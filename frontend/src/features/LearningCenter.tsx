import { useEffect, useState } from "react";
import { AgentDock } from "../agent/AgentDock";
import type { AgentPageContext, AgentSource } from "../agent/types";
import type { ApiClient } from "../services/api";
import type { CourseRoadmap, RoadmapGenerationResult } from "../types";
import { RoadmapGeneratorDialog } from "./RoadmapGeneratorDialog";

export function LearningCenter({
  api,
  courseId,
  courseTitle,
  agentContext,
  onOpenSource,
}: {
  api: ApiClient;
  courseId: number;
  courseTitle?: string;
  agentContext?: Omit<AgentPageContext, "view" | "title">;
  onOpenSource: (source: AgentSource) => void;
}) {
  const [roadmap, setRoadmap] = useState<CourseRoadmap | null>(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void api.get<CourseRoadmap>(`/api/courses/${courseId}/roadmap`)
      .then((next) => {
        if (!active) return;
        setRoadmap({
          course_id: Number(next?.course_id) || courseId,
          phases: Array.isArray(next?.phases) ? next.phases : [],
          weeks: Array.isArray(next?.weeks) ? next.weeks : [],
          generation: next?.generation && typeof next.generation === "object" ? next.generation : null,
        });
      })
      .catch(() => { if (active) setRoadmap(null); });
    return () => { active = false; };
  }, [api, courseId]);

  function acceptGenerated(result: RoadmapGenerationResult) {
    setRoadmap(result.roadmap);
  }

  return (
    <section className="learning-center" aria-label="学习中心">
      <header className="learning-center__roadmap">
        <div>
          <small>COURSE LEARNING PATH</small>
          <strong>{roadmap?.weeks.length ? `${roadmap.phases.length} 个阶段 · ${roadmap.weeks.length} 周` : "尚未生成课程学习路线"}</strong>
          <span>{roadmap?.weeks.length ? "PILOT 会沿当前路线继续每轮一个知识点。" : "先对话或导入资料，再让 AI 按你的时间生成完整计划。"}</span>
        </div>
        <button onClick={() => setGeneratorOpen(true)}>
          {roadmap?.weeks.length ? "重新生成计划" : "生成学习计划"}
        </button>
      </header>
      <div className="learning-center__workspace">
        <AgentDock
          variant="workspace"
          api={api}
          courseId={courseId}
          context={{ view: "learning", title: courseTitle, ...agentContext }}
          requestedMode="learning"
          onOpenSource={onOpenSource}
        />
      </div>
      <RoadmapGeneratorDialog
        api={api}
        courseId={courseId}
        courseTitle={courseTitle || "当前课程"}
        open={generatorOpen}
        onClose={() => setGeneratorOpen(false)}
        onGenerated={acceptGenerated}
      />
    </section>
  );
}
