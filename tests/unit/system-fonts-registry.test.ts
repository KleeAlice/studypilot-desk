import { expect, test } from "vitest";
import { parseWindowsFontRegistry } from "../../electron/windows-fonts";

test("Windows font registry discovery extracts family labels without registry metadata", () => {
  const output = [
    "HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts",
    "    Microsoft YaHei & Microsoft YaHei UI (TrueType)    REG_SZ    msyh.ttc",
    "    Aptos (TrueType)    REG_SZ    Aptos.ttf",
    "    Segoe UI (TrueType)    REG_SZ    segoeui.ttf",
    "    Malformed value",
  ].join("\r\n");

  expect(parseWindowsFontRegistry(output)).toEqual([
    "Aptos",
    "Microsoft YaHei & Microsoft YaHei UI",
    "Segoe UI",
  ]);
});
