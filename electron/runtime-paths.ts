import { join, resolve } from "node:path";

export interface RuntimePathInput {
  isPackaged: boolean;
  projectRoot: string;
  resourcesPath: string;
  userDataPath: string;
  dataDirOverride?: string;
  platform?: NodeJS.Platform;
}

export interface RuntimePaths {
  projectRoot: string;
  dataDir: string;
  backendExecutable?: string;
}

export function resolveRuntimePaths(input: RuntimePathInput): RuntimePaths {
  const projectRoot = resolve(input.projectRoot);
  const platform = input.platform ?? process.platform;
  const defaultDataDir = input.isPackaged
    ? join(resolve(input.userDataPath), "data")
    : join(projectRoot, "data");

  return {
    projectRoot,
    dataDir: resolve(input.dataDirOverride || defaultDataDir),
    backendExecutable: input.isPackaged
      ? join(
        resolve(input.resourcesPath),
        "backend",
        platform === "win32" ? "StudyPilotBackend.exe" : "StudyPilotBackend",
      )
      : undefined,
  };
}
