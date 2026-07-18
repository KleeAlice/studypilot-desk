import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";


test("success feedback uses the success color for text, border and surface", () => {
  const css = readFileSync(resolve("frontend/src/styles/global.css"), "utf8");
  const successRule = css.match(/^\.success-message\s*\{([^}]+)\}/m)?.[1] || "";

  expect(successRule).toContain("var(--green)");
  expect(successRule).toMatch(/background:[^;]*var\(--green\)/);
});
