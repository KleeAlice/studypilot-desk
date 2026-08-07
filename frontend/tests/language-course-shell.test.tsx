import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { LanguageCourseShell } from "../src/language/LanguageCourseShell";
import type { Course } from "../src/types";


const course: Course = {
  id: 9,
  title: "我的英语",
  description: "独立语言课程",
  course_type: "language" as const,
  target_language_tag: "en-US",
  native_language_tag: "zh-CN",
  proficiency_level: "beginner" as const,
  daily_word_goal: 10,
  pronunciation_scheme: "ipa",
  romanization_enabled: false,
  training_focus: ["reading", "listening", "speaking", "writing"],
};

test("language courses use a dedicated navigation and never show knowledge-course modules", async () => {
  const onNavigate = vi.fn();
  const onBack = vi.fn();
  render(
    <LanguageCourseShell
      course={course}
      activeView="home"
      onNavigate={onNavigate}
      onBackToLibrary={onBack}
    >
      <div>语言课程概览</div>
    </LanguageCourseShell>,
  );

  expect(screen.getByRole("navigation", { name: "语言课程导航" })).toBeVisible();
  for (const label of ["今日", "学习路径", "今日训练", "词汇本", "课程资料", "成长记录", "设置"]) {
    expect(screen.getByRole("button", { name: label })).toBeVisible();
  }
  expect(screen.queryByRole("button", { name: "学习路线" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "知识网络" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Python 实验室" })).not.toBeInTheDocument();
  expect(screen.getByText("语言课程概览")).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "今日训练" }));
  expect(onNavigate).toHaveBeenCalledWith("practice");
  await userEvent.click(screen.getByRole("button", { name: "返回课程书架" }));
  expect(onBack).toHaveBeenCalledOnce();
});
