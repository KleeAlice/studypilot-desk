export type FontOption = {

  id: string;
  label: string;
  sample: string;
  stack: string;
  displayStack?: string;
};

export const UI_FONT_SCALES = [.85, 1, 1.2, 1.4] as const;
export const UI_BASE_BODY_PIXELS = 14;
export const UI_CUSTOM_FONT_MIN_PIXELS = 21;
export const UI_CUSTOM_FONT_MAX_PIXELS = 32;

export function normalizeUiFontScale(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  if (numeric > UI_FONT_SCALES[UI_FONT_SCALES.length - 1]) {
    return Math.min(UI_CUSTOM_FONT_MAX_PIXELS / UI_BASE_BODY_PIXELS, numeric);
  }
  return UI_FONT_SCALES.reduce<number>((closest, candidate) => (
    Math.abs(candidate - numeric) < Math.abs(closest - numeric)
      ? candidate
      : closest
  ), 1);
}

export const UI_FONT_OPTIONS: FontOption[] = [
  {
    id: "system",
    label: "系统默认",
    sample: "清晰、均衡，适合长时间使用",
    stack: '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", system-ui, sans-serif',
    displayStack: '"Segoe UI Variable Display", "Segoe UI", "Microsoft YaHei UI", system-ui, sans-serif',
  },
  {
    id: "yahei",
    label: "微软雅黑",
    sample: "熟悉稳重的中文界面字体",
    stack: '"Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif',
  },
  {
    id: "song",
    label: "宋体阅读",
    sample: "适合资料阅读与人文课程",
    stack: 'SimSun, "Songti SC", serif',
  },
  {
    id: "kai",
    label: "楷体笔记",
    sample: "更接近纸笔书写的氛围",
    stack: 'KaiTi, "Kaiti SC", serif',
  },
];

export const CODE_FONT_OPTIONS: FontOption[] = [
  {
    id: "system",
    label: "系统等宽",
    sample: "print('StudyPilot')",
    stack: '"Cascadia Mono", "Cascadia Code", Consolas, monospace',
  },
  {
    id: "cascadia",
    label: "Cascadia Code",
    sample: "def learn(topic):",
    stack: '"Cascadia Code", "Cascadia Mono", Consolas, monospace',
  },
  {
    id: "consolas",
    label: "Consolas",
    sample: "result = model.fit(X)",
    stack: 'Consolas, "Courier New", monospace',
  },
];

function optionById(options: FontOption[], id: unknown): FontOption {
  return options.find((option) => option.id === id) || options[0];
}

function localFontName(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("local:")) return "";
  const name = value.slice(6).trim();
  if (!name || name.length > 160 || /["'\\;{}<>\r\n]/.test(name) || /url\s*\(/i.test(name)) return "";
  return name;
}

export function localFontCandidates(value: unknown): string[] {
  const exact = localFontName(value);
  if (!exact) return [];
  const candidates = [exact];
  const withoutTechnology = exact.replace(/\s+\((?:TrueType|OpenType|All res)\)$/i, "").trim();
  if (withoutTechnology && withoutTechnology !== exact) candidates.push(withoutTechnology);
  const cjkAlias = withoutTechnology.match(/^cjkfonts[\s_-]+(.+)$/i)?.[1]?.trim();
  if (cjkAlias) candidates.push(cjkAlias);
  if (/^cjkfonts\b/i.test(withoutTechnology)) candidates.push("cjkFonts");
  return [...new Set(candidates)];
}

export function fontStackForValue(value: unknown, kind: "ui" | "code" = "ui") {
  const local = localFontCandidates(value);
  if (local.length) {
    const fallback = kind === "code"
      ? '"Cascadia Mono", "Cascadia Code", Consolas, monospace'
      : '"Segoe UI Variable Text", "Microsoft YaHei UI", system-ui, sans-serif';
    return `${local.map((name) => `"${name}"`).join(", ")}, ${fallback}`;
  }
  const options = kind === "code" ? CODE_FONT_OPTIONS : UI_FONT_OPTIONS;
  return optionById(options, value).stack;
}

export function applyTypography(
  uiFont: unknown,
  codeFont: unknown,
  fontScale: unknown = 1,
  forceUniformFontSize = false,
) {
  const ui = optionById(UI_FONT_OPTIONS, uiFont);
  const uiStack = fontStackForValue(uiFont, "ui");
  const codeStack = fontStackForValue(codeFont, "code");
  const scale = normalizeUiFontScale(fontScale);
  const scaled = (pixels: number) => `${Math.round(pixels * scale * 100) / 100}px`;
  const uniformSize = scaled(UI_BASE_BODY_PIXELS);
  const roleSizes = forceUniformFontSize
    ? { small: uniformSize, control: uniformSize, body: uniformSize, reading: uniformSize, headingSm: uniformSize, headingMd: uniformSize, headingLg: uniformSize }
    : { small: scaled(11), control: scaled(13), body: uniformSize, reading: scaled(15), headingSm: scaled(17), headingMd: scaled(20), headingLg: scaled(28) };
  const root = document.documentElement;
  root.style.setProperty("--ui-font-family", uiStack);
  root.style.setProperty("--app-font-family", uiStack);
  root.style.setProperty("--display-font-family", localFontName(uiFont) ? uiStack : ui.displayStack || uiStack);
  root.style.setProperty("--code-font-family", codeStack);
  root.style.setProperty("--ui-root-font-size", scaled(16));
  root.style.setProperty("--ui-font-scale", String(scale));
  root.style.setProperty("--ui-uniform-font-size", uniformSize);
  root.style.setProperty("--ui-small-font-size", roleSizes.small);
  root.style.setProperty("--ui-control-font-size", roleSizes.control);
  root.style.setProperty("--ui-body-font-size", roleSizes.body);
  root.style.setProperty("--ui-reading-font-size", roleSizes.reading);
  root.style.setProperty("--ui-heading-sm-font-size", roleSizes.headingSm);
  root.style.setProperty("--ui-heading-md-font-size", roleSizes.headingMd);
  root.style.setProperty("--ui-heading-lg-font-size", roleSizes.headingLg);
  root.dataset.forceUniformFontSize = String(forceUniformFontSize);
  root.dataset.uiFont = localFontName(uiFont) ? String(uiFont) : ui.id;
  root.dataset.codeFont = localFontName(codeFont) ? String(codeFont) : optionById(CODE_FONT_OPTIONS, codeFont).id;
  const requestedFonts = [...localFontCandidates(uiFont), ...localFontCandidates(codeFont)];
  if (requestedFonts.length && document.fonts?.load) {
    root.dataset.localFontStatus = "loading";
    void Promise.allSettled(requestedFonts.map((name) => document.fonts.load(`16px "${name}"`, "StudyPilot 字体校验")))
      .then((results) => {
        const loaded = results.some((result) => result.status === "fulfilled" && result.value.length > 0);
        root.dataset.localFontStatus = loaded ? "loaded" : "fallback";
      });
  } else {
    root.dataset.localFontStatus = requestedFonts.length ? "fallback" : "builtin";
  }
}
