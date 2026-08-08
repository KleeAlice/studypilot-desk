import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import type { DocumentBlock, DocumentFormat, DocumentLocator } from "./types";
import { OfficeDocumentEditor } from "./OfficeDocumentEditor";
import { StableSourceDocumentEditor as SourceDocumentEditor } from "./StableSourceDocumentEditor";
import { SpreadsheetDocumentEditor } from "./SpreadsheetDocumentEditor";
import { MermaidDiagram } from "./MermaidDiagram";

const markdownRemarkPlugins: any[] = [remarkGfm, remarkMath];
const markdownRehypePlugins = [rehypeKatex];
const markdownComponents: Components = {
  code({ className, children, ...props }) {
    if (/\blanguage-mermaid\b/.test(className || "")) {
      return <MermaidDiagram chart={String(children).replace(/\n$/, "")} />;
    }
    return <code className={className} {...props}>{children}</code>;
  },
};

export function blockLabel(format: DocumentFormat, block: DocumentBlock): string {
  if (format === "pdf") return `第 ${Number(block.locator.page || block.ordinal + 1)} 页`;
  if (format === "xlsx" || format === "csv") return String(block.locator.sheet || block.data.title || `工作表 ${block.ordinal + 1}`);
  if (format === "pptx") return `第 ${Number(block.locator.slide || block.ordinal + 1)} 张幻灯片`;
  if (format === "markdown") return String(block.data.title || `章节 ${block.ordinal + 1}`);
  if (format === "ipynb") return `单元 ${Number(block.locator.cell || block.ordinal + 1)}`;
  return `段落 ${block.ordinal + 1}`;
}

export interface ReaderSelection {
  blockKey: string;
  locator: DocumentLocator;
  quote: string;
  startOffset?: number;
  endOffset?: number;
}

interface ReaderProps {
  format: DocumentFormat;
  rawUrl: string;
  blocks: DocumentBlock[];
  activeBlockKey: string;
  onActivate: (blockKey: string) => void;
  onRevise: (block: DocumentBlock, after: { text: string; data?: Record<string, any> }) => Promise<void>;
  onSelect: (selection: ReaderSelection) => void;
}

const LARGE_DOCUMENT_BLOCK_THRESHOLD = 88;
const INITIAL_BLOCK_WINDOW = 56;
const JUMP_BLOCK_WINDOW = 64;
const BLOCK_WINDOW_STEP = 48;

function useProgressiveBlockWindow(blocks: DocumentBlock[], activeBlockKey: string) {
  const activeIndex = Math.max(0, blocks.findIndex((block) => block.block_key === activeBlockKey));
  const signature = `${blocks.length}:${blocks[0]?.block_key || ""}:${blocks.at(-1)?.block_key || ""}`;
  const initialRange = () => blocks.length <= LARGE_DOCUMENT_BLOCK_THRESHOLD
    ? { start: 0, end: blocks.length }
    : {
        start: Math.max(0, activeIndex - 8),
        end: Math.min(blocks.length, Math.max(INITIAL_BLOCK_WINDOW, activeIndex + JUMP_BLOCK_WINDOW - 8)),
      };
  const [range, setRange] = useState(initialRange);

  useEffect(() => {
    setRange(initialRange());
  }, [signature]);

  useEffect(() => {
    if (blocks.length <= LARGE_DOCUMENT_BLOCK_THRESHOLD) return;
    setRange((current) => {
      if (activeIndex >= current.start && activeIndex < current.end) return current;
      const start = Math.max(0, activeIndex - 8);
      return { start, end: Math.min(blocks.length, start + JUMP_BLOCK_WINDOW) };
    });
  }, [activeIndex, blocks.length]);

  return {
    visibleBlocks: blocks.slice(range.start, range.end),
    hiddenBefore: range.start,
    hiddenAfter: Math.max(0, blocks.length - range.end),
    loadBefore: () => setRange((current) => ({
      start: Math.max(0, current.start - BLOCK_WINDOW_STEP),
      end: current.end,
    })),
    loadAfter: () => setRange((current) => ({
      start: current.start,
      end: Math.min(blocks.length, current.end + BLOCK_WINDOW_STEP),
    })),
  };
}

