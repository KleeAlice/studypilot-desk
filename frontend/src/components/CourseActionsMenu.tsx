import { useEffect, useRef, useState } from "react";
import type { Course } from "../types";
import { COURSE_COVER_PRESETS } from "../ui/course-covers";
import { AnchoredMenu } from "./AnchoredMenu";
import { ConfirmDialog } from "./ConfirmDialog";

type CourseChanges = Partial<Pick<Course, "title" | "cover_style">>;

export function CourseActionsMenu({
  course,
  disabled = false,
  onUpdate,
  onTrash,
}: {
  course: Course;
  disabled?: boolean;
  onUpdate: (changes: CourseChanges) => Promise<void>;
  onTrash: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "rename">("menu");
  const [name, setName] = useState(course.title);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [trashError, setTrashError] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && mode === "rename") inputRef.current?.focus();
  }, [mode, open]);

  function toggle() {
    setOpen((value) => !value);
    setMode("menu");
    setName(course.title);
    setError("");
  }

  async function update(changes: CourseChanges) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onUpdate(changes);
      setOpen(false);
      setMode("menu");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "课程信息更新失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  async function confirmTrash() {
    if (busy) return;
    setBusy(true);
    setTrashError("");
    try {
      await onTrash();
      setConfirming(false);
    } catch (reason) {
      setTrashError(reason instanceof Error ? reason.message : "课程移动失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  const cleanName = name.trim();

  return <>
    <div className="safe-action-menu course-actions-menu">
      <button
        ref={triggerRef}
        type="button"
        className="safe-action-menu__trigger"
        aria-label={`更多课程操作：${course.title}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled || busy}
        onClick={(event) => { event.stopPropagation(); toggle(); }}
      >•••</button>
      <AnchoredMenu open={open} anchorRef={triggerRef} className="course-actions-popover" ariaLabel={`${course.title}的课程操作`} onClose={() => { setOpen(false); setMode("menu"); }}>
          <div className="course-actions-popover__heading"><small>课程操作</small><strong>{course.title}</strong></div>
          {mode === "rename" ? <form className="course-actions-rename" onSubmit={(event) => { event.preventDefault(); void update({ title: cleanName }); }}>
            <label>课程名称<input ref={inputRef} aria-label="课程名称" value={name} maxLength={160} onChange={(event) => setName(event.target.value)} /></label>
            <div><button type="button" className="quiet-action" disabled={busy} onClick={() => { setMode("menu"); setError(""); }}>取消</button><button type="submit" className="primary-action" aria-label="保存名称" disabled={busy || !cleanName || cleanName === course.title}>保存</button></div>
          </form> : <>
            <button type="button" role="menuitem" aria-label="重命名课程" className="course-actions-popover__rename" onClick={() => { setName(course.title); setMode("rename"); }}>重命名课程 <span aria-hidden="true">⌘ R</span></button>
            <div className="course-actions-colors" role="group" aria-label="封面配色">
              <small>封面配色</small>
              <div>{COURSE_COVER_PRESETS.map((preset) => <button
                key={preset.id}
                type="button"
                role="menuitemradio"
                aria-checked={(course.cover_style || "cobalt") === preset.id}
                aria-label={`更换为${preset.label}封面`}
                className={`course-cover-swatch course-volume--${preset.id}`}
                title={preset.label}
                disabled={busy}
                onClick={() => void update({ cover_style: preset.id })}
              ><i /><span>{preset.label}</span></button>)}</div>
            </div>
            <button type="button" role="menuitem" className="is-danger" onClick={() => { setOpen(false); setTrashError(""); setConfirming(true); }}>移入回收站</button>
          </>}
          {error && <p className="course-actions-error" role="alert">{error}</p>}
      </AnchoredMenu>
    </div>
    <ConfirmDialog
      open={confirming}
      title="将课程移入回收站？"
      description={<p><strong>“{course.title}”</strong> 会从课程书架移除，其中的任务、资料、知识笔记和实验记录可在回收站恢复。</p>}
      confirmLabel="确认移入回收站"
      busy={busy}
      error={trashError}
      icon="♲"
      onCancel={() => { if (!busy) { setConfirming(false); setTrashError(""); triggerRef.current?.focus(); } }}
      onConfirm={() => void confirmTrash()}
    />
  </>;
}
