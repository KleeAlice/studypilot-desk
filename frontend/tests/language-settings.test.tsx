import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { LanguageSettings } from "../src/language/LanguageSettings";

test("language settings are editable and saved through the course API", async () => {
  const course = {
    id: 9,
    title: "我的日语",
    description: "",
    course_type: "language" as const,
    target_language_tag: "ja-JP",
    native_language_tag: "zh-CN",
    proficiency_level: "beginner" as const,
    daily_word_goal: 10,
    lesson_minutes: 15,
    speech_rate: 1,
    auto_play_audio: false,
    pronunciation_scheme: "kana",
    romanization_enabled: false,
    training_focus: ["reading", "listening", "speaking", "writing"] as const,
  };
  const api = {
    patch: vi.fn().mockResolvedValue({
      ...course,
      proficiency_level: "elementary",
      daily_word_goal: 16,
      auto_play_audio: true,
    }),
  } as any;
  let view: ReturnType<typeof render>;
  const onSaved = vi.fn((updated) => {
    view.rerender(<LanguageSettings api={api} course={updated} onSaved={onSaved} />);
  });

  view = render(<LanguageSettings api={api} course={course as any} onSaved={onSaved} />);

  await userEvent.selectOptions(screen.getByLabelText("当前水平"), "elementary");
  await userEvent.clear(screen.getByLabelText("每日词汇目标"));
  await userEvent.type(screen.getByLabelText("每日词汇目标"), "16");
  await userEvent.click(screen.getByLabelText("进入课节时自动朗读"));
  await userEvent.click(screen.getByRole("button", { name: "保存语言设置" }));

  await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
    "/api/courses/9",
    expect.objectContaining({
      proficiency_level: "elementary",
      daily_word_goal: 16,
      auto_play_audio: true,
    }),
  ));
  expect(onSaved).toHaveBeenCalled();
  expect(screen.getByText("设置已保存")).toBeVisible();
});

test("settings resync on course changes and use a real sample for every language", async () => {
  class UtteranceStub {
    lang = "";
    rate = 1;
    constructor(public text: string) {}
  }
  const speak = vi.fn();
  vi.stubGlobal("SpeechSynthesisUtterance", UtteranceStub);
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: { speak, cancel: vi.fn() },
  });
  const base = {
    id: 1,
    title: "Language",
    description: "",
    course_type: "language" as const,
    native_language_tag: "zh-CN",
    proficiency_level: "beginner" as const,
    daily_word_goal: 10,
    lesson_minutes: 15,
    speech_rate: 1,
    auto_play_audio: false,
    pronunciation_scheme: "",
    romanization_enabled: false,
    training_focus: ["reading", "listening", "speaking", "writing"] as const,
  };
  const api = { patch: vi.fn() } as any;
  const samples = [
    ["en-US", "Hello, nice to meet you."],
    ["fr-FR", "Bonjour, ravi de vous rencontrer."],
    ["ja-JP", "こんにちは、はじめまして。"],
    ["ko-KR", "안녕하세요, 만나서 반갑습니다."],
    ["yue-Hant-HK", "你好，好高興認識你。"],
  ] as const;

  const view = render(
    <LanguageSettings
      api={api}
      course={{ ...base, target_language_tag: "en-US" } as any}
      onSaved={vi.fn()}
    />,
  );

  for (const [tag, text] of samples) {
    view.rerender(
      <LanguageSettings
        api={api}
        course={{
          ...base,
          id: samples.findIndex(([value]) => value === tag) + 1,
          target_language_tag: tag,
          daily_word_goal: 20,
          proficiency_level: "advanced",
        } as any}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("每日词汇目标")).toHaveValue(20);
    expect(screen.getByLabelText("当前水平")).toHaveValue("advanced");
    await userEvent.click(screen.getByRole("button", { name: "试听" }));
    expect(speak).toHaveBeenLastCalledWith(
      expect.objectContaining({ text, lang: tag }),
    );
  }
  vi.unstubAllGlobals();
});

test("settings reject an invalid daily target instead of silently clamping it", async () => {
  const course = {
    id: 9,
    title: "英语",
    description: "",
    course_type: "language" as const,
    target_language_tag: "en-US",
    native_language_tag: "zh-CN",
    proficiency_level: "beginner" as const,
    daily_word_goal: 10,
    lesson_minutes: 15,
    speech_rate: 1,
    auto_play_audio: false,
    pronunciation_scheme: "ipa",
    romanization_enabled: false,
    training_focus: ["reading", "listening", "speaking", "writing"] as const,
  };
  const api = { patch: vi.fn() } as any;
  render(<LanguageSettings api={api} course={course as any} onSaved={vi.fn()} />);

  await userEvent.clear(screen.getByLabelText("每日词汇目标"));
  await userEvent.type(screen.getByLabelText("每日词汇目标"), "0");
  await userEvent.click(screen.getByRole("button", { name: "保存语言设置" }));

  expect(screen.getByRole("alert")).toHaveTextContent("每日词汇目标请输入 1–100");
  expect(api.patch).not.toHaveBeenCalled();
});