function ProgressiveBlockControls({ direction, count, onLoad }: { direction: "before" | "after"; count: number; onLoad: () => void }) {
  if (!count) return null;
  const label = direction === "before" ? `继续载入前面的章节（还有 ${count} 个）` : `继续载入后面的章节（还有 ${count} 个）`;
  return <button type="button" className="document-progressive-load" aria-label={label} onClick={onLoad}>
    <span>{direction === "before" ? "↑" : "↓"}</span><strong>{direction === "before" ? "载入前文" : "继续阅读"}</strong><small>剩余 {count} 节</small>
  </button>;
}

const OVERSIZED_MARKDOWN_THRESHOLD = 60_000;
const MARKDOWN_SEGMENT_TARGET = 16_000;
const INITIAL_MARKDOWN_SEGMENTS = 3;

function splitMarkdownForDisplay(source: string) {
  if (source.length <= OVERSIZED_MARKDOWN_THRESHOLD) return [source];
  const segments: string[] = [];
  let current: string[] = [];
  let currentLength = 0;
  let fence = "";
  source.split("\n").forEach((line) => {
    const trimmed = line.trimStart();
    const marker = trimmed.startsWith("```") ? "```" : trimmed.startsWith("~~~") ? "~~~" : "";
    if (marker) {
      if (!fence) fence = marker;
      else if (fence === marker) fence = "";
    }
    current.push(line);
    currentLength += line.length + 1;
    if (!fence && currentLength >= MARKDOWN_SEGMENT_TARGET && !line.trim()) {
      segments.push(current.join("\n"));
      current = [];
      currentLength = 0;
    }
  });
  if (current.length) segments.push(current.join("\n"));
  return segments.length ? segments : [source];
}

function MarkdownBlockContent({ source }: { source: string }) {
  const segments = useMemo(() => splitMarkdownForDisplay(source), [source]);
  const [visibleSegments, setVisibleSegments] = useState(INITIAL_MARKDOWN_SEGMENTS);
  useEffect(() => setVisibleSegments(INITIAL_MARKDOWN_SEGMENTS), [source]);
  const remaining = Math.max(0, segments.length - visibleSegments);
  return <>
    {segments.slice(0, visibleSegments).map((segment, index) => (
      <ReactMarkdown
        key={`${index}:${segment.length}`}
        remarkPlugins={markdownRemarkPlugins}
        rehypePlugins={markdownRehypePlugins}
        components={markdownComponents}
      >{segment}</ReactMarkdown>
    ))}
    {remaining > 0 && <button
      type="button"
      className="document-progressive-load document-progressive-load--inside"
      aria-label={`继续载入本节后文（还有 ${remaining} 段）`}
      onClick={(event) => {
        event.stopPropagation();
        setVisibleSegments(segments.length);
      }}
    ><span>↓</span><strong>继续阅读本节</strong><small>剩余 {remaining} 段</small></button>}
  </>;
}

function selectionFromWindow(block: DocumentBlock): ReaderSelection | null {
  const selection = window.getSelection();
  const quote = selection?.toString().trim() || "";
  if (!quote) return null;
  const start = block.text.indexOf(quote);
  return {
    blockKey: block.block_key,
    locator: block.locator,
    quote,
    startOffset: start >= 0 ? start : undefined,
    endOffset: start >= 0 ? start + quote.length : undefined,
  };
}

