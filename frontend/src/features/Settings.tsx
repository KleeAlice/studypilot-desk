import { useState } from "react";
import { AppearancePreferences } from "../components/AppearancePreferences";
import { ExportArchivePreferences } from "../components/ExportArchivePreferences";
import { WorkspaceToolbarPreferences } from "../components/WorkspaceToolbarPreferences";
import { SettingsIcon } from "../components/SettingsIcon";
import { GlassOpacityPreference } from "../components/GlassOpacityPreference";
import { SettingsSectionNav } from "../components/SettingsSectionNav";
import type { ApiClient } from "../services/api";
import type { DesktopRuntime } from "../types";
import type { WallpaperMode } from "../ui/appearance";
import type { UiLanguage } from "../ui/language";


type TypographyKey = "ui_font" | "code_font";

type SettingsProps = {
  api: ApiClient;
  runtime: DesktopRuntime;
  initialTheme: string;
  initialUiFont: string;
  initialCodeFont: string;
  systemFonts?: string[];
  initialFontScale?: number;
  initialForceUniformFontSize?: boolean;
  initialWallpaperMode?: WallpaperMode;
  initialWallpaperOpacity?: number;
  initialWallpaperBlur?: number;
  initialGlassOpacity?: number;
  initialWallpaperAdaptiveTheme?: boolean;
  initialLanguage?: UiLanguage;
  initialWorkspaceToolbarAutoHide?: boolean;
  wallpaperImageUrl?: string;
  exportDirectory?: string;
  onTheme: (theme: string) => void;
  onTypography: (key: TypographyKey, value: string) => Promise<void>;
  onFontScale?: (value: number) => Promise<void>;
  onForceUniformFontSize?: (value: boolean) => Promise<void>;
  onWallpaperMode?: (value: WallpaperMode) => Promise<void>;
  onWallpaperUpload?: (file: File) => Promise<void>;
  onWallpaperClear?: () => Promise<void>;
  onWallpaperOpacity?: (value: number) => Promise<void>;
  onWallpaperBlur?: (value: number) => Promise<void>;
  onGlassOpacity?: (value: number) => Promise<void>;
  onWallpaperAdaptiveTheme?: (value: boolean) => Promise<void>;
  onLanguage?: (value: UiLanguage) => Promise<void>;
  onWorkspaceToolbarAutoHide?: (value: boolean) => Promise<void>;
  onChooseExportDirectory?: () => Promise<string | null>;
  onResetExportDirectory?: () => Promise<string>;
  onOpenExportDirectory?: () => Promise<void>;
};

