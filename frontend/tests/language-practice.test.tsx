import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { LanguagePractice } from "../src/language/LanguagePractice";

const course = {
  id: 9,
  title: "我的英语",
  description: "",
  course_type: "language" as const,
  target_language_tag: "en-US",
  native_language_tag: "zh-CN",
  pronunciation_scheme: "ipa",
  daily_word_goal: 10,
};

const word = {
  id: 1,
  course_id: 9,
  language_tag: "en-US",
  term: "curious",
  pronunciation: "/ˈkjʊəriəs/",
  meaning: "好奇的",
  example: "She is curious about the world.",
  source_kind: "document",
  source_id: "3",
  document_id: 3,
  block_key: "paragraph-2",
  locator: { paragraph: 2 },
  interval_days: 0,
  repetitions: 0,
  next_review_at: null,
  last_rating: "",
};

function buildApi() {
  return {
    get: vi.fn().mockImplementation(async (path: string) => {
      if (path.includes("/language/overview")) return { reviewed_today: 2 };
      return [word];
    }),
    post: vi.fn().mockImplementation(async (path: string, payload: Record<string, unknown>) => {
      if (path.includes("/language/practice")) return { id: 11, ...payload };
      return { ...word, repetitions: 1, last_rating: "good" };
    }),
  } as any;
}

class UtteranceStub {
  text: string;
  lang = "";
  rate = 1;
  constructor(text: string) {
    this.text = text;
  }
}

describe("language practice", () => {
  const speak = vi.fn();
  const cancel = vi.fn();

  beforeEach(() => {
    speak.mockReset();
    cancel.mockReset();
    vi.stubGlobal("SpeechSynthesisUtterance", UtteranceStub);
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: { speak, cancel },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;
  });

  test("reading practice reveals meaning and persists self review plus spaced repetition", async () => {
    const api = buildApi();
    render(<LanguagePractice api={api} course={course} initialType="reading" />);

    expect(await screen.findByText("She is curious about the world.")).toBeVisible();
    expect(screen.queryByText("好奇的")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "显示释义" }));
    expect(screen.getByText("好奇的")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "完成阅读" }));
    await userEvent.click(screen.getByRole("button", { name: "记得" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/api/courses/9/language/practice",
      expect.objectContaining({
        practice_type: "reading",
        vocabulary_item_id: 1,
        result: "self_reviewed",
      }),
    ));
    expect(api.post).toHaveBeenCalledWith("/api/vocabulary/1/review", { rating: "good" });
    expect(api.post).toHaveBeenCalledWith("/api/vocabulary/check-in", {
      course_id: 9,
      local_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      reviewed_count: 3,
    });
  });
  test("finishing the due queue continues the same daily plan into a new lesson", async () => {
    const api = buildApi();
    const onContinueLesson = vi.fn();
    render(
      <LanguagePractice
        api={api}
        course={course}
        initialType="reading"
        onContinueLesson={onContinueLesson}
      />,
    );

    await screen.findByText("She is curious about the world.");
    await userEvent.click(screen.getByRole("button", { name: "显示释义" }));
    await userEvent.click(screen.getByRole("button", { name: "完成阅读" }));
    await userEvent.click(screen.getByRole("button", { name: "记得" }));

    expect(await screen.findByText("今天的到期复习已完成")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "继续今日新课" }));
    expect(onContinueLesson).toHaveBeenCalledOnce();
  });


  test("listening practice uses system speech and checks a typed answer", async () => {
    const api = buildApi();
    render(<LanguagePractice api={api} course={course} initialType="listening" />);

    await screen.findByLabelText("听写答案");
    await userEvent.click(screen.getByRole("button", { name: "原速播放" }));
    expect(speak).toHaveBeenCalledOnce();
    expect(speak.mock.calls[0][0]).toMatchObject({ text: "curious", lang: "en-US", rate: 1 });

    await userEvent.type(screen.getByLabelText("听写答案"), "curious");
    await userEvent.click(screen.getByRole("button", { name: "检查答案" }));
    expect(screen.getByText("回答正确")).toBeVisible();
  });

  test("speaking practice degrades honestly when speech recognition is unavailable", async () => {
    const api = buildApi();
    render(<LanguagePractice api={api} course={course} initialType="speaking" />);

    expect(await screen.findByText(/当前系统未提供语音识别/)).toBeVisible();
    expect(screen.queryByText(/发音评分/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "慢速播放" }));
    expect(speak.mock.calls[0][0]).toMatchObject({ text: "curious", rate: 0.65 });
    await userEvent.click(screen.getByRole("button", { name: "完成跟读" }));
    expect(screen.getByRole("button", { name: "记得" })).toBeVisible();
  });

  test("writing practice normalizes whitespace and casing before grading", async () => {
    const api = buildApi();
    render(<LanguagePractice api={api} course={course} initialType="writing" />);

    await userEvent.type(await screen.findByLabelText("拼写答案"), "  CURIOUS  ");
    await userEvent.click(screen.getByRole("button", { name: "检查答案" }));
    expect(screen.getByText("回答正确")).toBeVisible();
  });
});
