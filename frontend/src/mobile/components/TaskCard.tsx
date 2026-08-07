import type { MobileTask } from "../domain";

const kindLabels: Record<MobileTask["kind"], string> = {
  learn: "学习",
  review: "复习",
  practice: "练习",
};

export function TaskCard({ task, celebrate, onComplete }: { task: MobileTask; celebrate: boolean; onComplete: (task: MobileTask) => void }) {
  return (
    <article className="sp-task-card" data-complete={task.completed || undefined} data-celebrate={celebrate || undefined}>
      <button
        className="sp-task-card__check"
        type="button"
        aria-label={task.completed ? `任务已完成：${task.title}` : `完成任务：${task.title}`}
        aria-pressed={task.completed}
        disabled={task.completed}
        onClick={() => onComplete(task)}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 12.5 4 4L18.5 8" /></svg>
      </button>
      <div className="sp-task-card__body">
        <strong>{task.title}</strong>
        <span>{kindLabels[task.kind]} · {task.durationMinutes} 分钟</span>
      </div>
      <span className="sp-task-card__xp">+{task.xp} XP</span>
      <span className="sp-task-card__particles" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => <i key={index} />)}
      </span>
    </article>
  );
}
