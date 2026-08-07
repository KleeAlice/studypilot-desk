export type UiLanguage = "zh-CN" | "en-US";

export function normalizeUiLanguage(value: unknown): UiLanguage {
  return value === "en-US" ? "en-US" : "zh-CN";
}

export function applyUiLanguage(value: unknown): UiLanguage {
  const language = normalizeUiLanguage(value);
  document.documentElement.lang = language;
  document.documentElement.dataset.language = language;
  return language;
}

export function isEnglish(language: UiLanguage): boolean {
  return language === "en-US";
}
