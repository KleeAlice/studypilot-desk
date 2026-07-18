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
