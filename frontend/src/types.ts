export interface DesktopRuntime {
  apiBase: string;
  dataDir: string;
}

export interface Course {
  id: number;
  title: string;
  description: string;
  is_default?: number;
  created_at?: string;
  updated_at?: string;
  node_count?: number;
  edge_count?: number;
  cover_style?: string;
  icon?: string;
  goal?: string;
  start_date?: string | null;
  target_weeks?: number | null;
  weekly_hours?: number | null;
  progress?: number;
  last_opened_at?: string | null;
  deleted_at?: string | null;
  purge_after?: string | null;
}

export interface CourseCreateInput {
  title: string;
  description: string;
  cover_style: string;
  icon: string;
  goal: string;
  start_date: string | null;
  target_weeks: number | null;
  weekly_hours: number | null;
}

export interface CanvasSettings {
  width?: number;
  height?: number;
  fontFamily?: string;
  fontScale?: number;
  resizeTextWithCard?: boolean;
}

export interface KnowledgeNotebook {
  id: number;
  course_id: number;
  title: string;
  description: string;
  kind: "canvas" | "mindmap" | "mixed";
  cover_style: string;
  canvas_settings: CanvasSettings;
  node_count?: number;
  edge_count?: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export type KnowledgeNodeKind = "concept" | "sticky_note" | "flashcard" | "citation" | "image";
export type KnowledgeRelation = "prerequisite" | "mindmap" | "association";

export interface KnowledgeNode {
  id: number;
  title: string;
  description?: string;
  module: string;
  mastery: number;
  kind: KnowledgeNodeKind;
  content: string;
  color: string;
  position_x: number | null;
  position_y: number | null;
  width?: number | null;
  height?: number | null;
  font_scale?: number | null;
  source_document_id?: number | null;
  source_title?: string;
  source_quote?: string;
  image_asset_id?: string | null;
  image_alt?: string;
  image_url?: string | null;
}

export interface MediaAsset {
  id: string;
  filename: string;
  media_type: string;
  size_bytes: number;
  url: string;
}

export interface KnowledgeEdge { id: number; source_id: number; target_id: number; relation: KnowledgeRelation }

export interface PythonEnvironment {
  id: string;
  label: string;
  version: string;
  path: string;
  kind: string;
  current: boolean;
}

export interface DesktopBridge {
  runtime(): Promise<DesktopRuntime>;
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<boolean>;
    close(): Promise<void>;
    isMaximized?(): Promise<boolean>;
  };
  files: {
    chooseDocuments(): Promise<string[]>;
    saveExport?(request: { suggestedName: string; bytes: Uint8Array }): Promise<string | null>;
  };
  clipboard: { readText(): Promise<string>; readImage?(): Promise<Uint8Array | null> };
}

declare global {
  interface Window {
    studypilot: DesktopBridge;
  }
}

export interface WeekData {
  week: number;
  phase: number;
  gate: string;
  foundation: string;
  tasks: string[];
  deliverables: string[];
}

export interface PhaseData {
  phase: number;
  title: string;
  gate: string;
  acceptance: string;
  remediation?: string;
  start_week: number;
  end_week: number;
}

export interface TodayData {
  week: WeekData;
  phase: PhaseData;
  tasks: Array<Record<string, any>>;
}
