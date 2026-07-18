import { afterEach, expect, test } from "vitest";
import { applyTypography, CODE_FONT_OPTIONS, UI_FONT_OPTIONS } from "../src/ui/typography";


afterEach(() => {
  document.documentElement.style.removeProperty("--ui-font-family");
  document.documentElement.style.removeProperty("--display-font-family");
  document.documentElement.style.removeProperty("--code-font-family");
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
