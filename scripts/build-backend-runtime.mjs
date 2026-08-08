import { existsSync, rmSync } from "node:fs";
import { delimiter, dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolvePythonInterpreter } from "./python-interpreter.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const python = resolvePythonInterpreter({ root });
const distPath = resolve(root, "build", "backend-runtime");
const workPath = resolve(root, "build", "pyinstaller-work");
const specPath = resolve(root, "build", "pyinstaller-spec");
const executable = resolve(distPath, "StudyPilotPythonWorker", isWindows ? "StudyPilotPythonWorker.exe" : "StudyPilotPythonWorker");

rmSync(distPath, { recursive: true, force: true });
rmSync(workPath, { recursive: true, force: true });
rmSync(specPath, { recursive: true, force: true });

const args = [
  "-m",
  "PyInstaller",
  "--noconfirm",
  "--clean",
  "--onedir",
  "--noconsole",
  "--name",
  "StudyPilotPythonWorker",
  "--distpath",
  distPath,
  "--workpath",
  workPath,
  "--specpath",
  specPath,
  "--add-data",
  `${resolve(root, "data", "seeds")}${delimiter}data/seeds`,
  resolve(root, "backend", "app", "worker_bridge.py"),
];

console.log(`[StudyPilot] Building the packaged Python domain worker with ${python}...`);
const result = spawnSync(python, args, {
  cwd: root,
  env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (!existsSync(executable)) {
  throw new Error(`Packaged Python worker was not created: ${executable}`);
}
console.log(`[StudyPilot] Python domain worker ready: ${executable}`);
