import { useState } from "react";
import type { Course } from "../types";

interface NotebookShelfProps {
  courses: Course[];
  activeCourseId: number;
  onOpen(course: Course): Promise<void>;
  onCreate(title: string, description: string): Promise<void>;
  onDelete(course: Course): Promise<void>;
}

function formatUpdated(value?: string) {
  if (!value) return "本地持续保存";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "本地持续保存";
  return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date);
}

export function NotebookShelf({ courses, activeCourseId, onOpen, onCreate, onDelete }: NotebookShelfProps) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busyId, setBusyId] = useState<number | "create" | null>(null);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || busyId) return;
    setBusyId("create");
    setError("");
    try {
      await onCreate(title.trim(), description.trim());
      setTitle("");
      setDescription("");
      setCreating(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "暂时无法创建笔记本");
    } finally {
      setBusyId(null);
    }
  }

  async function open(course: Course) {
    if (busyId) return;
    setBusyId(course.id);
    setError("");
    try {
      await onOpen(course);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "暂时无法打开笔记本");
      setBusyId(null);
    }
  }

  async function remove(course: Course) {
    if (courses.length <= 1 || busyId) return;
    if (!window.confirm(`确定删除“${course.title}”及其中的知识卡片吗？此操作不可撤销。`)) return;
    setBusyId(course.id);
    setError("");
    try {
      await onDelete(course);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "暂时无法删除笔记本");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="page notebook-library">
      <div className="page-heading notebook-library__heading">
        <div>
          <h1>知识笔记本</h1>
          <p>每门课程都是一本独立笔记本。打开后再进入导图与自由画布，资料、便签和记忆卡都留在对应课程中。</p>
        </div>
        <div className="notebook-library__summary" aria-label="笔记本概览">
          <strong>{courses.length}</strong><span>本笔记</span>
          <i />
          <strong>{courses.reduce((total, course) => total + (course.node_count ?? 0), 0)}</strong><span>张卡片</span>
        </div>
      </div>

      {error && <div className="inline-error" role="alert">{error}</div>}

      <div className="notebook-shelf" aria-label="课程笔记本书架">
        <div className={`new-notebook ${creating ? "is-creating" : ""}`}>
          {creating ? (
            <form onSubmit={submit} aria-label="创建新笔记本">
              <span className="new-notebook__glyph">＋</span>
              <label>笔记本名称<input autoFocus value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} placeholder="例如：深度学习基础" /></label>
              <label>一句话描述<textarea value={description} maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder="这本笔记解决什么问题？" /></label>
              <div><button type="button" onClick={() => setCreating(false)}>取消</button><button className="primary" type="submit" disabled={!title.trim() || busyId === "create"}>{busyId === "create" ? "创建中…" : "创建并打开"}</button></div>
            </form>
          ) : (
            <button type="button" className="new-notebook__trigger" onClick={() => setCreating(true)}>
              <span>＋</span><strong>新建课程笔记本</strong><small>从空白导图与画布开始</small>
            </button>
          )}
        </div>

        {courses.map((course, index) => (
          <article className={`notebook-book notebook-book--${course.id % 5} ${course.id === activeCourseId ? "is-active" : ""}`} style={{ "--book-index": index } as React.CSSProperties} key={course.id}>
            <div className="notebook-book__pages" />
            <button className="notebook-book__cover" type="button" aria-label={`打开笔记本：${course.title}`} onClick={() => void open(course)} disabled={busyId === course.id}>
              <span className="notebook-book__binding" />
              <span className="notebook-book__kicker">STUDYPILOT · NOTEBOOK {String(index + 1).padStart(2, "0")}</span>
              <strong>{course.title}</strong>
              <p>{course.description || "用知识卡片、导图和资料摘录建立你的课程脉络。"}</p>
              <span className="notebook-book__meta"><b>{course.node_count ?? 0} 张卡片</b><b>{course.edge_count ?? 0} 条关系</b></span>
              <span className="notebook-book__foot"><small>{formatUpdated(course.updated_at)}</small><em>{course.id === activeCourseId ? "正在学习" : "打开画布 →"}</em></span>
            </button>
            <button className="notebook-book__delete" type="button" aria-label={`删除笔记本：${course.title}`} title={courses.length <= 1 ? "至少保留一本笔记本" : "删除笔记本"} disabled={courses.length <= 1 || busyId === course.id} onClick={() => void remove(course)}>×</button>
          </article>
        ))}
        <div className="notebook-shelf__plank" aria-hidden="true" />
      </div>
    </section>
  );
}