export function Settings({
  api,
  runtime,
  initialTheme,
  initialUiFont,
  initialCodeFont,
  systemFonts = [],
  initialFontScale = 1,
  initialForceUniformFontSize = false,
  initialWallpaperMode = "none",
  initialWallpaperOpacity = .82,
  initialWallpaperBlur = 0,
  initialGlassOpacity = .78,
  initialWallpaperAdaptiveTheme = false,
  initialLanguage = "zh-CN",
  initialWorkspaceToolbarAutoHide = true,
  wallpaperImageUrl = "",
  exportDirectory: initialExportDirectory = "",
  onTheme,
  onTypography,
  onFontScale,
  onForceUniformFontSize,
  onWallpaperMode,
  onWallpaperUpload,
  onWallpaperClear,
  onWallpaperOpacity,
  onWallpaperBlur,
  onGlassOpacity,
  onWallpaperAdaptiveTheme,
  onLanguage,
  onWorkspaceToolbarAutoHide,
  onChooseExportDirectory,
  onResetExportDirectory,
  onOpenExportDirectory,
}: SettingsProps) {
  const [theme, setTheme] = useState(initialTheme || "system");
  const [uiFont, setUiFont] = useState(initialUiFont || "system");
  const [codeFont, setCodeFont] = useState(initialCodeFont || "system");
  const [fontScale, setFontScale] = useState(initialFontScale || 1);
  const [forceUniformFontSize, setForceUniformFontSize] = useState(initialForceUniformFontSize);
  const [wallpaperMode, setWallpaperMode] = useState<WallpaperMode>(initialWallpaperMode);
  const [wallpaperOpacity, setWallpaperOpacity] = useState(initialWallpaperOpacity);
  const [wallpaperBlur, setWallpaperBlur] = useState(initialWallpaperBlur);
  const [glassOpacity, setGlassOpacity] = useState(initialGlassOpacity);
  const [wallpaperAdaptiveTheme, setWallpaperAdaptiveTheme] = useState(initialWallpaperAdaptiveTheme);
  const [language, setLanguage] = useState<UiLanguage>(initialLanguage);
  const [exportDirectory, setExportDirectory] = useState(initialExportDirectory);
  const [notice, setNotice] = useState("");

  async function changeTheme(value: string) {
    setTheme(value);
    onTheme(value);
    await api.put("/api/settings/theme", { value });
    setNotice("外观设置已保存");
  }

  async function changeLanguage(value: UiLanguage) {
    setLanguage(value);
    if (onLanguage) await onLanguage(value);
    else await api.put("/api/settings/ui_language", { value });
    setNotice(value === "en-US" ? "Interface language updated" : "界面语言已更新");
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

  async function changeFontScale(value: number) {
    setFontScale(value);
    if (onFontScale) await onFontScale(value);
    else await api.put("/api/settings/ui_font_scale", { value });
    setNotice("界面字号已应用到整个 StudyPilot");
  }

  async function changeForceUniformFontSize(value: boolean) {
    setForceUniformFontSize(value);
    if (onForceUniformFontSize) await onForceUniformFontSize(value);
    else await api.put("/api/settings/force_uniform_font_size", { value });
    setNotice(value ? "已强制统一界面字号" : "已恢复层级化界面字号");
  }

  async function changeWallpaper(value: WallpaperMode) {
    setWallpaperMode(value);
    if (onWallpaperMode) await onWallpaperMode(value);
    setNotice("软件壁纸已更新");
  }

  async function uploadWallpaper(file: File) {
    if (onWallpaperUpload) await onWallpaperUpload(file);
    setWallpaperMode("custom");
    setNotice("本地壁纸已保存");
  }

  async function clearWallpaper() {
    if (onWallpaperClear) await onWallpaperClear();
    setWallpaperMode("none");
    setNotice("已清除壁纸并恢复纯色背景");
  }

  async function changeWallpaperOpacity(value: number) {
    setWallpaperOpacity(value);
    if (onWallpaperOpacity) await onWallpaperOpacity(value);
    else await api.put("/api/settings/wallpaper_opacity", { value });
    setNotice("壁纸可见度已更新");
  }

  async function changeWallpaperBlur(value: number) {
    setWallpaperBlur(value);
    if (onWallpaperBlur) await onWallpaperBlur(value);
    else await api.put("/api/settings/wallpaper_blur", { value });
    setNotice("壁纸模糊程度已更新");
  }
  async function changeGlassOpacity(value: number) {
    setGlassOpacity(value);
    if (onGlassOpacity) await onGlassOpacity(value);
    else await api.put("/api/settings/glass_opacity", { value });
    setNotice("液态玻璃透明度已应用到所有页面");
  }


  async function changeWallpaperAdaptiveTheme(value: boolean) {
    setWallpaperAdaptiveTheme(value);
    if (onWallpaperAdaptiveTheme) await onWallpaperAdaptiveTheme(value);
    else await api.put("/api/settings/wallpaper_adaptive_theme", { value });
    setNotice(value ? "已从壁纸吸取主题色" : "已恢复当前颜色模式的默认主题色");
  }

  return (
    <section className="page settings-page">
      <div className="page-heading">
        <div>
          <h1>{language === "en-US" ? "System settings" : "系统设置"}</h1>
        </div>
      </div>

      <div className="settings-center settings-center--course">
        <aside className="settings-center__sidebar">
          <div className="settings-center__brand">
            <span><SettingsIcon name="general" /></span>
            <div><strong>设置中心</strong><small>STUDYPILOT DESK</small></div>
          </div>
          <SettingsSectionNav
            items={[
              { id: "settings-general", icon: "general", label: "常规" },
              { id: "settings-theme", icon: "theme", label: "外观模式" },
              { id: "settings-typography", icon: "type", label: "字体与字号" },
              { id: "settings-wallpaper", icon: "wallpaper", label: "软件壁纸" },
              { id: "settings-workspace", icon: "workspace", label: "工作区" },
              { id: "settings-data", icon: "data", label: "数据与模型" },
            ]}
          />
          <p>所有更改即时生效，并自动保存到本机。</p>
        </aside>
        <div className="settings-sections settings-center__content">
        <section id="settings-general" className="settings-panel language-settings-card">
          <header className="settings-panel__header"><span className="settings-panel__icon"><SettingsIcon name="general" /></span><div><h2>{language === "en-US" ? "Interface language" : "界面语言"}</h2><p>选择整个桌面端使用的界面语言。</p></div></header>
          <label>{language === "en-US" ? "Language" : "界面语言"}<select aria-label="界面语言" value={language} onChange={(event) => void changeLanguage(event.target.value as UiLanguage)}><option value="zh-CN">简体中文</option><option value="en-US">English</option></select></label>
        </section>
        <section id="settings-theme" className="settings-panel theme-settings-card">
          <header className="settings-panel__header"><span className="settings-panel__icon"><SettingsIcon name="theme" /></span><div><h2>外观模式</h2><p>浅色、深色或跟随 Windows 系统设置。</p></div></header>
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
          <GlassOpacityPreference
            value={glassOpacity}
            language={language}
            onChange={changeGlassOpacity}
          />
        </section>

        <AppearancePreferences
          systemFonts={systemFonts}
          uiFont={uiFont}
          codeFont={codeFont}
          fontScale={fontScale}
          forceUniformFontSize={forceUniformFontSize}
          wallpaperMode={wallpaperMode}
          wallpaperImageUrl={wallpaperImageUrl}
          wallpaperOpacity={wallpaperOpacity}
          onTypography={changeFont}
          wallpaperBlur={wallpaperBlur}
          wallpaperAdaptiveTheme={wallpaperAdaptiveTheme}
          onWallpaperAdaptiveTheme={changeWallpaperAdaptiveTheme}
          onFontScale={changeFontScale}
          onForceUniformFontSize={changeForceUniformFontSize}
          onWallpaperMode={changeWallpaper}
          onWallpaperUpload={uploadWallpaper}
          onWallpaperClear={clearWallpaper}
          onWallpaperOpacity={changeWallpaperOpacity}
          onWallpaperBlur={changeWallpaperBlur}
        />

        {onWorkspaceToolbarAutoHide && (
          <WorkspaceToolbarPreferences
            autoHide={initialWorkspaceToolbarAutoHide}
            language={language}
            onChange={onWorkspaceToolbarAutoHide}
          />
        )}

        {onChooseExportDirectory && onResetExportDirectory && onOpenExportDirectory && (
          <ExportArchivePreferences
            directory={exportDirectory}
            onChoose={async () => {
              const value = await onChooseExportDirectory();
              if (value) setExportDirectory(value);
              return value;
            }}
            onReset={async () => {
              const value = await onResetExportDirectory();
              setExportDirectory(value);
              return value;
            }}
            onOpen={onOpenExportDirectory}
          />
        )}

        <section id="settings-data" className="settings-panel data-settings-card">
          <header className="settings-panel__header"><span className="settings-panel__icon"><SettingsIcon name="data" /></span><div><h2>本地数据</h2><p>数据目录与完整备份均只保存在本机。</p></div></header>
          <code className="path-code">{runtime.dataDir}</code>
          <button className="quiet-action" onClick={() => void createBackup()}>创建完整备份</button>
        </section>

        <section id="settings-model" className="settings-panel model-settings-card">
          <header className="settings-panel__header"><span className="settings-panel__icon"><SettingsIcon name="model" /></span><div><h2>模型与助手</h2><p>管理模型连接、名称、图标和可用状态。</p></div></header>
          <button className="quiet-action" onClick={() => window.dispatchEvent(new CustomEvent("studypilot:open-agent", { detail: { view: "settings" } }))}>管理模型配置</button>
        </section>
      </div>
      </div>
      {notice && <p role="status" className="success-message">{notice}</p>}
    </section>
  );
}
