export type DocumentFormat = "pdf" | "docx" | "markdown" | "text" | "csv" | "xlsx" | "pptx" | "ipynb";

export interface DocumentItem {
  id: number;
  title: string;
  filename: string;
  body: string;
  format: DocumentFormat;
  status: "processing" | "ready" | "failed";
  metadata: Record<string, unknown>;
  structure: Record<string, unknown>;
  deleted_at?: string | null;
  source_created_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SearchItem {
  document_id: number;
  title: string;
  filename: string;
  snippet: string;
}

export type DocumentLocator = Record<string, string | number | boolean | null>;

export interface DocumentBlock {
  id: number;
  document_id: number;
  block_key: string;
  block_type: string;
  ordinal: number;
  locator: DocumentLocator;
  text: string;
  data: Record<string, any>;
}

export interface DocumentContent {
  document: DocumentItem;
  blocks: DocumentBlock[];
}

export interface DocumentAnnotation {
  id: number;
  document_id: number;
  block_key: string;
  kind: "highlight" | "note" | "tag" | "pen" | "marker" | "rectangle" | "ellipse";
  locator: DocumentLocator;
  quote: string;
  note: string;
  color: string;
  geometry: Record<string, any>;
  revision: number;
}

export type ImportState = "queued" | "uploading" | "done" | "error";

export interface ImportQueueItem {
  id: string;
  file: File;
  state: ImportState;
  message: string;
}
