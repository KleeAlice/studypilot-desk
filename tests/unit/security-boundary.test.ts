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

test("desktop capabilities stay behind Tauri commands rather than renderer globals", () => {
  const platform = readFileSync(resolve("frontend/src/platform/index.ts"), "utf8");
  const native = readFileSync(resolve("src-tauri/src/lib.rs"), "utf8");

  expect(platform).toContain("tauriPlatform");
  expect(platform).not.toContain("studypilot");
  expect(native).toContain("tauri::generate_handler!");
  expect(native).toContain("clipboard_read_text");
});
