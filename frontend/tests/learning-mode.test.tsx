import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AgentHost } from "../src/agent/AgentHost";


const provider = {
  id: "openai",
  label: "OpenAI",
  protocol: "openai_compatible",
  base_url: "https://api.openai.com/v1",
  model: "test-model",
  max_output_tokens: 32000,
  has_api_key: true,
  enabled: true,
};

const learningCard = {
  concept: "梯度",
  direct_answer: "梯度表示当前位置变化最快的方向和程度。",
  explanation: "把它想成站在山坡上判断哪一个方向最陡：方向告诉你往哪里走，大小告诉你坡有多陡。",
  example: {
    concept: "梯度",
    scenario: "下山时每走一步，都重新观察哪边下降最快。",
    analysis: "每次重新判断最陡方向，就像根据当前位置重新计算梯度。",
  },
  practice: {
    concept: "梯度",
    question: "如果每一步迈得太大，可能发生什么？",
    reference_answer: "可能越过合适位置，来回震荡甚至无法收敛。",
  },
};
function learningApi() {
  let nextMessageId = 8;
  const thread = {
    id: 4,
    course_id: 2,
    title: "梯度入门",
    provider_id: "openai",
    model: "test-model",
    mode: "learning",
    learning_state: { lesson_index: 1, current_concept: "梯度", last_feedback: "" },
    message_count: 2,
  };
  const source = {
    kind: "document",
    title: "优化基础.md",
    document_id: 10,
    block_key: "section:2",
    locator: { line_start: 12, line_end: 18 },
    location_label: "第 12–18 行",
    excerpt: "梯度指向函数增长最快的方向。",
    citation: "S1",
  };
  return {
    source,
    get: vi.fn((path: string) => Promise.resolve(
      path === "/api/agent/providers" ? [provider]
        : path === "/api/agent/threads?course_id=2" ? []
          : path === "/api/courses/2/documents" ? [{ id: 10, title: "优化基础", filename: "优化基础.md", format: "markdown", status: "ready" }]
            : [],
    )),
    post: vi.fn((path: string) => Promise.resolve(
      path === "/api/agent/threads" ? thread
        : path === "/api/agent/threads/4/messages" ? {
          thread,
          user_message_id: 7,
          message: {
            id: nextMessageId++,
            role: "assistant",
            content: "先理解方向，不急着算公式。[S1]",
            sources: [source],
            status: "complete",
            error: "",
            metadata: { learning_card: learningCard, lesson_index: 1 },
          },
        } : { ok: true },
    )),
    put: vi.fn().mockResolvedValue(provider),
    patch: vi.fn(),
    delete: vi.fn(),
  } as any;
}

function renderLearningHost() {
  const api = learningApi();
  const onOpenSource = vi.fn();
  render(
    <AgentHost
      api={api}
      courseId={2}
      context={{ view: "knowledge", notebookId: 3, title: "默认知识画布" }}
      onOpenSource={onOpenSource}
    >
      <main>知识画布</main>
    </AgentHost>,
  );
  fireEvent(window, new CustomEvent("studypilot:open-agent", {
    detail: { view: "chat", mode: "learning" },
  }));
  return { api, onOpenSource };
}

async function selectLearningMaterial() {
  await userEvent.click(screen.getByRole("button", { name: "选择指定资料" }));
  const checkbox = await screen.findByRole("checkbox", { name: "优化基础 · 优化基础.md" });
  if (!(checkbox as HTMLInputElement).checked) await userEvent.click(checkbox);
  await userEvent.click(screen.getByRole("button", { name: "完成资料选择" }));
}


