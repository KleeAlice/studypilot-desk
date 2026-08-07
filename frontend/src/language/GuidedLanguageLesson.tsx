import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApiClient } from "../services/api";
import { SpeechPracticeControls } from "./SpeechPracticeControls";
import { speakLanguageText, stopLanguageSpeech } from "./speech";
import type { LanguageJourney, LanguageLesson } from "./types";

const STEP_LABELS = ["目标", "词汇", "情境", "听辨", "跟读", "表达", "总结"];

function meaningfulOutputUnits(value: string): string[] {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized) return [];
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(normalized)) {
    return Array.from(normalized.replace(/[\p{P}\p{S}\s]+/gu, ""));
  }
  return normalized
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function guidedLessonScore({
  lessonType,
  listeningCorrect,
  shadowed,
  output,
}: {
  lessonType: LanguageLesson["lesson_type"];
  listeningCorrect: boolean;
  shadowed: boolean;
  output: string;
}): number {
  const requiredOutputUnits = {
    discover: 5,
    practice: 6,
    mission: 8,
    checkpoint: 14,
  }[lessonType];
  const outputRatio = Math.min(
    1,
    meaningfulOutputUnits(output).length / requiredOutputUnits,
  );
  return Math.min(
    100,
    20
      + (listeningCorrect ? 25 : 0)
      + (shadowed ? 20 : 0)
      + Math.round(outputRatio * 35),
  );
}

