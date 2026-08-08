import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const readJson = (path) => JSON.parse(read(path));

function requiredMatch(path, pattern, description) {
  const match = read(path).match(pattern);
  if (!match) throw new Error(`Could not read ${description} from ${path}`);
  return match[1];
}

const packageJson = readJson("package.json");
const packageLock = readJson("package-lock.json");
const tauriConfig = readJson("src-tauri/tauri.conf.json");
const manifest = readJson(".release-please-manifest.json");

const versions = new Map([
  ["package.json", packageJson.version],
  ["package-lock.json", packageLock.version],
  ["package-lock root package", packageLock.packages?.[""]?.version],
  ["Tauri config", tauriConfig.version],
  [
    "Rust package",
    requiredMatch(
      "src-tauri/Cargo.toml",
      /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m,
      "Rust package version",
    ),
  ],
  [
    "Rust lockfile",
    requiredMatch(
      "src-tauri/Cargo.lock",
      /^\[\[package\]\]\r?\nname = "studypilot-desk"\r?\nversion = "([^"]+)"/m,
      "Rust lockfile package version",
    ),
  ],
  [
    "Python project",
    requiredMatch(
      "pyproject.toml",
      /^\[project\][\s\S]*?^version\s*=\s*"([^"]+)"/m,
      "Python project version",
    ),
  ],
  [
    "Python runtime",
    requiredMatch(
      "backend/app/__init__.py",
      /^__version__\s*=\s*"([^"]+)"/m,
      "Python runtime version",
    ),
  ],
  ["Release Please manifest", manifest["."]],
]);

const expected = packageJson.version;
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(expected)) {
  throw new Error(`Invalid semantic version: ${expected}`);
}

const mismatches = [...versions].filter(([, version]) => version !== expected);
if (mismatches.length) {
  const details = mismatches.map(([source, version]) => `${source}=${version ?? "missing"}`).join(", ");
  throw new Error(`Version mismatch; expected ${expected}: ${details}`);
}

console.log(`All application version sources match ${expected}.`);
