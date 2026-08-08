import { describe, expect, it } from "vitest";
import {
  pythonInterpreterCandidates,
  resolvePythonInterpreter,
} from "../../scripts/python-interpreter.mjs";

describe("packaged worker Python resolution", () => {
  it("uses setup-python when a clean Windows runner has no project virtual environment", () => {
    const root = "D:\\a\\studypilot-desk\\studypilot-desk";
    const hostedPython = "C:\\hostedtoolcache\\windows\\Python\\3.12.10\\x64\\python.exe";
    const calls = [];
    const resolved = resolvePythonInterpreter({
      root,
      platform: "win32",
      environment: { pythonLocation: "C:\\hostedtoolcache\\windows\\Python\\3.12.10\\x64" },
      spawn(candidate) {
        calls.push(candidate);
        return { status: candidate === hostedPython ? 0 : 1 };
      },
    });

    expect(resolved).toBe(hostedPython);
    expect(calls).toEqual([
      "D:\\a\\studypilot-desk\\studypilot-desk\\.venv\\Scripts\\python.exe",
      hostedPython,
    ]);
  });

  it("prioritizes an explicit interpreter and keeps portable PATH fallbacks", () => {
    const candidates = pythonInterpreterCandidates({
      root: "/workspace",
      platform: "linux",
      environment: { STUDYPILOT_PYTHON: "/custom/python" },
    });

    expect(candidates).toEqual([
      "/custom/python",
      "/workspace/.venv/bin/python",
      "python3",
      "python",
    ]);
  });
});