export function GuidedLanguageLesson({
  api,
  courseId,
  targetLanguageTag,
  onOpenJourney,
}: {
  api: ApiClient;
  courseId: number;
  targetLanguageTag: string;
  onOpenJourney: () => void;
}) {
  const [journey, setJourney] = useState<LanguageJourney | null>(null);
  const [step, setStep] = useState(0);
  const [listeningAnswer, setListeningAnswer] = useState("");
  const [shadowed, setShadowed] = useState(false);
  const [output, setOutput] = useState("");
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState("");
  const [requiredRetryScore, setRequiredRetryScore] = useState<number | null>(null);
  const startedAt = useRef(Date.now());

  const load = useCallback(async () => {
    setError("");
    try {
      const next = await api.post<LanguageJourney>(
        `/api/courses/${courseId}/language/start`,
      );
      setJourney(next);
      startedAt.current = Date.now();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "课程暂时无法开始");
    }
  }, [api, courseId]);

  useEffect(() => {
    void load();
    return stopLanguageSpeech;
  }, [load]);

  useEffect(() => {
    stopLanguageSpeech();
  }, [step]);

  const lesson = journey?.current_lesson;
  const speechRate = journey?.course_settings.speech_rate || 1;
  useEffect(() => {
    if (
      lesson
      && journey?.course_settings.auto_play_audio
      && step === 1
    ) {
      speakLanguageText(lesson.phrases[0]?.term || "", targetLanguageTag, speechRate);
    }
  }, [journey?.course_settings.auto_play_audio, lesson, speechRate, step, targetLanguageTag]);

  const listeningCorrect = Boolean(
    lesson && listeningAnswer === lesson.listening.answer,
  );
  const score = useMemo(() => {
    if (!lesson) return 0;
    return guidedLessonScore({
      lessonType: lesson.lesson_type,
      listeningCorrect,
      shadowed,
      output,
    });
  }, [lesson, listeningCorrect, output, shadowed]);

  function nextStep() {
    stopLanguageSpeech();
    setStep((value) => Math.min(STEP_LABELS.length - 1, value + 1));
  }

  async function finishLesson() {
    if (!lesson || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await api.post<{ mastered: boolean; required_score: number }>(
        `/api/courses/${courseId}/language/lessons/${lesson.id}/complete`,
        {
          score,
          duration_seconds: Math.max(
            0,
            Math.round((Date.now() - startedAt.current) / 1000),
          ),
          activity_results: [
            {
              activity: "listening",
              result: listeningCorrect ? "correct" : "incorrect",
            },
            { activity: "speaking", result: "self_reviewed" },
            { activity: "writing", result: output.trim() ? "self_reviewed" : "pending" },
          ],
        },
      );
      stopLanguageSpeech();
      if (result.mastered === false) {
        setRequiredRetryScore(result.required_score || lesson.mastery_threshold || 80);
        return;
      }
      setCompleted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "学习进度保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (error && !journey) {
    return (
      <section className="language-page language-page--state" role="alert">
        <strong>课程暂时无法开始</strong>
        <p>{error}</p>
        <button type="button" onClick={() => void load()}>重试</button>
      </section>
    );
  }
  if (!journey || !lesson) {
    return (
      <section className="language-page language-page--state" role="status">
        正在为你准备今天的课…
      </section>
    );
  }
  if (requiredRetryScore !== null) {
    return (
      <section className="language-page guided-lesson guided-lesson--retry" role="status">
        <div className="guided-lesson__celebration" aria-hidden="true">↻</div>
        <span>{journey.language_name} · {lesson.level}</span>
        <h1>还差一点掌握本课</h1>
        <p>本课需要达到 {requiredRetryScore} 分并完成听辨、跟读和表达。</p>
        <strong className="guided-lesson__score">{score} 分</strong>
        <div className="guided-lesson__complete-actions">
          <button
            type="button"
            className="language-primary-action"
            onClick={() => {
              setStep(0);
              setCompleted(false);
              setRequiredRetryScore(null);
              setListeningAnswer("");
              setShadowed(false);
              setOutput("");
              startedAt.current = Date.now();
            }}
          >
            重新练习本课
          </button>
          <button type="button" onClick={onOpenJourney}>查看掌握要求</button>
        </div>
      </section>
    );
  }

  if (completed) {
    return (
      <section className="language-page guided-lesson guided-lesson--complete">
        <div className="guided-lesson__celebration" aria-hidden="true">✓</div>
        <span>{journey.language_name} · {lesson.level}</span>
        <h1>本课已完成</h1>
        <p>你已经把词汇、理解、听辨、跟读和主动表达串成了一次完整使用。</p>
        <strong className="guided-lesson__score">{score} 分</strong>
        <div className="guided-lesson__complete-actions">
          <button type="button" className="language-primary-action" onClick={() => {
            setStep(0);
            setCompleted(false);
            setListeningAnswer("");
            setShadowed(false);
            setOutput("");
            setRequiredRetryScore(null);
            void load();
          }}>继续下一课</button>
          <button type="button" onClick={onOpenJourney}>查看学习路径</button>
        </div>
      </section>
    );
  }

  return (
    <section className="language-page guided-lesson" aria-label={`${lesson.title}引导课`}>
      <header className="guided-lesson__header">
        <div>
          <span>
            {lesson.level} · 第 {lesson.order} 课 ·{" "}
            {lesson.lesson_type === "checkpoint" ? "阶段关卡" : lesson.lesson_type === "mission" ? "实战" : lesson.lesson_type === "practice" ? "强化" : "认识"}
          </span>
          <h1>{lesson.title}</h1>
        </div>
        <button type="button" onClick={stopLanguageSpeech}>停止朗读</button>
      </header>
      <div className="guided-lesson__progress" aria-label={`课节进度 ${step + 1}/${STEP_LABELS.length}`}>
        {STEP_LABELS.map((label, index) => (
          <span key={label} className={index <= step ? "is-active" : ""}>
            <i />
            <small>{label}</small>
          </span>
        ))}
      </div>

      {step === 0 && (
        <article className="guided-lesson__panel guided-lesson__goal">
          <span className="guided-lesson__eyebrow">本课可做到</span>
          <h2>{lesson.can_do}</h2>
          <p>预计 {journey.course_settings.lesson_minutes || lesson.estimated_minutes} 分钟。先理解目标，再在真实情境里反复使用。</p>
          <button type="button" className="language-primary-action" onClick={nextStep}>开始热身</button>
        </article>
      )}

      {step === 1 && (
        <article className="guided-lesson__panel">
          <span className="guided-lesson__eyebrow">核心表达</span>
          <h2>先掌握今天真正会用到的三句话</h2>
          {lesson.lesson_type === "checkpoint" && (
            <strong className="guided-lesson__mastery-note">达到 {lesson.mastery_threshold} 分才会晋级下一阶段</strong>
          )}
          <div className="guided-phrase-list">
            {lesson.phrases.map((phrase) => (
              <button
                type="button"
                key={phrase.term}
                onClick={() => speakLanguageText(
                  phrase.term,
                  targetLanguageTag,
                  speechRate,
                )}
              >
                <span><strong>{phrase.term}</strong><small>{phrase.pronunciation}</small></span>
                <span>{phrase.meaning}</span>
                <i aria-hidden="true">▶</i>
              </button>
            ))}
          </div>
          <button type="button" className="language-primary-action" onClick={nextStep}>进入情境</button>
        </article>
      )}

      {step === 2 && (
        <article className="guided-lesson__panel">
          <span className="guided-lesson__eyebrow">理解与情境</span>
          <h2>{lesson.passage.title}</h2>
          <div className="guided-passage">
            <p>{lesson.passage.text}</p>
            <small>{lesson.passage.translation}</small>
            <button type="button" onClick={() => speakLanguageText(
              lesson.passage.text,
              targetLanguageTag,
              speechRate,
            )}>朗读文段</button>
          </div>
          <div className="guided-dialogue">
            {lesson.dialogue.map((line, index) => (
              <div key={`${line.speaker}-${index}`}>
                <strong>{line.speaker}</strong>
                <p>{line.text}</p>
                <small>{line.translation}</small>
              </div>
            ))}
          </div>
          <button type="button" className="language-primary-action" onClick={nextStep}>开始听辨</button>
        </article>
      )}

      {step === 3 && (
        <article className="guided-lesson__panel">
          <span className="guided-lesson__eyebrow">听辨</span>
          <h2>{lesson.listening.prompt}</h2>
          <button
            type="button"
            className="guided-listen-button"
            onClick={() => speakLanguageText(
              lesson.listening.text,
              targetLanguageTag,
              speechRate,
            )}
          >播放听力</button>
          <div className="guided-choice-list">
            {lesson.listening.choices.map((choice) => (
              <button
                type="button"
                key={choice}
                className={listeningAnswer === choice ? "is-selected" : ""}
                onClick={() => setListeningAnswer(choice)}
              >{choice}</button>
            ))}
          </div>
          {listeningAnswer && (
            <p className={listeningCorrect ? "language-feedback is-correct" : "language-feedback is-incorrect"}>
              {listeningCorrect ? "听对了。注意整句话的节奏。" : `再听一次。正确表达是：${lesson.listening.answer}`}
            </p>
          )}
          <button type="button" className="language-primary-action" disabled={!listeningCorrect} onClick={nextStep}>进入跟读</button>
        </article>
      )}

      {step === 4 && (
        <article className="guided-lesson__panel">
          <span className="guided-lesson__eyebrow">跟读与节奏</span>
          <h2>{lesson.shadowing.text}</h2>
          <p>{lesson.shadowing.translation}</p>
          <SpeechPracticeControls
            term={lesson.shadowing.text}
            languageTag={targetLanguageTag}
            speechRate={speechRate}
            onComplete={() => setShadowed(true)}
          />
          {shadowed && <p className="language-feedback is-correct">跟读已完成。下一步把它变成你自己的话。</p>}
          <button type="button" className="language-primary-action" disabled={!shadowed} onClick={nextStep}>开始表达</button>
        </article>
      )}

      {step === 5 && (
        <article className="guided-lesson__panel">
          <span className="guided-lesson__eyebrow">主动表达</span>
          <h2>{lesson.output.prompt}</h2>
          <div className="guided-scaffold">
            {lesson.output.scaffold.map((hint) => <span key={hint}>{hint}</span>)}
          </div>
          <label>
            我的表达
            <textarea
              aria-label="我的表达"
              value={output}
              onChange={(event) => setOutput(event.target.value)}
              placeholder="可以参考提示，但尽量说自己的内容"
            />
          </label>
          <button type="button" className="language-primary-action" disabled={!output.trim()} onClick={nextStep}>查看本课总结</button>
        </article>
      )}

      {step === 6 && (
        <article className="guided-lesson__panel guided-lesson__summary">
          <span className="guided-lesson__eyebrow">本课总结</span>
          <h2>你已经完成一次完整的语言使用循环</h2>
          <ul>
            <li><strong>理解</strong><span>核心词汇、短文与对话</span></li>
            <li><strong>听辨</strong><span>{listeningCorrect ? "已听出目标表达" : "需要继续复听"}</span></li>
            <li><strong>跟读</strong><span>已完成节奏模仿</span></li>
            <li><strong>输出</strong><span>{output}</span></li>
          </ul>
          <aside><strong>文化提示</strong><p>{lesson.culture_note}</p></aside>
          {error && <p role="alert" className="error-message">{error}</p>}
          <button type="button" className="language-primary-action" disabled={saving} onClick={() => void finishLesson()}>
            {saving ? "正在保存…" : "完成本课"}
          </button>
        </article>
      )}
    </section>
  );
}
