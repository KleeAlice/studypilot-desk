import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRuntimePaths } from "../../electron/runtime-paths";

describe("runtime paths", () => {
  const projectRoot = resolve("C:/workspace/studypilot-desk");
  const resourcesPath = resolve("C:/Program Files/StudyPilot Desk/resources");
  const userDataPath = resolve("C:/Users/test/AppData/Roaming/StudyPilot Desk");

  it("uses repository resources in development", () => {
    expect(
      resolveRuntimePaths({
        isPackaged: false,
        projectRoot,
        resourcesPath,
        userDataPath,
      }),
    ).toEqual({
      projectRoot,
      dataDir: join(projectRoot, "data"),
      backendExecutable: undefined,
    });
  });

  it("uses packaged resources and per-user data after installation", () => {
    expect(
      resolveRuntimePaths({
        isPackaged: true,
        projectRoot,
        resourcesPath,
        userDataPath,
      }),
    ).toEqual({
      projectRoot,
      dataDir: join(userDataPath, "data"),
      backendExecutable: join(resourcesPath, "backend", "StudyPilotBackend.exe"),
    });
  });

  it("uses the extensionless packaged backend on macOS", () => {
    const macResources = "/Applications/StudyPilot Desk.app/Contents/Resources";
    const macUserData = "/Users/test/Library/Application Support/StudyPilot Desk";
    expect(
      resolveRuntimePaths({
        isPackaged: true,
        projectRoot: "/workspace/studypilot-desk",
        resourcesPath: macResources,
        userDataPath: macUserData,
        platform: "darwin",
      }),
    ).toEqual({
      projectRoot: resolve("/workspace/studypilot-desk"),
      dataDir: resolve(macUserData, "data"),
      backendExecutable: resolve(macResources, "backend", "StudyPilotBackend"),
    });
  });

  it("honors an explicit data directory override", () => {
    const dataDirOverride = resolve("C:/temp/studypilot-smoke");
    expect(
      resolveRuntimePaths({
        isPackaged: true,
        projectRoot,
        resourcesPath,
        userDataPath,
        dataDirOverride,
      }).dataDir,
    ).toBe(dataDirOverride);
  });
});
