import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FONT_REGISTRY_KEYS = [
  "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts",
  "HKCU\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts",
];

function normalizeFontNames(values: string[]): string[] {
  return [...new Set(
    values
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && value.length <= 160),
  )].sort((left, right) => {
    const leftLatin = /^[\u0000-\u007f]/.test(left);
    const rightLatin = /^[\u0000-\u007f]/.test(right);
    if (leftLatin !== rightLatin) return leftLatin ? -1 : 1;
    return left.localeCompare(right, "zh-CN", { sensitivity: "base" });
  });
}

export function parseWindowsFontRegistry(output: string): string[] {
  const names = output
    .split(/\r?\n/)
    .map((line) => line.match(/^\s+(.+?)\s+REG_(?:SZ|EXPAND_SZ)\s+/i)?.[1] || "")
    .map((name) => name.replace(/\s+\((?:TrueType|OpenType|All res)\)$/i, ""));
  return normalizeFontNames(names);
}

export async function listSystemFonts(): Promise<string[]> {
  if (process.platform !== "win32") return [];
  const results = await Promise.allSettled(
    FONT_REGISTRY_KEYS.map((key) => execFileAsync(
      "reg.exe",
      ["query", key],
      { windowsHide: true, timeout: 5_000, maxBuffer: 2 * 1024 * 1024 },
    )),
  );
  return normalizeFontNames(
    results.flatMap((result) => (
      result.status === "fulfilled"
        ? parseWindowsFontRegistry(result.value.stdout)
        : []
    )),
  );
}
