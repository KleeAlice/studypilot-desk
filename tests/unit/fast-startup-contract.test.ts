import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

describe("development launcher fast path", () => {
  it("starts existing Electron artifacts without rebuilding", () => {
    const launcher = readFileSync(resolve(root, "start.bat"), "utf8");
    const directElectron = launcher.indexOf("node_modules\\electron\\dist\\electron.exe");
    const powershellFallback = launcher.indexOf("powershell.exe");

    expect(launcher).toContain("dist\\index.html");
    expect(launcher).toContain("dist-electron\\main.cjs");
    expect(launcher).toContain(".venv\\Scripts\\python.exe");
    expect(directElectron).toBeGreaterThanOrEqual(0);
    expect(powershellFallback).toBeGreaterThan(directElectron);
    expect(launcher).not.toContain("npm run build");
  });
});
