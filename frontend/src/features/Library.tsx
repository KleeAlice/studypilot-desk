import { useEffect, useRef, useState } from "react";
import type { ApiClient } from "../services/api";

interface DocumentItem { id: number; title: string; filename: string; body: string; metadata: Record<string, unknown> }
interface SearchItem { document_id: number; title: string; filename: string; snippet: string }

export function Library({ api }: { api: ApiClient }) {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [query, setQuery] = useState(""); const [results, setResults] = useState<SearchItem[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  async function load() { setDocuments(await api.get("/api/documents")); }
  useEffect(() => { void load(); }, [api]);
  async function importFiles(files: FileList | null) { if (!files) return; setBusy(true); setError(""); try { for (const file of Array.from(files)) { const form = new FormData(); form.append("file", file); await api.post("/api/documents/import", form); } await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "导入失败"); } finally { setBusy(false); if (fileInput.current) fileInput.current.value = ""; } }
  async function search(event: React.FormEvent) { event.preventDefault(); if (!query.trim()) return setResults([]); try { setResults(await api.get(`/api/search?q=${encodeURIComponent(query)}`)); } catch (reason) { setError(reason instanceof Error ? reason.message : "搜索失败"); } }
  return (
    <section className="page">
      <div className="page-heading"><div><div className="eyebrow">LIBRARY / LOCAL FTS</div><h1>本地资料库</h1><p>文件正文在本机解析，SQLite FTS5 检索，不会默认上传。</p></div><button className="primary-action" onClick={() => fileInput.current?.click()}>{busy ? "正在解析…" : "导入资料"}</button><input ref={fileInput} className="visually-hidden" type="file" multiple accept=".pdf,.docx,.md,.txt" onChange={(event) => importFiles(event.target.files)} /></div>
      <form className="search-bar" onSubmit={search}><input aria-label="全文搜索" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索正文、术语或失败案例"/><button>全文检索</button></form>
      {error && <p role="alert" className="error-message">{error}</p>}
      {results.length > 0 && <section className="search-results"><div className="panel-index">SEARCH RESULT / {results.length}</div>{results.map((item) => <article key={`${item.document_id}-${item.snippet}`}><strong>{item.title}</strong><p>{item.snippet.replace(/<\/?mark>/g, "")}</p><small>{item.filename}</small></article>)}</section>}
      <div className="document-list">{documents.length ? documents.map((document) => <article key={document.id}><div className="file-type">{document.filename.split(".").pop()?.toUpperCase()}</div><div><h2>{document.title}</h2><p>{document.body.slice(0, 160)}</p><small>{document.filename}</small></div></article>) : <div className="empty-state">资料库为空。导入 PDF、DOCX、Markdown 或 TXT 后，正文会真实进入全文索引。</div>}</div>
    </section>
  );
}

