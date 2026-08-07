import { useState } from "react";
import type { Course } from "../types";

function remainingDays(value?: string | null): number {
  if (!value) return 30;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));
}

export function Trash({ courses, onRestore, onPurge, onBack }: {
  courses: Course[];
  onRestore: (course: Course) => Promise<void>;
  onPurge: (course: Course) => Promise<void>;
  onBack: () => void;
}) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  async function run(course: Course, action: (course: Course) => Promise<void>) {
    setBusyId(course.id); setError("");
    try { await action(course); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败"); }
    finally { setBusyId(null); }
  }
  return <main className="global-subpage trash-page">
    <header className="global-subpage-header"><button className="back-link" onClick={onBack}>← 返回课程书架</button><h1>回收站</h1><p>课程移入后保留 30 天。恢复会带回任务、资料、知识笔记、实验记录和图片。</p></header>
    {courses.length ? <div className="trash-list">{courses.map((course) => <article key={course.id}><div className={`trash-course-cover course-volume--${course.cover_style || "indigo"}`}><i>{course.icon === "python" ? "λ" : course.icon === "matrix" ? "∑" : "◇"}</i></div><div><small>剩余 {remainingDays(course.purge_after)} 天</small><h2>{course.title}</h2><p>{course.description || "没有课程说明"}</p><span>{course.node_count || 0} 个知识节点 · 删除于 {course.deleted_at ? new Date(course.deleted_at).toLocaleDateString("zh-CN") : "最近"}</span></div><footer><button aria-label={`恢复课程：${course.title}`} disabled={busyId !== null} onClick={() => void run(course, onRestore)}>恢复课程</button><button className="danger-action" aria-label={`永久删除课程：${course.title}`} disabled={busyId !== null} onClick={() => void run(course, onPurge)}>永久删除</button></footer></article>)}</div> : <div className="global-empty"><span>♲</span><h2>回收站是空的</h2><p>被移除的课程会在这里安全保留 30 天。</p><button onClick={onBack}>返回课程书架</button></div>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </main>;
}
