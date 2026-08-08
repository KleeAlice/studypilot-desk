import type { PlatformCapabilities, RuntimeConfig, SaveArtifactRequest } from "./types";

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(command, args);
}

function artifactArgs(request: SaveArtifactRequest) {
  return { request: { suggestedName: request.suggestedName, bytes: Array.from(request.bytes) } };
}

export const tauriPlatform: PlatformCapabilities = {
  kind: "tauri",
  async runtime() { return invoke<RuntimeConfig>("runtime_config"); },
  window: {
    controlsAvailable: true,
    async minimize() { await invoke("window_minimize"); },
    async toggleMaximize() { return invoke<boolean>("window_toggle_maximize"); },
    async close() { await invoke("window_close"); },
  },
  files: {
    async sourceCreatedAt(file) {
      return file.lastModified > 0 ? new Date(file.lastModified).toISOString() : null;
    },
    async saveExport(request) { return invoke<string | null>("save_export", artifactArgs(request)); },
    async getExportDirectory() { return invoke<string>("export_directory"); },
    async chooseExportDirectory() { return invoke<string | null>("choose_export_directory"); },
    async resetExportDirectory() { return invoke<string>("reset_export_directory"); },
    async saveToArchive(request) { return invoke<string | null>("save_to_archive", artifactArgs(request)); },
    canOpenExportDirectory: true,
    async openExportDirectory() { await invoke("open_export_directory"); },
  },
  fonts: { async list() { return invoke<string[]>("list_system_fonts"); } },
  appearance: { async setZoomFactor(factor) { await invoke("set_zoom_factor", { factor }); } },
  clipboard: {
    async readText() { return invoke<string>("clipboard_read_text"); },
    async writeText(text) { await invoke("clipboard_write_text", { text }); },
  },
};
