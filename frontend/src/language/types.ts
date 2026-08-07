import type { VocabularyItem } from "../agent/types";
import type { LanguageProficiency, LanguageTrainingFocus } from "../types";

export type LanguagePracticeType = LanguageTrainingFocus;

export interface LanguageOverview {
  course_id: number;
  target_language_tag: string;
  native_language_tag: string;
  proficiency_level: LanguageProficiency;
  daily_word_goal: number;
  pronunciation_scheme: string;
  romanization_enabled: boolean;
  training_focus: LanguageTrainingFocus[];
  lesson_minutes: number;
  speech_rate: number;
  auto_play_audio: boolean;
  total_vocabulary: number;
  due_vocabulary: number;
  reviewed_today: number;
  streak_days: number;
  due_word: VocabularyItem | null;
  practice_counts: Record<LanguagePracticeType, number>;
}

export interface LanguagePracticeSession {
  id: number;
  course_id: number;
  practice_type: LanguagePracticeType;
  vocabulary_item_id?: number | null;
  term?: string | null;
  prompt: string;
  answer: string;
  result: "pending" | "correct" | "incorrect" | "self_reviewed";
  feedback: string;
  duration_seconds: number;
  started_at: string;
  completed_at?: string | null;
}

export interface LanguagePhrase {
  term: string;
  pronunciation: string;
  meaning: string;
  example: string;
}

export interface LanguageDialogueLine {
  speaker: string;
  text: string;
  translation: string;
}

export interface LanguageLesson {
  id: string;
  order: number;
  stage_id: string;
  unit_id: string;
  lesson_type: "discover" | "practice" | "mission" | "checkpoint";
  support_level: "full" | "guided" | "minimal";
  mastery_threshold: number;
  level: string;
  title: string;
  scenario: string;
  can_do: string;
  estimated_minutes: number;
  status?: "current" | "completed" | "locked";
  phrases: LanguagePhrase[];
  dialogue: LanguageDialogueLine[];
  passage: { title: string; text: string; translation: string };
  listening: {
    prompt: string;
    text: string;
    answer: string;
    choices: string[];
  };
  shadowing: { text: string; translation: string };
  output: { prompt: string; scaffold: string[] };
  culture_note: string;
}

export interface LanguageJourneyLessonSummary {
  id: string;
  order: number;
  title: string;
  scenario: string;
  can_do: string;
  estimated_minutes: number;
  status: "current" | "completed" | "locked";
  best_score: number;
  attempts: number;
  unit_id: string;
  lesson_type: "discover" | "practice" | "mission" | "checkpoint";
  support_level: "full" | "guided" | "minimal";
  mastery_threshold: number;
}

export interface LanguageJourneyStage {
  id: string;
  level: string;
  title: string;
  can_do: string;
  lessons: LanguageJourneyLessonSummary[];
  status: "locked" | "current" | "completed";
  completed_lessons: number;
  total_lessons: number;
  checkpoint: LanguageJourneyLessonSummary;
}

export interface LanguageJourney {
  course_id: number;
  pack_id: string;
  pack_version: number;
  language_tag: string;
  language_name: string;
  initialized: boolean;
  stages: LanguageJourneyStage[];
  total_lessons: number;
  completed_lessons: number;
  progress_percent: number;
  current_lesson: LanguageLesson;
  all_complete: boolean;
  course_settings: {
    lesson_minutes: number;
    speech_rate: number;
    auto_play_audio: boolean;
    romanization_enabled: boolean;
  };
}

export interface LanguageMaterialsResponse {
  course_id: number;
  language_tag: string;
  language_name: string;
  total_lessons: number;
  query: string;
  items: LanguageLesson[];
}


export interface LanguagePackSummary {
  id: string;
  version: number;
  language_tag: string;
  name: string;
  script: string;
  pronunciation_scheme: string;
  stage_count: number;
  lesson_count: number;
}
