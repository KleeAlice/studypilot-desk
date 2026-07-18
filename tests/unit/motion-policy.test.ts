import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";


test("idle workspace avoids decorative infinite motion and busy cursors", () => {
  const workspace = readFileSync(resolve("frontend/src/styles/workspace.css"), "utf8");
  const global = readFileSync(resolve("frontend/src/styles/global.css"), "utf8");

  expect(workspace).not.toMatch(/animation:[^;]*(status-breathe|shelf-light|float-gentle|atlas-drift|link-pulse)/);
  expect(`${workspace}\n${global}`).not.toMatch(/cursor:\s*(wait|progress)/);
  expect(workspace).toContain("@media (prefers-reduced-motion: reduce)");
});

test("desktop motion is centralized, spatial and accessibility safe", () => {
  const tokens = readFileSync(resolve("frontend/src/styles/tokens.css"), "utf8");
  const motion = readFileSync(resolve("frontend/src/styles/motion.css"), "utf8");
  const runtime = readFileSync(resolve("frontend/src/ui/motion.ts"), "utf8");
  const refinement = readFileSync(resolve("frontend/src/styles/refinement.css"), "utf8");
  const entry = readFileSync(resolve("frontend/src/main.tsx"), "utf8");

  expect(tokens).toContain("--motion-instant:");
  expect(tokens).toContain("--motion-fast:");
  expect(tokens).toContain("--motion-standard:");
  expect(tokens).toContain("--motion-slow:");
  expect(tokens).toContain("--ease-enter:");
  expect(tokens).toContain("--ease-exit:");
  expect(runtime).not.toContain("startViewTransition");
  expect(motion).not.toContain("view-transition-name");
  expect(motion).not.toContain("::view-transition");
  expect(motion).not.toMatch(/transition\s*:[^;]*(?:width|flex-basis|grid-template-columns)/);
  expect(motion).not.toMatch(/animation\s*:[^;]*(?:course-index|module-index|notebook-index)/);
  expect(motion).toContain('[data-presence="exiting"]');
  expect(motion).toContain("@media (prefers-reduced-motion: reduce)");
  expect(motion).not.toMatch(/animation(?:-iteration-count)?\s*:[^;]*(?:infinite)/);
  expect(tokens).toContain("--motion-route: 180ms");
  expect(motion).toContain('[data-motion-intent="lateral"]');
  expect(motion).toContain("motion-shelf-in");
  expect(motion).toContain("motion-progress-fill");
  expect(motion).toContain("motion-chart-draw");
  expect(motion).toContain("motion-course-card-arrive");
  expect(motion).toContain("motion-course-launch");
  expect(motion).toContain("motion-course-home-cover");
  expect(motion).toContain('[data-course-launching]');
  expect(motion).toContain('[data-course-switching]');
  expect(motion).toContain("--nav-item-size: 44px");
  expect(motion).toContain("--nav-item-gap: 2px");
  expect(motion).toContain("--nav-item-stride: calc(var(--nav-item-size) + var(--nav-item-gap))");
  expect(motion).toMatch(/\.navrail__indicator\s*\{[^}]*height:\s*var\(--nav-item-size\)/s);
  expect(refinement).toMatch(/\.navrail nav button,[^}]*height:\s*var\(--nav-item-size\)[^}]*min-height:\s*var\(--nav-item-size\)/s);
  expect(refinement).toContain("transition: background-color");
  expect(refinement).toContain(".course-create-button:active");
  expect(refinement).toContain(".course-volume:active");
  expect(refinement).toContain(".navrail nav button::before");
  expect(refinement).toContain("content: none");
  expect(refinement).toMatch(/\.knowledge-notebook-add\s*>\s*span\s*\{[^}]*display:\s*inline-grid[^}]*width:\s*44px/s);
  expect(refinement).toContain("Quiet technical workspace");
  expect(refinement).toContain("backdrop-filter: none");
  expect(refinement).toContain(".course-module-grid");
  expect(refinement).toContain(".knowledge-studio");
  expect(entry.indexOf('"./styles/refinement.css"')).toBeGreaterThan(entry.indexOf('"./styles/workspace.css"'));
  expect(entry.indexOf('"./styles/motion.css"')).toBeGreaterThan(entry.indexOf('"./styles/workspace.css"'));
  expect(entry.indexOf('"./styles/motion.css"')).toBeGreaterThan(entry.indexOf('"./styles/refinement.css"'));
});
