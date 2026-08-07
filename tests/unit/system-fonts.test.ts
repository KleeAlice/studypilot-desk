import { expect, test } from "vitest";
import { buildWindowsFontDiscoveryScript, parseMacSystemFonts, parseSystemFontFamilies } from "../../electron/system-fonts";


test("system font discovery normalizes and sorts every installed family", () => {
  const output = JSON.stringify([
    "Microsoft YaHei UI",
    "Aptos",
    "霞鹜文楷",
    "Aptos",
    "  ",
  ]);

  expect(parseSystemFontFamilies(output)).toEqual([
    "Aptos",
    "Microsoft YaHei UI",
    "霞鹜文楷",
  ]);
});

test("Windows font discovery loads System.Drawing before enumerating families", () => {
  const script = buildWindowsFontDiscoveryScript();

  expect(script.indexOf("Add-Type -AssemblyName System.Drawing")).toBeGreaterThanOrEqual(0);
  expect(script.indexOf("Add-Type -AssemblyName System.Drawing")).toBeLessThan(
    script.indexOf("InstalledFontCollection"),
  );
});

test("Windows font discovery emits UTF-8 so non-ASCII family names survive Electron IPC", () => {
  const script = buildWindowsFontDiscoveryScript();

  expect(script).toContain("[Console]::OutputEncoding");
  expect(script).toContain("[System.Text.UTF8Encoding]::new($false)");
  expect(script.indexOf("[Console]::OutputEncoding")).toBeLessThan(script.indexOf("ConvertTo-Json"));
});

test("macOS system profiler discovery extracts enabled font families", () => {
  const output = JSON.stringify({
    SPFontsDataType: [
      { _name: "SFPro.ttf", family: "SF Pro", enabled: "yes" },
      { _name: "PingFang.ttc", family: "PingFang SC", enabled: "yes" },
      { _name: "Disabled.ttf", family: "Disabled Font", enabled: "no" },
      {
        _name: "Songti.ttc",
        typefaces: [
          { _name: "Songti SC Bold", family: "Songti SC" },
          { _name: "Songti SC Regular", family: "Songti SC" },
        ],
      },
    ],
  });

  expect(parseMacSystemFonts(output)).toEqual(["PingFang SC", "SF Pro", "Songti SC"]);
});
