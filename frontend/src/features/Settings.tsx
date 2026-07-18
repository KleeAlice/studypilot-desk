import { useState } from "react";
import type { ApiClient } from "../services/api";
import type { DesktopRuntime } from "../types";
import { CODE_FONT_OPTIONS, UI_FONT_OPTIONS } from "../ui/typography";


type TypographyKey = "ui_font" | "code_font";

type SettingsProps = {
  api: ApiClient;
  runtime: DesktopRuntime;
  initialTheme: string;
  initialUiFont: string;
  initialCodeFont: string;
  onTheme: (theme: string) => void;
  onTypography: (key: TypographyKey, value: string) => Promise<void>;
};

export function Settings({
  api,
  runtime,
  initialTheme,
  initialUiFont,
  initialCodeFont,
  onTheme,
  onTypography,
}: SettingsProps) {
  const [theme, setTheme] = useState(initialTheme || "system");
  const [uiFont, setUiFont] = useState(initialUiFont || "system");
  const [codeFont, setCodeFont] = useState(initialCodeFont || "system");
  const [notice, setNotice] = useState("");

  async function changeTheme(value: string) {
    setTheme(value);
    onTheme(value);
    await api.put("/api/settings/theme", { value });
    setNotice("外观设置已保存");
  }

  async function changeFont(key: TypographyKey, value: string) {
    if (key === "ui_font") setUiFont(value);
    else setCodeFont(value);
    await onTypography(key, value);
    setNotice("字体设置已应用到整个 StudyPilot");
  }

  async function createBackup() {
    const result = await api.post<{ path: string }>("/api/backups");
    setNotice(`完整备份已创建：${result.path}`);
  }

  const uiStack = UI_FONT_OPTIONS.find((option) => option.id === uiFont)?.stack || UI_FONT_OPTIONS[0].stack;
  const codeStack = CODE_FONT_OPTIONS.find((option) => option.id === codeFont)?.stack || CODE_FONT_OPTIONS[0].stack;

  return (
    <section className="page settings-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">CONFIG / LOCAL FIRST</div>
          <h1>系统设置</h1>
          <p>调整整个学习空间的外观、字体与本地数据策略。</p>
        </div>
      </div>

      <div className="settings-sections">
        <section>
          <div className="panel-index">APPEARANCE</div>
          <h2>外观</h2>
          <div className="segmented" aria-label="颜色模式">
            {["dark", "light", "system"].map((value) => (
              <button
                key={value}
                className={theme === value ? "is-active" : ""}
                onClick={() => void changeTheme(value)}
              >
                {value === "dark" ? "深色" : value === "light" ? "浅色" : "跟随系统"}
              </button>
            ))}
          </div>
        </section>

        <section className="typography-settings">
          <div className="panel-index">TYPOGRAPHY</div>
          <h2>字体</h2>
          <p>字体仅使用本机已安装资源，离线可用，修改后立即作用于整个软件。</p>
          <div className="font-controls">
            <label>
              <span>界面字体</span>
              <select value={uiFont} onChange={(event) => void changeFont("ui_font", event.target.value)}>
                {UI_FONT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
            <label>
              <span>代码字体</span>
              <select value={codeFont} onChange={(event) => void changeFont("code_font", event.target.value)}>
                {CODE_FONT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <div className="font-preview" aria-label="字体预览">
            <strong style={{ fontFamily: uiStack }}>知识会在连接中生长</strong>
            <code style={{ fontFamily: codeStack }}>def learn(topic):</code>
          </div>
        </section>

        <section>
          <div className="panel-index">DATA LOCATION</div>
          <h2>本地数据</h2>
          <code className="path-code">{runtime.dataDir}</code>
          <p>数据库、文档、Python 工作区、实验输出和备份均位于此目录。</p>
          <button className="quiet-action" onClick={() => void createBackup()}>创建完整备份</button>
        </section>

        <section>
          <div className="panel-index">OPTIONAL AI</div>
          <h2>可选 AI 提供商</h2>
          <p>未配置时，搜索、路线、任务、Python、测验、掌握度与复习仍可离线运行。</p>
          <button className="quiet-action" disabled>检测配置</button>
        </section>
      </div>
      {notice && <p role="status" className="success-message">{notice}</p>}
    </section>
  );
}
