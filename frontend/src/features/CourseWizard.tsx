import { useEffect, useState } from "react";
import type { CourseCreateInput } from "../types";
import { MotionPresence } from "../components/MotionPresence";
import { COURSE_COVER_PRESETS, type CourseCoverPreset } from "../ui/course-covers";

export function CourseWizard({ open, onClose, onCreate }: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: CourseCreateInput) => Promise<void>;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coverStyle, setCoverStyle] = useState<CourseCoverPreset>(COURSE_COVER_PRESETS[0].id);
  const [icon, setIcon] = useState("network");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetWeeks, setTargetWeeks] = useState("24");
  const [weeklyHours, setWeeklyHours] = useState("6");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) { setStep(1); setError(""); }
  }, [open]);

  async function submit() {
    if (!title.trim() || busy) return;
    setBusy(true); setError("");
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim(),
        cover_style: coverStyle,
        icon,
        goal: goal.trim(),
        start_date: startDate || null,
        target_weeks: targetWeeks ? Number(targetWeeks) : null,
        weekly_hours: weeklyHours ? Number(weeklyHours) : null,
        course_type: "knowledge",
        target_language_tag: "",
        native_language_tag: "zh-CN",
        proficiency_level: "beginner",
        daily_word_goal: 10,
        pronunciation_scheme: "",
        romanization_enabled: false,
        training_focus: ["reading", "listening", "speaking", "writing"],
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "课程创建失败，请重试");
    } finally { setBusy(false); }
  }

  return <MotionPresence present={open} exitMs={180}>{(phase) => <div className="course-wizard-backdrop" data-presence={phase} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="course-wizard" role="dialog" aria-modal="true" aria-labelledby="course-wizard-title">
      <header><div><small>NEW COURSE / {step} OF 2</small><h2 id="course-wizard-title">{step === 1 ? "给课程一个清晰的身份" : "设定你真正想抵达的地方"}</h2></div><button aria-label="关闭新建课程" onClick={onClose}>×</button></header>
      <div className="course-wizard-steps"><i className="is-active" /><i className={step === 2 ? "is-active" : ""} /></div>
      {step === 1 ? <div className="course-wizard-grid">
        <div className="course-wizard-fields">
          <label>课程名称<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：机器学习基础" maxLength={160} /></label>
          <label>课程简介<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="这门课程会带你解决什么问题？" maxLength={2000} /></label>
          <fieldset><legend>封面色</legend><div className="course-cover-options">{COURSE_COVER_PRESETS.map((preset) => <button type="button" key={preset.id} className={`${preset.id === coverStyle ? "is-selected" : ""} cover-dot course-volume--${preset.id}`} aria-label={`选择${preset.label}封面`} onClick={() => setCoverStyle(preset.id)}><i /><span>{preset.label}</span></button>)}</div></fieldset>
          <fieldset><legend>课程图标</legend><div className="course-icon-options">{[["network", "⌘"], ["matrix", "∑"], ["python", "λ"], ["research", "◈"], ["book", "◇"]].map(([value, glyph]) => <button type="button" key={value} className={value === icon ? "is-selected" : ""} onClick={() => setIcon(value)} aria-label={`选择${value}图标`}>{glyph}</button>)}</div></fieldset>
        </div>
        <div className={`course-wizard-preview course-volume--${coverStyle}`}><i>{{ network: "⌘", matrix: "∑", python: "λ", research: "◈", book: "◇" }[icon]}</i><strong>{title || "你的新课程"}</strong><span>{description || "一段清晰的课程简介"}</span></div>
      </div> : <div className="course-wizard-plan">
        <label>学习目标<textarea autoFocus value={goal} onChange={(event) => setGoal(event.target.value)} placeholder="例如：独立完成一个可复现的端到端项目" maxLength={2000} /></label>
        <div className="course-wizard-row"><label>开始日期<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>预计学习周数<input type="number" min="1" max="260" value={targetWeeks} onChange={(event) => setTargetWeeks(event.target.value)} /></label><label>每周投入小时<input type="number" min="0.5" max="168" step="0.5" value={weeklyHours} onChange={(event) => setWeeklyHours(event.target.value)} /></label></div>
        <div className="course-plan-note"><span>◎</span><p><strong>这些都可以稍后修改</strong>StudyPilot 会用目标和时间生成更贴近你的课程主页，但不会锁死学习节奏。</p></div>
      </div>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <footer>{step === 2 ? <button className="quiet-action" onClick={() => setStep(1)}>上一步</button> : <button className="quiet-action" onClick={onClose}>取消</button>}<span />{step === 1 ? <button className="primary-action" disabled={!title.trim()} onClick={() => setStep(2)}>下一步</button> : <><button className="quiet-action" disabled={busy} onClick={() => { setGoal(""); setTargetWeeks(""); setWeeklyHours(""); void submit(); }}>跳过计划</button><button className="primary-action" disabled={busy} onClick={() => void submit()}>{busy ? "正在创建…" : "创建并进入课程"}</button></>}</footer>
    </section>
  </div>}</MotionPresence>;
}
