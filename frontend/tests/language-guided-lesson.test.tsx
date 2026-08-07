import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { guidedLessonScore, GuidedLanguageLesson } from "../src/language/GuidedLanguageLesson";

test("active output quality affects mastery instead of every click-through scoring 100", () => {
  expect(guidedLessonScore({
    lessonType: "discover",
    listeningCorrect: true,
    shadowed: true,
    output: "Hi",
  })).toBeLessThan(80);
  expect(guidedLessonScore({
    lessonType: "checkpoint",
    listeningCorrect: true,
    shadowed: true,
    output: "I can greet people and introduce myself",
  })).toBeLessThan(85);
  expect(guidedLessonScore({
    lessonType: "checkpoint",
    listeningCorrect: true,
    shadowed: true,
    output: "Hello my name is Lin and I am from Guangzhou I study English every day",
  })).toBe(100);
});

const lesson = {
  id: "en-foundation-greeting",
  order: 1,
  stage_id: "foundation",
  level: "Pre-A1",
  title: "问候与声音",
  unit_id: "en-foundation-greeting",
  lesson_type: "discover",
  support_level: "full",
  mastery_threshold: 80,
  scenario: "greeting",
  can_do: "能自然地打招呼、回应并结束一次简短问候。",
  estimated_minutes: 15,
  status: "current",
  phrases: [
    { term: "Hi, how are you?", pronunciation: "/haɪ/", meaning: "嗨，你好吗？", example: "Hi, how are you today?" },
    { term: "I'm good, thanks.", pronunciation: "/ɡʊd/", meaning: "我很好，谢谢。", example: "I'm good, thanks." },
    { term: "See you later.", pronunciation: "/ˈleɪtər/", meaning: "回头见。", example: "See you later." },
  ],
  dialogue: [
    { speaker: "A", text: "Hi, how are you?", translation: "嗨，你好吗？" },
    { speaker: "B", text: "I'm good, thanks.", translation: "我很好，谢谢。" },
  ],
  passage: { title: "A quick hello", text: "Maya says hello before class.", translation: "Maya 在上课前问好。" },
  listening: {
    prompt: "选择你听到的表达",
    text: "I'm good, thanks.",
    answer: "I'm good, thanks.",
    choices: ["Hi, how are you?", "I'm good, thanks.", "See you later."],
  },
  shadowing: { text: "Hi, how are you today?", translation: "嗨，你今天好吗？" },
  output: { prompt: "完成一次自己的问候。", scaffold: ["Hi", "I'm good", "See you"] },
  culture_note: "英语日常问候通常很简短。",
};

const journey = {
  course_id: 9,
  pack_id: "builtin-en",
  pack_version: 1,
  language_tag: "en-US",
  language_name: "英语",
  initialized: true,
  stages: [],
  total_lessons: 42,
  completed_lessons: 0,
  progress_percent: 0,
  current_lesson: lesson,
  course_settings: {
    lesson_minutes: 15,
    speech_rate: 1,
    auto_play_audio: false,
    romanization_enabled: false,
  },
};

