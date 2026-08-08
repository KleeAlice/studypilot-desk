export type PlatformKind = "web" | "tauri" | "tauri-mobile";

export interface RuntimeConfig {
  apiBase: string;
  dataDir: string;
  platform: PlatformKind;
  sessionToken?: string;
}

export interface SaveArtifactRequest {
  suggestedName: string;
  bytes: Uint8Array;
}

/**
 * The only platform seam available to renderer business code.
 * Implementations hide browser and Tauri details.
 */
export interface PlatformCapabilities {
  readonly kind: PlatformKind;
  runtime(): Promise<RuntimeConfig>;
  window: {
    readonly controlsAvailable: boolean;
    minimize(): Promise<void>;
    toggleMaximize(): Promise<boolean>;
    close(): Promise<void>;
  };
  files: {
    sourceCreatedAt(file: File): Promise<string | null>;
    saveExport(request: SaveArtifactRequest): Promise<string | null>;
    getExportDirectory(): Promise<string>;
    chooseExportDirectory(): Promise<string | null>;
    resetExportDirectory(): Promise<string>;
    saveToArchive(request: SaveArtifactRequest): Promise<string | null>;
    canOpenExportDirectory: boolean;
    openExportDirectory(): Promise<void>;
  };
  fonts: { list(): Promise<string[]> };
  appearance: { setZoomFactor(factor: number): Promise<void> };
  captureWindow?: () => Promise<Uint8Array | null>;
  clipboard: {
    readText(): Promise<string>;
    writeText(text: string): Promise<void>;
    readImage?(): Promise<Uint8Array | null>;
  };
}
