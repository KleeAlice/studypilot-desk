import { afterEach, expect, test } from "vitest";
import { applyTypography, CODE_FONT_OPTIONS, fontStackForValue, UI_BASE_BODY_PIXELS, UI_FONT_OPTIONS } from "../src/ui/typography";


afterEach(() => {
  document.documentElement.style.removeProperty("--ui-font-family");
  document.documentElement.style.removeProperty("--display-font-family");
  document.documentElement.style.removeProperty("--code-font-family");
  delete document.documentElement.dataset.forceUniformFontSize;
});

test("applies allow-listed interface and code font stacks globally", () => {
  applyTypography("song", "consolas");

  expect(document.documentElement.style.getPropertyValue("--ui-font-family")).toContain("SimSun");
  expect(document.documentElement.style.getPropertyValue("--display-font-family")).toContain("SimSun");
  expect(document.documentElement.style.getPropertyValue("--code-font-family")).toContain("Consolas");
  expect(UI_FONT_OPTIONS.map((option) => option.id)).toEqual(["system", "yahei", "song", "kai"]);
  expect(CODE_FONT_OPTIONS.map((option) => option.id)).toEqual(["system", "cascadia", "consolas"]);
});

test("falls back to safe local stacks for unknown persisted values", () => {
  applyTypography("url(https://example.invalid/font.woff2)", "inherit; color: red");

  expect(document.documentElement.style.getPropertyValue("--ui-font-family")).toContain("Segoe UI Variable Text");
  expect(document.documentElement.style.getPropertyValue("--code-font-family")).toContain("Cascadia Code");
  expect(document.documentElement.getAttribute("style")).not.toContain("https://");
});

test("resolves CJKFonts entries through the exact family and browser-safe aliases", () => {
  const stack = fontStackForValue("local:cjkFonts 全瀨體", "ui");
  expect(stack.startsWith('"cjkFonts 全瀨體"')).toBe(true);
  expect(stack).toContain('"全瀨體"');
  expect(stack).toContain('"cjkFonts 全瀨體"');
  expect(stack).toContain('"cjkFonts"');
});

test("keeps a readable semantic hierarchy by default", () => {
  applyTypography("system", "system", 24 / UI_BASE_BODY_PIXELS);

  const root = document.documentElement.style;
  expect(root.getPropertyValue("--ui-body-font-size")).toBe("24px");
  expect(root.getPropertyValue("--ui-small-font-size")).toBe("18.86px");
  expect(root.getPropertyValue("--ui-control-font-size")).toBe("22.29px");
  expect(root.getPropertyValue("--ui-reading-font-size")).toBe("25.71px");
  expect(root.getPropertyValue("--ui-heading-sm-font-size")).toBe("29.14px");
  expect(root.getPropertyValue("--ui-heading-md-font-size")).toBe("34.29px");
  expect(root.getPropertyValue("--ui-heading-lg-font-size")).toBe("48px");
  expect(document.documentElement.dataset.forceUniformFontSize).toBe("false");
});

test("uses one literal interface size only when force uniform is enabled", () => {
  applyTypography("system", "system", 24 / UI_BASE_BODY_PIXELS, true);

  const root = document.documentElement.style;
  const variables = [
    "--ui-small-font-size",
    "--ui-control-font-size",
    "--ui-body-font-size",
    "--ui-reading-font-size",
    "--ui-heading-sm-font-size",
    "--ui-heading-md-font-size",
    "--ui-heading-lg-font-size",
  ];
  expect(variables.map((name) => root.getPropertyValue(name))).toEqual(
    variables.map(() => "24px"),
  );
  expect(document.documentElement.dataset.forceUniformFontSize).toBe("true");
});
