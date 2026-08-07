import { useEffect, useId, useState, type ChangeEvent } from "react";
import { SettingsIcon } from "./SettingsIcon";
import { CODE_FONT_OPTIONS, UI_BASE_BODY_PIXELS, UI_CUSTOM_FONT_MAX_PIXELS, UI_CUSTOM_FONT_MIN_PIXELS, UI_FONT_OPTIONS, fontStackForValue, normalizeUiFontScale } from "../ui/typography";
import type { WallpaperMode } from "../ui/appearance";


export const FONT_SCALE_OPTIONS = [
  { value: .85, label: "小", hint: "12px 正文" },
  { value: 1, label: "标准", hint: "14px 正文" },
  { value: 1.2, label: "大", hint: "17px 正文" },
  { value: 1.4, label: "超大", hint: "20px 正文" },
];

const WALLPAPER_OPTIONS: Array<{ mode: Exclude<WallpaperMode, "custom">; label: string; description: string }> = [
  { mode: "none", label: "纯色", description: "保持当前主题底色" },
  { mode: "dawn", label: "晨雾", description: "柔和米白与青灰光晕" },
  { mode: "midnight", label: "深海", description: "低亮度蓝黑层次" },
  { mode: "grid", label: "方格", description: "克制的学习纸网格" },
];

