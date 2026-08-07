import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SpeechPracticeControls } from "../src/language/SpeechPracticeControls";
import { speakLanguageText, stopLanguageSpeech } from "../src/language/speech";

class UtteranceStub {
  lang = "";
  rate = 1;
  constructor(public text: string) {}
}

const recognitionStop = vi.fn();
let latestRecognition: RecognitionStub | null = null;


class RecognitionStub {
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((event: any) => void) | null = null;
  onerror: (() => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    latestRecognition = this;
  }
  start = vi.fn();
  stop = recognitionStop;
}

beforeEach(() => {
  vi.stubGlobal("SpeechSynthesisUtterance", UtteranceStub);
  Object.defineProperty(window, "speechSynthesis", {
    configurable: true,
    value: { speak: vi.fn(), cancel: vi.fn() },
  });
  (window as any).SpeechRecognition = RecognitionStub;
  recognitionStop.mockReset();
});

afterEach(() => {
  latestRecognition = null;
  vi.unstubAllGlobals();
  delete (window as any).SpeechRecognition;
});

test("shared language speech controller applies voice settings and stops globally", () => {
  speakLanguageText("Bonjour", "fr-FR", 0.85);
  expect(window.speechSynthesis.speak).toHaveBeenCalledWith(
    expect.objectContaining({ text: "Bonjour", lang: "fr-FR", rate: 0.85 }),
  );
  stopLanguageSpeech();
  expect(window.speechSynthesis.cancel).toHaveBeenCalledTimes(2);
});

test("speech and active recognition stop when controls unmount", async () => {
  const view = render(
    <SpeechPracticeControls
      term="Bonjour"
      languageTag="fr-FR"
      onComplete={vi.fn()}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "原速播放" }));
  await userEvent.click(screen.getByRole("button", { name: "开始语音识别" }));
  view.unmount();

  expect(recognitionStop).toHaveBeenCalledOnce();
  expect(window.speechSynthesis.cancel).toHaveBeenCalled();
});

test("recognition reports Unicode-aware transcript coverage without faking an accent score", async () => {
  render(
    <SpeechPracticeControls
      term="Hi, how are you today?"
      languageTag="en-US"
      onComplete={vi.fn()}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "开始语音识别" }));
  act(() => {
    latestRecognition?.onresult?.({
      results: [[{ transcript: "Hi how are you" }]],
    });
  });

  expect(screen.getByText("转写覆盖 80%")).toBeVisible();
  expect(screen.getByText(/这是文本匹配反馈，不是口音或声学发音评分/)).toBeVisible();
  expect(screen.queryByText(/发音得分/)).not.toBeInTheDocument();
});

test("transcript coverage also handles scripts without spaces", async () => {
  render(
    <SpeechPracticeControls term="こんにちは世界" languageTag="ja-JP" onComplete={vi.fn()} />,
  );
  await userEvent.click(screen.getByRole("button", { name: "开始语音识别" }));
  act(() => latestRecognition?.onresult?.({ results: [[{ transcript: "こんにちは" }]] }));
  expect(screen.getByText("转写覆盖 71%")).toBeVisible();
});
