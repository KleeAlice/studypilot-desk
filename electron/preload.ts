import { contextBridge, ipcRenderer } from "electron";


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
    saveExport: (request: { suggestedName: string; bytes: Uint8Array }) => ipcRenderer.invoke("files:save-export", request),
  },
  clipboard: {
    readText: () => ipcRenderer.invoke("clipboard:read-text"),
    readImage: () => ipcRenderer.invoke("clipboard:read-image"),
  },
});
