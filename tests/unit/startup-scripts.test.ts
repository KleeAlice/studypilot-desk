import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const powershellScripts = ["start.ps1", "scripts/reset_demo.ps1"];

describe.runIf(process.platform === "win32")("Windows PowerShell startup scripts", () => {
  for (const relativePath of powershellScripts) {
    it(`${relativePath} parses in Windows PowerShell 5.1`, () => {
      const path = resolve(relativePath).replaceAll("'", "''");
      const command = [
        "$tokens = $null",
        "$errors = $null",
        `[System.Management.Automation.Language.Parser]::ParseFile('${path}', [ref]$tokens, [ref]$errors) | Out-Null`,
        "if ($errors.Count -gt 0) { $errors | ForEach-Object { [Console]::Error.WriteLine($_.Message) }; exit 1 }",
      ].join("; ");
      const result = spawnSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", command],
        { encoding: "utf8" },
      );

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    }, 20_000);
  }
});
