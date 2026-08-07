import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, shell } from "electron";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { BackendManager, type BackendRuntime } from "./backend-manager.js";
import { WindowStateManager } from "./window-manager.js";
import { listSystemFonts } from "./system-fonts.js";
import { ExportArchive } from "./export-archive.js";
import { resolveRuntimePaths } from "./runtime-paths.js";


const projectRoot = resolve(__dirname, "..");
const runtimePaths = resolveRuntimePaths({
  isPackaged: app.isPackaged,
  projectRoot,
  resourcesPath: process.resourcesPath,
  userDataPath: app.getPath("userData"),
  dataDirOverride: process.env.STUDYPILOT_DATA_DIR,
  platform: process.platform,
});
const { dataDir } = runtimePaths;
const backend = new BackendManager({
  dataDir,
  projectRoot: runtimePaths.projectRoot,
  backendExecutable: runtimePaths.backendExecutable,
  startupTimeoutMs: app.isPackaged ? 30_000 : 15_000,
});
const exportArchive = new ExportArchive(dataDir);
const smokeMode = process.env.STUDYPILOT_SMOKE_TEST === "1";
app.setAppUserModelId("com.studypilot.desk");
let runtime: BackendRuntime | undefined;
let runtimeReady: Promise<BackendRuntime> | undefined;
let mainWindow: BrowserWindow | null = null;
let quitting = false;
const MAX_EXPORT_BYTES = 64 * 1024 * 1024;
const EXPORT_FILTERS: Record<string, { name: string; extensions: string[] }> = {
  ".png": { name: "PNG 图片", extensions: ["png"] },
  ".pdf": { name: "PDF 文档", extensions: ["pdf"] },
  ".docx": { name: "Word 文档", extensions: ["docx"] },
  ".md": { name: "Markdown 文档", extensions: ["md"] },
};


function registerIpc(): void {
  ipcMain.handle("runtime:get", async () => {
    const ready = runtime ?? await runtimeReady;
    if (!ready) {
      throw new Error("StudyPilot local service has not started");
    }
    return { apiBase: ready.apiBase, dataDir };
  });
  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:toggle-maximize", () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle("window:close", () => mainWindow?.close());
  ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);
  ipcMain.handle("fonts:list-system", () => listSystemFonts());
  ipcMain.handle("clipboard:read-text", () => clipboard.readText());
  ipcMain.handle("clipboard:write-text", (_event, text: string) => clipboard.writeText(String(text || "")));
  ipcMain.handle("clipboard:read-image", () => {
    const image = clipboard.readImage();
    return image.isEmpty() ? null : image.toPNG();
  });
  ipcMain.handle("capture:window", async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    const image = await mainWindow.webContents.capturePage();
    return image.isEmpty() ? null : image.toPNG();
  });
  ipcMain.handle("files:choose-documents", async () => {
    if (!mainWindow) return [];
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "导入学习资料",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "学习文档", extensions: ["pdf", "docx", "md", "txt", "xlsx", "pptx"] }],
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle("files:source-created-at", async (_event, filePath: string) => {
    if (!filePath || typeof filePath !== "string") return null;
    try {
      const { birthtime } = await stat(resolve(filePath));
      return Number.isNaN(birthtime.getTime()) ? null : birthtime.toISOString();
    } catch {
      return null;
    }
  });
  ipcMain.handle("files:save-export", async (_event, request: { suggestedName?: string; bytes?: Uint8Array | number[] }) => {
    if (!mainWindow) return null;
    const suggestedName = basename(String(request?.suggestedName || ""));
    const extension = extname(suggestedName).toLowerCase();
    const filter = EXPORT_FILTERS[extension];
    if (!filter) throw new Error("不支持的导出文件类型");
    const content = Buffer.from(request?.bytes || []);
    if (!content.length || content.length > MAX_EXPORT_BYTES) throw new Error("导出文件为空或超过 64 MB");
    const result = await dialog.showSaveDialog(mainWindow, {
      title: "导出知识笔记",
      defaultPath: suggestedName,
      filters: [filter],
      properties: ["showOverwriteConfirmation", "createDirectory"],
    });
    if (result.canceled || !result.filePath) return null;
    const target = extname(result.filePath).toLowerCase() === extension
      ? result.filePath
      : `${result.filePath}${extension}`;
    await writeFile(target, content);
    return target;
  });
  ipcMain.handle("files:archive-directory", () => exportArchive.getDirectory());
  ipcMain.handle("files:choose-archive-directory", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "选择 StudyPilot 导出存档目录",
      properties: ["openDirectory", "createDirectory"],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return exportArchive.setDirectory(result.filePaths[0]);
  });
  ipcMain.handle("files:reset-archive-directory", () => exportArchive.resetDirectory());
  ipcMain.handle("files:save-to-archive", async (_event, request: { suggestedName?: string; bytes?: Uint8Array | number[] }) => {
    const suggestedName = basename(String(request?.suggestedName || ""));
    const extension = extname(suggestedName).toLowerCase();
    if (!EXPORT_FILTERS[extension]) throw new Error("不支持的导出文件类型");
    const content = Buffer.from(request?.bytes || []);
    if (!content.length || content.length > MAX_EXPORT_BYTES) throw new Error("导出文件为空或超过 64 MB");
    return exportArchive.saveFile(suggestedName, content);
  });
  ipcMain.handle("files:open-archive-directory", async () => {
    const directory = await exportArchive.getDirectory();
    await mkdir(directory, { recursive: true });
    const error = await shell.openPath(directory);
    if (error) throw new Error(`无法打开存档目录：${error}`);
  });
}

