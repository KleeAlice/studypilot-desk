import { afterEach, expect, test } from "vitest";
import { applyWallpaperPalette, deriveWallpaperPalette } from "../src/ui/wallpaperPalette";

afterEach(() => applyWallpaperPalette(null, false));

test("derives a readable accent palette without replacing semantic text colors", () => {
  const palette = deriveWallpaperPalette(new Uint8ClampedArray([
    28, 62, 140, 255,
    38, 82, 176, 255,
    235, 236, 240, 255,
  ]));

  expect(palette.accent).toMatch(/^#[0-9a-f]{6}$/);
  applyWallpaperPalette(palette, true);
  expect(document.documentElement.dataset.wallpaperAdaptive).toBe("true");
  expect(document.documentElement.style.getPropertyValue("--blue")).toBe(palette.accent);
  expect(document.documentElement.style.getPropertyValue("--text")).toBe("");
  expect(document.documentElement.style.getPropertyValue("--focus-ring")).toBe(palette.focusRing);
  expect(document.documentElement.style.getPropertyValue("--selection-surface")).toBe(palette.selectionSurface);
  expect(document.documentElement.style.getPropertyValue("--accent-hover")).toBe(palette.accentHover);
  expect(document.documentElement.style.getPropertyValue("--wallpaper-glass-tint")).toBe(palette.glassTint);

  applyWallpaperPalette(palette, false);
  expect(document.documentElement.style.getPropertyValue("--blue")).toBe("");
  expect(document.documentElement.dataset.wallpaperAdaptive).toBeUndefined();
});

test("upgrades an existing four-field wallpaper palette when adaptive color is enabled", () => {
  applyWallpaperPalette({
    accent: "#856ea3",
    accentSoft: "rgba(133, 110, 163, .18)",
    onAccent: "#ffffff",
    glassTint: "rgba(133, 110, 163, .1)",
  } as any, true);
  expect(document.documentElement.style.getPropertyValue("--focus-ring")).toBe("rgba(133, 110, 163, .46)");
  expect(document.documentElement.style.getPropertyValue("--selection-surface")).toBe("rgba(133, 110, 163, .24)");
});
