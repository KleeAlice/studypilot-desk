import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AgentDock, learningStreamPreview } from "../src/agent/AgentDock";


const provider = {
  id: "openai",
  label: "OpenAI",
  protocol: "openai_compatible",
  base_url: "https://provider.test/v1",
  model: "test-model",
  max_output_tokens: 32000,
  connect_timeout_seconds: 10,
  first_byte_timeout_seconds: 90,
  idle_timeout_seconds: 45,
  has_api_key: true,
  enabled: true,
};

const learningCard = {
  thread_title: "线性代数零基础",
  concept: "向量",
  direct_answer: "向量同时表达方向和大小。",
  explanation: "把向量想成一支有方向、有长度的箭头。",
  example: {
    concept: "向量",
    scenario: "向右走三格、向上走两格。",
    analysis: "这段位移同时包含方向和大小。",
  },
  practice: {
    concept: "向量",
    type: "multiple_choice",
    question: "哪一项同时描述方向和大小？",
    options: [
      { id: "A", text: "温度" },
      { id: "B", text: "向量" },
      { id: "C", text: "面积" },
      { id: "D", text: "时间" },
    ],
    correct_option: "B",
    reference_answer: "B。向量同时包含方向与大小。",
  },
};
test("withholds unfinished learning values containing protocol-like text", () => {
  const unfinished = [
    'response_mode":"lesson","direct_answer":"array and linked list',
    '\\",\\"type\\":\\"multiple_choice',
  ].join("");

  expect(learningStreamPreview(unfinished)).toBe("");
});

test("reveals only completed allowlisted text fields", () => {
  const partial = [
    '```studypilot-learning\n{"response_mode":"lesson",',
    '"thread_title":"complexity intro","concept":"random access complexity",',
    '"direct_answer":"still generating',
  ].join("");

  expect(learningStreamPreview(partial)).toBe("random access complexity");
  expect(learningStreamPreview(partial)).not.toMatch(
    /response_mode|thread_title|direct_answer|[{}]/,
  );
});


test("shows structured generation progress without flashing protocol JSON", async () => {
  let releaseFirstDelta: (() => void) | undefined;
  const firstDeltaGate = new Promise<void>((resolve) => {
    releaseFirstDelta = resolve;
  });
  let releaseStream: (() => void) | undefined;
  const streamGate = new Promise<void>((resolve) => {
    releaseStream = resolve;
  });
  const thread = {
    id: 7,
    course_id: 2,
    title: "新学习对话",
    provider_id: "openai",
    model: "test-model",
    mode: "learning",
    messages: [],
  };
  const api = {
    get: vi.fn((path: string) => Promise.resolve(
      path === "/api/agent/providers" ? [provider]
        : path === "/api/agent/threads?course_id=2" ? []
          : [],
    )),
    post: vi.fn((path: string) => Promise.resolve(
      path === "/api/agent/threads" ? thread : { ok: true },
    )),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    streamNDJSON: vi.fn(async (
      _path: string,
      _payload: unknown,
      onEvent: (event: unknown) => void,
    ) => {
      onEvent({ type: "start" });
      onEvent({
        type: "learning_progress",
        phase: "lesson",
        label: "正在生成知识点、讲解与例子",
        schema: "studypilot-learning/v1",
        fields: [
          { key: "thread_title", status: "ready" },
          { key: "concept", status: "generating" },
          { key: "practice", status: "pending" },
        ],
      });
      onEvent({
        type: "delta",
        text: "```studypilot-learning\n{\"respon",
      });
      await firstDeltaGate;
      onEvent({
        type: "delta",
        text: "se_mode\":\"lesson\",\"practice\":{\"type\":\"multiple_choice\"},\"concept\":\"向量\"",
      });
      await streamGate;
      onEvent({
        type: "final",
        data: {
          thread: {
            ...thread,
            title: "线性代数零基础",
            learning_state: {
              lesson_index: 1,
            },
          },
          user_message_id: 31,
          message: {
            id: 32,
            role: "assistant",
            content: learningCard.direct_answer,
            sources: [],
            status: "complete",
            error: "",
            metadata: {
              learning_card: learningCard,
              generation_trace: {
                schema: "studypilot-learning/v1",
                outcome: "valid",
                fields: [
                  { key: "concept", status: "ready" },
                  { key: "practice", status: "ready" },
                ],
              },
            },
          },
        },
      });
    }),
  } as any;

  render(
    <AgentDock
      api={api}
      courseId={2}
      context={{ view: "learning" }}
      requestedMode="learning"
      variant="workspace"
    />,
  );

  await userEvent.type(
    await screen.findByRole("textbox", { name: "想学习的主题" }),
    "线性代数",
  );
  await userEvent.click(screen.getByRole("button", { name: "规划并开始学习" }));

  expect(await screen.findByText("生成学习内容中")).toBeInTheDocument();
  expect(screen.getByText("正在生成知识点、讲解与例子")).toBeInTheDocument();
  expect(screen.queryByText(/```studypilot-learning/)).not.toBeInTheDocument();
  await new Promise((resolve) => setTimeout(resolve, 120));
  expect(screen.getByText("生成学习内容中")).toBeInTheDocument();
  expect(screen.queryByText(/multiple_choice|less/)).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "查看思考过程" }));
  expect(screen.getByText("studypilot-learning/v1")).toBeInTheDocument();
  expect(screen.queryByText("learning_path")).not.toBeInTheDocument();
  expect(screen.getByText("practice")).toBeInTheDocument();
  expect(
    screen.getByText("这里只展示结构化字段生成状态，不包含模型内部私有推理。"),
  ).toBeInTheDocument();

  act(() => releaseFirstDelta?.());
  expect(await screen.findByText("向量")).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.queryByText("生成学习内容中")).not.toBeInTheDocument();
  });
  expect(screen.queryByText(/studypilot-learning|\{"concept"/)).not.toBeInTheDocument();

  act(() => releaseStream?.());
  expect(
    await screen.findByRole("region", { name: "学习知识点：向量" }),
  ).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.queryByText("生成学习内容中")).not.toBeInTheDocument();
  });

  expect(screen.queryByLabelText("本轮学习轨迹")).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole("button", { name: "查看学习进度" }),
  );
  expect(
    screen.getByLabelText("本轮学习轨迹"),
  ).toBeInTheDocument();
});
