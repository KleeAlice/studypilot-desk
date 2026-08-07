import { useMemo, useState } from "react";
import { SafeTrashMenu } from "../components/SafeTrashMenu";
import { MotionPresence } from "../components/MotionPresence";
import type { KnowledgeNotebook } from "../types";

type NotebookDraft = Pick<KnowledgeNotebook, "title" | "description" | "kind" | "cover_style">;

export function NotebookLibrary({ courseTitle, notebooks, onOpen, onCreate, onTrash, onBackHome }: {
  courseTitle: string;
  notebooks: KnowledgeNotebook[];
  onOpen: (notebook: KnowledgeNotebook) => void;
  onCreate: (draft: NotebookDraft) => Promise<void>;
  onTrash: (notebook: KnowledgeNotebook) => Promise<void>;
  onBackHome: () => void;
}) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<KnowledgeNotebook["kind"]>("mixed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return keyword ? notebooks.filter((item) => `${item.title} ${item.description}`.toLocaleLowerCase().includes(keyword)) : notebooks;
  }, [notebooks, query]);
  const nodeCount = notebooks.reduce((sum, item) => sum + Number(item.node_count || 0), 0);

  async function create() {
    if (!title.trim() || busy) return;
    setBusy(true); setError("");
    try {
      await onCreate({ title: title.trim(), description: description.trim(), kind, cover_style: kind === "mindmap" ? "moss" : kind === "canvas" ? "cobalt" : "plum" });
      setTitle(""); setDescription(""); setKind("mixed"); setCreating(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "知识笔记创建失败"); }
    finally { setBusy(false); }
  }

  return <section className="notebook-library page">
    <header className="notebook-library-header">
      <button className="back-link" onClick={onBackHome}>← 课程主页</button>
      <div><div className="eyebrow">{courseTitle} / KNOWLEDGE NOTEBOOKS</div><h1>知识笔记</h1></div>
      <button className="primary-action notebook-create-trigger" aria-label="新建知识笔记" onClick={() => setCreating(true)}>＋ 新建知识笔记</button>
    </header>
    <div className="notebook-library-toolbar"><label><span>⌕</span><input aria-label="搜索知识笔记" placeholder="搜索标题或主题" value={query} onChange={(event) => setQuery(event.target.value)} /></label><p>{notebooks.length} 本笔记 · {nodeCount} 个节点</p><div><button className="is-active">最近编辑</button><button>名称</button></div></div>
    <div className="notebook-library-grid">{filtered.map((notebook, index) => <article className={`knowledge-notebook knowledge-notebook--${notebook.cover_style || "indigo"}`} key={notebook.id} style={{ "--notebook-index": index } as React.CSSProperties}>
      <button className="knowledge-notebook__cover" aria-label={`打开知识笔记：${notebook.title}`} onClick={() => onOpen(notebook)}>
        <span>{notebook.kind === "mindmap" ? "MIND MAP" : notebook.kind === "canvas" ? "FREE CANVAS" : "MIXED NOTES"}</span>
        <i>{notebook.kind === "mindmap" ? "⌘" : notebook.kind === "canvas" ? "✦" : "◇"}</i>
        <h2>{notebook.title}</h2><p>{notebook.description || "尚未添加说明"}</p>
        <small>{notebook.node_count || 0} 个节点 · {notebook.edge_count || 0} 条关系</small>
      </button>
      <footer><button onClick={() => onOpen(notebook)}>打开画布 →</button><SafeTrashMenu
        triggerLabel={`更多知识笔记操作：${notebook.title}`}
        menuLabel={`${notebook.title}的知识笔记操作`}
        dialogTitle="将知识笔记移入回收站？"
        itemName={notebook.title}
        consequence="会从当前课程中移除，画布内的卡片、图片和关系将一并保留在回收状态。"
        onConfirm={() => onTrash(notebook)}
      /></footer>
    </article>)}<button className="knowledge-notebook-add" aria-label="从空白卡片新建知识笔记" onClick={() => setCreating(true)}><span>＋</span><strong>新建知识笔记</strong><small>导图、画布或混合笔记</small></button></div>
    <MotionPresence present={creating} exitMs={180}>{(phase) => <div className="notebook-dialog-backdrop" data-presence={phase} onMouseDown={(event) => { if (event.target === event.currentTarget) setCreating(false); }}><section className="notebook-dialog" role="dialog" aria-labelledby="notebook-dialog-title"><header><div><h2 id="notebook-dialog-title">新建知识笔记</h2></div><button aria-label="关闭新建知识笔记" onClick={() => setCreating(false)}>×</button></header><label>知识笔记名称<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：模型评估方法" /></label><label>笔记说明<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="这本笔记聚焦什么主题？" /></label><fieldset><legend>笔记类型</legend><div className="notebook-kind-options"><button type="button" aria-label="混合笔记" className={kind === "mixed" ? "is-selected" : ""} onClick={() => setKind("mixed")}><i>◇</i><strong>混合笔记</strong><small>便签、图片与关系</small></button><button type="button" aria-label="思维导图" className={kind === "mindmap" ? "is-selected" : ""} onClick={() => setKind("mindmap")}><i>⌘</i><strong>思维导图</strong><small>层级与分支</small></button><button type="button" aria-label="自由画布" className={kind === "canvas" ? "is-selected" : ""} onClick={() => setKind("canvas")}><i>✦</i><strong>自由画布</strong><small>自由布局与创作</small></button></div></fieldset>{error && <p role="alert" className="error-message">{error}</p>}<footer><button className="quiet-action" onClick={() => setCreating(false)}>取消</button><button className="primary-action" disabled={!title.trim() || busy} onClick={() => void create()}>{busy ? "正在创建…" : "创建知识笔记"}</button></footer></section></div>}</MotionPresence>
  </section>;
}
