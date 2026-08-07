import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { LanguageJourney } from "../src/language/LanguageJourney";

test("journey exposes phase support, stage progress, and an explicit mastery checkpoint", async () => {
  const lesson = (overrides: Record<string, unknown>) => ({
    id: "lesson-1",
    order: 1,
    title: "第一次见面",
    scenario: "问候",
    can_do: "主动问候",
    estimated_minutes: 12,
    status: "current",
    best_score: 0,
    attempts: 0,
    unit_id: "stage-1",
    lesson_type: "discover",
    support_level: "full",
    mastery_threshold: 80,
    ...overrides,
  });
  const checkpoint = lesson({
    id: "checkpoint-1",
    order: 7,
    title: "生存开口关卡",
    lesson_type: "checkpoint",
    support_level: "minimal",
    status: "locked",
    mastery_threshold: 85,
    estimated_minutes: 18,
  });
  const api = {
    get: vi.fn().mockResolvedValue({
      language_name: "英语",
      progress_percent: 0,
      completed_lessons: 0,
      total_lessons: 42,
      all_complete: false,
      stages: [{
        id: "stage-1",
        level: "Pre-A1",
        title: "生存开口",
        can_do: "完成问候和简单自我介绍",
        status: "current",
        completed_lessons: 0,
        total_lessons: 7,
        checkpoint,
        lessons: [
          lesson({}),
          lesson({
            id: "lesson-2",
            order: 2,
            title: "第一次见面 · 强化",
            status: "locked",
            lesson_type: "practice",
            support_level: "guided",
            estimated_minutes: 15,
          }),
          checkpoint,
        ],
      }],
    }),
  } as any;

  render(<LanguageJourney api={api} courseId={9} onStart={vi.fn()} />);

  expect(await screen.findByText("本阶段 0 / 7")).toBeVisible();
  expect(screen.getByText("认识 · 完整引导")).toBeVisible();
  expect(screen.getByText("强化 · 半引导")).toBeVisible();
  expect(screen.getByText("阶段关卡 · 85 分达标")).toBeVisible();
  expect(screen.getByRole("button", { name: /生存开口关卡/ })).toBeDisabled();
});
