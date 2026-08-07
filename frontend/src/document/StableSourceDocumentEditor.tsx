import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { DocumentBlock } from "./types";

function sourceFromBlocks(blocks: DocumentBlock[]) {
  return blocks.map((block) => block.text).join("\n\n");
}

function distributeSource(source: string, blocks: DocumentBlock[]) {
  if (blocks.length <= 1) return new Map([[blocks[0]?.block_key || "", source]]);
  const parts = source.split(/\n{2,}/);
  const values = new Map<string, string>();
  blocks.forEach((block, index) => {
    if (index < blocks.length - 1) values.set(block.block_key, parts[index] ?? "");
    else values.set(block.block_key, parts.slice(index).join("\n\n"));
  });
  return values;
}

export function StableSourceDocumentEditor({
  kind,
  blocks,
  onActivate,
  onRevise,
  onExit,
  renderPreview,
}: {
  kind: "markdown" | "text";
  blocks: DocumentBlock[];
  onActivate: (blockKey: string) => void;
  onRevise: (block: DocumentBlock, after: { text: string; data?: Record<string, any> }) => Promise<void>;
  onExit: () => void;
  renderPreview?: (source: string) => ReactNode;
}) {
  const signature = useMemo(() => blocks.map((block) => `${block.block_key}:${block.text}`).join("\u001f"), [blocks]);
  const incomingSource = useMemo(() => sourceFromBlocks(blocks), [signature]);
  const [draft, setDraft] = useState(incomingSource);
  const [baseline, setBaseline] = useState(incomingSource);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [exitPrompt, setExitPrompt] = useState(false);
  const draftRef = useRef(draft);
  const baselineRef = useRef(baseline);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (saving) return;
    draftRef.current = incomingSource;
    baselineRef.current = incomingSource;
    setDraft(incomingSource);
    setBaseline(incomingSource);
    setUndoStack([]);
    setRedoStack([]);
  }, [incomingSource, saving]);

  const dirty = draft !== baseline;

  function applyDraft(next: string, track = true) {
    if (next === draftRef.current) return;
    if (track) {
      setUndoStack((items) => [...items, draftRef.current].slice(-100));
      setRedoStack([]);
    }
    draftRef.current = next;
    setDraft(next);
  }

  function undoLocal() {
    const previous = undoStack.at(-1);
    if (previous === undefined || saving) return;
    setUndoStack((items) => items.slice(0, -1));
    setRedoStack((items) => [...items, draftRef.current].slice(-100));
    draftRef.current = previous;
    setDraft(previous);
  }

  function redoLocal() {
    const next = redoStack.at(-1);
    if (next === undefined || saving) return;
    setRedoStack((items) => items.slice(0, -1));
    setUndoStack((items) => [...items, draftRef.current].slice(-100));
    draftRef.current = next;
    setDraft(next);
  }

  async function save() {
    if (!dirty || saving) return !dirty;
    const snapshot = draftRef.current;
    const distributed = distributeSource(snapshot, blocks);
    setSaving(true);
    setSaveError("");
    try {
      for (const block of blocks) {
        const nextText = distributed.get(block.block_key) ?? "";
        if (nextText !== block.text) await onRevise(block, { text: nextText });
      }
      baselineRef.current = snapshot;
      setBaseline(snapshot);
      setUndoStack([]);
      setRedoStack([]);
      return true;
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "保存资料失败");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndExit() {
    if (await save()) onExit();
  }

  function requestExit() {
    if (dirty) setExitPrompt(true);
    if (saving) return;
    else onExit();
  }

  function insertMarkdown(prefix: string, suffix = prefix) {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = draftRef.current.slice(start, end) || "文字";
    const next = `${draftRef.current.slice(0, start)}${prefix}${selected}${suffix}${draftRef.current.slice(end)}`;
    applyDraft(next);
    requestAnimationFrame(() => {
      editor.focus();
      const caret = start + prefix.length + selected.length + suffix.length;
      editor.setSelectionRange(caret, caret);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "s") { event.preventDefault(); void save(); }
    else if (key === "z") { event.preventDefault(); event.shiftKey ? redoLocal() : undoLocal(); }
    else if (key === "y") { event.preventDefault(); redoLocal(); }
    else if (kind === "markdown" && key === "b") { event.preventDefault(); insertMarkdown("**"); }
    else if (kind === "markdown" && key === "i") { event.preventDefault(); insertMarkdown("_"); }
  }

  const title = kind === "markdown" ? "Markdown" : "文本 / 代码";
  const editorLabel = kind === "markdown" ? "Markdown 源码编辑器" : "文本内容编辑器";
  return <section className={`source-editor source-editor--${kind}`} aria-label={`${title} 编辑器`}>
    <div className="source-editor__ribbon">
      <header>
        <div><span>{kind === "markdown" ? "MD" : "TEXT"}</span><strong>{title} 编辑模式</strong><small>{dirty ? "有未保存的更改" : "已保存到本地资料"}</small></div>
        <div>
          <button type="button" aria-label="撤销文档编辑" disabled={!undoStack.length || saving} onClick={undoLocal}>↶</button>
          <button type="button" aria-label="重做文档编辑" disabled={!redoStack.length || saving} onClick={redoLocal}>↷</button>
          <button type="button" className="source-editor__save" aria-label="保存文档" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "保存中…" : "保存"}</button>
          <button type="button" aria-label="切换到阅读模式" disabled={saving} onClick={requestExit}>阅读模式</button>
        </div>
      </header>
      {kind === "markdown" && <div className="source-editor__tools" role="toolbar" aria-label="Markdown 编辑工具">
        <button type="button" onClick={() => insertMarkdown("# ", "")}>标题</button>
        <button type="button" aria-label="Markdown 加粗" onClick={() => insertMarkdown("**")}><b>B</b></button>
        <button type="button" aria-label="Markdown 斜体" onClick={() => insertMarkdown("_")}><em>I</em></button>
        <button type="button" onClick={() => insertMarkdown("[", "](https://)")}>链接</button>
        <button type="button" onClick={() => insertMarkdown("`")}>代码</button>
        <span>源码与预览同步 · Ctrl+S 保存</span>
      </div>}
    </div>
    <div className="source-editor__workspace" data-with-preview={kind === "markdown"}>
      <section className="source-editor__source-pane">
        <header><strong>{kind === "markdown" ? "源码" : "内容"}</strong><span>{draft.length.toLocaleString()} 字符</span></header>
        <textarea
          ref={editorRef}
          className="source-editor__canvas"
          role="textbox"
          aria-label={editorLabel}
          data-source-block-key={blocks[0]?.block_key || "document"}
          data-document-block={blocks[0]?.block_key || "document"}
          value={draft}
          disabled={saving}
          spellCheck={kind !== "text"}
          onFocus={() => blocks[0] && onActivate(blocks[0].block_key)}
          onChange={(event) => applyDraft(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
      </section>
      {kind === "markdown" && <section className="source-editor__preview" role="region" aria-label="Markdown 实时预览">
        <header><strong>实时预览</strong><span>GFM · LaTeX · Mermaid</span></header>
        <article className="markdown-document markdown-document--preview">{renderPreview?.(draft)}</article>
      </section>}
    </div>
    {saveError && <p className="source-editor__error" role="alert">{saveError}</p>}
    {exitPrompt && <div className="source-editor__exit-prompt" role="dialog" aria-label="保存资料更改">
      <div><strong>还有未保存的更改</strong><span>返回阅读模式前，是否保存本次修改？</span></div>
      <div><button type="button" onClick={() => setExitPrompt(false)}>继续编辑</button><button type="button" onClick={() => { setExitPrompt(false); onExit(); }}>放弃更改</button><button type="button" className="source-editor__save" disabled={saving} onClick={() => void saveAndExit()}>保存并返回</button></div>
    </div>}
  </section>;
}
