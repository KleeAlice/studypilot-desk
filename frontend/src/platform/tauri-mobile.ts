import type { PlatformCapabilities } from "./types";
import { tauriPlatform } from "./tauri";

/**
 * Mobile uses the same command transport as desktop but intentionally omits
 * desktop window and directory affordances. Its backend is a configured
 * remote API, never the desktop-only Python sidecar.
 */
export const tauriMobilePlatform: PlatformCapabilities = {
  ...tauriPlatform,
  kind: "tauri-mobile",
  window: {
    controlsAvailable: false,
    async minimize() {},
    async toggleMaximize() { return false; },
    async close() {},
  },
  files: {
    ...tauriPlatform.files,
    canOpenExportDirectory: false,
    async openExportDirectory() {},
  },
};
