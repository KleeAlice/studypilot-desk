import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

describe("Tauri Windows installer contract", () => {
  it("uses a stable Tauri identity and packages the private Python worker as a resource", () => {
    const config = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));

    expect(config.identifier).toBe("com.studypilot.desk");
    expect(config.bundle.active).toBe(true);
    expect(config.bundle.resources["../build/backend-runtime/StudyPilotPythonWorker"]).toBe("backend");
    expect(config.bundle.windows.webviewInstallMode.type).toBe("downloadBootstrapper");
  });

  it("exposes one-command backend and installer builds", () => {
    const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

    expect(packageJson.scripts["build:backend-runtime"]).toBeTruthy();
    expect(packageJson.scripts["dist:win"]).toBeTruthy();
    expect(packageJson.devDependencies["@tauri-apps/cli"]).toBeTruthy();
    expect(packageJson.scripts.build).toBe("npm run build:tauri");
  });

  it("keeps Actix-Web as the only HTTP host and Python behind a stdio protocol", () => {
    const native = readFileSync(resolve(root, "src-tauri/src/lib.rs"), "utf8");
    const host = readFileSync(resolve(root, "src-tauri/crates/local-host/src/lib.rs"), "utf8");
    const worker = readFileSync(resolve(root, "backend/app/worker_bridge.py"), "utf8");
    const packager = readFileSync(resolve(root, "scripts/build-backend-runtime.mjs"), "utf8");

    expect(native).toContain("LocalApiConfig");
    expect(host).toContain("HttpServer::new");
    expect(host).toContain("RouteAdapter");
    expect(worker).toContain('await write({"kind": "ready"})');
    expect(worker).not.toContain("uvicorn");
    expect(worker).not.toContain("STUDYPILOT_BACKEND_PORT");
    expect(packager).toContain("StudyPilotPythonWorker");
    expect(packager).not.toContain("StudyPilotBackend");
    expect(packager).not.toContain("uvicorn");
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
