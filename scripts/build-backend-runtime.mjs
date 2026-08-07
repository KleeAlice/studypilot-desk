import { existsSync, rmSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWindows = process.platform === "win32";
const python = isWindows
  ? join(root, ".venv", "Scripts", "python.exe")
  : join(root, ".venv", "bin", "python");
const distPath = resolve(root, "build", "backend-runtime");
const workPath = resolve(root, "build", "pyinstaller-work");
const specPath = resolve(root, "build", "pyinstaller-spec");
const executable = resolve(distPath, "StudyPilotBackend", isWindows ? "StudyPilotBackend.exe" : "StudyPilotBackend");

if (!existsSync(python)) {
  throw new Error(`Python virtual environment was not found: ${python}`);
}

rmSync(distPath, { recursive: true, force: true });
rmSync(workPath, { recursive: true, force: true });
rmSync(specPath, { recursive: true, force: true });

const args = [
  "-m",
  "PyInstaller",
  "--noconfirm",
  "--clean",
  "--onedir",
  "--name",
  "StudyPilotBackend",
  "--distpath",
  distPath,
  "--workpath",
  workPath,
  "--specpath",
  specPath,
  "--add-data",
  `${resolve(root, "data", "seeds")}${delimiter}data/seeds`,
  "--collect-all",
  "uvicorn",
  "--hidden-import",
  "uvicorn.logging",
  "--hidden-import",
  "uvicorn.loops.auto",
  "--hidden-import",
  "uvicorn.protocols.http.auto",
  "--hidden-import",
  "uvicorn.protocols.websockets.auto",
  "--hidden-import",
  "uvicorn.lifespan.on",
  resolve(root, "backend", "packaged_server.py"),
];

console.log("[StudyPilot] Building the packaged backend runtime...");
const result = spawnSync(python, args, {
  cwd: root,
  env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (!existsSync(executable)) {
  throw new Error(`Packaged backend executable was not created: ${executable}`);
}
console.log(`[StudyPilot] Backend runtime ready: ${executable}`);
