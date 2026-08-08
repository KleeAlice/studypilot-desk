export type CourseType = "knowledge" | "language";
export type LanguageProficiency = "beginner" | "elementary" | "intermediate" | "advanced";
export type LanguageTrainingFocus = "reading" | "listening" | "speaking" | "writing";

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
  course_type?: CourseType;
  target_language_tag?: string;
  native_language_tag?: string;
  proficiency_level?: LanguageProficiency;
  daily_word_goal?: number;
  pronunciation_scheme?: string;
  romanization_enabled?: boolean;
  training_focus?: LanguageTrainingFocus[];
  lesson_minutes?: number;
  speech_rate?: number;
  auto_play_audio?: boolean;
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
  course_type: CourseType;
  target_language_tag: string;
  native_language_tag: string;
  proficiency_level: LanguageProficiency;
  daily_word_goal: number;
  pronunciation_scheme: string;
  romanization_enabled: boolean;
  training_focus: LanguageTrainingFocus[];
  lesson_minutes?: number;
  speech_rate?: number;
  auto_play_audio?: boolean;
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
  source_block_key?: string;
  source_locator?: Record<string, string | number | boolean | null>;
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


export interface RoadmapGenerationMeta {
  id: number;
  provider_id: string;
  model: string;
  status: "generating" | "completed" | "failed";
  request: {
    start_date?: string | null;
    target_weeks?: number;
    weekly_hours?: number;
    document_ids?: number[];
    history_message_count?: number;
  };
  error: string;
  created_at: string;
  completed_at?: string | null;
}

export interface CourseRoadmap {
  course_id: number;
  phases: PhaseData[];
  weeks: WeekData[];
  generation?: RoadmapGenerationMeta | null;
}

export interface RoadmapGenerationRequest {
  provider_id: string;
  start_date: string | null;
  target_weeks: number;
  weekly_hours: number;
  planning_goal: string;
  document_ids: number[];
}

export interface RoadmapGenerationResult {
  roadmap: CourseRoadmap;
  trace: {
    schema: string;
    outcome: "valid" | "repaired";
    provider_id: string;
    model: string;
    history_message_count: number;
    document_ids: number[];
    fields: Array<{
      key: string;
      status: "ready";
    }>;
  };
}
export interface TodayData {
  week: WeekData;
  phase: PhaseData;
  tasks: Array<Record<string, any>>;
}
