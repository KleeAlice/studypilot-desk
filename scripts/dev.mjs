import { spawn } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const electron = process.platform === "win32"
  ? "node_modules\\electron\\dist\\electron.exe"
  : "./node_modules/.bin/electron";
const renderer = spawn(npm, ["run", "dev:renderer"], { stdio: "inherit", windowsHide: true, shell: process.platform === "win32" });

async function waitForRenderer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:5173");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Vite 开发服务启动超时");
}

try {
  await waitForRenderer();
  const build = spawn(npm, ["run", "build:electron"], { stdio: "inherit", windowsHide: true, shell: process.platform === "win32" });
  const buildCode = await new Promise((resolve) => build.once("exit", resolve));
  if (buildCode !== 0) process.exit(Number(buildCode));
  const desktop = spawn(electron, ["."], {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, VITE_DEV_SERVER_URL: "http://127.0.0.1:5173" },
  });
  const code = await new Promise((resolve) => desktop.once("exit", resolve));
  process.exitCode = Number(code ?? 0);
} finally {
  renderer.kill();
}
