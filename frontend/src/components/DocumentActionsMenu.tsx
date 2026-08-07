import { useEffect, useRef, useState } from "react";
import type { DocumentItem } from "../document/types";
import { AnchoredMenu } from "./AnchoredMenu";
import { ConfirmDialog } from "./ConfirmDialog";

export type DocumentExportFormat = "source" | "pdf";

const SOURCE_EXPORT_LABELS: Record<DocumentItem["format"], string> = {
  pdf: "导出为 PDF",
  docx: "导出为 Word",
  markdown: "导出为 Markdown",
  text: "导出为 TXT",
  csv: "导出为 CSV",
  xlsx: "导出为 Excel",
  pptx: "导出为 PowerPoint",
  ipynb: "导出为 Jupyter Notebook",
};

const TEXT_EXPORT_LABELS: Record<string, string> = {
  txt: "TXT",
  json: "JSON",
  yaml: "YAML",
  yml: "YAML",
  xml: "XML",
  html: "HTML",
  css: "CSS",
  js: "JavaScript",
  jsx: "JavaScript",
  ts: "TypeScript",
  tsx: "TypeScript",
  py: "Python",
  java: "Java",
  c: "C",
  cpp: "C++",
  h: "C / C++",
  hpp: "C++",
  sql: "SQL",
  log: "LOG",
  ini: "INI",
  toml: "TOML",
};

function sourceExportLabel(document: DocumentItem) {
  const extension = document.filename.split(".").pop()?.toLowerCase() || "";
  if (document.format === "text") return `导出为 ${TEXT_EXPORT_LABELS[extension] || "TXT"}`;
  if (document.format === "csv" && extension === "tsv") return "导出为 TSV";
  return SOURCE_EXPORT_LABELS[document.format];
}

export function DocumentActionsMenu({
  document,
  onRename,
  onTrash,
  onExport,
}: {
  document: DocumentItem;
  onRename: (title: string) => Promise<void>;
  onTrash: () => Promise<void>;
  onExport: (format: DocumentExportFormat) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(document.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setName(document.title), [document.title]);
  useEffect(() => { if (open && renaming) inputRef.current?.focus(); }, [open, renaming]);

  async function rename() {
    const cleanName = name.trim();
    if (!cleanName || cleanName === document.title || busy) return;
    setBusy(true);
    setError("");
    try {
      await onRename(cleanName);
      setOpen(false);
      setRenaming(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "资料重命名失败");
    } finally {
      setBusy(false);
    }
  }

  async function exportDocument(format: DocumentExportFormat) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onExport(format);
      setOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "资料导出失败");
    } finally {
      setBusy(false);
    }
  }

  async function trash() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onTrash();
      setConfirming(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "资料移动失败");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="safe-action-menu document-actions-menu">
      <button
        ref={triggerRef}
        type="button"
        className="safe-action-menu__trigger"
        aria-label={`更多资料操作：${document.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}
      >•••</button>
      <AnchoredMenu open={open} anchorRef={triggerRef} ariaLabel={`${document.title}的资料操作`} className="document-actions-popover" onClose={() => { setOpen(false); setRenaming(false); setError(""); }}>
        <div><small>资料操作</small><strong>{document.title}</strong></div>
        {renaming ? <form className="document-actions-rename" onSubmit={(event) => { event.preventDefault(); void rename(); }}>
          <label>资料名称<input ref={inputRef} aria-label="资料名称" value={name} maxLength={240} onChange={(event) => setName(event.target.value)} /></label>
          <div><button type="button" className="quiet-action" onClick={() => { setRenaming(false); setName(document.title); }}>取消</button><button type="submit" className="primary-action" aria-label="保存资料名称" disabled={!name.trim() || name.trim() === document.title || busy}>保存</button></div>
        </form> : <>
          <button type="button" role="menuitem" onClick={() => void exportDocument("source")}>{sourceExportLabel(document)}</button>
          {document.format !== "pdf" && <button type="button" role="menuitem" onClick={() => void exportDocument("pdf")}>导出为 PDF</button>}
          <button type="button" role="menuitem" onClick={() => setRenaming(true)}>重命名资料</button>
          <button type="button" role="menuitem" className="is-danger" onClick={() => { setOpen(false); setConfirming(true); setError(""); }}>移入回收站</button>
        </>}
        {error && <p className="course-actions-error" role="alert">{error}</p>}
      </AnchoredMenu>
    </div>
    <ConfirmDialog
      open={confirming}
      title="将资料移入回收站？"
      description={<p><strong>“{document.title}”</strong> 会从资料库移除；知识图谱中的引用快照仍会保留。</p>}
      confirmLabel="确认移入回收站"
      busy={busy}
      error={error}
      onCancel={() => { if (!busy) { setConfirming(false); setError(""); triggerRef.current?.focus(); } }}
      onConfirm={() => void trash()}
    />
  </>;
}
