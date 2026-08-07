import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { DocumentBlock } from "./types";

type CellDrafts = Record<string, Record<string, string>>;

function cellDrafts(blocks: DocumentBlock[]): CellDrafts {
  return Object.fromEntries(blocks.map((block) => [block.block_key, Object.fromEntries((Array.isArray(block.data.cells) ? block.data.cells : []).map((cell: any) => [String(cell.address), String(cell.value ?? "")]))]));
}

function spreadsheetAddress(address: string) {
  const match = /^([A-Z]+)(\d+)$/i.exec(address);
  if (!match) return { column: 1, row: 1 };
  return {
    column: match[1].toUpperCase().split("").reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0),
    row: Number(match[2]),
  };
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

function boundsFor(block: DocumentBlock) {
  const cells = Array.isArray(block.data.cells) ? block.data.cells : [];
  const end = spreadsheetAddress(String(block.data.dimensions || block.locator.range || "A1" ).split(":").pop() || "A1");
  return cells.reduce((bounds: { maxColumn: number; maxRow: number }, cell: any) => {
    const position = spreadsheetAddress(String(cell.address));
    return { maxColumn: Math.max(bounds.maxColumn, position.column), maxRow: Math.max(bounds.maxRow, position.row) };
  }, { maxColumn: Math.max(1, Math.min(end.column, 100)), maxRow: Math.max(1, Math.min(end.row, 500)) });
}

