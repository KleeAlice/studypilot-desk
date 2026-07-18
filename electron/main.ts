import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme } from "electron";
import { writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { BackendManager, type BackendRuntime } from "./backend-manager.js";
import { WindowStateManager } from "./window-manager.js";


const projectRoot = resolve(__dirname, "..");
const dataDir = resolve(process.env.STUDYPILOT_DATA_DIR || join(projectRoot, "data"));
const backend = new BackendManager({ dataDir, projectRoot });
const smokeMode = process.env.STUDYPILOT_SMOKE_TEST === "1";
let runtime: BackendRuntime;
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
  ipcMain.handle("runtime:get", () => ({ apiBase: runtime.apiBase, dataDir }));
  ipcMain.handle("window:minimize", () => mainWindow?.minimize());
  ipcMain.handle("window:toggle-maximize", () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });
  ipcMain.handle("window:close", () => mainWindow?.close());
  ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);
  ipcMain.handle("clipboard:read-text", () => clipboard.readText());
  ipcMain.handle("clipboard:read-image", () => {
    const image = clipboard.readImage();
    return image.isEmpty() ? null : image.toPNG();
  });
  ipcMain.handle("files:choose-documents", async () => {
    if (!mainWindow) return [];
    const result = await dialog.showOpenDialog(mainWindow, {
      title: "导入学习资料",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "学习文档", extensions: ["pdf", "docx", "md", "txt"] }],
    });
    return result.canceled ? [] : result.filePaths;
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
}

async function createWindow(): Promise<void> {
  const state = new WindowStateManager(join(dataDir, "window-state.json"));
  const bounds = state.load();
  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#0b1018" : "#f2f4f7",
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
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
      return {
      title: document.title,
      bridge: typeof window.studypilot === 'object',
      content: document.body.innerText.slice(0, 300),
        overflow: document.documentElement.scrollWidth <= window.innerWidth
      };
    })()`);
    if (!result.bridge || !result.overflow || !String(result.title).includes("StudyPilot") || !String(result.content).trim()) {
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
  runtime = await backend.start();
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
  if (BrowserWindow.getAllWindows().length === 0 && runtime) void createWindow();
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
