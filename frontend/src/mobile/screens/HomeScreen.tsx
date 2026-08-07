import { useEffect, useMemo, useState } from "react";
import type { MobileCourse, MobileTask, MobileToday } from "../domain";
import { ProgressRing } from "../components/ProgressRing";
import { TaskCard } from "../components/TaskCard";
import { MOBILE_MOTION } from "../motion";

export function HomeScreen({ course, today, headingRef }: {
  course: MobileCourse;
  today: MobileToday;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const [tasks, setTasks] = useState(() => today.tasks);
  const [progress, setProgress] = useState(today.dailyProgress);
  const [announcement, setAnnouncement] = useState("");
  const [celebratingId, setCelebratingId] = useState<string | null>(null);
  const remaining = useMemo(() => tasks.filter((task) => !task.completed).length, [tasks]);

  useEffect(() => {
    if (!celebratingId) return undefined;
    const timer = window.setTimeout(() => setCelebratingId(null), MOBILE_MOTION.celebrationMs);
    return () => window.clearTimeout(timer);
  }, [celebratingId]);

  function completeTask(task: MobileTask) {
    if (task.completed) return;
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, completed: true } : item));
    setProgress((current) => Math.min(100, current + task.xp));
    setCelebratingId(task.id);
    setAnnouncement("完成得漂亮，今日进度又前进了一步。");
  }

  return (
    <section className="sp-mobile-screen sp-home" aria-labelledby="sp-mobile-heading-home">
      <div className="sp-mobile-screen__intro">
        <div>
          <p className="sp-mobile-eyebrow">TODAY / LEARNING PATH</p>
          <h1 id="sp-mobile-heading-home" ref={headingRef} tabIndex={-1}>今天，继续向前</h1>
          <p>保持节奏，比一次走得很远更重要。</p>
        </div>
        <div className="sp-streak-chip" aria-label={`${today.streakDays} 天连续学习`}>
          <span aria-hidden="true">▲</span>
          <strong>{today.streakDays}</strong>
          <small>天连续学习</small>
        </div>
      </div>

      <div className="sp-daily-card sp-tactile-card">
        <ProgressRing value={progress} />
        <div className="sp-daily-card__copy">
          <span className="sp-card-kicker">DAILY MOMENTUM</span>
          <h2>{remaining > 0 ? `再完成 ${remaining} 项` : "今天的目标完成了"}</h2>
          <p>每一步都会沉淀到你的学习节奏。</p>
        </div>
      </div>

      <button className="sp-continue-card sp-tactile-card" type="button">
        <span className={`sp-course-glyph sp-course-glyph--${course.accent}`} aria-hidden="true">04</span>
        <span>
          <small>{course.unit}</small>
          <strong>{today.continueTitle}</strong>
          <span>{today.continueDetail}</span>
        </span>
        <b aria-hidden="true">→</b>
      </button>

      <div className="sp-section-heading">
        <div>
          <span className="sp-card-kicker">TODAY'S STEPS</span>
          <h2>今天的任务</h2>
        </div>
        <span>{tasks.filter((task) => task.completed).length}/{tasks.length}</span>
      </div>
      <div className="sp-task-list">
        {tasks.map((task) => <TaskCard key={task.id} task={task} celebrate={celebratingId === task.id} onComplete={completeTask} />)}
      </div>
      <p className="sp-readonly-note">手机预览完成状态，不会改动电脑数据</p>
      <p className="sp-mobile-announcement" role="status" aria-live="polite">{announcement}</p>
    </section>
  );
}
