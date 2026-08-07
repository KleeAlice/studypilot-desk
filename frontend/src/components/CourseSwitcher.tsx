import { useEffect, useRef, useState } from "react";
import type { Course } from "../types";
import { AnchoredMenu } from "./AnchoredMenu";

export function CourseSwitcher({ courses, activeCourseId, fallbackTitle, onActivate, onCreate }: {
  courses: Course[];
  activeCourseId: number;
  fallbackTitle: string;
  onActivate: (course: Course) => Promise<void>;
  onCreate: (title: string, description: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [switchingId, setSwitchingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const active = courses.find((course) => course.id === activeCourseId);
  const activeTitle = active?.title || fallbackTitle || "我的课程";

  function closeAndRestoreFocus() {
    restoreFocusRef.current = true;
    setOpen(false);
    setCreating(false);
  }

  useEffect(() => {
    if (!open && !busy && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      triggerRef.current?.focus();
    }
  }, [busy, open]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true); setError("");
    try {
      await onCreate(title.trim(), description.trim());
      setTitle(""); setDescription(""); closeAndRestoreFocus();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "课程创建失败");
    } finally { setBusy(false); }
  }

  async function activate(course: Course) {
    if (course.id === activeCourseId) return closeAndRestoreFocus();
    setBusy(true); setSwitchingId(course.id); setError("");
    try { await onActivate(course); closeAndRestoreFocus(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "课程切换失败"); }
    finally { setBusy(false); setSwitchingId(null); }
  }

  return (
    <div className="course-switcher" ref={rootRef} data-course-switching={switchingId !== null ? String(switchingId) : undefined}>
      <button ref={triggerRef} className={`course-switcher__trigger ${switchingId !== null ? "is-switching" : ""}`} aria-label={`当前课程：${activeTitle}`} aria-expanded={open} aria-busy={busy} disabled={busy} onClick={() => setOpen((value) => !value)}>
        <span className="course-orbit" /><span><strong>{activeTitle}</strong></span><b>⌄</b>
      </button>
      <AnchoredMenu
        open={open}
        anchorRef={triggerRef}
        role="dialog"
        ariaLabel="课程空间"
        className="course-popover"
        onClose={closeAndRestoreFocus}
      >
        <div className="course-popover__head"><div><strong>课程空间</strong></div><button aria-label="关闭课程空间" onClick={closeAndRestoreFocus}>×</button></div>
        {!creating && <>
          <div className="course-list">{courses.map((course) => <button key={course.id} className={`${course.id === activeCourseId ? "is-active" : ""} ${course.id === switchingId ? "is-switching" : ""}`} onClick={() => void activate(course)} aria-label={`切换到 ${course.title}`} aria-busy={course.id === switchingId} disabled={busy}>
            <span>{course.title.slice(0, 1).toUpperCase()}</span><div><strong>{course.title}</strong><small>{course.description || "独立知识与实验空间"}</small></div>{course.id === activeCourseId && <i>正在使用</i>}
          </button>)}</div>
          <button className="course-create-entry" aria-label="新建课程" onClick={() => setCreating(true)}>＋ 新建课程</button>
        </>}
        {creating && <form className="course-create-form" onSubmit={create}>
          <div className="course-form-intro"><button type="button" aria-label="返回课程列表" onClick={() => setCreating(false)}>←</button><div><strong>建立新课程</strong><small>创建后直接进入空白知识画布</small></div></div>
          <label>课程名称<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：RAG 专项" maxLength={160} /></label>
          <label>课程描述<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="这门课程想解决什么问题？" maxLength={2000} /></label>
          <button className="primary-action" disabled={!title.trim() || busy}>{busy ? "正在创建…" : "创建并进入知识画布"}</button>
        </form>}
        {error && <p className="error-message" role="alert">{error}</p>}
      </AnchoredMenu>
    </div>
  );
}