function SystemFontOptions({ fonts, current }: { fonts: string[]; current: string }) {
  const names = [...new Set(fonts.map((font) => font.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, "en-US", { sensitivity: "base" }));
  const currentName = current.startsWith("local:") ? current.slice(6) : "";
  if (currentName && !names.includes(currentName)) names.unshift(currentName);
  return (
    <optgroup label={`全部本机字体（${names.length}）`}>
      {names.map((font) => <option key={font} value={`local:${font}`}>{font}</option>)}
    </optgroup>
  );
}

export function AppearancePreferences({
  variant = "course",
  systemFonts,
  uiFont,
  codeFont,
  fontScale,
  forceUniformFontSize = false,
  wallpaperMode,
  wallpaperImageUrl,
  wallpaperOpacity = .82,
  wallpaperBlur = 0,
  wallpaperAdaptiveTheme = false,
  onWallpaperAdaptiveTheme,
  onTypography,
  onFontScale,
  onForceUniformFontSize,
  onWallpaperMode,
  onWallpaperUpload,
  onWallpaperClear,
  onWallpaperOpacity,
  onWallpaperBlur,
}: {
  variant?: "course" | "global";
  systemFonts: string[];
  uiFont: string;
  codeFont: string;
  fontScale: number;
  forceUniformFontSize?: boolean;
  wallpaperMode: WallpaperMode;
  wallpaperImageUrl?: string;
  wallpaperOpacity?: number;
  wallpaperBlur?: number;
  wallpaperAdaptiveTheme?: boolean;
  onWallpaperAdaptiveTheme?: (value: boolean) => void | Promise<void>;
  onTypography: (key: "ui_font" | "code_font", value: string) => void | Promise<void>;
  onFontScale: (value: number) => void | Promise<void>;
  onForceUniformFontSize?: (value: boolean) => void | Promise<void>;
  onWallpaperMode: (value: WallpaperMode) => void | Promise<void>;
  onWallpaperUpload: (file: File) => void | Promise<void>;
  onWallpaperClear: () => void | Promise<void>;
  onWallpaperOpacity?: (value: number) => void | Promise<void>;
  onWallpaperBlur?: (value: number) => void | Promise<void>;
}) {
  const uploadId = useId();
  const cardClass = variant === "global" ? "global-settings-card settings-panel appearance-settings-card" : "settings-panel appearance-settings-card";
  const normalizedFontScale = normalizeUiFontScale(fontScale);
  const fontScaleMode = normalizedFontScale > FONT_SCALE_OPTIONS[FONT_SCALE_OPTIONS.length - 1].value
    ? "custom"
    : String(normalizedFontScale);
  const [customFontPixels, setCustomFontPixels] = useState(() => String(Math.max(
    UI_CUSTOM_FONT_MIN_PIXELS,
    Math.round(normalizedFontScale * UI_BASE_BODY_PIXELS),
  )));

  useEffect(() => {
    if (fontScaleMode !== "custom") return;
    setCustomFontPixels(String(Math.round(normalizedFontScale * UI_BASE_BODY_PIXELS)));
  }, [fontScaleMode, normalizedFontScale]);

  function commitCustomFontSize() {
    const parsed = Number(customFontPixels);
    const pixels = Number.isFinite(parsed)
      ? Math.min(UI_CUSTOM_FONT_MAX_PIXELS, Math.max(UI_CUSTOM_FONT_MIN_PIXELS, Math.round(parsed)))
      : UI_CUSTOM_FONT_MIN_PIXELS;
    setCustomFontPixels(String(pixels));
    void onFontScale(pixels / UI_BASE_BODY_PIXELS);
  }

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void onWallpaperUpload(file);
    event.target.value = "";
  }

  return (
    <>
      <section id="settings-typography" className={`${cardClass} typography-settings`}>
        <div className="appearance-settings-card__intro settings-panel__header">
          <span className="settings-panel__icon"><SettingsIcon name="type" /></span>
          <div>
            <h2>字体与字号</h2>
            <p>默认保留标题、正文和控件的清晰层级；需要时可单独开启无障碍统一字号。</p>
          </div>
        </div>
        <div>
          <div className="font-controls">
            <label>
              <span>界面字体</span>
              <select aria-label="界面字体" value={uiFont} onChange={(event) => void onTypography("ui_font", event.target.value)}>
                <optgroup label="推荐字体">{UI_FONT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</optgroup>
                <SystemFontOptions fonts={systemFonts} current={uiFont} />
              </select>
            </label>
            <label>
              <span>代码字体</span>
              <select aria-label="代码字体" value={codeFont} onChange={(event) => void onTypography("code_font", event.target.value)}>
                <optgroup label="推荐等宽字体">{CODE_FONT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</optgroup>
                <SystemFontOptions fonts={systemFonts} current={codeFont} />
              </select>
            </label>
          </div>
          <div className="font-scale-grid">
            <label className="font-scale-select">
              <span>基础字号</span>
              <select aria-label="界面字号" value={fontScaleMode} onChange={(event) => {
                if (event.target.value === "custom") {
                  const pixels = normalizedFontScale > 1.4 ? Math.round(normalizedFontScale * UI_BASE_BODY_PIXELS) : 22;
                  setCustomFontPixels(String(pixels));
                  void onFontScale(pixels / UI_BASE_BODY_PIXELS);
                  return;
                }
                void onFontScale(Number(event.target.value));
              }}>
                {FONT_SCALE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label} · {option.hint}</option>)}
                <option value="custom">自定义 · 21–32px 正文</option>
              </select>
            </label>
            {fontScaleMode === "custom" && <label className="font-scale-custom"><span>自定义字号（px）</span><input aria-label="自定义界面字号" type="number" min={UI_CUSTOM_FONT_MIN_PIXELS} max={UI_CUSTOM_FONT_MAX_PIXELS} value={customFontPixels} onChange={(event) => setCustomFontPixels(event.target.value)} onBlur={commitCustomFontSize} onKeyDown={(event) => { if (event.key === "Enter") commitCustomFontSize(); }} /></label>}
          </div>
          <label className="font-uniform-toggle">
            <input
              aria-label="强制所有界面文字使用同一字号"
              type="checkbox"
              checked={forceUniformFontSize}
              onChange={(event) => void onForceUniformFontSize?.(event.target.checked)}
            />
            <span><strong>强制统一界面字号</strong><small>可选。开启后导航、标题、正文与控件使用同一字号；学习内容区始终严格统一。</small></span>
            <i aria-hidden="true" />
          </label>
          <div className="font-preview" aria-label="字体预览">
            <strong style={{ fontFamily: fontStackForValue(uiFont, "ui") }}>知识会在连接中生长</strong>
            <code style={{ fontFamily: fontStackForValue(codeFont, "code") }}>def learn(topic):</code>
          </div>
        </div>
      </section>

      <section id="settings-wallpaper" className={`${cardClass} wallpaper-settings`}>
        <div className="appearance-settings-card__intro settings-panel__header">
          <span className="settings-panel__icon"><SettingsIcon name="wallpaper" /></span>
          <div>
            <h2>软件壁纸</h2>
            <p>分别控制原图可见度与模糊程度，也可以从壁纸提取交互主题色。</p>
          </div>
        </div>
        <div>
          <div className="wallpaper-options" aria-label="壁纸预设">
            {WALLPAPER_OPTIONS.map((option) => (
              <button
                key={option.mode}
                aria-label={`${option.label}壁纸`}
                className={wallpaperMode === option.mode ? "is-active" : ""}
                data-wallpaper-preview={option.mode}
                onClick={() => void onWallpaperMode(option.mode)}
              >
                <i /><span><strong>{option.label}</strong><small>{option.description}</small></span>
              </button>
            ))}
            <label className={wallpaperMode === "custom" ? "wallpaper-upload is-active" : "wallpaper-upload"} htmlFor={uploadId}>
              <i style={wallpaperImageUrl ? { backgroundImage: `url("${wallpaperImageUrl}")` } : undefined} />
              <span><strong>本地图片</strong><small>PNG、JPEG、WebP 或 GIF，最大 12 MB</small></span>
              <input id={uploadId} aria-label="选择本地壁纸" className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={upload} />
            </label>
          </div>
          <div className="wallpaper-tuning-grid">
            <div className="wallpaper-opacity-control">
              <label htmlFor={`${uploadId}-opacity`}>壁纸可见度</label>
              <output htmlFor={`${uploadId}-opacity`}>{Math.round(wallpaperOpacity * 100)}%</output>
              <input id={`${uploadId}-opacity`} aria-label="壁纸可见度" type="range" min={0} max={100} step={1} value={Math.round(wallpaperOpacity * 100)} onChange={(event) => void onWallpaperOpacity?.(Number(event.target.value) / 100)} />
              <small>0% 完全隐藏，100% 按原图显示</small>
            </div>
            <div className="wallpaper-opacity-control">
              <label htmlFor={`${uploadId}-blur`}>壁纸模糊程度</label>
              <output htmlFor={`${uploadId}-blur`}>{Math.round(wallpaperBlur)}px</output>
              <input id={`${uploadId}-blur`} aria-label="壁纸模糊程度" type="range" min={0} max={40} step={1} value={Math.round(wallpaperBlur)} onChange={(event) => void onWallpaperBlur?.(Number(event.target.value))} />
              <small>0px 保持原图清晰，40px 为强模糊</small>
            </div>
          </div>
          <label className="adaptive-theme-toggle">
            <input type="checkbox" checked={wallpaperAdaptiveTheme} onChange={(event) => void onWallpaperAdaptiveTheme?.(event.target.checked)} />
            <span>
              <strong>从壁纸吸取主题色</strong>
              <small>可选。只调整按钮与高亮颜色，正文仍按浅色或深色主题保持可读。</small>
              <i className="adaptive-theme-swatches" aria-hidden="true"><b /><b /><b /></i>
            </span>
          </label>
          <button className="wallpaper-clear" aria-label="清除壁纸" onClick={() => void onWallpaperClear()}>清除壁纸并恢复纯色</button>
        </div>
      </section>
    </>
  );
}
