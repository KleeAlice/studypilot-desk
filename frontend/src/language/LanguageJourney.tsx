import { useCallback, useEffect, useState } from "react";
import type { ApiClient } from "../services/api";
import type { LanguageJourney as LanguageJourneyData } from "./types";

const LESSON_TYPE_LABELS = {
  discover: "认识",
  practice: "强化",
  mission: "实战",
  checkpoint: "阶段关卡",
} as const;

const SUPPORT_LABELS = {
  full: "完整引导",
  guided: "半引导",
  minimal: "最小提示",
} as const;

export function LanguageJourney({
  api,
  courseId,
  onStart,
}: {
  api: ApiClient;
  courseId: number;
  onStart: () => void;
}) {
  const [journey, setJourney] = useState<LanguageJourneyData | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setJourney(await api.get<LanguageJourneyData>(`/api/courses/${courseId}/language/journey`));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "学习路径暂时不可用");
    }
  }, [api, courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <section className="language-page language-page--state" role="alert"><strong>无法加载学习路径</strong><p>{error}</p><button onClick={() => void load()}>重试</button></section>;
  if (!journey) return <section className="language-page language-page--state" role="status">正在加载完整学习路径…</section>;

  return (
    <section className="language-page language-journey">
      <header className="language-journey__hero">
        <div>
          <span className="language-page-kicker">从零到自然表达</span>
          <h1>{journey.language_name}学习路径</h1>
          <p>从 Pre-A1 到 C1，每节课都把词汇、理解、听辨、跟读和输出串起来。</p>
        </div>
        <div className="language-journey__overall">
          <strong>{journey.progress_percent}%</strong>
          <span>{journey.completed_lessons} / {journey.total_lessons} 课</span>
          <button type="button" className="language-primary-action" onClick={onStart}>{journey.all_complete ? "回顾最后一课" : "继续当前课"}</button>
        </div>
      </header>

      <div className="language-journey__stages">
        {journey.stages.map((stage) => (
          <article key={stage.id}>
            <header>
              <span>{stage.level}</span>
              <div>
                <h2>{stage.title}</h2>
                <p>{stage.can_do}</p>
                <small>本阶段 {stage.completed_lessons} / {stage.total_lessons}</small>
              </div>
            </header>
            <div>
              {stage.lessons.map((lesson) => {
                const phaseLabel = lesson.lesson_type === "checkpoint"
                  ? `阶段关卡 · ${lesson.mastery_threshold} 分达标`
                  : `${LESSON_TYPE_LABELS[lesson.lesson_type]} · ${SUPPORT_LABELS[lesson.support_level]}`;
                return (
                <button
                  type="button"
                  key={lesson.id}
                  className={`language-path-lesson is-${lesson.status}`}
                  disabled={lesson.status === "locked"}
                  onClick={lesson.status === "current" ? onStart : undefined}
                >
                  <span>{lesson.status === "completed" ? "✓" : lesson.order}</span>
                  <div>
                    <em>{phaseLabel}</em>
                    <strong>{lesson.title}</strong>
                    <small>{lesson.can_do}</small>
                  </div>
                  <i>{lesson.status === "completed" ? `${lesson.best_score} 分` : `${lesson.estimated_minutes} 分钟`}</i>
                </button>
              );})}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