export function SpreadsheetDocumentEditor({ blocks, onActivate, onRevise, onExit }: {
  blocks: DocumentBlock[];
  onActivate: (blockKey: string) => void;
  onRevise: (block: DocumentBlock, after: { text: string; data?: Record<string, any> }) => Promise<void>;
  onExit: () => void;
}) {
  const signature = useMemo(() => JSON.stringify(blocks.map((block) => [block.block_key, block.data.cells])), [blocks]);
  const [drafts, setDrafts] = useState<CellDrafts>(() => cellDrafts(blocks));
  const [baseline, setBaseline] = useState<CellDrafts>(() => cellDrafts(blocks));
  const [undoStack, setUndoStack] = useState<CellDrafts[]>([]);
  const [redoStack, setRedoStack] = useState<CellDrafts[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [exitPrompt, setExitPrompt] = useState(false);
  const draftsRef = useRef(drafts);
  const baselineRef = useRef(baseline);

  useEffect(() => {
    if (saving) return;
    const next = cellDrafts(blocks);
    draftsRef.current = next;
    baselineRef.current = next;
    setDrafts(next);
    setBaseline(next);
    setUndoStack([]);
    setRedoStack([]);
  }, [signature]);

  const dirty = JSON.stringify(drafts) !== JSON.stringify(baseline);

  function apply(next: CellDrafts, track = true) {
    if (track) {
      setUndoStack((items) => [...items, structuredClone(draftsRef.current)].slice(-100));
      setRedoStack([]);
    }
    draftsRef.current = next;
    setDrafts(next);
  }

  function updateCell(blockKey: string, address: string, value: string) {
    apply({ ...draftsRef.current, [blockKey]: { ...draftsRef.current[blockKey], [address]: value } });
  }

  function undoLocal() {
    const previous = undoStack.at(-1);
    if (!previous || saving) return;
    setUndoStack((items) => items.slice(0, -1));
    setRedoStack((items) => [...items, structuredClone(draftsRef.current)].slice(-100));
    apply(structuredClone(previous), false);
  }

  function redoLocal() {
    const next = redoStack.at(-1);
    if (!next || saving) return;
    setRedoStack((items) => items.slice(0, -1));
    setUndoStack((items) => [...items, structuredClone(draftsRef.current)].slice(-100));
    apply(structuredClone(next), false);
  }

  async function save() {
    if (!dirty || saving) return false;
    const snapshot = structuredClone(draftsRef.current);
    setSaving(true);
    setSaveError("");
    try {
      for (const block of blocks) {
        if (JSON.stringify(snapshot[block.block_key]) === JSON.stringify(baselineRef.current[block.block_key])) continue;
        const cells = (Array.isArray(block.data.cells) ? block.data.cells : []).map((cell: any) => ({ ...cell, value: snapshot[block.block_key]?.[String(cell.address)] ?? "" }));
        const text = cells.map((cell: any) => `${cell.address}: ${cell.value}`).join("\n");
        await onRevise(block, { text, data: { ...block.data, cells } });
      }
      baselineRef.current = snapshot;
      setBaseline(snapshot);
      setUndoStack([]);
      setRedoStack([]);
      return true;
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "保存表格失败");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "s") { event.preventDefault(); void save(); }
    else if (key === "z") { event.preventDefault(); event.shiftKey ? redoLocal() : undoLocal(); }
    else if (key === "y") { event.preventDefault(); redoLocal(); }
  }

  function requestExit() {
    if (dirty) setExitPrompt(true);
    if (saving) return;
    else onExit();
  }

  return <section className="spreadsheet-editor" aria-label="表格编辑器" onKeyDown={handleKeyDown}>
    <div className="spreadsheet-editor__ribbon">
      <header><div><span>GRID</span><strong>表格编辑模式</strong><small>{dirty ? "有未保存的单元格" : "已保存到本地资料"}</small></div><div>
        <button type="button" aria-label="撤销表格编辑" disabled={!undoStack.length || saving} onClick={undoLocal}>↶</button>
        <button type="button" aria-label="重做表格编辑" disabled={!redoStack.length || saving} onClick={redoLocal}>↷</button>
        <button type="button" className="spreadsheet-editor__save" aria-label="保存表格" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "保存中…" : "保存"}</button>
        <button type="button" aria-label="切换到表格阅读模式" disabled={saving} onClick={requestExit}>阅读模式</button>
      </div></header>
      <div className="spreadsheet-editor__tools"><strong>开始</strong><span>输入数据</span><span>Ctrl+S 保存 · Ctrl+Z 撤销</span></div>
    </div>
    <div className="spreadsheet-editor__workbook">
      {blocks.map((block) => {
        const cells = Array.isArray(block.data.cells) ? block.data.cells : [];
        const bounds = boundsFor(block);
        const gridStyle = { gridTemplateColumns: `42px repeat(${bounds.maxColumn}, minmax(112px, 1fr))`, gridTemplateRows: `28px repeat(${bounds.maxRow}, minmax(34px, auto))` } as CSSProperties;
        return <section key={block.block_key} data-document-block={block.block_key} onClick={() => onActivate(block.block_key)}>
          <header><strong>{String(block.locator.sheet || block.data.title || "Sheet")}</strong><span>{String(block.data.dimensions || block.locator.range || "A1")}</span></header>
          <div className="spreadsheet-editor__grid" role="grid" aria-label={`编辑工作表 ${String(block.locator.sheet || "Sheet")}`} style={gridStyle}>
            <span className="sheet-corner" />
            {Array.from({ length: bounds.maxColumn }, (_, index) => <span role="columnheader" key={`c-${index}`} style={{ gridColumn: index + 2, gridRow: 1 }}>{columnName(index + 1)}</span>)}
            {Array.from({ length: bounds.maxRow }, (_, index) => <span role="rowheader" key={`r-${index}`} style={{ gridColumn: 1, gridRow: index + 2 }}>{index + 1}</span>)}
            {cells.map((cell: any) => {
              const position = spreadsheetAddress(String(cell.address));
              return <input
                key={cell.address}
                aria-label={`编辑单元格 ${cell.address}`}
                value={drafts[block.block_key]?.[String(cell.address)] ?? ""}
                style={{ gridColumn: position.column + 1, gridRow: position.row + 1 }}
                onFocus={() => onActivate(block.block_key)}
                onChange={(event) => updateCell(block.block_key, String(cell.address), event.target.value)}
              />;
            })}
          </div>
        </section>;
      })}
    </div>
    {saveError && <p className="spreadsheet-editor__error" role="alert">{saveError}</p>}
    {exitPrompt && <div className="source-editor__exit-prompt" role="dialog" aria-label="保存表格更改"><div><strong>还有未保存的单元格</strong><span>返回阅读模式前，是否保存本次修改？</span></div><div><button onClick={() => setExitPrompt(false)}>继续编辑</button><button onClick={() => { setExitPrompt(false); onExit(); }}>放弃更改</button><button className="spreadsheet-editor__save" onClick={() => void save().then((saved) => { if (saved) onExit(); })}>保存并返回</button></div></div>}
  </section>;
}
