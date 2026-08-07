import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { DocumentBlock } from "./types";

type DraftMap = Record<string, string>;

function draftsFromBlocks(blocks: DocumentBlock[]): DraftMap {
  return Object.fromEntries(blocks.map((block) => [block.block_key, block.text]));
}

function editableBlock(target: EventTarget | null, root: HTMLElement | null) {
  const element = target instanceof HTMLElement ? target : null;
  return element?.closest<HTMLElement>("[data-source-block-key]")
    || root?.querySelector<HTMLElement>("[data-source-block-key]")
    || null;
}

export function SourceDocumentEditor({
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
  const [drafts, setDrafts] = useState<DraftMap>(() => draftsFromBlocks(blocks));
  const [baseline, setBaseline] = useState<DraftMap>(() => draftsFromBlocks(blocks));
  const [undoStack, setUndoStack] = useState<DraftMap[]>([]);
  const [redoStack, setRedoStack] = useState<DraftMap[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [exitPrompt, setExitPrompt] = useState(false);
  const draftsRef = useRef(drafts);
  const baselineRef = useRef(baseline);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (saving) return;
    const next = draftsFromBlocks(blocks);
    draftsRef.current = next;
    baselineRef.current = next;
    setDrafts(next);
    setBaseline(next);
    setUndoStack([]);
    setRedoStack([]);
  }, [signature]);

  const dirty = blocks.some((block) => (drafts[block.block_key] ?? "") !== (baseline[block.block_key] ?? block.text));
  const source = blocks.map((block) => drafts[block.block_key] ?? block.text).join("\n\n");

  function syncEditor(next: DraftMap) {
    editorRef.current?.querySelectorAll<HTMLElement>("[data-source-block-key]").forEach((element) => {
      const key = element.dataset.sourceBlockKey;
      if (key && element.innerText !== (next[key] ?? "")) element.textContent = next[key] ?? "";
    });
  }

  function applyDraft(next: DraftMap, track = true, sync = false) {
    if (track) {
      setUndoStack((items) => [...items, { ...draftsRef.current }].slice(-100));
      setRedoStack([]);
    }
    draftsRef.current = next;
    setDrafts(next);
    if (sync) syncEditor(next);
  }

  function updateBlock(blockKey: string, text: string) {
    if ((draftsRef.current[blockKey] ?? "") === text) return;
    applyDraft({ ...draftsRef.current, [blockKey]: text });
  }

  function undoLocal() {
    const previous = undoStack.at(-1);
    if (!previous || saving) return;
    setUndoStack((items) => items.slice(0, -1));
    setRedoStack((items) => [...items, { ...draftsRef.current }].slice(-100));
    applyDraft({ ...previous }, false, true);
  }

  function redoLocal() {
    const next = redoStack.at(-1);
    if (!next || saving) return;
    setRedoStack((items) => items.slice(0, -1));
    setUndoStack((items) => [...items, { ...draftsRef.current }].slice(-100));
    applyDraft({ ...next }, false, true);
  }

  async function save() {
    if (!dirty || saving) return false;
    const snapshot = { ...draftsRef.current };
    const changed = blocks.filter((block) => (baselineRef.current[block.block_key] ?? block.text) !== (snapshot[block.block_key] ?? ""));
    setSaving(true);
    setSaveError("");
    try {
      for (const block of changed) await onRevise(block, { text: snapshot[block.block_key] ?? "" });
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
    const saved = await save();
    if (saved) onExit();
  }

  function requestExit() {
    if (dirty) setExitPrompt(true);
    else onExit();
  }

  function insertMarkdown(prefix: string, suffix = prefix) {
    editorRef.current?.focus();
    const selection = window.getSelection();
    const selected = selection?.toString() || "文字";
    document.execCommand("insertText", false, `${prefix}${selected}${suffix}`);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
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
          <button type="button" aria-label="切换到阅读模式" onClick={requestExit}>阅读模式</button>
        </div>
      </header>
      {kind === "markdown" && <div className="source-editor__tools" role="toolbar" aria-label="Markdown 编辑工具">
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertMarkdown("# ", "")}>标题</button>
        <button type="button" aria-label="Markdown 加粗" onMouseDown={(event) => event.preventDefault()} onClick={() => insertMarkdown("**")}><b>B</b></button>
        <button type="button" aria-label="Markdown 斜体" onMouseDown={(event) => event.preventDefault()} onClick={() => insertMarkdown("_")}><em>I</em></button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertMarkdown("[", "](https://)")}>链接</button>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertMarkdown("`")}>代码</button>
        <span>源码与预览同步 · Ctrl+S 保存</span>
      </div>}
    </div>
    <div className="source-editor__workspace" data-with-preview={kind === "markdown"}>
      <section className="source-editor__source-pane">
        <header><strong>{kind === "markdown" ? "源码" : "内容"}</strong><span>{source.length.toLocaleString()} 字符</span></header>
        <div
          ref={editorRef}
          className="source-editor__canvas"
          role="textbox"
          aria-label={editorLabel}
          aria-multiline="true"
          contentEditable={!saving}
          suppressContentEditableWarning
          spellCheck={kind !== "text"}
          onKeyDown={handleKeyDown}
          onInput={(event) => {
            const element = editableBlock(event.target, editorRef.current);
            const key = element?.dataset.sourceBlockKey || blocks[0]?.block_key;
            const text = event.target === event.currentTarget ? event.currentTarget.innerText : element?.innerText;
            if (key && text !== undefined) updateBlock(key, text.replace(/\n$/, ""));
          }}
          onClick={(event) => {
            const block = editableBlock(event.target, editorRef.current);
            if (block?.dataset.sourceBlockKey) onActivate(block.dataset.sourceBlockKey);
          }}
        >
          {blocks.map((block) => <pre key={block.block_key} data-source-block-key={block.block_key} data-document-block={block.block_key}>{drafts[block.block_key] ?? block.text}</pre>)}
        </div>
      </section>
      {kind === "markdown" && <section className="source-editor__preview" role="region" aria-label="Markdown 实时预览">
        <header><strong>实时预览</strong><span>GFM · LaTeX · Mermaid</span></header>
        <article className="markdown-document markdown-document--preview">{renderPreview?.(source)}</article>
      </section>}
    </div>
    {saveError && <p className="source-editor__error" role="alert">{saveError}</p>}
    {exitPrompt && <div className="source-editor__exit-prompt" role="dialog" aria-label="保存资料更改">
      <div><strong>还有未保存的更改</strong><span>返回阅读模式前，是否保存本次修改？</span></div>
      <div><button type="button" onClick={() => setExitPrompt(false)}>继续编辑</button><button type="button" onClick={() => { setExitPrompt(false); onExit(); }}>放弃更改</button><button type="button" className="source-editor__save" disabled={saving} onClick={() => void saveAndExit()}>保存并返回</button></div>
    </div>}
  </section>;
}
