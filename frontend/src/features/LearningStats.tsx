import { useEffect, useMemo, useState } from "react";
import type { ApiClient } from "../services/api";

interface DailyActivity {
  date: string;
  count: number;
}

export interface CourseStats {
  course_id?: number;
  current_streak: number;
  active_days_14: number;
  activity_total_14: number;
  weekly_active_days: number;
  completed_tasks: number;
  total_tasks: number;
  completion_rate: number;
  knowledge_nodes: number;
  knowledge_edges: number;
  notebooks: number;
  documents: number;
  python_runs: number;
  daily_activity: DailyActivity[];
}

function StatsIcon({ name }: { name: "streak" | "activity" | "tasks" | "knowledge" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}>
    {name === "streak" && <path d="M13.5 3.5c.8 3.7-2.2 4.5-2.2 7.2 0 1.3.8 2.1 1.8 2.1 1.8 0 2.5-1.8 2.2-3.6 2.1 1.5 3.5 3.6 3.5 6A6.8 6.8 0 0 1 5.2 15c0-3 1.8-5.1 4.2-7.1-.2 2.2.7 3.3 1.7 3.5-.4-3.2 1.4-5.3 2.4-7.9Z" />}
    {name === "activity" && <><path d="M4 18V9m5 9V5m5 13v-6m5 6V7" /><path d="m4 5 4 3 5-5 4 4 3-3" /></>}
    {name === "tasks" && <><rect x="4" y="4" width="16" height="16" rx="4" /><path d="m8 12 2.3 2.3L16 8.7" /></>}
    {name === "knowledge" && <><circle cx="6" cy="8" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="14" cy="18" r="2.5" /><path d="m8.3 7.7 7.2-1.2M7.5 10l4.9 6m4-7.8-1.7 7.3" /></>}
  </svg>;
}

function formatDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function LearningStats({ api, courseId, courseTitle }: { api: ApiClient; courseId: number; courseTitle?: string }) {
  const [stats, setStats] = useState<CourseStats | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setError("");
    api.get<CourseStats>(`/api/courses/${courseId}/stats`)
      .then((value) => { if (active) setStats(value); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "学习统计暂时无法加载"); });
    return () => { active = false; };
  }, [api, courseId, reload]);

  const chart = useMemo(() => {
    const values = stats?.daily_activity || [];
    if (!values.length) return { line: "", area: "", points: [] as Array<{ x: number; y: number; item: DailyActivity }> };
    const maximum = Math.max(1, ...values.map((item) => item.count));
    const points = values.map((item, index) => ({
      x: 10 + (index / Math.max(1, values.length - 1)) * 300,
      y: 102 - (item.count / maximum) * 76,
      item,
    }));
    const line = points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
    return { line, area: `${line} L310 108 L10 108 Z`, points };
  }, [stats]);

  if (error) return <section className="learning-stats page"><div className="stats-error" role="alert"><strong>统计数据没有加载成功</strong><p>{error}</p><button onClick={() => setReload((value) => value + 1)}>重新加载</button></div></section>;
  if (!stats) return <section className="learning-stats page" aria-label="正在加载学习统计"><div className="stats-skeleton"><i /><i /><i /><i /></div></section>;

  const recommendation = stats.total_tasks === 0
    ? "先创建一个可以在今天完成的任务，让学习节奏有明确起点。"
    : stats.completion_rate < 50
      ? "待完成任务较多，建议今天只推进一个最小闭环。"
      : stats.knowledge_nodes > 2 && stats.knowledge_edges < Math.ceil(stats.knowledge_nodes / 2)
        ? "知识点已经积累起来了，下一步适合补充概念之间的关系。"
        : "当前节奏稳定，继续保持短周期输入与可验证输出。";

  return <section className="learning-stats page">
    <header className="stats-hero">
      <div><div className="eyebrow">{courseTitle || "当前课程"} / LEARNING PULSE</div><h1>学习统计</h1><p>不计算虚假的在线时长，只记录你真正完成的任务、知识连接、资料沉淀与实验运行。</p></div>
      <div className="stats-hero__streak" aria-label={`连续学习 ${stats.current_streak} 天`}><span><StatsIcon name="streak" /></span><strong>{stats.current_streak}</strong><small>连续学习天数</small></div>
    </header>

    <div className="stats-metrics">
      <article className="stats-metric stats-metric--accent"><span><StatsIcon name="streak" /></span><div><strong>{stats.current_streak}<small>天</small></strong><p>当前连续学习</p></div><em>{stats.current_streak ? "节奏保持中" : "今天开始第一天"}</em></article>
      <article><span><StatsIcon name="activity" /></span><div><strong>{stats.weekly_active_days}<small>/ 7</small></strong><p>本周活跃天数</p></div><em>近 14 天共 {stats.activity_total_14} 次活动</em></article>
      <article><span><StatsIcon name="tasks" /></span><div><strong>{stats.completion_rate}<small>%</small></strong><p>任务完成率</p></div><em>{stats.completed_tasks} / {stats.total_tasks} 项已完成</em></article>
      <article><span><StatsIcon name="knowledge" /></span><div><strong>{stats.knowledge_nodes}<small>个</small></strong><p>知识节点</p></div><em>{stats.knowledge_edges} 条知识关系</em></article>
    </div>

    <div className="stats-dashboard-grid">
      <article className="stats-panel stats-trend">
        <header><div><small>14 DAY ACTIVITY</small><h2>两周学习节奏</h2></div><span>{stats.active_days_14} 个活跃日</span></header>
        <svg viewBox="0 0 320 120" role="img" aria-label={`过去 14 天共有 ${stats.activity_total_14} 次真实学习活动`} preserveAspectRatio="none">
          <defs><linearGradient id="stats-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--blue)" stopOpacity=".25" /><stop offset="1" stopColor="var(--blue)" stopOpacity="0" /></linearGradient></defs>
          <path className="stats-chart__area" d={chart.area} />
          <path className="stats-chart__line" d={chart.line} pathLength="100" />
          {chart.points.map((point) => <circle key={point.item.date} cx={point.x} cy={point.y} r={point.item.count ? 2.8 : 1.6}><title>{point.item.date}：{point.item.count} 次活动</title></circle>)}
        </svg>
        <footer><span>{formatDay(stats.daily_activity[0]?.date || "")}</span><i>任务 · 知识 · 资料 · 实验</i><span>{formatDay(stats.daily_activity.at(-1)?.date || "")}</span></footer>
      </article>

      <article className="stats-panel stats-progress">
        <header><div><h2>任务推进</h2></div></header>
        <div className="stats-progress__body">
          <div className="stats-progress-ring" style={{ "--stats-progress": stats.completion_rate } as React.CSSProperties}>
            <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" pathLength="100" /><circle className="is-value" cx="60" cy="60" r="50" pathLength="100" /></svg>
            <strong>{stats.completion_rate}<small>%</small></strong>
          </div>
          <div><strong>{stats.completed_tasks} 项完成</strong><p>每完成一个可验证任务，统计才向前推进。</p></div>
        </div>
      </article>

      <article className="stats-panel stats-assets">
        <header><div><h2>学习资产</h2></div></header>
        <div><span>知识笔记<strong>{stats.notebooks}</strong></span><span>本地资料<strong>{stats.documents}</strong></span><span>Python 实验<strong>{stats.python_runs}</strong></span></div>
      </article>

      <article className="stats-panel stats-coach">
        <header><div><h2>下一步建议</h2></div></header>
        <p>{recommendation}</p><span>根据当前课程的真实记录生成</span>
      </article>
    </div>
  </section>;
}