async function createWindow(): Promise<void> {
  const state = new WindowStateManager(join(dataDir, "window-state.json"));
  const bounds = state.load();
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0b1018" : "#f2f4f7",
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      plugins: true,
    },
  });
  state.observe(mainWindow);
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  if (!smokeMode) mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const developmentUrl = process.env.VITE_DEV_SERVER_URL;
  if (developmentUrl) await mainWindow.loadURL(developmentUrl);
  else await mainWindow.loadFile(join(projectRoot, "dist", "index.html"));
  if (smokeMode) {
    const result = await mainWindow.webContents.executeJavaScript(`(async () => {
      const deadline = Date.now() + 5000;
      while (!document.body.innerText.trim() && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const fonts = typeof window.studypilot?.fonts?.list === 'function'
        ? await window.studypilot.fonts.list()
        : [];
      return {
        title: document.title,
        bridge: typeof window.studypilot === 'object',
        content: document.body.innerText.slice(0, 300),
        overflow: document.documentElement.scrollWidth <= window.innerWidth,
        fontCount: Array.isArray(fonts) ? fonts.length : 0
      };
    })()`);
    const fontsMissing = process.platform === "win32" && Number(result.fontCount) < 10;
    if (!result.bridge || !result.overflow || fontsMissing || !String(result.title).includes("StudyPilot") || !String(result.content).trim()) {
      throw new Error(`Electron smoke failed: ${JSON.stringify(result)}`);
    }
    console.log(`STUDYPILOT_SMOKE_OK ${JSON.stringify(result)}`);
    quitting = true;
    console.log("STUDYPILOT_SMOKE_STOP_BEGIN");
    await backend.stop();
    console.log("STUDYPILOT_SMOKE_STOP_END");
    mainWindow.destroy();
    app.exit(0);
  }
}

async function bootstrap(): Promise<void> {
  if (smokeMode) {
    runtime = await backend.start();
    runtimeReady = Promise.resolve(runtime);
    registerIpc();
    await createWindow();
    return;
  }

  runtimeReady = backend.start().then((ready) => {
    runtime = ready;
    return ready;
  });
  void runtimeReady.catch((error) => {
    console.error(`StudyPilot backend startup failed: ${String(error)}`);
  });
  registerIpc();
  await createWindow();
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(bootstrap).catch(async (error) => {
    await backend.stop();
    if (smokeMode) console.error(`STUDYPILOT_SMOKE_ERROR ${String(error)}`);
    else dialog.showErrorBox("StudyPilot Desk 启动失败", String(error));
    app.exit(1);
  });
}

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && (runtime || runtimeReady)) void createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  void backend.stop().finally(() => app.exit(0));
});
