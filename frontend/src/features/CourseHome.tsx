import type { ReactNode } from "react";
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
  { view: "roadmap", code: "01", title: "学习路线", copy: "", metric: () => "查看路线" },
  { view: "knowledge", code: "02", title: "知识网络", copy: "", metric: (s) => `${s.notebook_count} 本知识笔记` },
  { view: "library", code: "03", title: "资料库", copy: "", metric: (s) => `${s.document_count} 份资料` },
  { view: "lab", code: "04", title: "Python 实验室", copy: "", metric: (s) => `${s.run_count} 次运行` },
];

export function CourseHome({ course, summary: inputSummary, onOpenModule, onContinue, dailyWorkspace }: {
  course: Course;
  summary: CourseHomeSummary;
  onOpenModule: (view: CourseView) => void;
  onContinue: () => void;
  dailyWorkspace?: ReactNode;
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
      <div className={`course-home-cover course-volume--${course.cover_style || "indigo"}`}><i><ProductIcon name={(course.icon || "book") as ProductIconName} className="course-cover-icon" /></i></div>
      <div className="course-home-intro"><h1>{course.title}</h1><div className="course-home-progress"><span><i style={{ width: `${progress}%` }} /></span><strong>{progress}%</strong><small>{summary.task_counts.done}/{totalTasks || 0} 项任务完成</small></div></div>
      <button className="course-continue" onClick={onContinue}><strong>查看本周任务</strong><b>↓</b></button>
    </header>
    {dailyWorkspace && <section className="course-home-daily" id="course-daily-workspace">{dailyWorkspace}</section>}
    <div className="course-home-section-title"><div><h2>课程工作区</h2></div></div>
    <div className="course-module-grid">{modules.map((module, index) => {
      const iconName = ({ knowledge: "network", lab: "python", library: "library", roadmap: "roadmap", review: "review", dashboard: "dashboard" } as Record<string, ProductIconName>)[module.view] || "book";
      return <button key={module.view} className="course-module-card" style={{ "--module-index": index } as React.CSSProperties} onClick={() => onOpenModule(module.view)} aria-label={`打开${module.title}`}><span>{module.code}</span><div><i><ProductIcon name={iconName} /></i><h3>{module.title}</h3></div><small>{module.metric(summary)} <b>→</b></small></button>;
    })}</div>
    <div className="course-home-lower"><article><h2>最近打开</h2>{summary.recent_items.length ? summary.recent_items.map((item) => <p key={`${item.kind}-${item.id}`}>{item.title}</p>) : <p className="muted-copy">暂无最近记录</p>}</article></div>
  </section>;
}
