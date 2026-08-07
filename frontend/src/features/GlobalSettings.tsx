import { AppearancePreferences } from "../components/AppearancePreferences";
import { ExportArchivePreferences } from "../components/ExportArchivePreferences";
import { WorkspaceToolbarPreferences } from "../components/WorkspaceToolbarPreferences";
import { SettingsIcon } from "../components/SettingsIcon";
import { GlassOpacityPreference } from "../components/GlassOpacityPreference";
import { SettingsSectionNav } from "../components/SettingsSectionNav";
import type { WallpaperMode } from "../ui/appearance";
import type { UiLanguage } from "../ui/language";


type TypographyKey = "ui_font" | "code_font";

export function GlobalSettings({
  theme,
  startupDestination,
  uiFont,
  codeFont,
  systemFonts,
  fontScale,
  forceUniformFontSize,
  wallpaperMode,
  wallpaperOpacity,
  wallpaperBlur,
  glassOpacity,
  wallpaperImageUrl,
  wallpaperAdaptiveTheme,
  exportDirectory,
  workspaceToolbarAutoHide,
  onChangeTheme,
  onChangeStartup,
  onChangeTypography,
  onChangeFontScale,
  onChangeForceUniformFontSize,
  onChangeWallpaper,
  onUploadWallpaper,
  onClearWallpaper,
  onChangeWallpaperOpacity,
  onChangeWallpaperBlur,
  onChangeGlassOpacity,
  onChangeWallpaperAdaptiveTheme,
  onChooseExportDirectory,
  onResetExportDirectory,
  onOpenExportDirectory,
  onChangeWorkspaceToolbarAutoHide,
  language,
  onChangeLanguage,
  onBack,
}: {
  theme: string;
  startupDestination: "library" | "last_course";
  uiFont: string;
  codeFont: string;
  systemFonts: string[];
  fontScale: number;
  forceUniformFontSize: boolean;
  wallpaperMode: WallpaperMode;
  wallpaperOpacity: number;
  wallpaperBlur: number;
  glassOpacity: number;
  wallpaperImageUrl?: string;
  wallpaperAdaptiveTheme: boolean;
  exportDirectory: string;
  workspaceToolbarAutoHide: boolean;
  onChangeTheme: (value: string) => Promise<void>;
  onChangeStartup: (value: "library" | "last_course") => Promise<void>;
  onChangeTypography: (key: TypographyKey, value: string) => Promise<void>;
  onChangeFontScale: (value: number) => Promise<void>;
  onChangeForceUniformFontSize: (value: boolean) => Promise<void>;
  onChangeWallpaper: (value: WallpaperMode) => Promise<void>;
  onUploadWallpaper: (file: File) => Promise<void>;
  onClearWallpaper: () => Promise<void>;
  onChangeWallpaperOpacity: (value: number) => Promise<void>;
  onChangeWallpaperBlur: (value: number) => Promise<void>;
  onChangeGlassOpacity: (value: number) => Promise<void>;
  onChangeWallpaperAdaptiveTheme: (value: boolean) => Promise<void>;
  onChooseExportDirectory: () => Promise<string | null>;
  onResetExportDirectory: () => Promise<string>;
  onOpenExportDirectory: () => Promise<void>;
  onChangeWorkspaceToolbarAutoHide: (value: boolean) => Promise<void>;
  language: UiLanguage;
  onChangeLanguage: (value: UiLanguage) => Promise<void>;
  onBack: () => void;
}) {
  const english = language === "en-US";
  return (
    <main className="global-subpage global-settings-page">
      <header className="global-subpage-header">
        <button className="back-link" onClick={onBack}>← {english ? "Course Library" : "返回课程书架"}</button>
        <h1>{english ? "Global Settings" : "全局设置"}</h1>
      </header>

      <div className="settings-center settings-center--global">
        <aside className="settings-center__sidebar">
          <div className="settings-center__brand">
            <span><SettingsIcon name="general" /></span>
            <div><strong>{english ? "Settings" : "设置中心"}</strong><small>STUDYPILOT DESK</small></div>
          </div>
          <SettingsSectionNav
            label={english ? "Settings categories" : "设置分类"}
            items={[
              { id: "settings-general", icon: "general", label: english ? "General" : "常规" },
              { id: "settings-theme", icon: "theme", label: english ? "Appearance" : "外观模式" },
              { id: "settings-startup", icon: "startup", label: english ? "Startup" : "启动位置" },
              { id: "settings-typography", icon: "type", label: english ? "Typography" : "字体与字号" },
              { id: "settings-wallpaper", icon: "wallpaper", label: english ? "Wallpaper" : "软件壁纸" },
              { id: "settings-workspace", icon: "workspace", label: english ? "Workspace" : "工作区" },
              { id: "settings-archive", icon: "archive", label: english ? "Archive" : "导出存档" },
            ]}
          />
          <p>{english ? "Changes apply immediately and are stored locally." : "所有更改即时生效，并自动保存到本机。"}</p>
        </aside>
        <div className="global-settings-grid settings-center__content">
        <section id="settings-general" className="global-settings-card settings-panel language-settings-card">
          <header className="settings-panel__header"><span className="settings-panel__icon"><SettingsIcon name="general" /></span><div><h2>{english ? "Interface language" : "界面语言"}</h2><p>{english ? "Choose the language used across the desktop app." : "选择整个桌面端使用的界面语言。"}</p></div></header>
          <label>{english ? "Language" : "界面语言"}<select aria-label="界面语言" value={language} onChange={(event) => void onChangeLanguage(event.target.value as UiLanguage)}><option value="zh-CN">简体中文</option><option value="en-US">English</option></select></label>
        </section>
        <section id="settings-theme" className="global-settings-card settings-panel theme-settings-card">
          <header className="settings-panel__header"><span className="settings-panel__icon"><SettingsIcon name="theme" /></span><div><h2>颜色模式</h2><p>深色、浅色或跟随 Windows 外观，所有页面和编辑器同步切换。</p></div></header>
          <div className="segmented theme-choice" aria-label="颜色模式">
            {["dark", "light", "system"].map((value) => (
              <button
                key={value}
                className={theme === value ? "is-active" : ""}
                onClick={() => void onChangeTheme(value)}
              >
                {value === "dark" ? "深色" : value === "light" ? "浅色" : "跟随系统"}
              </button>
            ))}
          </div>
          <GlassOpacityPreference
            value={glassOpacity}
            language={language}
            onChange={onChangeGlassOpacity}
          />
        </section>
        <section id="settings-startup" className="global-settings-card settings-panel startup-settings-card">
          <header className="settings-panel__header"><span className="settings-panel__icon"><SettingsIcon name="startup" /></span><div><h2>启动位置</h2><p>选择打开 StudyPilot 后首先进入的页面。</p></div></header>
          <div className="startup-choice">
            <button className={startupDestination === "library" ? "is-selected" : ""} onClick={() => void onChangeStartup("library")}>
              <i><SettingsIcon name="general" /></i><span><strong>课程书架</strong><small>每次先选择课程</small></span>
            </button>
            <button className={startupDestination === "last_course" ? "is-selected" : ""} onClick={() => void onChangeStartup("last_course")}>
              <i><SettingsIcon name="startup" /></i><span><strong>继续上次课程</strong><small>恢复该课程最后模块</small></span>
            </button>
          </div>
        </section>

        <AppearancePreferences
          variant="global"
          systemFonts={systemFonts}
          uiFont={uiFont}
          codeFont={codeFont}
          fontScale={fontScale}
          forceUniformFontSize={forceUniformFontSize}
          wallpaperMode={wallpaperMode}
          wallpaperImageUrl={wallpaperImageUrl}
          wallpaperOpacity={wallpaperOpacity}
          wallpaperBlur={wallpaperBlur}
          onTypography={onChangeTypography}
          wallpaperAdaptiveTheme={wallpaperAdaptiveTheme}
          onWallpaperAdaptiveTheme={onChangeWallpaperAdaptiveTheme}
          onFontScale={onChangeFontScale}
          onForceUniformFontSize={onChangeForceUniformFontSize}
          onWallpaperMode={onChangeWallpaper}
          onWallpaperUpload={onUploadWallpaper}
          onWallpaperClear={onClearWallpaper}
          onWallpaperOpacity={onChangeWallpaperOpacity}
          onWallpaperBlur={onChangeWallpaperBlur}
        />
        <WorkspaceToolbarPreferences
          variant="global"
          autoHide={workspaceToolbarAutoHide}
          language={language}
          onChange={onChangeWorkspaceToolbarAutoHide}
        />
        <ExportArchivePreferences
          variant="global"
          directory={exportDirectory}
          onChoose={onChooseExportDirectory}
          onReset={onResetExportDirectory}
          onOpen={onOpenExportDirectory}
        />
      </div>
      </div>
    </main>
  );
}
