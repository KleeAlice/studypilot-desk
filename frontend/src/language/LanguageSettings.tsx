import { useEffect, useState } from "react";
import type { ApiClient } from "../services/api";
import type { Course, LanguageProficiency, LanguageTrainingFocus } from "../types";
import { languageName } from "./LanguageCourseShell";
import { speakLanguageText, stopLanguageSpeech } from "./speech";

const focusOptions: Array<{ value: LanguageTrainingFocus; label: string }> = [
  { value: "reading", label: "阅读" },
  { value: "listening", label: "听力" },
  { value: "speaking", label: "口语" },
  { value: "writing", label: "写作" },
];

const speechSamples: Record<string, string> = {
  "en-US": "Hello, nice to meet you.",
  "fr-FR": "Bonjour, ravi de vous rencontrer.",
  "ja-JP": "こんにちは、はじめまして。",
  "ko-KR": "안녕하세요, 만나서 반갑습니다.",
  "yue-Hant-HK": "你好，好高興認識你。",
};

export function LanguageSettings({
  api,
  course,
  onSaved,
}: {
  api: ApiClient;
  course: Course;
  onSaved: (course: Course) => void;
}) {
  const [level, setLevel] = useState<LanguageProficiency>(course.proficiency_level || "beginner");
  const [dailyGoal, setDailyGoal] = useState(String(course.daily_word_goal || 10));
  const [lessonMinutes, setLessonMinutes] = useState(course.lesson_minutes || 15);
  const [speechRate, setSpeechRate] = useState(course.speech_rate || 1);
  const [autoPlay, setAutoPlay] = useState(course.auto_play_audio === true);
  const [romanization, setRomanization] = useState(course.romanization_enabled === true);
  const [focus, setFocus] = useState<LanguageTrainingFocus[]>(
    course.training_focus?.length
      ? course.training_focus
      : ["reading", "listening", "speaking", "writing"],
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const focusKey = course.training_focus?.join("|") || "";
  useEffect(() => {
    setLevel(course.proficiency_level || "beginner");
    setDailyGoal(String(course.daily_word_goal || 10));
    setLessonMinutes(course.lesson_minutes || 15);
    setSpeechRate(course.speech_rate || 1);
    setAutoPlay(course.auto_play_audio === true);
    setRomanization(course.romanization_enabled === true);
    setFocus(course.training_focus?.length
      ? [...course.training_focus]
      : ["reading", "listening", "speaking", "writing"]);
    stopLanguageSpeech();
  }, [
    course.id, course.proficiency_level, course.daily_word_goal, course.lesson_minutes,
    course.speech_rate, course.auto_play_audio, course.romanization_enabled, focusKey,
  ]);

  useEffect(() => () => stopLanguageSpeech(), []);
  useEffect(() => {
    setMessage("");
    setError("");
  }, [course.id]);

  function toggleFocus(value: LanguageTrainingFocus) {
    setFocus((current) => current.includes(value)
      ? current.length === 1 ? current : current.filter((item) => item !== value)
      : [...current, value]);
  }

  async function save() {
    const parsedDailyGoal = Number(dailyGoal);
    if (!Number.isInteger(parsedDailyGoal) || parsedDailyGoal < 1 || parsedDailyGoal > 100) {
      setMessage("");
      setError("每日词汇目标请输入 1–100");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = await api.patch<Course>(`/api/courses/${course.id}`, {
        proficiency_level: level,
        daily_word_goal: parsedDailyGoal,
        lesson_minutes: lessonMinutes,
        speech_rate: speechRate,
        auto_play_audio: autoPlay,
        pronunciation_scheme: course.pronunciation_scheme || "",
        romanization_enabled: romanization,
        training_focus: focus,
      });
      onSaved(updated);
      setMessage("设置已保存");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "设置保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="language-page language-settings">
      <header>
        <div>
          <span className="language-page-kicker">学习偏好</span>
          <h1>语言课程设置</h1>
          <p>这里的设置只影响当前语言课程，不会改动知识学习模式。</p>
        </div>
        <button type="button" className="language-primary-action" disabled={saving} onClick={() => void save()}>
          {saving ? "正在保存…" : "保存语言设置"}
        </button>
      </header>

      <div className="language-settings-grid">
        <article>
          <h2>学习节奏</h2>
          <label>目标语言<input value={languageName(course.target_language_tag)} disabled /></label>
          <label>
            当前水平
            <select aria-label="当前水平" value={level} onChange={(event) => setLevel(event.target.value as LanguageProficiency)}>
              <option value="beginner">从零开始</option>
              <option value="elementary">基础</option>
              <option value="intermediate">中级</option>
              <option value="advanced">高级</option>
            </select>
          </label>
          <label>
            每日词汇目标
            <input aria-label="每日词汇目标" type="number" min={1} max={100} value={dailyGoal} onChange={(event) => setDailyGoal(event.target.value)} />
          </label>
          <label>
            每课时长
            <select aria-label="每课时长" value={lessonMinutes} onChange={(event) => setLessonMinutes(Number(event.target.value))}>
              <option value={10}>10 分钟</option>
              <option value={15}>15 分钟</option>
              <option value={20}>20 分钟</option>
              <option value={30}>30 分钟</option>
            </select>
          </label>
        </article>

        <article>
          <h2>朗读与显示</h2>
          <label className="language-settings__range">
            朗读速度 <strong>{speechRate.toFixed(2)}×</strong>
            <input aria-label="朗读速度" type="range" min={0.5} max={1.5} step={0.05} value={speechRate} onChange={(event) => setSpeechRate(Number(event.target.value))} />
          </label>
          <div className="language-settings__audio-test">
            <button type="button" onClick={() => speakLanguageText(
              speechSamples[course.target_language_tag || "en-US"] || speechSamples["en-US"],
              course.target_language_tag || "en-US",
              speechRate,
            )}>试听</button>
            <button type="button" onClick={stopLanguageSpeech}>停止</button>
          </div>
          <label className="language-toggle">
            <input aria-label="进入课节时自动朗读" type="checkbox" checked={autoPlay} onChange={(event) => setAutoPlay(event.target.checked)} />
            <span><strong>进入课节时自动朗读</strong><small>仅朗读当前学习项，切页和退出时自动停止</small></span>
          </label>
          <label className="language-toggle">
            <input aria-label="显示罗马字/注音" type="checkbox" checked={romanization} onChange={(event) => setRomanization(event.target.checked)} />
            <span><strong>显示罗马字/注音</strong><small>可在熟练后关闭，逐步依赖原文字形</small></span>
          </label>
        </article>

        <article className="language-settings__focus">
          <h2>训练重点</h2>
          <p>至少保留一项；内置课仍会保证听说读写的完整闭环。</p>
          <div>
            {focusOptions.map((option) => (
              <button
                type="button"
                key={option.value}
                className={focus.includes(option.value) ? "is-active" : ""}
                aria-pressed={focus.includes(option.value)}
                onClick={() => toggleFocus(option.value)}
              >{option.label}</button>
            ))}
          </div>
        </article>
      </div>
      {message && <p className="language-settings__success" role="status">{message}</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
    </section>
  );
}
