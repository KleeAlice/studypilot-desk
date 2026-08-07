import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AgentHost } from "../src/agent/AgentHost";


test("AI explain opens PILOT and sends the exact one-time selection context", async () => {
  const thread = {
    id: 41,
    course_id: 3,
    title: "新对话",
    provider_id: "openai",
    model: "test-model",
    mode: "assistant",
    learning_state: {},
  };
  const api = {
    get: vi.fn((path: string) => Promise.resolve(
      path === "/api/agent/providers" ? [{
        id: "openai",
        label: "OpenAI",
        protocol: "openai_compatible",
        base_url: "https://api.openai.com/v1",
        model: "test-model",
        max_output_tokens: 32000,
        connect_timeout_seconds: 10,
        first_byte_timeout_seconds: 90,
        idle_timeout_seconds: 45,
        has_api_key: true,
        enabled: true,
      }]
        : path === "/api/settings" ? {}
          : [],
    )),
    post: vi.fn((path: string) => Promise.resolve(
      path === "/api/agent/threads" ? thread
        : path === "/api/agent/threads/41/messages" ? {
          thread,
          user_message_id: 1,
          message: {
            id: 2,
            role: "assistant",
            content: "人工卡片是一种人机协作交接机制。",
            sources: [],
            status: "complete",
            error: "",
            metadata: {},
          },
        } : { id: 1 },
    )),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as any;

  render(
    <AgentHost api={api} courseId={3} context={{ view: "learning" }}>
      <p>人工卡片把最终判断交给人处理。</p>
    </AgentHost>,
  );

  const paragraph = screen.getByText("人工卡片把最终判断交给人处理。");
  const range = document.createRange();
  range.setStart(paragraph.firstChild as Text, 0);
  range.setEnd(paragraph.firstChild as Text, 4);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent.mouseUp(document);

  await userEvent.click(await screen.findByRole("button", { name: "AI 解释" }));

  expect(await screen.findByRole("complementary", { name: "PILOT 学习助手" })).toBeInTheDocument();
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/agent/threads/41/messages",
    expect.objectContaining({
      message: expect.stringMatching(/请解释[\s\S]*人工卡片/),
      context: expect.objectContaining({ selected_text: "人工卡片" }),
    }),
    expect.anything(),
  ));
});
