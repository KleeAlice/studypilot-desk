import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

describe("Windows installer contract", () => {
  it("uses a stable NSIS identity and preserves installed user data", () => {
    const config = readFileSync(resolve(root, "electron-builder.yml"), "utf8");

    expect(config).toContain("appId: com.studypilot.desk");
    expect(config).toMatch(/target:\s*\n\s*-\s*target:\s*nsis/);
    expect(config).toContain("deleteAppDataOnUninstall: false");
    expect(config).toContain("from: build/backend-runtime/StudyPilotBackend");
    expect(config).toContain("to: backend");
    expect(config).not.toMatch(/from:\s*data\b/);
  });

  it("exposes one-command backend and installer builds", () => {
    const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

    expect(packageJson.scripts["build:backend-runtime"]).toBeTruthy();
    expect(packageJson.scripts["dist:win"]).toBeTruthy();
    expect(packageJson.devDependencies["electron-builder"]).toBeTruthy();
  });

  it("starts the packaged API from installer-provided environment", () => {
    const entry = readFileSync(resolve(root, "backend/packaged_server.py"), "utf8");

    expect(entry).toContain("STUDYPILOT_BACKEND_PORT");
    expect(entry).toContain("uvicorn.run");
  });
});

describe("macOS installer contract", () => {
  it("builds a native-architecture DMG and ZIP with the packaged backend", () => {
    const config = readFileSync(resolve(root, "electron-builder.mac.yml"), "utf8");

    expect(config).toContain("appId: com.studypilot.desk");
    expect(config).toContain("output: release/macos");
    expect(config).toContain("from: build/backend-runtime/StudyPilotBackend");
    expect(config).toContain("to: backend");
    expect(config).toMatch(/target:\s*\n\s*-\s*dmg\s*\n\s*-\s*zip/);
    expect(config).toContain("category: public.app-category.education");
    expect(config).toContain("hardenedRuntime: true");
    expect(config).toContain("icon: build/icon.png");
  });

  it("exposes a guarded one-command native macOS build", () => {
    const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    const script = readFileSync(resolve(root, "scripts/build-mac-installer.mjs"), "utf8");
    const backendScript = readFileSync(resolve(root, "scripts/build-backend-runtime.mjs"), "utf8");

    expect(packageJson.scripts["dist:mac"]).toContain("build-mac-installer.mjs");
    expect(script).toContain('process.platform !== "darwin"');
    expect(script).toContain('"--mac"');
    expect(script).toContain('"dmg"');
    expect(script).toContain('"zip"');
    expect(script).toContain("process.arch");
    expect(backendScript).toContain('join(root, ".venv", "bin", "python")');
    expect(backendScript).toContain('process.platform === "win32"');
  });

  it("provides an Apple Silicon CI artifact path for builds from Windows development", () => {
    const workflow = readFileSync(resolve(root, ".github/workflows/build-macos.yml"), "utf8");

    expect(workflow).toContain("runs-on: macos-latest");
    expect(workflow).toContain("npm run dist:mac");
    expect(workflow).toContain("release/macos");
    expect(workflow).toContain("actions/upload-artifact@");
  });

  it("ships a scalable icon source and a 1024px packager-compatible PNG", () => {
    const source = readFileSync(resolve(root, "build/icon.svg"), "utf8");
    const icon = readFileSync(resolve(root, "build/icon.png"));

    expect(source).toContain("<svg");
    expect(source).toContain("StudyPilot");
    expect(icon.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(icon.readUInt32BE(16)).toBe(1024);
    expect(icon.readUInt32BE(20)).toBe(1024);
  });
});
