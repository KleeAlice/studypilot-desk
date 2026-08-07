import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { DocumentBlock } from "./types";

type DraftMap = Record<string, string>;

function draftsFromBlocks(blocks: DocumentBlock[]): DraftMap {
  return Object.fromEntries(blocks.map((block) => [block.block_key, block.text]));
}

function blockClass(block: DocumentBlock) {
  const style = String(block.data.style || "").toLowerCase();
  if (style.includes("heading 1") || style.includes("标题 1")) return "office-editor-block office-editor-block--h1";
  if (style.includes("heading 2") || style.includes("标题 2")) return "office-editor-block office-editor-block--h2";
  if (style.includes("heading")) return "office-editor-block office-editor-block--h3";
  return "office-editor-block";
}

export function OfficeDocumentEditor({
  blocks,
  onActivate,
  onRevise,
  onExit,
}: {
  blocks: DocumentBlock[];
  onActivate: (blockKey: string) => void;
  onRevise: (block: DocumentBlock, after: { text: string; data?: Record<string, any> }) => Promise<void>;
  onExit: () => void;
}) {
  const sourceSignature = useMemo(() => blocks.map((block) => `${block.block_key}:${block.text}`).join("\u001f"), [blocks]);
  const [drafts, setDrafts] = useState<DraftMap>(() => draftsFromBlocks(blocks));
  const [baseline, setBaseline] = useState<DraftMap>(() => draftsFromBlocks(blocks));
  const [undoStack, setUndoStack] = useState<DraftMap[]>([]);
  const [redoStack, setRedoStack] = useState<DraftMap[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [exitPrompt, setExitPrompt] = useState(false);
  const draftRef = useRef(drafts);
  const baselineRef = useRef(baseline);
  const pageRef = useRef<HTMLDivElement>(null);

  function inputBlock(target: EventTarget | null) {
    const fromTarget = target instanceof HTMLElement ? target.closest<HTMLElement>("[data-office-block-key]") : null;
    if (fromTarget) return fromTarget;
    const anchor = window.getSelection?.()?.anchorNode;
    const anchorElement = anchor instanceof HTMLElement ? anchor : anchor?.parentElement;
    return anchorElement?.closest<HTMLElement>("[data-office-block-key]") || null;
  }

  useEffect(() => {
    if (saving) return;
    const next = draftsFromBlocks(blocks);
    draftRef.current = next;
    baselineRef.current = next;
    setDrafts(next);
    setBaseline(next);
    setUndoStack([]);
    setRedoStack([]);
  }, [sourceSignature]);

  const dirty = blocks.some((block) => (drafts[block.block_key] ?? "") !== (baseline[block.block_key] ?? block.text));

  function syncCanvas(next: DraftMap) {
    pageRef.current?.querySelectorAll<HTMLElement>("[data-office-block-key]").forEach((element) => {
      const key = element.dataset.officeBlockKey;
      if (key && element.innerText !== (next[key] ?? "")) element.textContent = next[key] ?? "";
    });
  }

  function applyDraft(next: DraftMap, track = true, updateCanvas = false) {
    if (track) {
      setUndoStack((items) => [...items, { ...draftRef.current }].slice(-80));
      setRedoStack([]);
    }
    draftRef.current = next;
    setDrafts(next);
    if (updateCanvas) syncCanvas(next);
  }

  function updateBlock(blockKey: string, text: string) {
    if ((draftRef.current[blockKey] ?? "") === text) return;
    applyDraft({ ...draftRef.current, [blockKey]: text });
  }

  function undoLocal() {
    const previous = undoStack.at(-1);
    if (!previous || saving) return;
    setUndoStack((items) => items.slice(0, -1));
    setRedoStack((items) => [...items, { ...draftRef.current }].slice(-80));
    applyDraft({ ...previous }, false, true);
  }

  function redoLocal() {
    const next = redoStack.at(-1);
    if (!next || saving) return;
    setRedoStack((items) => items.slice(0, -1));
    setUndoStack((items) => [...items, { ...draftRef.current }].slice(-80));
    applyDraft({ ...next }, false, true);
  }

  function runCommand(command: string, value?: string) {
    pageRef.current?.focus();
    document.execCommand(command, false, value);
  }

  async function save() {
    if (saving || !dirty) return;
    const snapshot = { ...draftRef.current };
    const changed = blocks.filter((block) => (baselineRef.current[block.block_key] ?? block.text) !== (snapshot[block.block_key] ?? ""));
    if (!changed.length) return;
    setSaving(true);
    setSaveError("");
    try {
      for (const block of changed) {
        await onRevise(block, { text: snapshot[block.block_key] ?? "" });
      }
      baselineRef.current = snapshot;
      setBaseline(snapshot);
      setUndoStack([]);
      setRedoStack([]);
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : "保存文档失败");
    } finally {
      setSaving(false);
    }
  }

  async function saveAndExit() {
    await save();
    if (!blocks.some((block) => (draftRef.current[block.block_key] ?? "") !== (baselineRef.current[block.block_key] ?? block.text))) onExit();
  }

  function requestExit() {
    if (dirty) setExitPrompt(true);
    else onExit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === "s") { event.preventDefault(); void save(); return; }
    if (key === "z") { event.preventDefault(); event.shiftKey ? redoLocal() : undoLocal(); return; }
    if (key === "y") { event.preventDefault(); redoLocal(); return; }
    const commands: Record<string, string> = { b: "bold", i: "italic", u: "underline", l: "justifyLeft", e: "justifyCenter", r: "justifyRight", j: "justifyFull" };
    if (commands[key]) { event.preventDefault(); runCommand(commands[key]); }
  }

  return <section className="office-editor" aria-label="Word 连续编辑器">
    <div className="office-editor__ribbon">
      <header>
        <div><span>WORD</span><strong>编辑模式</strong><small>{dirty ? "有未保存的更改" : "已保存到本地资料"}</small></div>
        <div className="office-editor__primary-actions">
          <button type="button" aria-label="撤销文档编辑" title="撤销 · Ctrl+Z" disabled={!undoStack.length || saving} onMouseDown={(event) => event.preventDefault()} onClick={undoLocal}>↶</button>
          <button type="button" aria-label="重做文档编辑" title="重做 · Ctrl+Y" disabled={!redoStack.length || saving} onMouseDown={(event) => event.preventDefault()} onClick={redoLocal}>↷</button>
          <button type="button" className="office-editor__save" aria-label="保存文档" disabled={!dirty || saving} onClick={() => void save()}>{saving ? "保存中…" : "保存"}</button>
          <button type="button" aria-label="切换到阅读模式" onClick={requestExit}>阅读模式</button>
        </div>
      </header>
      <div className="office-editor__tabs"><strong>开始</strong><span>插入</span><span>页面布局</span><span>审阅</span><span>视图</span></div>
      <div className="office-editor__tools" role="toolbar" aria-label="Word 编辑工具">
        <label>样式<select aria-label="文本样式" defaultValue="p" onChange={(event) => runCommand("formatBlock", event.target.value === "p" ? "p" : event.target.value)}><option value="p">正文</option><option value="h1">标题 1</option><option value="h2">标题 2</option><option value="h3">标题 3</option></select></label>
        <label>字体<select aria-label="编辑字体" defaultValue="Microsoft YaHei UI" onChange={(event) => runCommand("fontName", event.target.value)}><option>Microsoft YaHei UI</option><option>Noto Sans SC</option> <option>SimSun</option></select></label>
        <label>字号<select aria-label="编辑字号" defaultValue="3" onChange={(event) => runCommand("fontSize", event.target.value)}><option value="2">小</option><option value="3">标准</option><option value="4">大</option><option value="5">超大</option></select></label>
        <i />
        <button type="button" aria-label="加粗" title="加粗 · Ctrl+B" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("bold")}><b>B</b></button>
        <button type="button" aria-label="斜体" title="斜体 · Ctrl+I" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("italic")}><em>I</em></button>
        <button type="button" aria-label="下划线" title="下划线 · Ctrl+U" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("underline")}><u>U</u></button>
        <button type="button" aria-label="清除格式" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("removeFormat")}>Tx</button>
        <i />
        <button type="button" aria-label="项目符号" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertUnorderedList")}>• 列表</button>
        <button type="button" aria-label="编号列表" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertOrderedList")}>1. 列表</button>
        <button type="button" aria-label="左对齐" title="左对齐 · Ctrl+L" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("justifyLeft")}>≡</button>
        <button type="button" aria-label="居中" title="居中 · Ctrl+E" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("justifyCenter")}>≡</button>
        <button type="button" aria-label="右对齐" title="右对齐 · Ctrl+R" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("justifyRight")}>≡</button>
        <button type="button" aria-label="两端对齐" title="两端对齐 · Ctrl+J" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("justifyFull")}>☷</button>
      </div>
    </div>

    <div className="office-editor__desk">
      <article className="office-editor__page">
        <header><span>文档内容</span><span>{blocks.length} 段 · Ctrl+S 保存</span></header>
        <div
          ref={pageRef}
          className="office-editor__canvas"
          role="textbox"
          aria-label="Word 文档编辑器"
          aria-multiline="true"
          contentEditable={!saving}
          suppressContentEditableWarning
          spellCheck
          onKeyDown={handleKeyDown}
          onInput={(event) => {
            const block = inputBlock(event.target);
            if (block?.dataset.officeBlockKey) updateBlock(block.dataset.officeBlockKey, block.innerText.replace(/\n$/, ""));
          }}
          onClick={(event) => {
            const block = (event.target as HTMLElement).closest<HTMLElement>("[data-office-block-key]");
            if (block?.dataset.officeBlockKey) onActivate(block.dataset.officeBlockKey);
          }}
        >
          {blocks.map((block) => <p key={block.block_key} data-office-block-key={block.block_key} data-document-block={block.block_key} className={blockClass(block)}>{baseline[block.block_key] ?? block.text}</p>)}
        </div>
        <footer><span>第 1 页</span><span>{dirty ? "未保存" : "已保存"}</span></footer>
      </article>
    </div>
    {saveError && <p className="office-editor__error" role="alert">{saveError}</p>}
    {exitPrompt && <div className="office-editor__exit-prompt" role="dialog" aria-label="保存文档更改">
      <div><strong>还有未保存的更改</strong><span>返回阅读模式前，是否保存本次修改？</span></div>
      <div><button type="button" onClick={() => setExitPrompt(false)}>继续编辑</button><button type="button" onClick={() => { setExitPrompt(false); onExit(); }}>放弃更改</button><button type="button" className="office-editor__save" disabled={saving} onClick={() => void saveAndExit()}>保存并返回</button></div>
    </div>}
  </section>;
}
