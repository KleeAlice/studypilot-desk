import { useEffect, useState } from "react";
import type {
  CourseCreateInput,
  CourseType,
  LanguageProficiency,
  LanguageTrainingFocus,
} from "../types";
import { MotionPresence } from "../components/MotionPresence";
import { COURSE_COVER_PRESETS, type CourseCoverPreset } from "../ui/course-covers";

const LANGUAGE_PRESETS = [
  { tag: "yue-Hant-HK", label: "粤语", pronunciation: "jyutping", note: "粤拼" },
  { tag: "en-US", label: "英语", pronunciation: "ipa", note: "IPA" },
  { tag: "fr-FR", label: "法语", pronunciation: "ipa", note: "IPA" },
  { tag: "ja-JP", label: "日语", pronunciation: "kana", note: "假名" },
  { tag: "ko-KR", label: "韩语", pronunciation: "hangul", note: "韩文" },
] as const;

const ALL_TRAINING_FOCUS: LanguageTrainingFocus[] = [
  "reading",
  "listening",
  "speaking",
  "writing",
];

function languagePreset(tag: string) {
  return LANGUAGE_PRESETS.find((item) => item.tag === tag) || LANGUAGE_PRESETS[1];
}

export function CourseWizard({ open, onClose, onCreate }: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: CourseCreateInput) => Promise<void>;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [courseType, setCourseType] = useState<CourseType | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverStyle, setCoverStyle] = useState<CourseCoverPreset>(COURSE_COVER_PRESETS[0].id);
  const [icon, setIcon] = useState("book");
  const [targetLanguage, setTargetLanguage] = useState("en-US");
  const [proficiency, setProficiency] = useState<LanguageProficiency>("beginner");
  const [dailyWordGoal, setDailyWordGoal] = useState("10");
  const [pronunciationScheme, setPronunciationScheme] = useState("ipa");
  const [romanizationEnabled, setRomanizationEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setCourseType(null);
    setError("");
  }, [open]);

  function chooseType(value: CourseType) {
    setCourseType(value);
    if (value === "language") {
      setIcon("book");
      setPronunciationScheme(languagePreset(targetLanguage).pronunciation);
    }
  }

  function chooseLanguage(tag: string) {
    setTargetLanguage(tag);
    setPronunciationScheme(languagePreset(tag).pronunciation);
    setRomanizationEnabled(false);
  }

  async function submit() {
    if (!title.trim() || !courseType || busy) return;
    setBusy(true);
    setError("");
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim(),
        cover_style: coverStyle,
        icon,
        goal: "",
        start_date: null,
        target_weeks: null,
        weekly_hours: null,
        course_type: courseType,
        target_language_tag: courseType === "language" ? targetLanguage : "",
        native_language_tag: "zh-CN",
        proficiency_level: proficiency,
        daily_word_goal: Math.max(1, Math.min(100, Number(dailyWordGoal) || 10)),
        pronunciation_scheme: courseType === "language" ? pronunciationScheme : "",
        romanization_enabled: courseType === "language" && romanizationEnabled,
        training_focus: ALL_TRAINING_FOCUS,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "课程创建失败，请重试");
    } finally {
      setBusy(false);
    }
  }

  const isLanguage = courseType === "language";
  const totalSteps = isLanguage ? 3 : 2;
  const shouldAdvance = step === 1 || (step === 2 && isLanguage);
  const stepTitle = step === 1
    ? "选择这门课程的学习方式"
    : step === 2
      ? isLanguage ? "建立你的语言学习空间" : "给课程一个清晰的身份"
      : "设置每天真正能完成的目标";

  return (
    <MotionPresence present={open} exitMs={180}>
      {(phase) => (
        <div
          className="course-wizard-backdrop"
          data-presence={phase}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <section className="course-wizard course-wizard--typed" role="dialog" aria-modal="true" aria-labelledby="course-wizard-title">
            <header>
              <div>
                <small>第 {step} 步，共 {totalSteps} 步</small>
                <h2 id="course-wizard-title">{stepTitle}</h2>
              </div>
              <button aria-label="关闭新建课程" onClick={onClose}>×</button>
            </header>
            <div className="course-wizard-steps" aria-hidden="true">
              {Array.from({ length: totalSteps }, (_, index) => index + 1).map((value) => <i key={value} className={step >= value ? "is-active" : ""} />)}
            </div>

            {step === 1 && (
              <div className="course-type-picker" aria-label="课程类型">
                <button
                  type="button"
                  aria-label="默认学习课程"
                  className={courseType === "knowledge" ? "is-selected" : ""}
                  aria-pressed={courseType === "knowledge"}
                  onClick={() => chooseType("knowledge")}
                >
                  <span aria-hidden="true">◇</span>
                  <strong>默认学习课程</strong>
                  <p>适合知识学习、研究、项目与实验。保留路线、知识网络、资料和 Python 工作区。</p>
                  <small>知识路线 · 资料 · 实验</small>
                </button>
                <button
                  type="button"
                  aria-label="语言学习课程"
                  className={courseType === "language" ? "is-selected" : ""}
                  aria-pressed={courseType === "language"}
                  onClick={() => chooseType("language")}
                >
                  <span aria-hidden="true">文</span>
                  <strong>语言学习课程</strong>
                  <p>独立的词汇、阅读、听力、跟读与拼写训练，不进入普通课程界面。</p>
                  <small>词汇复习 · 听说读写</small>
                </button>
              </div>
            )}

            {step === 2 && (
              <div className="course-wizard-grid">
                <div className="course-wizard-fields">
                  <label>
                    课程名称
                    <input
                      autoFocus
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder={isLanguage ? "例如：我的英语进阶" : "例如：机器学习基础"}
                      maxLength={160}
                    />
                  </label>
                  <label>
                    课程简介
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder={isLanguage ? "你希望能在哪些场景使用这门语言？" : "这门课程会带你解决什么问题？"}
                      maxLength={2000}
                    />
                  </label>
                  {isLanguage && (
                    <div className="language-course-identity">
                      <label>
                        目标语言
                        <select value={targetLanguage} onChange={(event) => chooseLanguage(event.target.value)}>
                          {LANGUAGE_PRESETS.map((preset) => (
                            <option key={preset.tag} value={preset.tag}>
                              {preset.label} · {preset.note}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        当前水平
                        <select value={proficiency} onChange={(event) => setProficiency(event.target.value as LanguageProficiency)}>
                          <option value="beginner">刚开始</option>
                          <option value="elementary">认识一些基础表达</option>
                          <option value="intermediate">可以进行日常交流</option>
                          <option value="advanced">希望提高准确度与表达</option>
                        </select>
                      </label>
                    </div>
                  )}
                  <fieldset>
                    <legend>封面色</legend>
                    <div className="course-cover-options">
                      {COURSE_COVER_PRESETS.map((preset) => (
                        <button
                          type="button"
                          key={preset.id}
                          className={`${preset.id === coverStyle ? "is-selected" : ""} cover-dot course-volume--${preset.id}`}
                          aria-label={`选择${preset.label}封面`}
                          onClick={() => setCoverStyle(preset.id)}
                        >
                          <i /><span>{preset.label}</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </div>
                <div className={`course-wizard-preview course-volume--${coverStyle}`}>
                  <i>{isLanguage ? languagePreset(targetLanguage).label.slice(0, 1) : "◇"}</i>
                  <strong>{title || (isLanguage ? `我的${languagePreset(targetLanguage).label}` : "你的新课程")}</strong>
                  <span>{description || (isLanguage ? "每天完成一小轮听说读写" : "一段清晰的课程简介")}</span>
                </div>
              </div>
            )}

            {step === 3 && isLanguage && (
              <div className="language-course-plan">
                <div className="course-wizard-row">
                  <label>
                    每日单词目标
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={dailyWordGoal}
                      onChange={(event) => setDailyWordGoal(event.target.value)}
                    />
                  </label>
                  <label>
                    读音显示
                    <select value={pronunciationScheme} onChange={(event) => setPronunciationScheme(event.target.value)}>
                      <option value="jyutping">粤拼</option>
                      <option value="ipa">IPA</option>
                      <option value="kana">假名</option>
                      <option value="hangul">韩文</option>
                      <option value="romanization">罗马字</option>
                    </select>
                  </label>
                </div>
                {["ja-JP", "ko-KR"].includes(targetLanguage) && (
                  <label className="language-romanization-toggle">
                    <input
                      type="checkbox"
                      checked={romanizationEnabled}
                      onChange={(event) => setRomanizationEnabled(event.target.checked)}
                    />
                    同时显示罗马字
                  </label>
                )}
                <div className="language-training-preview">
                  {[
                    ["阅读", "看懂词语和真实例句"],
                    ["听力", "听词语与短句辨认内容"],
                    ["跟读", "播放、慢速播放与主动录音"],
                    ["拼写", "根据释义或声音写出目标词"],
                  ].map(([name, copy]) => <article key={name}><strong>{name}</strong><span>{copy}</span></article>)}
                </div>
              </div>
            )}

            {error && <p className="error-message" role="alert">{error}</p>}
            <footer>
              {step === 1
                ? <button className="quiet-action" onClick={onClose}>取消</button>
                : <button className="quiet-action" onClick={() => setStep((step - 1) as 1 | 2)}>上一步</button>}
              <span />
              {shouldAdvance
                ? <button
                    className="primary-action"
                    disabled={(step === 1 && !courseType) || (step === 2 && !title.trim())}
                    onClick={() => setStep((step + 1) as 2 | 3)}
                  >
                    下一步
                  </button>
                : <button className="primary-action" disabled={busy || !title.trim()} onClick={() => void submit()}>
                    {busy ? "正在创建…" : "创建并进入课程"}
                  </button>}
            </footer>
          </section>
        </div>
      )}
    </MotionPresence>
  );
}
