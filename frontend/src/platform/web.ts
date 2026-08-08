import type { PlatformCapabilities, RuntimeConfig, SaveArtifactRequest } from "./types";

declare global {
  interface Window {
    __STUDYPILOT_RUNTIME__?: Partial<Pick<RuntimeConfig, "apiBase" | "dataDir" | "sessionToken">>;
  }
}

function browserRuntime(): RuntimeConfig {
  const configured = window.__STUDYPILOT_RUNTIME__;
  const apiBase = configured?.apiBase || import.meta.env.VITE_API_BASE || window.location.origin;
  return {
    apiBase: apiBase.replace(/\/$/, ""),
    dataDir: configured?.dataDir || "浏览器本地存储",
    platform: "web",
    sessionToken: configured?.sessionToken || import.meta.env.VITE_SESSION_TOKEN || undefined,
  };
}

function download(request: SaveArtifactRequest): string {
  const bytes = request.bytes.buffer.slice(
    request.bytes.byteOffset,
    request.bytes.byteOffset + request.bytes.byteLength,
  ) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([bytes]));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = request.suggestedName;
  anchor.click();
  URL.revokeObjectURL(url);
  return `下载：${request.suggestedName}`;
}

export const webPlatform: PlatformCapabilities = {
  kind: "web",
  async runtime() { return browserRuntime(); },
  window: {
    controlsAvailable: false,
    async minimize() {},
    async toggleMaximize() { return false; },
    async close() {},
  },
  files: {
    async sourceCreatedAt(file) {
      return file.lastModified > 0 ? new Date(file.lastModified).toISOString() : null;
    },
    async saveExport(request) { return download(request); },
    async getExportDirectory() { return "浏览器下载目录"; },
    async chooseExportDirectory() { return null; },
    async resetExportDirectory() { return "浏览器下载目录"; },
    async saveToArchive(request) { return download(request); },
    canOpenExportDirectory: false,
    async openExportDirectory() {},
  },
  fonts: { async list() { return []; } },
  appearance: { async setZoomFactor() {} },
  clipboard: {
    async readText() {
      if (!navigator.clipboard?.readText) throw new Error("当前浏览器不允许读取剪贴板");
      return navigator.clipboard.readText();
    },
    async writeText(text) {
      if (!navigator.clipboard?.writeText) throw new Error("当前浏览器不允许写入剪贴板");
      await navigator.clipboard.writeText(text);
    },
  },
};
