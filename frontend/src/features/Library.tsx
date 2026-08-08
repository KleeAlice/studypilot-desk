import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createImportItems, importQueueReducer } from "../document/import-queue";
import type { DocumentFormat, DocumentItem, SearchItem } from "../document/types";
import type { ApiClient } from "../services/api";
import { DocumentActionsMenu } from "../components/DocumentActionsMenu";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { platform } from "../platform";

const ACCEPTED_EXTENSIONS = new Set(["pdf", "docx", "md", "markdown", "txt", "csv", "tsv", "json", "yaml", "yml", "xml", "html", "css", "js", "jsx", "ts", "tsx", "py", "java", "c", "cpp", "h", "hpp", "sql", "log", "ini", "toml", "xlsx", "pptx", "ipynb"]);

function extension(filename: string) {
  return filename.split(".").pop()?.toLocaleLowerCase() || "";
}

type FormatFilter = "all" | DocumentFormat;
type SortMode = "import-newest" | "import-oldest" | "source-newest" | "source-oldest" | "title-asc" | "title-desc";

function libraryViewKey(courseId?: number) {
  return courseId ? `studypilot.document-library.view.v1.${courseId}` : "";
}

function readLibraryView(courseId?: number): { query: string; format: FormatFilter; sort: SortMode } {
  const key = libraryViewKey(courseId);
  if (!key) return { query: "", format: "all", sort: "import-newest" };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "{}") as Record<string, unknown>;
    const format = FORMAT_OPTIONS.some((item) => item.value === parsed.format) ? parsed.format as FormatFilter : "all";
    const sortModes: SortMode[] = ["import-newest", "import-oldest", "source-newest", "source-oldest", "title-asc", "title-desc"];
    const sort = sortModes.includes(parsed.sort as SortMode) ? parsed.sort as SortMode : "import-newest";
    return { query: typeof parsed.query === "string" ? parsed.query : "", format, sort };
  } catch {
    return { query: "", format: "all", sort: "import-newest" };
  }
}

function documentFlag(document: DocumentItem, key: "favorite" | "pinned") {
  return document.metadata?.[key] === true;
}

const FORMAT_OPTIONS: Array<{ value: FormatFilter; label: string }> = [
  { value: "all", label: "全部格式" },
  { value: "pdf", label: "PDF" },
  { value: "docx", label: "Word" },
  { value: "markdown", label: "Markdown" },
  { value: "text", label: "TXT / 代码" },
  { value: "csv", label: "CSV" },
  { value: "xlsx", label: "Excel" },
  { value: "pptx", label: "PowerPoint" },
  { value: "ipynb", label: "Notebook" },
];

function asDate(value?: string | null) {
  if (!value) return null;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value?: string | null) {
  const date = asDate(value);
  if (!date) return "未知";
  const parts = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}

function compareDate(a?: string | null, b?: string | null, direction = 1) {
  const left = asDate(a)?.getTime();
  const right = asDate(b)?.getTime();
  if (left === undefined && right === undefined) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  return (left - right) * direction;
}

function sortDocuments(items: DocumentItem[], mode: SortMode) {
  return [...items].sort((left, right) => {
    let result = 0;
    if (mode === "import-newest") result = compareDate(left.created_at, right.created_at, -1);
    if (mode === "import-oldest") result = compareDate(left.created_at, right.created_at, 1);
    if (mode === "source-newest") result = compareDate(left.source_created_at, right.source_created_at, -1);
    if (mode === "source-oldest") result = compareDate(left.source_created_at, right.source_created_at, 1);
    if (mode === "title-asc") result = left.title.localeCompare(right.title, "zh-CN", { numeric: true, sensitivity: "base" });
    if (mode === "title-desc") result = right.title.localeCompare(left.title, "zh-CN", { numeric: true, sensitivity: "base" });
    return Number(documentFlag(right, "favorite") || documentFlag(right, "pinned")) - Number(documentFlag(left, "favorite") || documentFlag(left, "pinned")) || result || right.id - left.id;
  });
}