function TextReadView({ format, blocks, activeBlockKey, onActivate, onRevise, onSelect }: ReaderProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const windowed = useProgressiveBlockWindow(blocks, activeBlockKey);
  useEffect(() => {
    if (!editing) return;
    const block = blocks.find((item) => item.block_key === editing);
    if (block) setDraft(block.text);
  }, [blocks, editing]);
  return <div className={`structured-reader reader--${format}`}>
    <ProgressiveBlockControls direction="before" count={windowed.hiddenBefore} onLoad={windowed.loadBefore} />
    {windowed.visibleBlocks.map((block) => {
      const label = blockLabel(format, block);
      const active = block.block_key === activeBlockKey;
      return <article key={block.block_key} id={`document-block-${block.block_key}`} data-document-block={block.block_key} className={active ? "is-active" : ""} onClick={() => onActivate(block.block_key)} onMouseUp={() => {
        const selection = selectionFromWindow(block);
        if (selection) onSelect(selection);
      }}>
        <header><small>{format === "docx" ? String(block.data.style || "WORD BLOCK") : format === "markdown" ? "MARKDOWN" : "TEXT"}</small><span>{label}</span></header>
        {editing === block.block_key ? <div className="block-editor"><textarea aria-label={`编辑${label}`} value={draft} onChange={(event) => setDraft(event.target.value)} /><footer><button onClick={() => setEditing(null)}>取消</button><button className="primary-action" aria-label={`保存${label}`} onClick={() => void onRevise(block, { text: draft }).then(() => setEditing(null))}>保存</button></footer></div> : <>
          <p className="document-prose">{block.text}</p>
          <button className="block-edit-trigger" aria-label={`编辑${label}`} onClick={() => { setDraft(block.text); setEditing(block.block_key); }}>编辑内容</button>
        </>}
      </article>;
    })}
    <ProgressiveBlockControls direction="after" count={windowed.hiddenAfter} onLoad={windowed.loadAfter} />
  </div>;
}

function MarkdownReadView({ blocks, activeBlockKey, onActivate, onRevise, onSelect }: ReaderProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const windowed = useProgressiveBlockWindow(blocks, activeBlockKey);

  return <article className="markdown-document" aria-label="Markdown 连续文档">
    <ProgressiveBlockControls direction="before" count={windowed.hiddenBefore} onLoad={windowed.loadBefore} />
    {windowed.visibleBlocks.map((block) => {
      const label = blockLabel("markdown", block);
      const active = block.block_key === activeBlockKey;
      return <section
        key={block.block_key}
        id={`document-block-${block.block_key}`}
        data-document-block={block.block_key}
        className={`markdown-section ${active ? "is-active" : ""}`}
        onClick={() => onActivate(block.block_key)}
        onMouseUp={() => {
          const selection = selectionFromWindow(block);
          if (selection) onSelect(selection);
        }}
      >
        {editing === block.block_key
          ? <div className="block-editor markdown-source-editor">
              <textarea aria-label={`编辑${label}`} value={draft} onChange={(event) => setDraft(event.target.value)} />
              <footer><button onClick={() => setEditing(null)}>取消</button><button className="primary-action" aria-label={`保存${label}`} onClick={() => void onRevise(block, { text: draft }).then(() => setEditing(null))}>保存</button></footer>
            </div>
          : <>
              <MarkdownBlockContent source={block.text} />
              <button className="block-edit-trigger markdown-edit-trigger" aria-label={`编辑${label}`} onClick={(event) => { event.stopPropagation(); setDraft(block.text); setEditing(block.block_key); }}>编辑源码</button>
            </>}
      </section>;
    })}
    <ProgressiveBlockControls direction="after" count={windowed.hiddenAfter} onLoad={windowed.loadAfter} />
  </article>;
}

function TextReader(props: ReaderProps) {
  const [mode, setMode] = useState<"read" | "edit">("read");
  if (mode === "edit") return <SourceDocumentEditor kind="text" blocks={props.blocks} onActivate={props.onActivate} onRevise={props.onRevise} onExit={() => setMode("read")} />;
  return <section className="source-reader-shell source-reader-shell--text">
    <div className="reader-mode-bar">
      <span><strong>阅读模式</strong><small>连续阅读文本、代码与配置内容</small></span>
      <button type="button" aria-label="进入文本编辑模式" onClick={() => setMode("edit")}>编辑模式</button>
    </div>
    <TextReadView {...props} />
  </section>;
}

