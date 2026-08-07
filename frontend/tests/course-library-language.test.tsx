import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { CourseLibrary } from "../src/features/CourseLibrary";
import type { Course } from "../src/types";

test("course shelf clearly identifies a language course instead of showing knowledge metrics", () => {
  const languageCourse: Course = {
    id: 9,
    title: "我的英语",
    description: "日常英语",
    course_type: "language",
    target_language_tag: "en-US",
    daily_word_goal: 12,
    cover_style: "cobalt",
  };
  render(<CourseLibrary
    courses={[languageCourse]}
    activeCourseId={languageCourse.id}
    onOpen={vi.fn().mockResolvedValue(undefined)}
    onCreate={vi.fn()}
    onUpdate={vi.fn().mockResolvedValue(undefined)}
    onTrash={vi.fn().mockResolvedValue(undefined)}
    onOpenTrash={vi.fn()}
    onOpenSettings={vi.fn()}
  />);

  expect(screen.getByText("语言学习 · 英语")).toBeVisible();
  expect(screen.getByText("每日 12 词")).toBeVisible();
  expect(screen.queryByText(/知识节点/)).not.toBeInTheDocument();
});
