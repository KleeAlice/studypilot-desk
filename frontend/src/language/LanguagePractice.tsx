import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VocabularyItem, VocabularyRating } from "../agent/types";
import type { ApiClient } from "../services/api";
import type { Course } from "../types";
import { PronunciationDisplay } from "./PronunciationDisplay";
import { SpeechPracticeControls } from "./SpeechPracticeControls";
import { speakLanguageText, stopLanguageSpeech } from "./speech";
import type { LanguageOverview, LanguagePracticeType } from "./types";

const PRACTICE_LABELS: Record<LanguagePracticeType, string> = {
  reading: "阅读",
  listening: "听力",
  speaking: "口语",
  writing: "写作",
};

const RATING_LABELS: Array<{ rating: VocabularyRating; label: string }> = [
  { rating: "again", label: "没记住" },
  { rating: "hard", label: "困难" },
  { rating: "good", label: "记得" },
  { rating: "easy", label: "很熟" },
];

interface PracticeOutcome {
  answer: string;
  result: "correct" | "incorrect" | "self_reviewed";
  feedback: string;
}

function normalizeAnswer(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function localDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function LanguagePractice({
  api,
  course,
  initialType = "reading",
  onContinueLesson,
}: {
  api: ApiClient;
  course: Course;
  initialType?: LanguagePracticeType;
  onContinueLesson?: () => void;
}) {
  const [practiceType, setPracticeType] = useState<LanguagePracticeType>(initialType);
  const [words, setWords] = useState<VocabularyItem[]>([]);
  const [wordIndex, setWordIndex] = useState(0);
  const [reviewedToday, setReviewedToday] = useState(0);
  const [completedHere, setCompletedHere] = useState(0);
  const [answer, setAnswer] = useState("");
  const [meaningVisible, setMeaningVisible] = useState(false);
  const [outcome, setOutcome] = useState<PracticeOutcome | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const startedAt = useRef(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dueWords, overview] = await Promise.all([
        api.get<VocabularyItem[]>(`/api/vocabulary?course_id=${course.id}&due_only=true&limit=40`),
        api.get<LanguageOverview>(`/api/courses/${course.id}/language/overview`),
      ]);
      setWords(dueWords);
      setReviewedToday(overview.reviewed_today || 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "训练内容暂时无法加载");
    } finally {
      setLoading(false);
    }
  }, [api, course.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => () => {
    stopLanguageSpeech();
  }, []);

  const word = words[wordIndex];
  const prompt = useMemo(() => {
    if (!word) return "";
    if (practiceType === "reading") return word.example || word.term;
    if (practiceType === "listening") return "听写系统播放的词语";
    if (practiceType === "speaking") return `跟读：${word.term}`;
    return word.meaning || `根据提示写出：${word.term}`;
  }, [practiceType, word]);

  function resetExercise(nextType?: LanguagePracticeType) {
    stopLanguageSpeech();
    if (nextType) setPracticeType(nextType);
    setAnswer("");
    setMeaningVisible(false);
    setOutcome(null);
    setError("");
    startedAt.current = Date.now();
  }

  function gradeTypedAnswer() {
    if (!word || !answer.trim()) return;
    const correct = normalizeAnswer(answer) === normalizeAnswer(word.term);
    setOutcome({
      answer,
      result: correct ? "correct" : "incorrect",
      feedback: correct ? "回答正确" : `正确答案：${word.term}`,
    });
  }

  function completeSpeaking(transcript: string) {
    if (!word) return;
    if (!transcript) {
      setOutcome({
        answer: "",
        result: "self_reviewed",
        feedback: "已完成跟读。本次没有可用的语音转写，因此不生成发音分数。",
      });
      return;
    }
    const correct = normalizeAnswer(transcript).includes(normalizeAnswer(word.term));
    setOutcome({
      answer: transcript,
      result: correct ? "correct" : "incorrect",
      feedback: correct
        ? "语音转写包含目标词；这只表示转写匹配，不代表声学发音评分。"
        : `识别转写为“${transcript}”；请对照目标词继续跟读。`,
    });
  }

  async function persist(rating: VocabularyRating) {
    if (!word || !outcome || busy) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/api/courses/${course.id}/language/practice`, {
        practice_type: practiceType,
        vocabulary_item_id: word.id,
        source_kind: word.source_kind || "",
        source_id: word.source_id || "",
        document_id: word.document_id || null,
        block_key: word.block_key || "",
        locator: word.locator || {},
        prompt,
        answer: outcome.answer,
        result: outcome.result,
        feedback: outcome.feedback,
        duration_seconds: Math.max(0, Math.round((Date.now() - startedAt.current) / 1000)),
      });
      await api.post(`/api/vocabulary/${word.id}/review`, { rating });
      await api.post("/api/vocabulary/check-in", {
        course_id: course.id,
        local_date: localDate(),
        reviewed_count: reviewedToday + completedHere + 1,
      });
      setCompletedHere((value) => value + 1);
      setWordIndex((value) => value + 1);
      resetExercise();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "训练记录保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="language-page language-practice" aria-label="语言课程今日训练">
      <header className="language-practice__header">
        <div><h1>今日训练</h1><p>从真实词汇本出题；完成后写入训练记录和间隔复习计划。</p></div>
        <span>{completedHere} 已完成</span>
      </header>

      <div className="language-practice__tabs" role="tablist" aria-label="训练类型">
        {(Object.keys(PRACTICE_LABELS) as LanguagePracticeType[]).map((type) => (
          <button
            type="button"
            role="tab"
            aria-selected={practiceType === type}
            className={practiceType === type ? "is-active" : ""}
            key={type}
            onClick={() => resetExercise(type)}
          >
            {PRACTICE_LABELS[type]}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="error-message">{error}</p>}
      {loading ? (
        <div className="language-practice__empty">正在准备训练…</div>
      ) : !word ? (
        <div className="language-practice__empty">
          <strong>{words.length ? "今天的到期复习已完成" : "今天没有到期复习"}</strong>
          <p>
            {words.length
              ? "复习已经写入间隔计划，现在继续今天的新课。"
              : "无需自己添加词语；进入内置课后会自动建立本课词汇。"}
          </p>
          {onContinueLesson && (
            <button
              type="button"
              className="language-primary-action"
              onClick={onContinueLesson}
            >{words.length ? "继续今日新课" : "开始内置第一课"}</button>
          )}
        </div>
      ) : (
        <article className="language-exercise-card">
          <header>
            <span>{PRACTICE_LABELS[practiceType]} · {wordIndex + 1}/{words.length}</span>
            {practiceType !== "listening" && <h2>{word.term}</h2>}
            {practiceType !== "listening" && (
              <PronunciationDisplay
                value={word.pronunciation}
                scheme={course.pronunciation_scheme}
                romanization={course.romanization_enabled}
              />
            )}
          </header>

          {practiceType === "reading" && (
            <div className="language-exercise-card__body">
              <blockquote>{word.example || word.term}</blockquote>
              {meaningVisible ? <p className="language-answer-reveal">{word.meaning || "暂无释义"}</p> : (
                <button type="button" onClick={() => setMeaningVisible(true)}>显示释义</button>
              )}
              <button
                type="button"
                className="language-primary-action"
                disabled={!meaningVisible}
                onClick={() => setOutcome({
                  answer: "",
                  result: "self_reviewed",
                  feedback: "已阅读例句并核对释义。",
                })}
              >
                完成阅读
              </button>
            </div>
          )}

          {practiceType === "listening" && (
            <div className="language-exercise-card__body">
              <div className="speech-playback-actions">
                <button type="button" onClick={() => {
                  speakLanguageText(
                    word.term,
                    course.target_language_tag || word.language_tag,
                    course.speech_rate || 1,
                  );
                }}>原速播放</button>
                <button type="button" onClick={() => {
                  speakLanguageText(
                    word.term,
                    course.target_language_tag || word.language_tag,
                    Math.max(0.5, (course.speech_rate || 1) * 0.65),
                  );
                }}>慢速播放</button>
              </div>
              <label>听写答案<input autoFocus aria-label="听写答案" value={answer} onChange={(event) => setAnswer(event.target.value)} /></label>
              <button type="button" className="language-primary-action" disabled={!answer.trim()} onClick={gradeTypedAnswer}>检查答案</button>
            </div>
          )}

          {practiceType === "speaking" && (
            <div className="language-exercise-card__body">
              <p>{word.meaning}</p>
              <SpeechPracticeControls
                key={`${word.id}-${practiceType}`}
                term={word.term}
                languageTag={course.target_language_tag || word.language_tag}
                speechRate={course.speech_rate || 1}
                onComplete={completeSpeaking}
              />
            </div>
          )}

          {practiceType === "writing" && (
            <div className="language-exercise-card__body">
              <p className="language-writing-prompt">{word.meaning || "根据读音写出目标词"}</p>
              <label>拼写答案<input autoFocus aria-label="拼写答案" value={answer} onChange={(event) => setAnswer(event.target.value)} /></label>
              <button type="button" className="language-primary-action" disabled={!answer.trim()} onClick={gradeTypedAnswer}>检查答案</button>
            </div>
          )}

          {outcome && (
            <footer className={`language-practice-result is-${outcome.result}`}>
              <strong>{outcome.feedback}</strong>
              <span>你对这个词的掌握程度？</span>
              <div>
                {RATING_LABELS.map(({ rating, label }) => (
                  <button type="button" key={rating} disabled={busy} onClick={() => void persist(rating)}>
                    {busy ? "保存中…" : label}
                  </button>
                ))}
              </div>
            </footer>
          )}
        </article>
      )}
    </section>
  );
}