function MarkdownReader(props: ReaderProps) {
  const [mode, setMode] = useState<"read" | "edit">("read");
  if (mode === "edit") return <SourceDocumentEditor
    kind="markdown"
    blocks={props.blocks}
    onActivate={props.onActivate}
    onRevise={props.onRevise}
    onExit={() => setMode("read")}
    renderPreview={(source) => <MarkdownBlockContent source={source} />}
  />;
  return <section className="source-reader-shell source-reader-shell--markdown">
    <div className="reader-mode-bar">
      <span><strong>阅读模式</strong><small>按排版预览 Markdown、公式与图表</small></span>
      <button type="button" aria-label="进入 Markdown 编辑模式" onClick={() => setMode("edit")}>编辑模式</button>
    </div>
    <MarkdownReadView {...props} />
  </section>;
}

function PdfReader({ rawUrl, blocks, activeBlockKey, onActivate }: ReaderProps) {
  const active = blocks.find((block) => block.block_key === activeBlockKey) || blocks[0];
  return <div
    className="pdf-original-reader"
    data-document-block={active?.block_key || ""}
    onPointerDown={() => active && onActivate(active.block_key)}
  >
    <iframe
      title="PDF 原版阅读器"
      src={`${rawUrl}#toolbar=1&navpanes=1&view=FitH`}
      loading="eager"
    />
  </div>;
}

