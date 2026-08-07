import { execFile } from "node:child_process";
import { promisify } from "node:util";


const execFileAsync = promisify(execFile);

export function parseSystemFontFamilies(output: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output.trim() || "[]");
  } catch {
    return [];
  }
  const values = Array.isArray(parsed) ? parsed : [parsed];
  return [...new Set(
    values
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && value.length <= 160),
  )].sort((left, right) => {
    const leftLatin = /^[\u0000-\u007f]/.test(left);
    const rightLatin = /^[\u0000-\u007f]/.test(right);
    if (leftLatin !== rightLatin) return leftLatin ? -1 : 1;
    return left.localeCompare(right, "zh-CN", { sensitivity: "base" });
  });
}

export function buildWindowsFontDiscoveryScript(): string {
  return [
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "$OutputEncoding = [Console]::OutputEncoding",
    "Add-Type -AssemblyName System.Drawing",
    "$collection = New-Object System.Drawing.Text.InstalledFontCollection",
    "$names = @($collection.Families | ForEach-Object { $_.Name })",
    "$collection.Dispose()",
    "$names | ConvertTo-Json -Compress",
  ].join("; ");
}

export function parseMacSystemFonts(output: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output.trim() || "{}");
  } catch {
    return [];
  }
  const names: string[] = [];
  const visit = (value: unknown, inheritedEnabled = true): void => {
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, inheritedEnabled));
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const enabled = inheritedEnabled && String(record.enabled ?? "yes").toLowerCase() !== "no";
    if (!enabled) return;
    for (const key of ["family", "family_name", "familyName"]) {
      const family = record[key];
      if (typeof family === "string") names.push(family);
      else if (Array.isArray(family)) {
        names.push(...family.filter((item): item is string => typeof item === "string"));
      }
    }
    Object.values(record).forEach((item) => visit(item, enabled));
  };
  visit(parsed);
  return parseSystemFontFamilies(JSON.stringify(names));
}

export async function listSystemFonts(): Promise<string[]> {
  if (process.platform === "darwin") {
    try {
      const { stdout } = await execFileAsync(
        "system_profiler",
        ["SPFontsDataType", "-json"],
        { timeout: 30_000, maxBuffer: 16 * 1024 * 1024 },
      );
      return parseMacSystemFonts(stdout);
    } catch {
      return [];
    }
  }
  if (process.platform !== "win32") return [];
  try {
    const script = buildWindowsFontDiscoveryScript();
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script],
      { windowsHide: true, timeout: 15_000, maxBuffer: 2 * 1024 * 1024 },
    );
    return parseSystemFontFamilies(stdout);
  } catch {
    return [];
  }
}