test("starts a short source-grounded learning session with the selected model", async () => {
  const { api } = renderLearningHost();

  expect(await screen.findByRole("tab", { name: "学习" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("button", { name: "从这些资料开始" })).toBeDisabled();
  expect(screen.getByRole("combobox", { name: /当前模型/ })).toHaveValue("openai");
  await selectLearningMaterial();
  await userEvent.click(screen.getByRole("button", { name: "从这些资料开始" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/agent/threads",
    expect.objectContaining({ course_id: 2, provider_id: "openai", mode: "learning" }),
  ));
  expect(await screen.findByText("这次只学一个点")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "梯度" })).toBeInTheDocument();
  expect(screen.getByText("先给结论")).toBeInTheDocument();
  expect(screen.queryByText("词语拆开看")).not.toBeInTheDocument();
  expect(screen.getByText("与本题对齐的例子")).toBeInTheDocument();
  expect(screen.getByText("轮到你")).toBeInTheDocument();
  expect(screen.getByText("如果每一步迈得太大，可能发生什么？")).toBeInTheDocument();
});


test("sends learning feedback and opens an exact cited location", async () => {
  const { api, onOpenSource } = renderLearningHost();
  await selectLearningMaterial();
  await userEvent.click(await screen.findByRole("button", { name: "从这些资料开始" }));
  await screen.findByRole("heading", { name: "梯度" });

  await userEvent.click(screen.getByText(/参考来源/));
  await userEvent.click(screen.getByRole("button", { name: /优化基础.md.*第 12–18 行/ }));
  expect(onOpenSource).toHaveBeenCalledWith(api.source);

  await userEvent.click(screen.getByRole("button", { name: "还没懂" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/agent/threads/4/messages",
    expect.objectContaining({ feedback_kind: "confused" }),
    expect.anything(),
  ));
});


test("restores an open learning panel after navigating to a cited source", async () => {
  window.sessionStorage.setItem("studypilot.agent.continuity", JSON.stringify({ open: true, mode: "learning" }));
  const api = learningApi();
  render(
    <AgentHost api={api} courseId={2} context={{ view: "document", documentId: 10 }}>
      <main>引用资料</main>
    </AgentHost>,
  );

  expect(await screen.findByRole("complementary", { name: "PILOT 学习助手" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "学习" })).toHaveAttribute("aria-selected", "true");
  expect(window.sessionStorage.getItem("studypilot.agent.continuity")).toBeNull();
});

test("persists the short medium long explanation setting and sends it with learning requests", async () => {
  const { api } = renderLearningHost();
  await screen.findByRole("tab", { name: "学习" });

  await userEvent.click(screen.getByRole("button", { name: "模型设置" }));
  expect(await screen.findByRole("group", { name: "单次输出策略" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "长" }));

  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    "/api/settings/learning_explanation_length",
    { value: "long" },
  ));

  await userEvent.click(screen.getByRole("button", { name: "返回" }));
  await selectLearningMaterial();
  await userEvent.click(screen.getByRole("button", { name: "从这些资料开始" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/agent/threads/4/messages",
    expect.objectContaining({ explanation_length: "long" }),
    expect.anything(),
  ));
});

test("links the unlimited explanation preset to an unlimited token ceiling", async () => {
  const { api } = renderLearningHost();
  await screen.findByRole("tab", { name: "学习" });

  await userEvent.click(screen.getByRole("button", { name: "模型设置" }));
  expect(await screen.findByRole("group", { name: "单次输出策略" })).toBeInTheDocument();
  const tokenSelect = screen.getByRole("combobox", { name: "单次 Token 上限" });
  await userEvent.selectOptions(tokenSelect, "64000");
  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    "/api/settings/learning_explanation_length",
    { value: "long" },
  ));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    "/api/agent/providers/openai",
    expect.objectContaining({ max_output_tokens: 64000 }),
  ));
  expect(screen.getByRole("button", { name: "长" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("充分展开 · 64K tokens")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "无上限" }));

  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    "/api/settings/learning_explanation_length",
    { value: "unlimited" },
  ));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    "/api/agent/providers/openai",
    expect.objectContaining({ max_output_tokens: 0 }),
  ));
  expect(screen.getByRole("combobox", { name: "单次 Token 上限" })).toHaveValue("0");

  await userEvent.click(screen.getByRole("button", { name: "返回" }));
  await selectLearningMaterial();
  await userEvent.click(screen.getByRole("button", { name: "从这些资料开始" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/agent/threads/4/messages",
    expect.objectContaining({ explanation_length: "unlimited" }),
    expect.anything(),
  ));
});