function WordReader(props: ReaderProps) {
  const [mode, setMode] = useState<"layout" | "edit">("layout");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode !== "layout" || !containerRef.current) return;
    const controller = new AbortController();
    const target = containerRef.current;
    target.replaceChildren();
    setStatus("loading");
    fetch(props.rawUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Word file ${response.status}`);
        return response.arrayBuffer();
      })
      .then(async (buffer) => {
        const { renderAsync } = await import("docx-preview");
        return renderAsync(buffer, target, target, {
        className: "studypilot-docx",
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        renderHeaders: true,
        renderFooters: true,
        renderFootnotes: true,
        renderEndnotes: true,
        renderAltChunks: false,
        useBase64URL: true,
        });
      })
      .then(() => setStatus("ready"))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setStatus("error");
      });
    return () => controller.abort();
  }, [mode, props.rawUrl]);

  if (mode === "edit") {
    return <div className="word-reader-shell">
      <OfficeDocumentEditor blocks={props.blocks} onActivate={props.onActivate} onRevise={props.onRevise} onExit={() => setMode("layout")} />
    </div>;
  }
  return <section className="word-reader-shell" aria-label="Word 原版阅读器" data-state={status}>
    <div className="reader-mode-bar">
      <span><strong>原版式</strong><small>{status === "loading" ? "正在载入 Word…" : status === "error" ? "原版式载入失败，可切换到内容编辑" : "页眉、表格、图片与分页均按原文件显示"}</small></span>
      <button aria-label="进入编辑模式" onClick={() => setMode("edit")}>编辑模式</button>
    </div>
    <div className="word-layout-reader" ref={containerRef} />
  </section>;
}

function SheetReadView({ blocks, activeBlockKey, onActivate, onRevise, onSelect }: ReaderProps) {
  const [editing, setEditing] = useState<{ blockKey: string; address: string; value: string } | null>(null);
  return <div className="sheet-reader">{blocks.map((block) => {
    const cells = Array.isArray(block.data.cells) ? block.data.cells : [];
    const title = String(block.locator.sheet || block.data.title || "Sheet");
    const dimensions = String(block.data.dimensions || block.locator.range || "A1:A1");
    const bounds = spreadsheetBounds(dimensions, cells);
    const merged = mergedCellMap(Array.isArray(block.data.merged_ranges) ? block.data.merged_ranges : []);
    const columnWidths = block.data.column_widths || {};
    const rowHeights = block.data.row_heights || {};
    const gridStyle = {
      gridTemplateColumns: `42px ${Array.from({ length: bounds.maxColumn }, (_, index) => `${Math.max(72, Math.min(360, Number(columnWidths[columnName(index + 1)] || 12) * 7 + 16))}px`).join(" ")}`,
      gridTemplateRows: `28px ${Array.from({ length: bounds.maxRow }, (_, index) => `${Math.max(30, Number(rowHeights[String(index + 1)] || 22) * 1.34)}px`).join(" ")}`,
    } as CSSProperties;
    return <section key={block.block_key} data-document-block={block.block_key} className={block.block_key === activeBlockKey ? "is-active" : ""} onClick={() => onActivate(block.block_key)}><header><strong>工作表 · {title}</strong><small>{dimensions}</small></header><div className="sheet-grid" role="grid" aria-label={`工作表 ${title}`} style={gridStyle}>
      <span className="sheet-corner" aria-hidden="true" />
      {Array.from({ length: bounds.maxColumn }, (_, index) => <span role="columnheader" key={`column-${index + 1}`} style={{ gridColumn: index + 2, gridRow: 1 }}>{columnName(index + 1)}</span>)}
      {Array.from({ length: bounds.maxRow }, (_, index) => <span role="rowheader" key={`row-${index + 1}`} style={{ gridColumn: 1, gridRow: index + 2 }}>{index + 1}</span>)}
      {cells.map((cell: any) => {
        const position = spreadsheetAddress(String(cell.address));
        const span = merged[String(cell.address)] || { columns: 1, rows: 1 };
        const visual = spreadsheetCellStyle(cell.style || {});
        return <div
          role="gridcell"
          aria-label={`${cell.address} ${String(cell.value ?? "")}`}
          key={cell.address}
          className="sheet-cell"
          style={{ ...visual, gridColumn: `${position.column + 1} / span ${span.columns}`, gridRow: `${position.row + 1} / span ${span.rows}` }}
        ><b>{cell.address}</b>{editing?.blockKey === block.block_key && editing.address === cell.address ? <form onSubmit={(event) => {
      event.preventDefault();
      const nextCells = cells.map((item: any) => item.address === cell.address ? { ...item, value: editing.value } : item);
      const text = nextCells.map((item: any) => `${item.address}: ${item.value}`).join("\n");
      void onRevise(block, { text, data: { ...block.data, cells: nextCells } }).then(() => setEditing(null));
    }}><input autoFocus aria-label={`编辑单元格 ${cell.address}`} value={editing.value} onChange={(event) => setEditing({ ...editing, value: event.target.value })}/><button>保存</button></form> : <button aria-label={`编辑单元格 ${cell.address}`} onClick={() => { onSelect({ blockKey: block.block_key, locator: { ...block.locator, range: cell.address }, quote: String(cell.value) }); setEditing({ blockKey: block.block_key, address: cell.address, value: String(cell.value) }); }}>{String(cell.value)}</button>}</div>;
      })}</div></section>;
  })}</div>;
}

function spreadsheetAddress(address: string) {
  const match = /^([A-Z]+)(\d+)$/i.exec(address);
  if (!match) return { column: 1, row: 1 };
  const column = match[1].toUpperCase().split("").reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
  return { column, row: Number(match[2]) };
}

function columnName(column: number) {
  let value = column;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function spreadsheetBounds(dimensions: string, cells: any[]) {
  const end = spreadsheetAddress(dimensions.split(":").pop() || "A1");
  return cells.reduce((bounds, cell) => {
    const position = spreadsheetAddress(String(cell.address));
    return { maxColumn: Math.max(bounds.maxColumn, position.column), maxRow: Math.max(bounds.maxRow, position.row) };
  }, { maxColumn: Math.max(1, Math.min(end.column, 100)), maxRow: Math.max(1, Math.min(end.row, 500)) });
}

function mergedCellMap(ranges: string[]) {
  return ranges.reduce<Record<string, { columns: number; rows: number }>>((result, range) => {
    const [startAddress, endAddress] = range.split(":");
    const start = spreadsheetAddress(startAddress);
    const end = spreadsheetAddress(endAddress || startAddress);
    result[startAddress] = { columns: Math.max(1, end.column - start.column + 1), rows: Math.max(1, end.row - start.row + 1) };
    return result;
  }, {});
}

function spreadsheetCellStyle(style: any): CSSProperties {
  const alignment: Record<string, CSSProperties["textAlign"]> = { center: "center", right: "right", left: "left", justify: "justify" };
  const vertical: Record<string, CSSProperties["alignItems"]> = { center: "center", top: "flex-start", bottom: "flex-end" };
  return {
    backgroundColor: style.fill ? `#${style.fill}` : undefined,
    color: style.font?.color ? `#${style.font.color}` : undefined,
    fontFamily: style.font?.name || undefined,
    fontSize: style.font?.size ? `${style.font.size}px` : undefined,
    fontWeight: style.font?.bold ? 700 : undefined,
    fontStyle: style.font?.italic ? "italic" : undefined,
    textAlign: alignment[style.alignment?.horizontal] || undefined,
    alignItems: vertical[style.alignment?.vertical] || undefined,
    whiteSpace: style.alignment?.wrap_text ? "normal" : "nowrap",
  };
}

