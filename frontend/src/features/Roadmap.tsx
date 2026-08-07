import { useEffect, useState } from "react";
import type { ApiClient } from "../services/api";
import type { PhaseData, WeekData } from "../types";

export function Roadmap({ api }: { api: ApiClient }) {
  const [data, setData] = useState<{ phases: PhaseData[]; weeks: WeekData[] }>({ phases: [], weeks: [] });
  const [selected, setSelected] = useState(1);
  useEffect(() => { void api.get<typeof data>("/api/roadmaps").then(setData); }, [api]);
  const phase = data.phases.find((item) => item.phase === selected);
  const weeks = data.weeks.filter((item) => item.phase === selected);
  return (
    <section className="page">
      <div className="page-heading"><div><h1>路线与阶段闸门</h1></div></div>
      <div className="phase-track">{data.phases.map((item) => <button key={item.phase} className={selected === item.phase ? "is-active" : ""} onClick={() => setSelected(item.phase)}><span>阶段 {item.phase}</span><strong>{item.title}</strong><small>第 {item.start_week}—{item.end_week} 周</small></button>)}</div>
      {!data.phases.length && <div className="empty-state roadmap-empty"><strong>这是一门空白课程</strong></div>}
      {phase && <div className="gate-detail"><div className="gate-badge gate-badge--large">阶段 {phase.phase}</div><div><span className="eyebrow">验收标准</span><h2>{phase.acceptance}</h2><p>{phase.remediation}</p></div></div>}
      <div className="week-table" role="table"><div className="week-row week-row--head" role="row"><span>周</span><span>基础与面试</span><span>项目 / 研究任务</span><span>交付物</span></div>{weeks.map((week) => <div className="week-row" role="row" key={week.week}><strong>第 {week.week} 周</strong><p>{week.foundation}</p><ul>{week.tasks.map((task) => <li key={task}>{task}</li>)}</ul><ul>{week.deliverables.map((item) => <li key={item}>{item}</li>)}</ul></div>)}</div>
    </section>
  );
}
