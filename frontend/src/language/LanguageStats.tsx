import { useEffect, useMemo, useState } from "react";
import type { ApiClient } from "../services/api";
import type { LanguageJourney, LanguageOverview, LanguagePracticeSession, LanguagePracticeType } from "./types";

const TYPE_LABELS: Record<LanguagePracticeType, string> = {
  reading: "阅读",
  listening: "听力",
  speaking: "口语",
  writing: "写作",
};

function formatSessionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function LanguageStats({
  api,
  courseId,
  courseTitle,
}: {
  api: ApiClient;
  courseId: number;
  courseTitle?: string;
}) {
  const [overview, setOverview] = useState<LanguageOverview | null>(null);
  const [sessions, setSessions] = useState<LanguagePracticeSession[]>([]);
  const [journey, setJourney] = useState<LanguageJourney | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setError("");
    Promise.all([
      api.get<LanguageOverview>(`/api/courses/${courseId}/language/overview`),
      api.get<LanguagePracticeSession[]>(`/api/courses/${courseId}/language/sessions?limit=80`),
      api.get<LanguageJourney>(`/api/courses/${courseId}/language/journey`),
    ]).then(([nextOverview, nextSessions, nextJourney]) => {
      if (!active) return;
      setOverview(nextOverview);
      setSessions(nextSessions);
      setJourney(nextJourney);
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "学习记录暂时无法加载");
    });
    return () => { active = false; };
  }, [api, courseId]);

  const maximumCount = useMemo(() => {
    if (!overview) return 1;
    return Math.max(1, ...Object.values(overview.practice_counts || {}));
  }, [overview]);

  const currentStage = useMemo(() => {
    if (!journey?.stages.length) return null;
    return journey.stages.find((stage) => stage.status === "current")
      || [...journey.stages].reverse().find((stage) => stage.status === "completed")
      || journey.stages[0];
  }, [journey]);

  return (
    <section className="language-page language-stats" aria-label="语言课程学习记录">
      <header className="language-stats__header">
        <div><h1>学习记录</h1><p>{courseTitle || "语言课程"}的真实训练和复习数据。</p></div>
        {overview && <strong>连续 {overview.streak_days} 天</strong>}
      </header>
      {error && <p role="alert" className="error-message">{error}</p>}
      {!overview ? (
        <div className="language-practice__empty">正在读取学习记录…</div>
      ) : (
        <>
          <div className="language-stats__metrics">
            <article><span>词汇总量</span><strong>{overview.total_vocabulary}</strong></article>
            <article><span>待复习</span><strong>{overview.due_vocabulary}</strong></article>
            <article><span>今日已复习</span><strong>{overview.reviewed_today}</strong></article>
            <article><span>连续学习</span><strong>{overview.streak_days} 天</strong></article>
          </div>
          {journey && currentStage && (
            <section className="language-stats__mastery">
              <header>
                <div>
                  <span>{journey.all_complete ? "全部阶段已掌握" : `当前阶段 ${currentStage.level}`}</span>
                  <h2>{currentStage.title}</h2>
                  <p>{currentStage.can_do}</p>
                </div>
                <strong>{journey.progress_percent}%</strong>
              </header>
              <div
                className="language-stats__mastery-bar"
                role="progressbar"
                aria-label="全课程掌握进度"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={journey.progress_percent}
              ><i style={{ width: `${journey.progress_percent}%` }} /></div>
              <aside>
                <div><strong>{currentStage.completed_lessons} / {currentStage.total_lessons}</strong><span>本阶段已掌握</span></div>
                <div><strong>关卡 {currentStage.checkpoint.mastery_threshold} 分</strong><span>达标后进入下一阶段</span></div>
                <div><strong>{journey.completed_lessons} / {journey.total_lessons}</strong><span>全课程课节</span></div>
              </aside>
            </section>
          )}
          <section className="language-stats__distribution">
            <header><h2>训练分布</h2><span>按已保存会话统计</span></header>
            <div>
              {(Object.keys(TYPE_LABELS) as LanguagePracticeType[]).map((type) => {
                const count = overview.practice_counts?.[type] || 0;
                return (
                  <article key={type}>
                    <span>{TYPE_LABELS[type]} {count} 次</span>
                    <i><b style={{ width: `${Math.round((count / maximumCount) * 100)}%` }} /></i>
                  </article>
                );
              })}
            </div>
          </section>
          <section className="language-stats__history">
            <header><h2>最近训练</h2><span>{sessions.length} 条记录</span></header>
            {sessions.length ? sessions.map((session) => (
              <article key={session.id}>
                <div><strong>{TYPE_LABELS[session.practice_type]}</strong><span>{session.term || session.prompt || "自由训练"}</span></div>
                <span className={`is-${session.result}`}>{session.result === "correct" ? "正确" : session.result === "incorrect" ? "待加强" : "已完成"}</span>
                <small>{formatSessionDate(session.started_at)} · {session.duration_seconds || 0} 秒</small>
              </article>
            )) : <div className="language-empty-vocabulary"><strong>还没有训练记录</strong><p>完成一次听说读写训练后会显示在这里。</p></div>}
          </section>
        </>
      )}
    </section>
  );
}
