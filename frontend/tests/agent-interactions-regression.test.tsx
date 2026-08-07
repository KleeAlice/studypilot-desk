import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { AgentHost } from "../src/agent/AgentHost";


const provider = {
  id: "openai",
  label: "OpenAI",
  protocol: "openai_compatible",
  base_url: "https://api.openai.com/v1",
  model: "gpt-5.6-terra",
  max_output_tokens: 32000,
  has_api_key: true,
  enabled: true,
};

const thread = {
  id: 4,
  course_id: 2,
  title: "当前学习问题",
  provider_id: "openai",
  model: "gpt-5.6-terra",
  mode: "assistant",
  message_count: 0,
};

function apiWith(messages: Array<Record<string, unknown>> = []) {
  return {
    get: vi.fn((path: string) => Promise.resolve(
      path === "/api/agent/providers" ? [provider]
        : path === "/api/agent/threads?course_id=2" ? (messages.length ? [thread] : [])
          : path === "/api/agent/threads/4" ? { ...thread, message_count: messages.length, messages }
            : path === "/api/settings" ? {}
              : [],
    )),
    post: vi.fn((path: string) => Promise.resolve(
      path === "/api/agent/threads" ? thread
        : {
          thread,
          message: {
            id: 8,
            role: "assistant",
            content: "最终回答",
            sources: [],
            status: "complete",
            error: "",
          },
        },
    )),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as any;
}

function renderHost(api: any) {
  return render(
    <AgentHost api={api} courseId={2} context={{ view: "dashboard" }}>
      <main>课程内容</main>
    </AgentHost>,
  );
}

beforeEach(() => {
  window.localStorage.removeItem("studypilot.agent.dock-width");
  window.localStorage.removeItem("studypilot.agent.active-thread.assistant.2");
});

test("assistant width can be dragged, changed by keyboard, and persisted", async () => {
  const { container } = renderHost(apiWith());
  fireEvent(window, new CustomEvent("studypilot:open-agent", { detail: { view: "chat" } }));

  const separator = await screen.findByRole("separator", { name: "调整 PILOT 助手宽度" });
  fireEvent.pointerDown(separator, { pointerId: 1, clientX: 900 });
  fireEvent.pointerMove(separator, { pointerId: 1, clientX: 780 });
  fireEvent.pointerUp(separator, { pointerId: 1, clientX: 780 });

  expect(container.querySelector(".agent-host")).toHaveStyle({ "--agent-dock-width": "540px" });
  expect(window.localStorage.getItem("studypilot.agent.dock-width")).toBe("540");

  fireEvent.keyDown(separator, { key: "ArrowRight" });
  expect(container.querySelector(".agent-host")).toHaveStyle({ "--agent-dock-width": "516px" });
});

test("current conversation exposes a left question guide that scrolls to each question", async () => {
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
  renderHost(apiWith([
    { id: 1, role: "user", content: "什么是梯度下降？", sources: [], status: "complete", error: "" },
    { id: 2, role: "assistant", content: "第一条回答", sources: [], status: "complete", error: "" },
    { id: 3, role: "user", content: "它和牛顿法有什么区别？", sources: [], status: "complete", error: "" },
    { id: 4, role: "assistant", content: "第二条回答", sources: [], status: "complete", error: "" },
  ]));
  fireEvent(window, new CustomEvent("studypilot:open-agent", { detail: { view: "chat" } }));

  const guide = await screen.findByRole("navigation", { name: "本次对话问题导览" });
  expect(within(guide).getByRole("button", { name: "定位问题 1：什么是梯度下降？" })).toBeInTheDocument();
  await userEvent.click(within(guide).getByRole("button", { name: "定位问题 2：它和牛顿法有什么区别？" }));

  expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
});

test("one large stream delta is revealed with a typewriter instead of appearing at once", async () => {
  const api = apiWith();
  const fullAnswer = "Streaming answer arrives progressively instead of appearing all at once.";
  let releaseStream = () => {};
  const gate = new Promise<void>((resolve) => { releaseStream = resolve; });
  api.streamNDJSON = vi.fn(async (
    _path: string,
    _payload: unknown,
    onEvent: (event: unknown) => void,
  ) => {
    onEvent({ type: "start" });
    onEvent({ type: "delta", text: fullAnswer });
    await gate;
    onEvent({
      type: "final",
      data: {
        thread,
        message: {
          id: 12,
          role: "assistant",
          content: fullAnswer,
          sources: [],
          status: "complete",
          error: "",
        },
      },
    });
  });
  const { container } = renderHost(api);
  fireEvent(window, new CustomEvent("studypilot:open-agent", { detail: { view: "chat" } }));
  const composer = await screen.findByRole("textbox", { name: "向 PILOT 提问" });
  await userEvent.type(composer, "Stream this");
  fireEvent.keyDown(composer, { key: "Enter" });

  await waitFor(() => {
    const streaming = container.querySelector(".agent-message.is-assistant");
    expect(streaming?.textContent?.replace("PILOT", "").length).toBeGreaterThan(0);
    expect(streaming).not.toHaveTextContent(fullAnswer);
  });

  releaseStream();
  expect(await screen.findByText(fullAnswer)).toBeInTheDocument();
});

test("learning generation indicator disappears on the first delta and reveals content immediately", async () => {
  const api = apiWith();
  const learningThread = { ...thread, mode: "learning" };
  api.post.mockImplementation((path: string) => Promise.resolve(
    path === "/api/agent/threads" ? learningThread : {
      thread: learningThread,
      message: { id: 22, role: "assistant", content: "完整学习内容", sources: [], status: "complete", error: "" },
    },
  ));
  let releaseFinal = () => {};
  const beforeFinal = new Promise<void>((resolve) => { releaseFinal = resolve; });
  api.streamNDJSON = vi.fn(async (_path: string, _payload: unknown, onEvent: (event: unknown) => void) => {
    onEvent({ type: "start" });
    onEvent({ type: "learning_progress", phase: "writing", label: "正在生成讲解", schema: "studypilot-learning/v1", fields: [{ key: "explanation", status: "generating" }] });
    onEvent({ type: "delta", text: "首段学习内容正在流式显示" });
    await beforeFinal;
    onEvent({ type: "final", data: { thread: learningThread, message: { id: 22, role: "assistant", content: "完整学习内容", sources: [], status: "complete", error: "" } } });
  });

  const { container } = renderHost(api);
  fireEvent(window, new CustomEvent("studypilot:open-agent", { detail: { view: "chat", mode: "learning" } }));
  const composer = await screen.findByRole("textbox", { name: "向 PILOT 提问" });
  await userEvent.type(composer, "继续讲解");
  fireEvent.keyDown(composer, { key: "Enter" });
  await waitFor(() => {
    const streaming = container.querySelector(".agent-message.is-assistant");
    expect(streaming?.textContent?.replace("PILOT", "").length).toBeGreaterThan(0);
  });
  expect(screen.queryByRole("status", { name: "正在生成结构化学习内容" })).not.toBeInTheDocument();

  releaseFinal();
  expect(await screen.findByText("完整学习内容")).toBeInTheDocument();
});
