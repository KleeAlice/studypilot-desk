import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath
  || resolve(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const builderCli = resolve(root, "node_modules", "electron-builder", "cli.js");

if (!existsSync(npmCli)) throw new Error(`npm CLI was not found: ${npmCli}`);
if (!existsSync(builderCli)) throw new Error(`electron-builder CLI was not found: ${builderCli}`);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(process.execPath, [npmCli, "run", "build"]);
run(process.execPath, [npmCli, "run", "build:backend-runtime"]);
run(process.execPath, [builderCli, "--win", "nsis", "--x64", "--config", "electron-builder.yml"]);
