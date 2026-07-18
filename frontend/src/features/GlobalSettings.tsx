import { CODE_FONT_OPTIONS, UI_FONT_OPTIONS } from "../ui/typography";


type TypographyKey = "ui_font" | "code_font";

export function GlobalSettings({
  startupDestination,
  uiFont,
  codeFont,
  onChangeStartup,
  onChangeTypography,
  onBack,
}: {
  startupDestination: "library" | "last_course";
  uiFont: string;
  codeFont: string;
  onChangeStartup: (value: "library" | "last_course") => Promise<void>;
  onChangeTypography: (key: TypographyKey, value: string) => Promise<void>;
  onBack: () => void;
}) {
  return (
    <main className="global-subpage global-settings-page">
      <header className="global-subpage-header">
        <button className="back-link" onClick={onBack}>← 返回课程书架</button>
        <div className="eyebrow">APPLICATION / PREFERENCES</div>
        <h1>全局设置</h1>
        <p>这些设置影响整个 StudyPilot，而不是某一门课程。</p>
      </header>

      <div className="global-settings-grid">
        <section className="global-settings-card">
          <div>
            <small>STARTUP</small>
            <h2>启动位置</h2>
            <p>默认先进入课程书架；也可以自动回到上次学习的课程和模块。</p>
          </div>
          <div className="startup-choice">
            <button className={startupDestination === "library" ? "is-selected" : ""} onClick={() => void onChangeStartup("library")}>
              <i>▦</i><span><strong>课程书架</strong><small>每次先选择课程</small></span>
            </button>
            <button className={startupDestination === "last_course" ? "is-selected" : ""} onClick={() => void onChangeStartup("last_course")}>
              <i>→</i><span><strong>继续上次课程</strong><small>恢复该课程最后模块</small></span>
            </button>
          </div>
        </section>

        <section className="global-settings-card global-font-card">
          <div>
            <small>TYPOGRAPHY</small>
            <h2>字体与阅读感受</h2>
            <p>选择本机字体栈。无需联网，界面和 Python 编辑器会即时同步。</p>
          </div>
          <div className="font-controls">
            <label>
              <span>界面字体</span>
              <select value={uiFont} onChange={(event) => void onChangeTypography("ui_font", event.target.value)}>
                {UI_FONT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span>代码字体</span>
              <select value={codeFont} onChange={(event) => void onChangeTypography("code_font", event.target.value)}>
                {CODE_FONT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
          </div>
        </section>
      </div>
    </main>
  );
}
