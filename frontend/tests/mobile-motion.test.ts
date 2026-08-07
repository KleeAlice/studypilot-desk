import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { MOBILE_MOTION } from "../src/mobile/motion";

test("keeps navigation fast and tactile feedback restrained", () => {
  expect(MOBILE_MOTION.screenEnterMs).toBeLessThanOrEqual(280);
  expect(MOBILE_MOTION.pressDepthPx).toBeGreaterThanOrEqual(2);
  expect(MOBILE_MOTION.pressDepthPx).toBeLessThanOrEqual(3);
  expect(MOBILE_MOTION.celebrationMs).toBeLessThanOrEqual(700);
});

test("ships explicit reduced-motion and purposeful interaction policies", () => {
  const css = readFileSync("frontend/src/mobile/styles.css", "utf8");
  expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  expect(css).toContain("sp-mobile-screen-in");
  expect(css).toContain(".sp-tactile-card:active");
  expect(css).toContain("sp-task-celebrate");
  expect(css).not.toContain("animate-bounce");
});
