import { useEffect, useState } from "react";
import type { ApiClient } from "../services/api";
import type { CourseRoadmap as CourseRoadmapData, RoadmapGenerationResult } from "../types";
import { RoadmapGeneratorDialog } from "./RoadmapGeneratorDialog";

const EMPTY_ROADMAP: CourseRoadmapData = { course_id: 0, phases: [], weeks: [], generation: null };

function normalizeRoadmap(value: CourseRoadmapData, courseId: number): CourseRoadmapData {
  return {
    course_id: Number(value?.course_id) || courseId,
    phases: Array.isArray(value?.phases) ? value.phases : [],
    weeks: Array.isArray(value?.weeks) ? value.weeks : [],
    generation: value?.generation && typeof value.generation === "object" ? value.generation : null,
  };
}

export function CourseRoadmap({ api, courseId, courseTitle }: {
  api: ApiClient;
  courseId: number;
  courseTitle: string;
}) {
  const [data, setData] = useState<CourseRoadmapData>({ ...EMPTY_ROADMAP, course_id: courseId });
  const [selected, setSelected] = useState(1);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setError("");
    void api.get<CourseRoadmapData>(`/api/courses/${courseId}/roadmap`)
      .then((next) => {
        if (!active) return;
        const normalized = normalizeRoadmap(next, courseId);
        setData(normalized);
        setSelected((current) => normalized.phases.some((item) => item.phase === current)
          ? current
          : normalized.phases[0]?.phase || 1);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "无法读取学习路线");
      });
    return () => { active = false; };
  }, [api, courseId]);

  const phase = data.phases.find((item) => item.phase === selected);
  const weeks = data.weeks.filter((item) => item.phase === selected);
  const generatedRequest = data.generation?.request;

  function acceptGenerated(result: RoadmapGenerationResult) {
    setData(result.roadmap);
    setSelected(result.roadmap.phases[0]?.phase || 1);
  }

  return (
    <section className="page">
      <div className="page-heading roadmap-heading">
        <div>
          <span className="eyebrow">COURSE ROADMAP</span>
          <h1>学习路线</h1>
          <p>由课程历史对话、选定资料和你的可投入时间共同生成。</p>
        </div>
        <button className="primary-action" onClick={() => setGeneratorOpen(true)}>
          {data.weeks.length ? "重新生成学习计划" : "生成学习计划"}
        </button>
      </div>
      {data.weeks.length > 0 && (
        <div className="roadmap-summary">
          <div><strong>{courseTitle}</strong><span>{data.phases.length} 个阶段 · {data.weeks.length} 周</span></div>
          <div>
            <span>每周 {generatedRequest?.weekly_hours || "—"} 小时</span>
            <span>{data.generation?.model || "已保存路线"}</span>
          </div>
        </div>
      )}
      {error && <p className="error-message" role="alert">{error}</p>}
      <div className="phase-track">{data.phases.map((item) => <button key={item.phase} className={selected === item.phase ? "is-active" : ""} onClick={() => setSelected(item.phase)}><span>阶段 {item.phase}</span><strong>{item.title}</strong><small>第 {item.start_week}—{item.end_week} 周</small></button>)}</div>
      {!data.phases.length && (
        <div className="empty-state roadmap-empty">
          <span>◇</span>
          <strong>还没有学习路线</strong>
          <p>先学习、提问或导入资料都可以；准备好后让 AI 根据当前课程上下文为你规划。</p>
          <button className="primary-action" onClick={() => setGeneratorOpen(true)}>生成学习计划</button>
        </div>
      )}
      {phase && <div className="gate-detail"><div className="gate-badge gate-badge--large">阶段 {phase.phase}</div><div><span className="eyebrow">验收标准</span><h2>{phase.acceptance}</h2><p>{phase.remediation}</p></div></div>}
      <div className="week-table" role="table"><div className="week-row week-row--head" role="row"><span>周</span><span>本周主线</span><span>学习任务</span><span>交付物</span></div>{weeks.map((week) => <div className="week-row" role="row" key={week.week}><strong>第 {week.week} 周</strong><p>{week.foundation}</p><ul>{week.tasks.map((task) => <li key={task}>{task}</li>)}</ul><ul>{week.deliverables.map((item) => <li key={item}>{item}</li>)}</ul></div>)}</div>
      <RoadmapGeneratorDialog
        api={api}
        courseId={courseId}
        courseTitle={courseTitle}
        open={generatorOpen}
        onClose={() => setGeneratorOpen(false)}
        onGenerated={acceptGenerated}
      />
    </section>
  );
}
