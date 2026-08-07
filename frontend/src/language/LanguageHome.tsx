import { useCallback, useEffect, useState } from "react";
import type { ApiClient } from "../services/api";
import type { LanguageJourney, LanguageOverview, LanguagePracticeType } from "./types";

const practiceCards: Array<{
  type: LanguagePracticeType;
  title: string;
  copy: string;
  action: string;
}> = [
  { type: "reading", title: "阅读", copy: "看懂词语、读音和真实例句", action: "开始阅读训练" },
  { type: "listening", title: "听力", copy: "先听声音，再辨认词语或短句", action: "开始听力训练" },
  { type: "speaking", title: "跟读", copy: "原速与慢速播放，主动录音对照", action: "开始跟读训练" },
  { type: "writing", title: "拼写", copy: "根据释义或声音写出目标词", action: "开始拼写训练" },
];

export function LanguageHome({
  api,
  courseId,
  courseTitle,
  onStartLesson,
  onOpenJourney,
  onStartPractice,
  onOpenVocabulary,
  onOpenLibrary,
}: {
  api: ApiClient;
  courseId: number;
  courseTitle: string;
  onStartLesson?: () => void;
  onOpenJourney?: () => void;
  onStartPractice: (type: LanguagePracticeType) => void;
  onOpenVocabulary: () => void;
  onOpenLibrary: () => void;
}) {
  const [overview, setOverview] = useState<LanguageOverview | null>(null);
  const [journey, setJourney] = useState<LanguageJourney | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [nextOverview, nextJourney] = await Promise.all([
        api.get<LanguageOverview>(`/api/courses/${courseId}/language/overview`),
        api.get<LanguageJourney>(`/api/courses/${courseId}/language/journey`),
      ]);
      setOverview(nextOverview);
      setJourney(
        nextJourney
        && !Array.isArray(nextJourney)
        && nextJourney.current_lesson
          ? nextJourney
          : null,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "语言学习数据暂时不可用");
    }
  }, [api, courseId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return <section className="language-page language-page--state" role="alert">
      <strong>暂时无法加载语言课程</strong>
      <p>{error}</p>
      <button onClick={() => void load()}>重试</button>
    </section>;
  }
  if (!overview) {
    return <section className="language-page language-page--state" role="status">正在准备今天的语言学习…</section>;
  }

  const target = Math.max(1, overview.daily_word_goal);
  const progress = Math.min(100, Math.round((overview.reviewed_today / target) * 100));
  return (
    <section className="language-page language-home" aria-label={`${courseTitle}语言课程概览`}>
      <header className="language-home__hero">
        <div>
          <span className="language-page-kicker">Today · 每天完成一个可用能力</span>
          <h1>今天学什么</h1>
          <p>跟着内置课程完成词汇、理解、听辨、跟读和表达，不需要自己找资料。</p>
        </div>
        <div className="language-home__hero-actions">
          {onOpenJourney && <button type="button" onClick={onOpenJourney}>查看路径</button>}
          <button
            className="language-primary-action"
            onClick={() => (
              overview.due_vocabulary > 0
                ? onStartPractice("reading")
                : journey?.all_complete && onOpenJourney
                  ? onOpenJourney()
                : onStartLesson ? onStartLesson() : onStartPractice("reading")
            )}
          >{journey?.all_complete && overview.due_vocabulary === 0 ? "查看学习成果" : "一键开始学习"}</button>
        </div>
      </header>

      <div className="language-home__metrics">
        <article className="language-daily-progress">
          <header><span>今日单词</span><strong>{overview.reviewed_today} / {target}</strong></header>
          <div aria-label={`今日单词进度 ${progress}%`}><i style={{ width: `${progress}%` }} /></div>
        </article>
        <article><span>复习队列</span><strong>{overview.due_vocabulary} 个待复习</strong></article>
        <article><span>学习节奏</span><strong>连续 {overview.streak_days} 天</strong></article>
        <article><span>词汇本</span><strong>{overview.total_vocabulary} 个词</strong></article>
      </div>

      {overview.due_word ? (
        <section className="language-due-word" aria-label={`今日单词 ${overview.due_word.term}`}>
          <div>
            <span>接下来复习</span>
            <h2>{overview.due_word.term}</h2>
            {overview.due_word.pronunciation && <small>{overview.due_word.pronunciation}</small>}
          </div>
          <p>{overview.due_word.meaning}</p>
          <button onClick={() => onStartPractice("reading")}>从这个词开始</button>
        </section>
      ) : journey?.all_complete ? (
        <section className="language-next-lesson language-graduation-card">
          <div>
            <span>C1 · 阶段成果</span>
            <h2>内置 C1 路径已完成</h2>
            <p>你已掌握全部内置课节。继续按到期队列复习，并用听说读写训练保持自然表达。</p>
          </div>
          <div className="language-next-lesson__progress">
            <strong>100%</strong>
            <span>{journey.completed_lessons} / {journey.total_lessons} 课</span>
          </div>
          <button className="language-primary-action" onClick={() => onOpenJourney?.()}>
            查看毕业成果
          </button>
        </section>
      ) : journey ? (
        <section className="language-next-lesson">
          <div>
            <span>{journey.current_lesson.level} · 第 {journey.current_lesson.order} 课</span>
            <h2>{journey.current_lesson.title}</h2>
            <p>{journey.current_lesson.can_do}</p>
          </div>
          <div className="language-next-lesson__progress">
            <strong>{journey.progress_percent}%</strong>
            <span>{journey.completed_lessons} / {journey.total_lessons} 课</span>
          </div>
          <button className="language-primary-action" onClick={() => onStartLesson ? onStartLesson() : onStartPractice("reading")}>开始这节课</button>
        </section>
      ) : (
        <section className="language-empty-vocabulary">
          <strong>内置课程正在准备</strong>
          <p>无需导入资料；你也可以先浏览默认课程资料或建立自己的词汇本。</p>
          <div><button onClick={onOpenLibrary}>查看内置资料</button><button onClick={onOpenVocabulary}>打开词汇本</button></div>
        </section>
      )}

      <div className="language-section-heading">
        <h2>选择训练</h2>
        <button onClick={onOpenVocabulary}>管理词汇本</button>
      </div>
      <div className="language-practice-grid">
        {practiceCards.map((card) => (
          <article key={card.type}>
            <span>{String(overview.practice_counts[card.type] || 0).padStart(2, "0")}</span>
            <h3>{card.title}</h3>
            <p>{card.copy}</p>
            <button aria-label={card.action} onClick={() => onStartPractice(card.type)}>{card.action} →</button>
          </article>
        ))}
      </div>
    </section>
  );
}
