import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

test("start.bat delegates desktop startup to the Tauri PowerShell launcher", () => {
  const launcher = readFileSync(resolve(process.cwd(), "start.bat"), "utf8");

  expect(launcher).toContain('powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"');
  expect(launcher).not.toContain("dist-electron");
});

test("silent launcher starts the development app without a console window", () => {
  const launcherPath = resolve(process.cwd(), "StudyPilot Desk.vbs");

  expect(existsSync(launcherPath)).toBe(true);
  if (!existsSync(launcherPath)) return;

  const launcher = readFileSync(launcherPath, "utf8");

  expect(launcher).toContain('CreateObject("WScript.Shell")');
  expect(launcher).toContain('\\start.bat');
  expect(launcher).toMatch(/\.Run\s+command,\s*0,\s*False/i);
});
