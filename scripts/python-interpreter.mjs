import { spawnSync } from "node:child_process";
import { posix, win32 } from "node:path";

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function pythonInterpreterCandidates({
  root,
  platform = process.platform,
  environment = process.env,
}) {
  const windows = platform === "win32";
  const path = windows ? win32 : posix;
  const executable = windows ? "python.exe" : "python";
  return unique([
    environment.STUDYPILOT_PYTHON,
    windows
      ? path.join(root, ".venv", "Scripts", executable)
      : path.join(root, ".venv", "bin", executable),
    environment.pythonLocation
      ? path.join(environment.pythonLocation, executable)
      : undefined,
    windows ? "python.exe" : "python3",
    "python",
  ]);
}

export function resolvePythonInterpreter({
  root,
  platform = process.platform,
  environment = process.env,
  spawn = spawnSync,
}) {
  const candidates = pythonInterpreterCandidates({ root, platform, environment });
  for (const candidate of candidates) {
    const probe = spawn(candidate, ["-c", "import PyInstaller"], {
      cwd: root,
      env: environment,
      encoding: "utf8",
      shell: false,
      stdio: "pipe",
    });
    if (!probe.error && probe.status === 0) return candidate;
  }
  throw new Error(
    `No Python interpreter with PyInstaller was found. Checked: ${candidates.join(", ")}`,
  );
}
