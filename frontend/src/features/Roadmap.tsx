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
      <div className="page-heading"><div><div className="eyebrow">ROADMAP / 24 WEEKS</div><h1>路线与阶段闸门</h1><p>周计划可以调整，阶段出口必须由证据通过。</p></div></div>
      <div className="phase-track">{data.phases.map((item) => <button key={item.phase} className={selected === item.phase ? "is-active" : ""} onClick={() => setSelected(item.phase)}><span>{item.gate}</span><strong>{item.title}</strong><small>W{item.start_week}—W{item.end_week}</small></button>)}</div>
      {!data.phases.length && <div className="empty-state roadmap-empty"><strong>这是一门空白课程</strong><p>先在知识画布建立概念、便签和引用；路线编排可以随后补充。</p></div>}
      {phase && <div className="gate-detail"><div className="gate-badge gate-badge--large">{phase.gate}</div><div><span className="eyebrow">ACCEPTANCE</span><h2>{phase.acceptance}</h2><p>{phase.remediation}</p></div></div>}
      <div className="week-table" role="table"><div className="week-row week-row--head" role="row"><span>周</span><span>基础与面试</span><span>项目 / 研究任务</span><span>交付物</span></div>{weeks.map((week) => <div className="week-row" role="row" key={week.week}><strong>W{week.week}</strong><p>{week.foundation}</p><ul>{week.tasks.map((task) => <li key={task}>{task}</li>)}</ul><ul>{week.deliverables.map((item) => <li key={item}>{item}</li>)}</ul></div>)}</div>
    </section>
  );
}
