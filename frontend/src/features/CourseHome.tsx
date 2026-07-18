import type { Course } from "../types";
import type { CourseView } from "../app/router";
import { ProductIcon, type ProductIconName } from "../components/ProductIcon";

export interface CourseHomeSummary {
  task_counts: { todo: number; doing: number; blocked?: number; done: number };
  notebook_count: number;
  document_count: number;
  run_count: number;
  recent_items: Array<{ id: string | number; title: string; kind: string }>;
  continue_route?: string;
}

const modules: Array<{ view: CourseView; code: string; title: string; copy: string; metric: (summary: CourseHomeSummary) => string }> = [
  { view: "dashboard", code: "01", title: "主驾驶舱", copy: "今日任务、周计划与学习证据", metric: (s) => `${s.task_counts.todo + s.task_counts.doing} 项待推进` },
  { view: "roadmap", code: "02", title: "学习路线", copy: "里程碑、阶段闸门与进度", metric: () => "查看路线" },
  { view: "knowledge", code: "03", title: "知识网络", copy: "多个笔记、导图与自由画布", metric: (s) => `${s.notebook_count} 本知识笔记` },
  { view: "library", code: "04", title: "资料库", copy: "文档、原文引用与检索", metric: (s) => `${s.document_count} 份资料` },
  { view: "lab", code: "05", title: "Python 实验室", copy: "环境、代码、输出与实验记录", metric: (s) => `${s.run_count} 次运行` },
  { view: "review", code: "06", title: "练习与复习", copy: "记忆调度、错题与面试证据", metric: () => "开始复习" },
];

export function CourseHome({ course, summary: inputSummary, onOpenModule, onContinue }: {
  course: Course;
  summary: CourseHomeSummary;
  onOpenModule: (view: CourseView) => void;
  onContinue: () => void;
}) {
  const progress = Math.round(Number(course.progress || 0) * 100);
  const summary: CourseHomeSummary = {
    task_counts: inputSummary?.task_counts || { todo: 0, doing: 0, blocked: 0, done: 0 },
    notebook_count: Number(inputSummary?.notebook_count || 0),
    document_count: Number(inputSummary?.document_count || 0),
    run_count: Number(inputSummary?.run_count || 0),
    recent_items: Array.isArray(inputSummary?.recent_items) ? inputSummary.recent_items : [],
    continue_route: inputSummary?.continue_route,
  };
  const totalTasks = Object.values(summary.task_counts).reduce((sum, value) => sum + Number(value || 0), 0);
  return <section className="course-home page">
    <header className="course-home-hero">
      <div className={`course-home-cover course-volume--${course.cover_style || "indigo"}`}><small>COURSE</small><i><ProductIcon name={(course.icon || "book") as ProductIconName} className="course-cover-icon" /></i></div>
      <div className="course-home-intro"><div className="eyebrow">COURSE HOME / LEARNING COMPASS</div><h1>{course.title}</h1><p>{course.goal || course.description || "从今天开始，为这门课程建立可验证的学习证据。"}</p><div className="course-home-progress"><span><i style={{ width: `${progress}%` }} /></span><strong>{progress}%</strong><small>{summary.task_counts.done}/{totalTasks || 0} 项任务完成</small></div></div>
      <button className="course-continue" onClick={onContinue}><small>RESUME</small><strong>继续学习</strong><span>回到上次停下的位置 →</span></button>
    </header>
    <div className="course-home-section-title"><div><small>WORKSPACES</small><h2>选择今天的学习方式</h2></div><p>每个模块都只属于「{course.title}」</p></div>
    <div className="course-module-grid">{modules.map((module, index) => {
      const iconName = ({ knowledge: "network", lab: "python", library: "library", roadmap: "roadmap", review: "review", dashboard: "dashboard" } as Record<string, ProductIconName>)[module.view] || "book";
      return <button key={module.view} className="course-module-card" style={{ "--module-index": index } as React.CSSProperties} onClick={() => onOpenModule(module.view)} aria-label={`打开${module.title}`}><span>{module.code}</span><div><i><ProductIcon name={iconName} /></i><h3>{module.title}</h3><p>{module.copy}</p></div><small>{module.metric(summary)} <b>→</b></small></button>;
    })}</div>
    <div className="course-home-lower"><article><small>TODAY</small><h2>今天的节奏</h2><div className="course-home-stats"><span><strong>{summary.task_counts.doing}</strong>进行中</span><span><strong>{summary.task_counts.todo}</strong>待开始</span><span><strong>{summary.task_counts.done}</strong>已完成</span></div></article><article><small>RECENT</small><h2>最近打开</h2>{summary.recent_items.length ? summary.recent_items.map((item) => <p key={`${item.kind}-${item.id}`}>{item.title}</p>) : <p className="muted-copy">打开一个知识笔记、资料或实验后，它会出现在这里。</p>}</article></div>
  </section>;
}