function SheetReader(props: ReaderProps) {
  const [mode, setMode] = useState<"read" | "edit">("read");
  if (mode === "edit") return <SpreadsheetDocumentEditor blocks={props.blocks} onActivate={props.onActivate} onRevise={props.onRevise} onExit={() => setMode("read")} />;
  return <section className="source-reader-shell source-reader-shell--sheet">
    <div className="reader-mode-bar">
      <span><strong>表格阅读模式</strong><small>保留工作表、坐标与单元格样式</small></span>
      <button type="button" aria-label="进入表格编辑模式" onClick={() => setMode("edit")}>编辑模式</button>
    </div>
    <SheetReadView {...props} />
  </section>;
}

function NotebookReader({ blocks, activeBlockKey, onActivate, onRevise, onSelect }: ReaderProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  return <div className="notebook-reader" aria-label="Jupyter Notebook 阅读器">{blocks.map((block) => {
    const cellType = String(block.data.cell_type || block.locator.cell_type || "raw");
    const source = String(block.data.source ?? block.text);
    const outputs = Array.isArray(block.data.outputs) ? block.data.outputs : [];
    return <section
      key={block.block_key}
      data-document-block={block.block_key}
      className={`notebook-cell is-${cellType} ${block.block_key === activeBlockKey ? "is-active" : ""}`}
      onClick={() => onActivate(block.block_key)}
      onMouseUp={() => { const selection = selectionFromWindow(block); if (selection) onSelect(selection); }}
    >
      <aside>{cellType === "code" ? `In [${block.data.execution_count ?? " "}]` : "MD"}</aside>
      <div className="notebook-cell__body">
        {editing === block.block_key ? <div className="block-editor notebook-source-editor">
          <textarea aria-label={`编辑${blockLabel("ipynb", block)}`} value={draft} onChange={(event) => setDraft(event.target.value)} />
          <footer><button onClick={() => setEditing(null)}>取消</button><button className="primary-action" aria-label={`保存${blockLabel("ipynb", block)}`} onClick={() => {
            const outputText = outputs.map((output: any) => String(output.text || "")).filter(Boolean).join("\n\n");
            void onRevise(block, {
              text: [draft, outputText].filter(Boolean).join("\n\n"),
              data: { ...block.data, source: draft },
            }).then(() => setEditing(null));
          }}>保存</button></footer>
        </div> : <>
          {cellType === "markdown" ? <ReactMarkdown remarkPlugins={markdownRemarkPlugins} components={markdownComponents}>{source}</ReactMarkdown> : <pre><code>{source}</code></pre>}
          {outputs.length > 0 && <div className="notebook-outputs" aria-label={`单元 ${block.locator.cell} 输出`}>{outputs.map((output: any, index: number) => <pre key={`${output.output_type}-${index}`} data-output-type={output.output_type}>{String(output.text || "")}</pre>)}</div>}
          <button className="block-edit-trigger" aria-label={`编辑${blockLabel("ipynb", block)}`} onClick={() => { setDraft(source); setEditing(block.block_key); }}>编辑源内容</button>
        </>}
      </div>
    </section>;
  })}</div>;
}

