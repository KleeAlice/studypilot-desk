import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCli = process.env.npm_execpath
  || resolve(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const builderCli = resolve(root, "node_modules", "electron-builder", "cli.js");

if (process.platform !== "darwin") {
  throw new Error(
    "macOS DMG/ZIP must be built on macOS because the bundled Python runtime, "
    + "code signing, and notarization are native Apple toolchain steps. "
    + "Run `npm run dist:mac` on a Mac or dispatch `.github/workflows/build-macos.yml`.",
  );
}
if (!["arm64", "x64"].includes(process.arch)) {
  throw new Error(`Unsupported macOS architecture: ${process.arch}`);
}
if (!existsSync(npmCli)) throw new Error(`npm CLI was not found: ${npmCli}`);
if (!existsSync(builderCli)) throw new Error(`electron-builder CLI was not found: ${builderCli}`);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const archFlag = process.arch === "arm64" ? "--arm64" : "--x64";
const signingConfigured = Boolean(process.env.CSC_LINK || process.env.CSC_NAME);
const apiNotarization = Boolean(
  process.env.APPLE_API_KEY
  && process.env.APPLE_API_KEY_ID
  && process.env.APPLE_API_ISSUER,
);
const appleIdNotarization = Boolean(
  process.env.APPLE_ID
  && process.env.APPLE_APP_SPECIFIC_PASSWORD
  && process.env.APPLE_TEAM_ID,
);
const builderArgs = [
  builderCli,
  "--mac",
  "dmg",
  "zip",
  archFlag,
  "--config",
  "electron-builder.mac.yml",
];

if (!signingConfigured) {
  builderArgs.push("-c.mac.identity=null", "-c.mac.hardenedRuntime=false", "-c.mac.notarize=false");
  console.warn("[StudyPilot] Building unsigned macOS artifacts. Gatekeeper will require manual approval.");
} else if (apiNotarization || appleIdNotarization) {
  builderArgs.push("-c.mac.notarize=true");
}

run(process.execPath, [npmCli, "run", "build"]);
run(process.execPath, [npmCli, "run", "build:backend-runtime"]);
run(process.execPath, builderArgs);
console.log(`[StudyPilot] macOS ${process.arch} artifacts are ready in release/macos.`);
