import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";

const { stopLanguageSpeechMock } = vi.hoisted(() => ({
  stopLanguageSpeechMock: vi.fn(),
}));

vi.mock("../src/language/speech", () => ({
  stopLanguageSpeech: stopLanguageSpeechMock,
}));

vi.mock("../src/agent/AgentDock", () => ({
  AgentDock: ({ onClose }: { onClose: () => void }) => (
    <aside aria-label="PILOT 学习助手">
      <button type="button" onClick={onClose}>关闭 PILOT 助手</button>
    </aside>
  ),
}));

import { AgentHost } from "../src/agent/AgentHost";

beforeEach(() => {
  stopLanguageSpeechMock.mockReset();
  window.sessionStorage.clear();
});

test("closing PILOT from its button always stops active language speech", async () => {
  render(
    <AgentHost api={{} as any} courseId={2} context={{ view: "language-home" }}>
      <main>语言课程</main>
    </AgentHost>,
  );

  act(() => window.dispatchEvent(new CustomEvent("studypilot:open-agent")));
  await userEvent.click(await screen.findByRole("button", { name: "关闭 PILOT 助手" }));

  expect(stopLanguageSpeechMock).toHaveBeenCalledOnce();
  expect(screen.queryByRole("complementary", { name: "PILOT 学习助手" })).not.toBeInTheDocument();
});

test("closing PILOT from the global titlebar toggle also stops active speech", () => {
  render(
    <AgentHost api={{} as any} courseId={2} context={{ view: "language-home" }}>
      <main>语言课程</main>
    </AgentHost>,
  );

  act(() => window.dispatchEvent(new CustomEvent("studypilot:open-agent")));
  act(() => window.dispatchEvent(new CustomEvent("studypilot:toggle-agent")));

  expect(stopLanguageSpeechMock).toHaveBeenCalledOnce();
});
