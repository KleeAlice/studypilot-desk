import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("titlebar dragging is delegated to the native window manager without geometry IPC", () => {
  const css = readFileSync("frontend/src/styles/global.css", "utf-8");
  const titlebar = readFileSync("frontend/src/components/TitleBar.tsx", "utf-8");
  const main = readFileSync("electron/main.ts", "utf-8");

  expect(css).toMatch(/\.titlebar__drag-fill\s*\{[^}]*-webkit-app-region:\s*drag/s);
  expect(titlebar).not.toContain("onPointerMove");
  expect(main).not.toContain('"window:drag-move"');
  expect(main).not.toContain("setContentBounds");
});