function SlideReader({ blocks, activeBlockKey, onActivate, onRevise, onSelect }: ReaderProps) {
  const [editing, setEditing] = useState<{ blockKey: string; shapeId: number; value: string } | null>(null);
  return <div className="slide-reader">{blocks.map((block) => {
    const elements = Array.isArray(block.data.elements) ? block.data.elements : [];
    return <article key={block.block_key} data-document-block={block.block_key} className={block.block_key === activeBlockKey ? "is-active" : ""} onClick={() => onActivate(block.block_key)}><header><span>{blockLabel("pptx", block)}</span></header><div className="slide-stage">{elements.map((element: any) => editing?.blockKey === block.block_key && editing.shapeId === element.shape_id ? <form key={element.shape_id} style={slideElementStyle(element)} onSubmit={(event) => {
      event.preventDefault();
      const nextElements = elements.map((item: any) => item.shape_id === element.shape_id ? { ...item, text: editing.value } : item);
      void onRevise(block, { text: nextElements.map((item: any) => item.text).join("\n"), data: { ...block.data, elements: nextElements } }).then(() => setEditing(null));
    }}><textarea autoFocus aria-label={`编辑文本框 ${element.name}`} value={editing.value} onChange={(event) => setEditing({ ...editing, value: event.target.value })}/><button>保存文本框</button></form> : <button key={element.shape_id} style={slideElementStyle(element)} aria-label={`编辑文本框 ${element.name}`} onClick={() => { onSelect({ blockKey: block.block_key, locator: { ...block.locator, shape: element.shape_id }, quote: element.text }); setEditing({ blockKey: block.block_key, shapeId: element.shape_id, value: element.text }); }}>{element.text}</button>)}</div></article>;
  })}</div>;
}

function slideElementStyle(element: any): CSSProperties {
  const layout = element.layout || {};
  const style = element.style || {};
  const hasLayout = [layout.left, layout.top, layout.width, layout.height].every((value) => Number.isFinite(Number(value)));
  return {
    position: hasLayout ? "absolute" : "relative",
    left: hasLayout ? `${Number(layout.left) * 100}%` : undefined,
    top: hasLayout ? `${Number(layout.top) * 100}%` : undefined,
    width: hasLayout ? `${Number(layout.width) * 100}%` : undefined,
    height: hasLayout ? `${Number(layout.height) * 100}%` : undefined,
    transform: Number(layout.rotation) ? `rotate(${Number(layout.rotation)}deg)` : undefined,
    fontSize: style.font_size ? `${style.font_size}px` : undefined,
    fontWeight: style.bold ? 700 : undefined,
    fontStyle: style.italic ? "italic" : undefined,
    color: style.color ? `#${style.color}` : undefined,
    textAlign: style.align || undefined,
  };
}

export function DocumentReader(props: ReaderProps) {
  if (props.format === "pdf") return <PdfReader {...props} />;
  if (props.format === "docx") return <WordReader {...props} />;
  if (props.format === "xlsx" || props.format === "csv") return <SheetReader {...props} />;
  if (props.format === "pptx") return <SlideReader {...props} />;
  if (props.format === "markdown") return <MarkdownReader {...props} />;
  if (props.format === "ipynb") return <NotebookReader {...props} />;
  return <TextReader {...props} />;
}
