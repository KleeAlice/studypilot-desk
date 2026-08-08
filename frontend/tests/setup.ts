import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

type LegacyTestBridge = Record<string, any>;

function platformForTestBridge(bridge: LegacyTestBridge) {
  return {
    kind: "tauri" as const,
    runtime: async () => ({
      apiBase: bridge.runtime ? (await bridge.runtime()).apiBase : "http://localhost:3000",
      dataDir: bridge.runtime ? (await bridge.runtime()).dataDir : "测试数据",
      platform: "tauri" as const,
      sessionToken: bridge.runtime ? (await bridge.runtime()).sessionToken : undefined,
    }),
    window: {
      controlsAvailable: true,
      minimize: async () => bridge.window?.minimize?.(),
      toggleMaximize: async () => bridge.window?.toggleMaximize?.() ?? false,
      close: async () => bridge.window?.close?.(),
    },
    files: {
      sourceCreatedAt: async (file: File) => file.lastModified ? new Date(file.lastModified).toISOString() : null,
      saveExport: async (request: any) => bridge.files?.saveExport?.(request) ?? null,
      getExportDirectory: async () => bridge.files?.getExportDirectory?.() ?? "测试导出目录",
      chooseExportDirectory: async () => bridge.files?.chooseExportDirectory?.() ?? null,
      resetExportDirectory: async () => bridge.files?.resetExportDirectory?.() ?? "测试导出目录",
      saveToArchive: async (request: any) => bridge.files?.saveToArchive?.(request) ?? null,
      canOpenExportDirectory: Boolean(bridge.files?.openExportDirectory),
      openExportDirectory: async () => bridge.files?.openExportDirectory?.(),
    },
    fonts: { list: async () => bridge.fonts?.list?.() ?? [] },
    appearance: { setZoomFactor: async (factor: number) => bridge.appearance?.setZoomFactor?.(factor) },
    captureWindow: bridge.capture?.window ? async () => bridge.capture.window() : undefined,
    clipboard: {
      readText: async () => bridge.clipboard?.readText?.() ?? "",
      writeText: async (text: string) => bridge.clipboard?.writeText?.(text),
      readImage: bridge.clipboard?.readImage ? async () => bridge.clipboard.readImage() : undefined,
    },
  };
}

if (typeof window !== "undefined") {
  let testBridge: LegacyTestBridge = {};
  Object.defineProperty(window, "studypilot", {
    configurable: true,
    get: () => testBridge,
    set: (value: LegacyTestBridge) => {
      testBridge = value || {};
      (window as any).__STUDYPILOT_TEST_PLATFORM__ = platformForTestBridge(testBridge);
    },
  });

  if (!("PointerEvent" in window)) {
    Object.defineProperty(window, "PointerEvent", { value: MouseEvent, configurable: true });
  }

  if (!("setPointerCapture" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { value: () => undefined, configurable: true });
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { value: () => undefined, configurable: true });
  }
}

afterEach(() => {
  if (typeof document !== "undefined") cleanup();
});
