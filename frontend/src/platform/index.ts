import { tauriPlatform } from "./tauri";
import { tauriMobilePlatform } from "./tauri-mobile";
import type { PlatformCapabilities } from "./types";
import { webPlatform } from "./web";

export type { PlatformCapabilities, PlatformKind, RuntimeConfig } from "./types";

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isTauriMobile() {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function platform(): PlatformCapabilities {
  if (typeof window !== "undefined") {
    const testPlatform = (window as Window & {
      __STUDYPILOT_TEST_PLATFORM__?: PlatformCapabilities;
    }).__STUDYPILOT_TEST_PLATFORM__;
    if (import.meta.env.MODE === "test" && testPlatform) return testPlatform;
  }
  if (isTauri()) return isTauriMobile() ? tauriMobilePlatform : tauriPlatform;
  return webPlatform;
}
