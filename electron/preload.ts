import { contextBridge, ipcRenderer, webFrame, webUtils } from "electron";

contextBridge.exposeInMainWorld("studypilot", {
  runtime: () => ipcRenderer.invoke("runtime:get"),
  window: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  },
  files: {
    chooseDocuments: () => ipcRenderer.invoke("files:choose-documents"),
    sourceCreatedAt: (file: File) => {
      const filePath = webUtils.getPathForFile(file);
      return filePath
        ? ipcRenderer.invoke("files:source-created-at", filePath)
        : Promise.resolve(null);
    },
    saveExport: (request: { suggestedName: string; bytes: Uint8Array }) => ipcRenderer.invoke("files:save-export", request),
    getExportDirectory: () => ipcRenderer.invoke("files:archive-directory"),
    chooseExportDirectory: () => ipcRenderer.invoke("files:choose-archive-directory"),
    resetExportDirectory: () => ipcRenderer.invoke("files:reset-archive-directory"),
    saveToArchive: (request: { suggestedName: string; bytes: Uint8Array }) => ipcRenderer.invoke("files:save-to-archive", request),
    openExportDirectory: () => ipcRenderer.invoke("files:open-archive-directory"),
  },
  fonts: {
    list: () => ipcRenderer.invoke("fonts:list-system"),
  },
  appearance: {
    setZoomFactor: (factor: number) => webFrame.setZoomFactor(factor),
  },
  capture: {
    window: () => ipcRenderer.invoke("capture:window"),
  },
  clipboard: {
    readText: () => ipcRenderer.invoke("clipboard:read-text"),
    writeText: (text: string) => ipcRenderer.invoke("clipboard:write-text", text),
    readImage: () => ipcRenderer.invoke("clipboard:read-image"),
  },
});
