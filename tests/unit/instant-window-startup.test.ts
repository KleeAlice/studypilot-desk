import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";


test("normal desktop startup creates the window before backend readiness", () => {
  const source = readFileSync(
    resolve(process.cwd(), "electron/main.ts"),
    "utf8",
  );
  const bootstrap = source.slice(
    source.indexOf("async function bootstrap"),
    source.indexOf("app.whenReady"),
  );

  const normalBackendStart = bootstrap.indexOf("runtimeReady = backend.start()");
  const normalWindowStart = bootstrap.indexOf("await createWindow()", normalBackendStart);
  expect(bootstrap).toContain("runtimeReady = backend.start()");
  expect(normalBackendStart).toBeLessThan(
    normalWindowStart,
  );
  expect(source).toContain('ipcMain.handle("runtime:get", async');
});
