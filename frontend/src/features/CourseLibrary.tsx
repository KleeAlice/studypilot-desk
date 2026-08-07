import { useMemo, useState } from "react";
import { ProductIcon, type ProductIconName } from "../components/ProductIcon";
import { CourseActionsMenu } from "../components/CourseActionsMenu";
import { languageName } from "../language/LanguageCourseShell";
import type { Course } from "../types";

interface CourseLibraryProps {
  courses: Course[];
  activeCourseId: number;
  onOpen: (course: Course) => Promise<void>;
  onCreate: () => void;
  onUpdate: (course: Course, changes: Partial<Pick<Course, "title" | "cover_style">>) => Promise<void>;
  onTrash: (course: Course) => Promise<void>;
  onOpenTrash: () => void;
  onOpenSettings: () => void;
}

function courseIcon(value?: string) {
  return <ProductIcon name={(value || "book") as ProductIconName} className="course-cover-icon" />;
}

export function CourseLibrary({
  courses,
  activeCourseId,
  onOpen,
  onCreate,
  onUpdate,
  onTrash,
  onOpenTrash,
  onOpenSettings,
}: CourseLibraryProps) {
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    if (!keyword) return courses;
    return courses.filter((course) => `${course.title} ${course.description}`.toLocaleLowerCase().includes(keyword));
  }, [courses, query]);
  const active = courses.find((course) => course.id === activeCourseId) || courses[0];

  async function open(course: Course) {
    if (busyId !== null) return;
    setBusyId(course.id); setError("");
    try { await onOpen(course); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "暂时无法进入课程"); }
    finally { setBusyId(null); }
  }

  async function trash(course: Course) {
    if (busyId !== null) return;
    setBusyId(course.id); setError("");
    try { await onTrash(course); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "暂时无法移动课程"); }
    finally { setBusyId(null); }
  }

  return (
    <main className="course-library-shell" data-course-launching={busyId !== null ? String(busyId) : undefined} aria-busy={busyId !== null}>
      <div className="course-library-aurora" aria-hidden="true"><i /><i /><i /></div>
      <header className="course-library-topbar">
        <div className="course-library-brand"><span>SP</span><div><strong>StudyPilot</strong></div></div>
        <label className="course-library-search">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索课程、目标或主题" aria-label="搜索课程" />
          <kbd>Ctrl K</kbd>
        </label>
        <div className="course-library-actions">
          <button onClick={onOpenTrash}>回收站</button>
          <button onClick={onOpenSettings} aria-label="全局设置">设置</button>
        </div>
      </header>

      <section className="course-library-hero">
        <div>
          <h1>课程书架</h1>
        </div>
        <button className="course-create-button" onClick={onCreate}><span>＋</span>新建课程</button>
      </section>

      {active && <button className={`course-resume ${busyId === active.id ? "is-launching" : ""}`} onClick={() => void open(active)} disabled={busyId !== null} aria-busy={busyId === active.id}>
        <div className="course-resume__mark">{courseIcon(active.icon)}</div>
        <div><strong>继续学习 · {active.title}</strong><span>{active.goal || active.description || "回到上次停下的位置"}</span></div>
        <b>进入课程 →</b>
      </button>}

      <section className="course-shelf-section">
        <div className="course-shelf-heading"><div><h2>我的课程</h2></div><span>{filtered.length} 个学习空间</span></div>
        {filtered.length > 0 ? <div className="course-bookcase">
          {filtered.map((course, index) => {
            const progress = Math.round(Number(course.progress || 0) * 100);
            const isLanguageCourse = course.course_type === "language";
            return <article className={`course-volume course-volume--${course.cover_style || "indigo"} ${busyId === course.id ? "is-launching" : ""}`} style={{ "--course-index": index } as React.CSSProperties} key={course.id}>
              <div className="course-volume__pages" aria-hidden="true" />
              <div className="course-volume__cover">
                <i>{courseIcon(course.icon)}</i>
                {isLanguageCourse && <small className="course-volume__kind">语言学习 · {languageName(course.target_language_tag)}</small>}
                <h3>{course.title}</h3>
                {isLanguageCourse
                  ? <small>每日 {course.daily_word_goal || 10} 词</small>
                  : <>
                      <div className="course-volume__progress"><span style={{ width: `${progress}%` }} /></div>
                      <small>{progress}% · {course.node_count || 0} 个知识节点</small>
                    </>}
              </div>
              <div className="course-volume__controls">
                <button className="course-volume__open" aria-label={`进入课程：${course.title}`} aria-busy={busyId === course.id} onClick={() => void open(course)} disabled={busyId !== null}>{busyId === course.id ? "正在打开…" : "进入课程"}</button>
                <CourseActionsMenu
                  course={course}
                  disabled={busyId !== null}
                  onUpdate={(changes) => onUpdate(course, changes)}
                  onTrash={() => trash(course)}
                />
              </div>
            </article>;
          })}
          <button className="course-empty-volume" onClick={onCreate}><span>＋</span><strong>创建新课程</strong><small>从目标和周期开始</small></button>
          <div className="course-shelf-plank" aria-hidden="true" />
        </div> : <div className="course-library-empty"><span>◇</span><h2>还没有匹配的课程</h2><p>换个关键词，或者创建一门新课程。</p><button onClick={onCreate}>新建课程</button></div>}
        {error && <p className="error-message" role="alert">{error}</p>}
      </section>
    </main>
  );
}
