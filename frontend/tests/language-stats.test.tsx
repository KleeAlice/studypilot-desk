import { render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { LanguageStats } from "../src/language/LanguageStats";

test("language stats combines persistent overview and practice sessions", async () => {
  const api = {
    get: vi.fn().mockImplementation(async (path: string) => {
      if (path.includes("/overview")) {
        return {
          total_vocabulary: 48,
          due_vocabulary: 6,
          reviewed_today: 8,
          streak_days: 5,
          practice_counts: { reading: 12, listening: 7, speaking: 3, writing: 4 },
        };
      }
      if (path.includes("/journey")) {
        return {
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
            checkpoint: {
              id: "checkpoint-1",
              order: 7,
              title: "生存开口关卡",
              can_do: "独立完成初次见面任务",
              estimated_minutes: 18,
              status: "locked",
              best_score: 0,
              attempts: 0,
              unit_id: "stage-1",
              lesson_type: "checkpoint",
              support_level: "minimal",
              mastery_threshold: 85,
            },
            lessons: [],
          }],
        };
      }
      return [
        {
          id: 1,
          practice_type: "listening",
          term: "curious",
          result: "correct",
          feedback: "回答正确",
          duration_seconds: 18,
          started_at: "2026-07-26T10:00:00Z",
        },
      ];
    }),
  } as any;

  render(<LanguageStats api={api} courseId={9} courseTitle="我的英语" />);

  expect(await screen.findByText("连续 5 天")).toBeVisible();
  expect(screen.getByText("48")).toBeVisible();
  expect(screen.getByText("阅读 12 次")).toBeVisible();
  expect(screen.getByText("curious")).toBeVisible();
  expect(screen.getByText("当前阶段 Pre-A1")).toBeVisible();
  expect(screen.getByText("0 / 7")).toBeVisible();
  expect(screen.getByText("关卡 85 分")).toBeVisible();
  await waitFor(() => {
    expect(api.get).toHaveBeenCalledWith("/api/courses/9/language/overview");
    expect(api.get).toHaveBeenCalledWith("/api/courses/9/language/sessions?limit=80");
    expect(api.get).toHaveBeenCalledWith("/api/courses/9/language/journey");
  });
});
