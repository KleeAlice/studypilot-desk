import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("GitHub delivery contracts", () => {
  it("runs strict PR checks before producing a Windows package", () => {
    const workflow = read(".github/workflows/ci.yml");

    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("npm run typecheck");
    expect(workflow).toContain("python -m ruff check backend scripts");
    expect(workflow).toContain("--workspace --all-targets --locked -- -D warnings");
    expect(workflow).toContain("python scripts/check_packaged_worker.py");
    expect(workflow).toContain("build --bundles nsis");
  });

  it("keeps security scanning independent from release permissions", () => {
    const workflow = read(".github/workflows/security.yml");

    expect(workflow).toContain("actions/dependency-review-action@v4");
    expect(workflow).toContain("github/codeql-action/analyze@v3");
    expect(workflow).toContain("python -m pip_audit --strict .");
    expect(workflow).toContain("python -m pip_audit --skip-editable");
    expect(workflow).toContain("cargo audit --file src-tauri/Cargo.lock --deny warnings");
  });

  it("uses Release Please and builds all supported desktop bundles", () => {
    const workflow = read(".github/workflows/release.yml");
    const config = JSON.parse(read("release-please-config.json"));
    const extraFiles = config.packages["."]["extra-files"];
    const serializedExtraFiles = JSON.stringify(extraFiles);

    expect(workflow).toContain("googleapis/release-please-action@v4");
    expect(workflow).toContain("bundles: nsis");
    expect(workflow).toContain("bundles: deb,appimage");
    expect(workflow).toContain("bundles: dmg");
    expect(serializedExtraFiles).toContain("src-tauri/tauri.conf.json");
    expect(serializedExtraFiles).toContain("src-tauri/Cargo.lock");
    expect(serializedExtraFiles).toContain("pyproject.toml");
    expect(serializedExtraFiles).toContain("backend/app/__init__.py");
  });
});
