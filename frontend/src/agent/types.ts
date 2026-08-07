export type AgentProviderProtocol = "openai_compatible" | "anthropic" | "gemini" | "azure_openai";
export type AgentMode = "assistant" | "learning";
export type LearningFeedbackKind = "simpler" | "another_example" | "understood" | "confused";
export type LearningExplanationLength = "short" | "medium" | "long" | "unlimited";

export type VocabularyRating = "again" | "hard" | "good" | "easy";

export interface VocabularyItem {
  id: number;
  course_id: number;
  language_tag: string;
  term: string;
  pronunciation: string;
  meaning: string;
  example: string;
  source_kind: string;
  source_id: string;
  document_id?: number | null;
  block_key: string;
  locator: Record<string, string | number | boolean | null>;
  interval_days: number;
  repetitions: number;
  next_review_at?: string | null;
  last_rating: string;
}

export interface LearningExample {
  concept: string;
  scenario: string;
  analysis: string;
}

export interface LearningPracticeOption {
  id: "A" | "B" | "C" | "D";
  text: string;
}

export interface LearningPathStage {
  title: string;
  objective: string;
  concepts: string[];
}

export interface LearningPath {
  subject: string;
  goal: string;
  stages: LearningPathStage[];
}

export interface LearningPractice {
  concept: string;
  type?: "multiple_choice" | "open";
  question: string;
  options?: LearningPracticeOption[];
  correct_option?: "A" | "B" | "C" | "D" | "";
  reference_answer: string;
}

export interface LearningCard {
  thread_title?: string;
  learning_path?: LearningPath;
  concept: string;
  direct_answer?: string;
  explanation?: string;
  example: LearningExample | string;
  practice?: LearningPractice;
  /** Legacy persisted cards remain readable, but no vocabulary UI is rendered. */
  plain_explanation?: string;
  /** Legacy persisted cards remain readable. */
  question?: string;
}

export interface LearningGenerationTrace {
  schema: string;
  outcome: "valid" | "repaired";
  raw_length?: number;
  fields: Array<{
    key: string;
    status: "pending" | "generating" | "ready";
  }>;
}

export interface AgentMessageMetadata {
  learning_card?: LearningCard;
  lesson_index?: number;
  feedback_kind?: LearningFeedbackKind;
  explanation_length?: LearningExplanationLength;
  source_free?: boolean;
  generation_trace?: LearningGenerationTrace;
}

export interface AgentProvider {
  id: string;
  label: string;
  icon?: string;
  protocol: AgentProviderProtocol;
  base_url: string;
  model: string;
  max_output_tokens: number;
  connect_timeout_seconds: number;
  first_byte_timeout_seconds: number;
  idle_timeout_seconds: number;
  has_api_key: boolean;
  enabled: boolean;
}

export interface AgentSource {
  kind: "page" | "selection" | "document" | "annotation" | "note" | "knowledge" | "knowledge_notebook" | "knowledge_edge";
  id?: number | string;
  title: string;
  document_id?: number | null;
  notebook_id?: number | null;
  node_id?: number | null;
  edge_id?: number | null;
  source_id?: number | null;
  target_id?: number | null;
  block_key?: string;
  locator?: Record<string, string | number | boolean | null>;
  excerpt: string;
  citation?: string;
  location_label?: string;
}

export type AgentActionPlanStatus = "pending" | "executing" | "completed" | "cancelled" | "undone" | "failed";

export interface AgentActionOperation {
  type: "replace_document_block" | "create_knowledge_node" | "update_knowledge_node" | "delete_knowledge_node" | "create_knowledge_edge" | "delete_knowledge_edge";
  description?: string;
  document_id?: number;
  block_key?: string;
  expected_text?: string;
  new_text?: string;
  notebook_id?: number;
  node_id?: number;
  edge_id?: number;
  temp_id?: string;
  title?: string;
  kind?: string;
  source_ref?: number | string;
  target_ref?: number | string;
  relation?: string;
  changes?: Record<string, unknown>;
}

export interface AgentActionPlan {
  id: number;
  thread_id: number;
  assistant_message_id: number;
  course_id: number;
  status: AgentActionPlanStatus;
  title: string;
  summary: string;
  operations: AgentActionOperation[];
  before: Record<string, unknown>;
  result: {
    operation_count?: number;
    affected_document_ids?: number[];
    affected_notebook_ids?: number[];
    created_node_ids?: Record<string, number>;
    created_edge_ids?: number[];
  };
  destructive: boolean;
  error: string;
}

export interface AgentMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources: AgentSource[];
  status: "complete" | "error" | "streaming" | "cancelled";
  error: string;
  attachments?: AgentAttachment[];
  action_plan?: AgentActionPlan | null;
  metadata?: AgentMessageMetadata;
  created_at?: string;
}

export interface AgentAttachment {
  kind: "document" | "image";
  name: string;
  media_type: string;
  document_id?: number;
  image_asset_id?: string;
  url?: string;
}

export interface AgentThread {
  id: number;
  course_id: number;
  title: string;
  provider_id: string;
  model: string;
  mode?: AgentMode;
  pinned?: boolean;
  learning_state?: {
    lesson_index?: number;
    current_concept?: string;
    completed_concepts?: string[];
    learning_path?: LearningPath;
    last_feedback?: LearningFeedbackKind | "";
  };
  message_count?: number;
  messages?: AgentMessage[];
  updated_at?: string;
}

export interface AgentPageContext {
  view: string;
  documentId?: number;
  documentIds?: number[];
  blockKey?: string;
  selectedText?: string;
  locator?: Record<string, string | number | boolean | null>;
  notebookId?: number;
  title?: string;
  languageTag?: string;
  proficiencyLevel?: string;
  sourceFree?: boolean;
  learningTopic?: string;
  learningGoal?: string;
}

export interface AgentRequestedAction {
  id: string;
  prompt: string;
  context: Partial<AgentPageContext>;
}

export interface AgentReply {
  thread: AgentThread;
  message: AgentMessage;
  user_message_id: number;
}
