import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { App } from "../src/app/App";

function json(data: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  }));
}

const languageCourse = {
  id: 2,
  title: "我的英语",
  description: "日常英语训练",
  is_default: 1,
  course_type: "language",
  target_language_tag: "en-US",
  native_language_tag: "zh-CN",
  proficiency_level: "intermediate",
  daily_word_goal: 10,
  pronunciation_scheme: "ipa",
  romanization_enabled: true,
  training_focus: ["reading", "listening", "speaking", "writing"],
};

const overview = {
  course_id: 2,
  target_language_tag: "en-US",
  native_language_tag: "zh-CN",
  proficiency_level: "intermediate",
  daily_word_goal: 10,
  pronunciation_scheme: "ipa",
  romanization_enabled: true,
  training_focus: ["reading", "listening", "speaking", "writing"],
  total_vocabulary: 0,
  due_vocabulary: 0,
  reviewed_today: 0,
  streak_days: 0,
  due_word: null,
  practice_counts: { reading: 0, listening: 0, speaking: 0, writing: 0 },
};

beforeEach(() => {
  window.history.replaceState({}, "", "/courses/2/home");
  (window as any).studypilot = {
    runtime: vi.fn().mockResolvedValue({ apiBase: "http://127.0.0.1:9000", dataDir: "C:/Study/data" }),
    window: { minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() },
    files: { chooseDocuments: vi.fn().mockResolvedValue([]) },
    fonts: { list: vi.fn().mockResolvedValue([]) },
    clipboard: { readText: vi.fn().mockResolvedValue("") },
  };
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return json({ onboarding_complete: true, theme: "dark", startup_destination: "last_course", active_course: 2 });
    if (url.endsWith("/api/courses")) return json([languageCourse]);
    if (url.endsWith("/api/system/status")) return json({ status: "ready", active_course: 2 });
    if (url.endsWith("/api/today")) return json({ week: { week: 1, tasks: [], deliverables: [] }, phase: { title: languageCourse.title, gate: "G1" }, tasks: [] });
    if (url.endsWith("/api/courses/2/language/overview")) return json(overview);
    if (url.includes("/api/vocabulary?course_id=2")) return json([]);
    if (url.endsWith("/api/courses/2/notebooks")) return json([]);
    return json([]);
  }));
});

test("a language course enters its independent UI and navigates to real language pages", async () => {
  render(<App />);

  expect(await screen.findByRole("heading", { name: "今天学什么" })).toBeVisible();
  expect(screen.getByRole("navigation", { name: "语言课程导航" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "学习路线" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "知识网络" })).not.toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).endsWith("/api/courses/2/home"))).toBe(false);
  expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).endsWith("/api/courses/2/notebooks"))).toBe(false);

  await userEvent.click(screen.getByRole("button", { name: "今日训练" }));
  await waitFor(() => expect(window.location.pathname).toBe("/courses/2/practice"));
  expect(await screen.findByRole("heading", { name: "今日训练" })).toBeVisible();

  await userEvent.click(screen.getByRole("button", { name: "词汇本" }));
  await waitFor(() => expect(window.location.pathname).toBe("/courses/2/vocabulary"));
  expect(await screen.findByRole("heading", { name: "词汇本" })).toBeVisible();
});