test("one click starts a complete guided lesson and records completion", async () => {
  const api = {
    post: vi.fn().mockImplementation(async (path: string) => {
      if (path.endsWith("/language/start")) return journey;
      return {
        completed: { lesson_id: lesson.id, status: "completed", best_score: 100 },
        journey: { ...journey, completed_lessons: 1, progress_percent: 8 },
        mastered: true,
      };
    }),
  } as any;

  render(
    <GuidedLanguageLesson
      api={api}
      courseId={9}
      targetLanguageTag="en-US"
      onOpenJourney={vi.fn()}
    />,
  );

  expect(await screen.findByRole("heading", { name: "问候与声音" })).toBeVisible();
  expect(api.post).toHaveBeenCalledWith("/api/courses/9/language/start");

  await userEvent.click(screen.getByRole("button", { name: "开始热身" }));
  expect(screen.getByText("Hi, how are you?")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "进入情境" }));
  expect(screen.getByRole("heading", { name: "A quick hello" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "开始听辨" }));
  await userEvent.click(screen.getByRole("button", { name: "I'm good, thanks." }));
  await userEvent.click(screen.getByRole("button", { name: "进入跟读" }));
  await userEvent.click(screen.getByRole("button", { name: "完成跟读" }));
  await userEvent.click(screen.getByRole("button", { name: "开始表达" }));
  await userEvent.type(screen.getByLabelText("我的表达"), "Hi, I'm good. See you later.");
  await userEvent.click(screen.getByRole("button", { name: "查看本课总结" }));
  await userEvent.click(screen.getByRole("button", { name: "完成本课" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/courses/9/language/lessons/en-foundation-greeting/complete",
    expect.objectContaining({
      score: 100,
      activity_results: expect.arrayContaining([
        expect.objectContaining({ activity: "listening", result: "correct" }),
        expect.objectContaining({ activity: "speaking", result: "self_reviewed" }),
      ]),
    }),
  ));
  expect(await screen.findByRole("heading", { name: "本课已完成" })).toBeVisible();
  expect(screen.queryByText("setRequiredRetryScore(null);")).not.toBeInTheDocument();
});

test("an incorrect listening answer cannot advance to shadowing", async () => {
  const api = {
    post: vi.fn().mockResolvedValue(journey),
  } as any;

  render(
    <GuidedLanguageLesson
      api={api}
      courseId={9}
      targetLanguageTag="en-US"
      onOpenJourney={vi.fn()}
    />,
  );

  await screen.findByRole("heading", { name: "问候与声音" });
  await userEvent.click(screen.getByRole("button", { name: "开始热身" }));
  await userEvent.click(screen.getByRole("button", { name: "进入情境" }));
  await userEvent.click(screen.getByRole("button", { name: "开始听辨" }));
  await userEvent.click(screen.getByRole("button", { name: "Hi, how are you?" }));

  expect(screen.getByText(/再听一次/)).toBeVisible();
  expect(screen.getByRole("button", { name: "进入跟读" })).toBeDisabled();
});

test("a non-mastered completion keeps the lesson and offers a retry", async () => {
  const api = {
    post: vi.fn().mockImplementation(async (path: string) => {
      if (path.endsWith("/language/start")) return journey;
      return {
        mastered: false,
        required_score: 80,
        completed: {
          lesson_id: lesson.id,
          status: "started",
          best_score: 79,
          attempts: 1,
        },
        journey,
      };
    }),
  } as any;

  render(
    <GuidedLanguageLesson
      api={api}
      courseId={9}
      targetLanguageTag="en-US"
      onOpenJourney={vi.fn()}
    />,
  );

  await screen.findByRole("heading", { name: "问候与声音" });
  await userEvent.click(screen.getByRole("button", { name: "开始热身" }));
  await userEvent.click(screen.getByRole("button", { name: "进入情境" }));
  await userEvent.click(screen.getByRole("button", { name: "开始听辨" }));
  await userEvent.click(screen.getByRole("button", { name: "I'm good, thanks." }));
  await userEvent.click(screen.getByRole("button", { name: "进入跟读" }));
  await userEvent.click(screen.getByRole("button", { name: "完成跟读" }));
  await userEvent.click(screen.getByRole("button", { name: "开始表达" }));
  await userEvent.type(
    screen.getByLabelText("我的表达"),
    "Hi, I'm good. See you later.",
  );
  await userEvent.click(screen.getByRole("button", { name: "查看本课总结" }));
  await userEvent.click(screen.getByRole("button", { name: "完成本课" }));

  expect(await screen.findByRole("heading", { name: "还差一点掌握本课" })).toBeVisible();
  expect(screen.getByText("本课需要达到 80 分并完成听辨、跟读和表达。")).toBeVisible();
  expect(screen.getByRole("button", { name: "重新练习本课" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "本课已完成" })).not.toBeInTheDocument();
});
