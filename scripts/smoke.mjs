import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const dataDir = await mkdtemp(join(tmpdir(), "studypilot-electron-smoke-"));
const executable = process.platform === "win32"
  ? resolve("node_modules", "electron", "dist", "electron.exe")
  : resolve("node_modules", ".bin", "electron");
const child = spawn(executable, ["--no-sandbox", "--disable-gpu-sandbox", `--user-data-dir=${join(dataDir, "electron-profile")}`, "."], {
  cwd: process.cwd(),
  windowsHide: true,
  env: { ...process.env, STUDYPILOT_SMOKE_TEST: "1", STUDYPILOT_DATA_DIR: dataDir },
  stdio: ["ignore", "pipe", "pipe"],
});
const completion = new Promise((resolveCode, reject) => {
  child.once("error", reject);
  child.once("close", resolveCode);
});
let output = "";
child.stdout.on("data", (chunk) => { output += String(chunk); process.stdout.write(String(chunk)); });
child.stderr.on("data", (chunk) => { output += String(chunk); process.stderr.write(String(chunk)); });
let timeoutId;
const timedCompletion = Promise.race([
  completion,
  new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
    if (process.platform === "win32" && child.pid) {
      spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).unref();
    } else child.kill("SIGKILL");
    reject(new Error("Electron smoke timed out after 30 seconds"));
    }, 30_000);
  }),
]);
const code = await timedCompletion.finally(() => clearTimeout(timeoutId));
try {
  if (code !== 0 || !output.includes("STUDYPILOT_SMOKE_OK")) {
    throw new Error(`Electron smoke failed (${code}):\n${output}`);
  }
} finally {
  await rm(dataDir, { recursive: true, force: true });
}