async function sourceCreatedAt(file: File) {
  try {
    const nativeTime = await platform().files.sourceCreatedAt(file);
    if (nativeTime) return nativeTime;
  } catch {
    // Browser builds do not expose native filesystem metadata.
  }
  return file.lastModified > 0 ? new Date(file.lastModified).toISOString() : null;
}

interface DocumentLibraryProps {
  api: ApiClient;
  onOpen?: (document: DocumentItem) => void;
  onOpenKnowledgeSplit?: () => void;
  courseId?: number;
}

function DocumentLibrary({ api, onOpen, onOpenKnowledgeSplit, courseId, layout }: DocumentLibraryProps & { layout: "page" | "compact" }) {
  const rememberedView = readLibraryView(courseId);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [query, setQuery] = useState(rememberedView.query);
  const [formatFilter, setFormatFilter] = useState<FormatFilter>(rememberedView.format);
  const [sortMode, setSortMode] = useState<SortMode>(rememberedView.sort);
  const [results, setResults] = useState<SearchItem[]>([]);
  const [error, setError] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<number[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [queue, dispatchQueue] = useReducer(importQueueReducer, []);
  const fileInput = useRef<HTMLInputElement>(null);
  const pickerOpen = useRef(false);
  const dragDepth = useRef(0);
  const documentLoadVersion = useRef(0);

  async function load() {
    const version = ++documentLoadVersion.current;
    const nextDocuments = await api.get<DocumentItem[]>("/api/documents");
    if (version === documentLoadVersion.current) setDocuments(nextDocuments);
  }

  useEffect(() => { void load(); }, [api]);

  useEffect(() => {
    const key = libraryViewKey(courseId);
    if (!key) return;
    window.localStorage.setItem(key, JSON.stringify({ query, format: formatFilter, sort: sortMode }));
  }, [courseId, formatFilter, query, sortMode]);

  useEffect(() => {
    if (!importNotice) return;
    const timer = window.setTimeout(() => setImportNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [importNotice]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => documents.some((item) => item.id === id)));
  }, [documents]);

  useEffect(() => {
    const releasePicker = () => { pickerOpen.current = false; };
    window.addEventListener("focus", releasePicker);
    return () => window.removeEventListener("focus", releasePicker);
  }, []);

  function openPicker() {
    if (pickerOpen.current) return;
    pickerOpen.current = true;
    fileInput.current?.click();
  }

  async function importFiles(files: File[]) {
    const supported = files.filter((file) => ACCEPTED_EXTENSIONS.has(extension(file.name)));
    if (supported.length !== files.length) {
      setError("部分文件格式不受支持；可导入 PDF、DOCX、Markdown、CSV、常见文本/代码、XLSX、PPTX 和 Jupyter Notebook");
    } else {
      setError("");
    }
    if (!supported.length) return;
    const items = createImportItems(supported);
    dispatchQueue({ type: "enqueue", items });
    let completed = 0;
    for (const item of items) {
      dispatchQueue({ type: "start", id: item.id });
      const form = new FormData();
      form.append("file", item.file);
      const createdAt = await sourceCreatedAt(item.file);
      if (createdAt) form.append("source_created_at", createdAt);
      try {
        await api.post("/api/documents/import", form, { timeoutMs: 600_000 });
        dispatchQueue({ type: "finish", id: item.id });
        completed += 1;
      } catch (reason) {
        dispatchQueue({
          type: "fail",
          id: item.id,
          message: reason instanceof Error ? reason.message : "导入失败",
        });
      }
    }
    try { await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "资料列表刷新失败"); }
    dispatchQueue({ type: "dismiss_completed" });
    if (completed) setImportNotice(`${completed} 份资料导入完成`);
  }

  async function search(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return setResults([]);
    try { setResults(await api.get(`/api/search?q=${encodeURIComponent(query)}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "搜索失败"); }
  }

  async function renameDocument(document: DocumentItem, title: string) {
    const updated = await api.patch<DocumentItem>(`/api/documents/${document.id}`, { title });
    setDocuments((current) => current.map((item) => item.id === document.id ? updated : item));
  }

  async function exportDocument(document: DocumentItem, format: "source" | "pdf") {
    setError("");
    try {
      const artifact = await api.download(`/api/documents/${document.id}/export`, { format });
      const savedPath = await platform().files.saveToArchive({ suggestedName: artifact.filename, bytes: artifact.bytes });
      if (savedPath) {
      } else {
        if (platform().kind !== "web") {
          setImportNotice("已取消导出");
          return;
        }
        const bytes = artifact.bytes.buffer.slice(
          artifact.bytes.byteOffset,
          artifact.bytes.byteOffset + artifact.bytes.byteLength,
        ) as ArrayBuffer;
        const url = URL.createObjectURL(new Blob([bytes], { type: artifact.mediaType }));
        const anchor = window.document.createElement("a");
        anchor.href = url;
        anchor.download = artifact.filename;
        anchor.click();
        URL.revokeObjectURL(url);
      }
      setImportNotice(`已导出 ${artifact.filename}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "资料导出失败";
      setError(message);
      throw reason;
    }
  }

  async function trashDocument(document: DocumentItem) {
    await api.delete(`/api/documents/${document.id}`);
    setDocuments((current) => current.filter((item) => item.id !== document.id));
  }

  async function updateDocumentFlag(document: DocumentItem, key: "favorite" | "pinned") {
    setError("");
    try {
      const updated = await api.patch<DocumentItem>(`/api/documents/${document.id}`, {
        [key]: !documentFlag(document, key),
      });
      setDocuments((current) => current.map((item) => item.id === document.id ? updated : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "资料状态保存失败");
    }
  }

  async function deleteSelectedDocuments() {
    const ids = pendingDeleteIds;
    if (!ids.length || bulkBusy) return;
    setBulkBusy(true);
    setBulkError("");
    try {
      await Promise.all(ids.map((id) => api.delete(`/api/documents/${id}`)));
      setDocuments((current) => current.filter((item) => !ids.includes(item.id)));
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      setPendingDeleteIds([]);
    } catch (reason) {
      setBulkError(reason instanceof Error ? reason.message : "批量删除失败");
    } finally {
      setBulkBusy(false);
    }
  }

  function toggleDocumentSelection(documentId: number) {
    setSelectedIds((current) => current.includes(documentId)
      ? current.filter((id) => id !== documentId)
      : [...current, documentId]);
  }

  const activeImports = queue.filter((item) => item.state === "queued" || item.state === "uploading").length;
  const visibleDocuments = useMemo(() => {
    const filtered = formatFilter === "all"
      ? documents
      : documents.filter((document) => document.format === formatFilter);
    return sortDocuments(filtered, sortMode);
  }, [documents, formatFilter, sortMode]);
  const allVisibleSelected = visibleDocuments.length > 0 && visibleDocuments.every((item) => selectedIds.includes(item.id));

  return (
    <section
      className={`page document-library ${layout === "compact" ? "is-compact" : ""} ${dragging ? "is-dragging" : ""}`}
      data-testid="document-library-page"
      onDragEnter={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        void importFiles(Array.from(event.dataTransfer.files));
      }}
    >
      {dragging && <div className="document-drop-veil" role="status"><span>＋</span><strong>释放文件，加入资料库</strong><small>PDF · Word · Markdown · CSV · 文本/代码 · Excel · PowerPoint · Jupyter Notebook</small></div>}
      <div className="page-heading">
        <div><h1>本地资料库</h1></div>
        <div className="document-library__actions">
          {onOpenKnowledgeSplit && <button className="quiet-action linked-split-trigger" aria-label="分屏打开知识图谱" onClick={onOpenKnowledgeSplit}>⌘ 知识图谱</button>}
          <button className="primary-action" aria-label="导入资料" onClick={openPicker}>{activeImports ? `${activeImports} 个文件导入中…` : "导入资料"}</button>
        </div>
        <input
          ref={fileInput}
          aria-label="选择资料文件"
          className="visually-hidden"
          type="file"
          multiple
          accept=".pdf,.docx,.md,.markdown,.txt,.csv,.tsv,.json,.yaml,.yml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.hpp,.sql,.log,.ini,.toml,.xlsx,.pptx,.ipynb"
          onChange={(event) => {
            pickerOpen.current = false;
            const files = Array.from(event.target.files || []);
            event.target.value = "";
            void importFiles(files);
          }}
        />
      </div>

      {queue.length > 0 && <section className="import-queue" aria-label="资料导入队列">
        <header><div><strong>导入进度</strong></div><span>{queue.filter((item) => item.state === "done").length}/{queue.length}</span></header>
        <div>{queue.map((item) => <article key={item.id} data-state={item.state}>
          <i>{extension(item.file.name).toUpperCase()}</i>
          <span><strong>{item.file.name}</strong><small>{item.message}</small></span>
          {(item.state === "done" || item.state === "error") && <button aria-label={`移除导入记录：${item.file.name}`} onClick={() => dispatchQueue({ type: "dismiss", id: item.id })}>×</button>}
        </article>)}</div>
      </section>}

      {importNotice && <div role="status" aria-label="资料导入结果" className="library-import-notice">{importNotice}</div>}
      <form className="search-bar" onSubmit={search}><input name="query" autoComplete="off" aria-label="全文搜索" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索正文、术语或失败案例…"/><button>全文检索</button></form>
      {error && <p role="alert" className="error-message">{error}</p>}
      {results.length > 0 && <section className="search-results"><div className="panel-index">检索结果 · {results.length}</div>{results.map((item) => <article key={`${item.document_id}-${item.snippet}`}><strong>{item.title}</strong><p>{item.snippet.replace(/<\/?mark>/g, "")}</p><small>{item.filename}</small></article>)}</section>}
      {documents.length > 0 && <section className="library-controls" aria-label="书架筛选与排序">
        <div className="library-controls__count"><strong>显示 {visibleDocuments.length} / {documents.length} 本</strong>{selectedIds.length > 0 && <span>已选 {selectedIds.length}</span>}</div>
        <label><span>格式</span><select aria-label="筛选资料格式" value={formatFilter} onChange={(event) => setFormatFilter(event.target.value as FormatFilter)}>
          {FORMAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        <label><span>排序</span><select aria-label="排序资料" value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
          <option value="import-newest">最近导入</option>
          <option value="import-oldest">最早导入</option>
          <option value="source-newest">文件创建：最新</option>
          <option value="source-oldest">文件创建：最早</option>
          <option value="title-asc">标题：A → Z</option>
          <option value="title-desc">标题：Z → A</option>
        </select></label>
        <div className="library-controls__bulk">
          <button type="button" aria-label={allVisibleSelected ? "取消全选全部资料" : "全选全部资料"} onClick={() => setSelectedIds(allVisibleSelected ? selectedIds.filter((id) => !visibleDocuments.some((item) => item.id === id)) : Array.from(new Set([...selectedIds, ...visibleDocuments.map((item) => item.id)])))}>
            {allVisibleSelected ? "取消全选" : "全选"}
          </button>
          <button type="button" aria-label="删除所选资料" disabled={!selectedIds.length} onClick={() => { setBulkError(""); setPendingDeleteIds(selectedIds); }}>删除所选</button>
          <button type="button" className="is-danger" aria-label="删除全部资料" onClick={() => { setBulkError(""); setPendingDeleteIds(documents.map((item) => item.id)); }}>全部删除</button>
        </div>
        <button type="button" disabled={formatFilter === "all" && sortMode === "import-newest"} onClick={() => { setFormatFilter("all"); setSortMode("import-newest"); }}>重置</button>
      </section>}
      <div className="document-list">{visibleDocuments.length ? visibleDocuments.map((document) => {
        const fileExtension = extension(document.filename).toUpperCase();
        return <article className="document-card document-book" data-format={document.format} data-testid={`document-book-${document.id}`} key={document.id}>
          <label className="document-book__select"><input type="checkbox" aria-label={`选择资料：${document.title}`} checked={selectedIds.includes(document.id)} onChange={() => toggleDocumentSelection(document.id)} /><span /></label>
          <div className="document-book__spine" data-testid={`book-spine-${document.id}`} aria-hidden="true"><span>{fileExtension}</span></div>
          <button type="button" className="document-card__open" aria-label={`打开资料：${document.title}`} onClick={() => onOpen?.(document)}>
            {documentFlag(document, "favorite") && <span className="document-book__bookmark" aria-label="已收藏" />}
            <span className="document-book__edition"><span className="file-type">{fileExtension}</span></span>
            <span className="document-book__copy"><h2>{document.title}</h2><p>{document.body.slice(0, 160)}</p><small title={document.filename}>{document.filename}</small></span>
            <span className="document-book__dates">
              <span><b>文件创建</b><time dateTime={document.source_created_at || undefined}>{formatDateTime(document.source_created_at)}</time></span>
              <span><b>导入时间</b><time dateTime={document.created_at}>{formatDateTime(document.created_at)}</time></span>
            </span>
            <span className="document-book__page-edge" aria-hidden="true" />
          </button>
          <footer>
            <button type="button" onClick={() => onOpen?.(document)}>打开阅读 <span>↗</span></button>
            <button type="button" aria-label={documentFlag(document, "favorite") ? `取消收藏：${document.title}` : `收藏：${document.title}`} aria-pressed={documentFlag(document, "favorite")} onClick={() => void updateDocumentFlag(document, "favorite")}>☆</button>
            <button type="button" aria-label={documentFlag(document, "pinned") ? `取消置顶：${document.title}` : `置顶：${document.title}`} aria-pressed={documentFlag(document, "pinned")} onClick={() => void updateDocumentFlag(document, "pinned")}>⌃</button>
            <DocumentActionsMenu document={document} onRename={(title) => renameDocument(document, title)} onTrash={() => trashDocument(document)} onExport={(format) => exportDocument(document, format)} />
          </footer>
        </article>;
      }) : documents.length ? <div className="empty-state library-filter-empty"><strong>没有符合筛选条件的资料</strong><button type="button" onClick={() => setFormatFilter("all")}>查看全部资料</button></div> : <div className="empty-state">资料库为空。把 PDF、Word、Markdown、CSV、文本/代码、Excel、PowerPoint 或 Jupyter Notebook 拖到这里开始。</div>}</div>
      <ConfirmDialog
        open={pendingDeleteIds.length > 0}
        title={`删除 ${pendingDeleteIds.length} 份资料？`}
        description={<p>所选资料会移入回收站，已有知识引用快照仍会保留。</p>}
        confirmLabel={`确认删除 ${pendingDeleteIds.length} 份资料`}
        busy={bulkBusy}
        error={bulkError}
        onCancel={() => { if (!bulkBusy) { setPendingDeleteIds([]); setBulkError(""); } }}
        onConfirm={() => void deleteSelectedDocuments()}
      />
    </section>
  );
}

export function Library(props: DocumentLibraryProps) {
  return <DocumentLibrary {...props} layout="page" />;
}

export function CompactLibrary(props: DocumentLibraryProps) {
  return <DocumentLibrary {...props} layout="compact" />;
}
