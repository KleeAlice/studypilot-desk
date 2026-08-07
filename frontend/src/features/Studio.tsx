import { useEffect, useState } from "react";
import type { ApiClient } from "../services/api";

interface Item { id: number; title: string; payload: Record<string, any>; updated_at: string }

export function Studio({ api }: { api: ApiClient }) {
  const [projects, setProjects] = useState<Item[]>([]); const [research, setResearch] = useState<Item[]>([]); const [title, setTitle] = useState(""); const [track, setTrack] = useState<"projects" | "research">("projects");
  async function load() { const [left, right] = await Promise.all([api.get<Item[]>("/api/projects"), api.get<Item[]>("/api/research")]); setProjects(left); setResearch(right); }
  useEffect(() => { void load(); }, [api]);
  async function create(event: React.FormEvent) { event.preventDefault(); if (!title.trim()) return; await api.post(`/api/${track}`, { title, payload: { status: "active", evidence: [], track: track === "projects" ? "StudyPilot" : "IndependentResearch" } }); setTitle(""); await load(); }
  return (
    <section className="page"><div className="page-heading"><div><div className="eyebrow">BUILD / RESEARCH</div><h1>项目与研究工作台</h1><p>工程项目与个人研究证据分轨管理。</p></div></div><form className="studio-create" onSubmit={create}><select value={track} onChange={(event) => setTrack(event.target.value as any)}><option value="projects">工程项目</option><option value="research">个人研究</option></select><input aria-label="项目或研究标题" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="新建可验收工作项"/><button>创建工作项</button></form><div className="split-ledger"><Ledger title="PROJECT" accent="cyan" items={projects} empty="还没有项目工作项。创建后记录代码、测试、指标和失败案例。"/><Ledger title="RESEARCH" accent="magenta" items={research} empty="还没有研究工作项。先写假设、数据和基线，再运行实验。"/></div></section>
  );
}

function Ledger({ title, accent, items, empty }: { title: string; accent: string; items: Item[]; empty: string }) {
  return <section className={`ledger ledger--${accent}`}><div className="panel-index">{title}</div>{items.length ? items.map((item) => <article key={item.id}><div><span>{item.payload.status || "active"}</span><h2>{item.title}</h2></div><small>{item.updated_at}</small></article>) : <div className="empty-state">{empty}</div>}</section>;
}

