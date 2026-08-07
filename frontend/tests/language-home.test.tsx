import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { LanguageHome } from "../src/language/LanguageHome";


test("language home renders persisted daily progress and all four practice entry points", async () => {
  const onStartPractice = vi.fn();
  const onStartLesson = vi.fn();
  const onOpenVocabulary = vi.fn();
  const onOpenLibrary = vi.fn();
  const api = {
    get: vi.fn().mockResolvedValue({
      course_id: 9,
      target_language_tag: "en-US",
      native_language_tag: "zh-CN",
      proficiency_level: "beginner",
      daily_word_goal: 10,
      pronunciation_scheme: "ipa",
      romanization_enabled: false,
      training_focus: ["reading", "listening", "speaking", "writing"],
      total_vocabulary: 24,
      due_vocabulary: 4,
      reviewed_today: 3,
      streak_days: 7,
      due_word: {
        id: 2,
        course_id: 9,
        language_tag: "en-US",
        term: "curious",
        pronunciation: "/ˈkjʊəriəs/",
        meaning: "好奇的",
        example: "She is curious about the new language.",
        source_kind: "",
        source_id: "",
        document_id: null,
        block_key: "",
        locator: {},
        interval_days: 0,
        repetitions: 0,
        ease_factor: 2.5,
        next_review_at: null,
        last_rating: "",
      },
      practice_counts: { reading: 5, listening: 3, speaking: 2, writing: 4 },
    }),
  } as any;

  render(
    <LanguageHome
      api={api}
      courseId={9}
      courseTitle="我的英语"
      onStartPractice={onStartPractice}
      onStartLesson={onStartLesson}
      onOpenVocabulary={onOpenVocabulary}
      onOpenLibrary={onOpenLibrary}
    />,
  );

  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/api/courses/9/language/overview"));
  expect(screen.getByRole("heading", { name: "今天学什么" })).toBeVisible();
  expect(screen.getByText("3 / 10")).toBeVisible();
  expect(screen.getByText("4 个待复习")).toBeVisible();
  expect(screen.getByText("连续 7 天")).toBeVisible();
  expect(screen.getByRole("heading", { name: "curious" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "一键开始学习" }));
  expect(onStartPractice).toHaveBeenLastCalledWith("reading");
  expect(onStartLesson).not.toHaveBeenCalled();


  for (const [label, mode] of [
    ["开始阅读训练", "reading"],
    ["开始听力训练", "listening"],
    ["开始跟读训练", "speaking"],
    ["开始拼写训练", "writing"],
  ] as const) {
    await userEvent.click(screen.getByRole("button", { name: label }));
    expect(onStartPractice).toHaveBeenLastCalledWith(mode);
  }
});

test("a completed C1 path shows graduation instead of reopening the final lesson", async () => {
  const onStartLesson = vi.fn();
  const onOpenJourney = vi.fn();
  const api = {
    get: vi.fn().mockImplementation(async (path: string) => {
      if (path.endsWith("/overview")) {
        return {
          daily_word_goal: 10,
          total_vocabulary: 126,
          due_vocabulary: 0,
          reviewed_today: 10,
          streak_days: 42,
          due_word: null,
          practice_counts: { reading: 20, listening: 18, speaking: 16, writing: 14 },
        };
      }
      return {
        language_name: "英语",
        progress_percent: 100,
        completed_lessons: 42,
        total_lessons: 42,
        all_complete: true,
        current_lesson: {
          id: "final",
          order: 42,
          level: "C1",
          title: "成熟运用 · 阶段关卡",
          can_do: "能根据关系和语境自然表达",
        },
        course_settings: {
          lesson_minutes: 15,
          speech_rate: 1,
          auto_play_audio: false,
          romanization_enabled: false,
        },
      };
    }),
  } as any;

  render(
    <LanguageHome
      api={api}
      courseId={9}
      courseTitle="我的英语"
      onStartPractice={vi.fn()}
      onStartLesson={onStartLesson}
      onOpenJourney={onOpenJourney}
      onOpenVocabulary={vi.fn()}
      onOpenLibrary={vi.fn()}
    />,
  );

  expect(await screen.findByRole("heading", { name: "内置 C1 路径已完成" })).toBeVisible();
  expect(screen.getByText("42 / 42 课")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "查看毕业成果" }));
  expect(onOpenJourney).toHaveBeenCalledOnce();
  expect(onStartLesson).not.toHaveBeenCalled();
});
