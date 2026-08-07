import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

test("desktop bridge exposes a constrained export save channel", () => {
  const preload = readFileSync(resolve("electron/preload.ts"), "utf8");
  const main = readFileSync(resolve("electron/main.ts"), "utf8");

  expect(preload).toContain("saveExport");
  expect(preload).toContain("files:save-export");
  expect(main).toContain('ipcMain.handle("files:save-export"');
  expect(main).toMatch(/png.*pdf.*docx.*md/s);
  expect(main).toContain("MAX_EXPORT_BYTES");
});

test("desktop bridge exposes installed fonts and renderer zoom without a shell channel", () => {
  const preload = readFileSync(resolve("electron/preload.ts"), "utf8");
  const main = readFileSync(resolve("electron/main.ts"), "utf8");

  expect(preload).toContain("fonts: {");
  expect(preload).toContain('ipcRenderer.invoke("fonts:list-system")');
  expect(preload).toContain("setZoomFactor");
  expect(main).toContain('ipcMain.handle("fonts:list-system"');
  expect(main).toContain("listSystemFonts");
});

test("desktop bridge owns one persistent archive directory and can reveal it", () => {
  const preload = readFileSync(resolve("electron/preload.ts"), "utf8");
  const main = readFileSync(resolve("electron/main.ts"), "utf8");
  const archive = readFileSync(resolve("electron/export-archive.ts"), "utf8");

  expect(preload).toContain("getExportDirectory");
  expect(preload).toContain("chooseExportDirectory");
  expect(preload).toContain("resetExportDirectory");
  expect(preload).toContain("saveToArchive");
  expect(preload).toContain("openExportDirectory");
  expect(main).toContain('ipcMain.handle("files:archive-directory"');
  expect(main).toContain('ipcMain.handle("files:choose-archive-directory"');
  expect(main).toContain('ipcMain.handle("files:save-to-archive"');
  expect(main).toContain('ipcMain.handle("files:open-archive-directory"');
  expect(archive).toContain('join(dataDir, "exports")');
  expect(archive).toContain('{ flag: "wx" }');
  expect(main).toContain("shell.openPath");
});

test("desktop bridge resolves a selected file's filesystem creation time", () => {
  const preload = readFileSync(resolve("electron/preload.ts"), "utf8");
  const main = readFileSync(resolve("electron/main.ts"), "utf8");

  expect(preload).toContain("sourceCreatedAt");
  expect(preload).toContain("webUtils.getPathForFile(file)");
  expect(preload).toContain('ipcRenderer.invoke("files:source-created-at"');
  expect(main).toContain('ipcMain.handle("files:source-created-at"');
  expect(main).toContain("birthtime.toISOString()");
});
