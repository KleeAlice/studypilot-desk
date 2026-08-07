import type { ReactNode } from "react";
import type { Course } from "../types";
import { LanguageNavRail, type LanguageCourseView } from "./LanguageNavRail";

const languageNames: Record<string, string> = {
  "yue-Hant-HK": "粤语",
  "en-US": "英语",
  "fr-FR": "法语",
  "ja-JP": "日语",
  "ko-KR": "韩语",
};

export function languageName(tag?: string): string {
  return languageNames[tag || ""] || tag || "语言学习";
}

export function LanguageCourseShell({
  course,
  activeView,
  onNavigate,
  onBackToLibrary,
  children,
}: {
  course: Course;
  activeView: LanguageCourseView;
  onNavigate: (view: LanguageCourseView) => void;
  onBackToLibrary: () => void;
  children: ReactNode;
}) {
  const targetLanguage = languageName(course.target_language_tag);
  return (
    <div className="language-course-shell" data-course-type="language">
      <LanguageNavRail
        active={activeView}
        courseTitle={course.title}
        languageLabel={targetLanguage}
        onNavigate={onNavigate}
        onBackToLibrary={onBackToLibrary}
      />
      <main className="language-course-main">
        <header className="language-course-context">
          <div>
            <span className="language-course-context__mark" aria-hidden="true">
              {targetLanguage.slice(0, 1)}
            </span>
            <div>
              <strong>{course.title}</strong>
              <small>{targetLanguage} · {course.proficiency_level || "beginner"}</small>
            </div>
          </div>
          <span className="language-course-context__goal">
            每日 {course.daily_word_goal || 10} 词
          </span>
        </header>
        <div className="language-course-scroll">{children}</div>
      </main>
    </div>
  );
}
