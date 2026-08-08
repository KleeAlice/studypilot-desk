export type WallpaperMode = "none" | "dawn" | "midnight" | "grid" | "custom";

export const WALLPAPER_MODES: WallpaperMode[] = ["none", "dawn", "midnight", "grid", "custom"];

export function normalizeWallpaperMode(value: unknown): WallpaperMode {
  return WALLPAPER_MODES.includes(value as WallpaperMode) ? value as WallpaperMode : "none";
}

export function wallpaperUrl(apiBase: string, mode: unknown, revision: unknown, sessionToken?: string) {
  if (normalizeWallpaperMode(mode) !== "custom") return "";
  const safeRevision = encodeURIComponent(String(revision || "0"));
  const base = `${apiBase}/api/settings/wallpaper/image?revision=${safeRevision}`;
  // CSS background loads cannot send a custom header, so carry the session
  // token as a query parameter (the Rust gateway accepts it there too).
  if (!sessionToken) return base;
  return `${base}&session=${encodeURIComponent(sessionToken)}`;
}

export function normalizeWallpaperOpacity(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : .82;
}

export function normalizeWallpaperBlur(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(40, Math.max(0, parsed)) : 0;
}

export function normalizeGlassOpacity(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : .78;
}

export function applyGlassOpacity(value: unknown) {
  const normalized = normalizeGlassOpacity(value);
  document.documentElement.style.setProperty("--glass-opacity", `${Math.round(normalized * 100)}%`);
}

export function applyWallpaper(apiBase: string, mode: unknown, revision: unknown, opacity: unknown = .82, blur: unknown = 0) {
  const normalized = normalizeWallpaperMode(mode);
  const root = document.documentElement;
  root.dataset.wallpaper = normalized;
  const url = wallpaperUrl(apiBase, normalized, revision);
  root.style.setProperty("--app-wallpaper-image", url ? `url("${url}")` : "none");
  const normalizedOpacity = normalizeWallpaperOpacity(opacity);
  const normalizedBlur = normalizeWallpaperBlur(blur);
  root.style.setProperty("--app-wallpaper-opacity", String(normalizedOpacity));
  root.style.setProperty("--app-wallpaper-blur", `${normalizedBlur}px`);
  root.style.setProperty("--app-wallpaper-overscan", `${normalizedBlur * 2}px`);
  delete root.dataset.wallpaperClarity;
}
