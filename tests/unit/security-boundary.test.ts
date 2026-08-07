import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";


test("production CSP permits images served by the local backend", () => {
  const html = readFileSync(resolve("frontend/index.html"), "utf8");
  const policy = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1] || "";
  const imageDirective = policy.match(/img-src\s+([^;]+)/)?.[1] || "";
  const sources = imageDirective.trim().split(/\s+/);

  expect(sources).toContain("http://127.0.0.1:*");
  expect(sources).not.toContain("http:");
});

test("production CSP permits bundled data fonts without loosening scripts", () => {
  const html = readFileSync(resolve("frontend/index.html"), "utf8");
  const policy = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1] || "";
  const fontDirective = policy.match(/font-src\s+([^;]+)/)?.[1] || "";
  const scriptDirective = policy.match(/script-src\s+([^;]+)/)?.[1] || "";

  expect(fontDirective.trim().split(/\s+/)).toContain("data:");
  expect(scriptDirective).not.toContain("data:");
  expect(scriptDirective).not.toContain("'unsafe-eval'");
});

test("window screenshots use a narrow isolated Electron bridge", () => {
  const preload = readFileSync(resolve("electron/preload.ts"), "utf8");
  const main = readFileSync(resolve("electron/main.ts"), "utf8");

  expect(preload).toContain('window: () => ipcRenderer.invoke("capture:window")');
  expect(main).toContain('ipcMain.handle("capture:window"');
  expect(main).toContain("mainWindow.webContents.capturePage()");
  expect(preload).not.toContain("desktopCapturer");
});
