import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AgentDock } from "../src/agent/AgentDock";


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

const learningPath = {
  subject: "Python",
  goal: "从零基础走到能独立编写小程序",
  stages: [
    {
      title: "语法与数据",
      objective: "理解变量、类型和控制流",
      concepts: ["变量", "数据类型", "条件判断"],
    },
  ],
};

const initialThread = {
  id: 41,
  course_id: 2,
  title: "新学习对话",
  provider_id: "openai",
  model: "test-model",
  mode: "learning",
  learning_state: {},
  message_count: 0,
};

const savedThread = {
  ...initialThread,
  title: "Python 零基础实践路线",
  learning_state: {
    lesson_index: 1,
    current_concept: "变量",
    completed_concepts: ["变量"],
    learning_path: learningPath,
  },
  message_count: 2,
  updated_at: "2026-07-27 16:00:00",
};

const card = {
  thread_title: savedThread.title,
  learning_path: learningPath,
  concept: "变量",
  direct_answer: "变量是保存数据的名字。",
  explanation: "程序通过变量引用不断变化的数据。",
  example: {
    concept: "变量",
    scenario: "把用户年龄保存为 age。",
    analysis: "age 是名字，年龄是它保存的数据。",
  },
  practice: {
    concept: "变量",
    type: "multiple_choice",
    question: "下面哪一个是合法赋值？",
    options: [
      { id: "A", text: "18 = age" },
      { id: "B", text: "age = 18" },
      { id: "C", text: "age == 18 =" },
      { id: "D", text: "变量 18" },
    ],
    correct_option: "B",
    reference_answer: "B。变量名写在等号左边。",
  },
};

function workspaceApi(withHistory = false, withDocuments = false) {
  const reply = {
    thread: savedThread,
    user_message_id: 51,
    message: {
      id: 52,
      role: "assistant",
      content: "",
      sources: [],
      status: "complete",
      error: "",
      metadata: { learning_card: card, lesson_index: 1 },
    },
  };
  return {
    get: vi.fn((path: string) => Promise.resolve(
      path === "/api/agent/providers" ? [provider]
        : path === "/api/agent/threads?course_id=2" ? (withHistory ? [savedThread] : [])
          : path === "/api/agent/threads/41" ? {
            ...savedThread,
            messages: withHistory ? [reply.message] : [],
          }
            : path === "/api/settings" ? {}
              : path === "/api/courses/2/documents" ? (withDocuments ? [
                { id: 10, title: "线性代数讲义", filename: "linear-algebra.pdf", format: "pdf", status: "ready" },
                { id: 11, title: "例题笔记", filename: "examples.md", format: "markdown", status: "ready" },
                { id: 12, title: "实验数据", filename: "matrix.xlsx", format: "xlsx", status: "ready" },
              ] : [])
                : [],
    )),
    post: vi.fn((path: string) => Promise.resolve(
      path === "/api/agent/threads" ? initialThread
        : path === "/api/agent/threads/41/messages" ? reply
          : path === "/api/agent/threads/41/generate-title" ? savedThread
          : { ok: true },
    )),
    put: vi.fn(),
    patch: vi.fn((_path: string, body: { pinned?: boolean }) => Promise.resolve({
      ...savedThread,
      pinned: body.pinned === true,
    })),
    delete: vi.fn(),
  } as any;
}


test("starts autonomous learning with an explicitly source-free request", async () => {
  const api = workspaceApi();
  render(
    <AgentDock
      api={api}
      courseId={2}
      context={{ view: "learning" }}
      requestedMode="learning"
      variant="workspace"
    />,
  );

  expect(await screen.findByRole("button", { name: "新对话" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "历史对话" })).toBeInTheDocument();
  expect(screen.getByText("本地自动保存")).toBeInTheDocument();

  await userEvent.type(
    screen.getByRole("textbox", { name: "想学习的主题" }),
    "Python",
  );
  await userEvent.click(screen.getByRole("button", { name: "规划并开始学习" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/agent/threads/41/messages",
    expect.objectContaining({
      context: expect.objectContaining({
        source_free: true,
        include_current: false,
        include_library: false,
        include_notes: false,
        include_knowledge: false,
      }),
    }),
    expect.anything(),
  ));
  expect(await screen.findByRole("region", { name: "学习知识点：变量" }))
    .toBeInTheDocument();
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/agent/threads/41/generate-title",
    {},
    { timeoutMs: 120000 },
  ));
  expect(screen.getAllByText("Python 零基础实践路线")).not.toHaveLength(0);
  expect(screen.queryByRole("region", { name: "为你规划的学习路径" }))
    .not.toBeInTheDocument();
});


test("loads course-scoped materials, groups them, and supports selecting everything", async () => {
  const api = workspaceApi(false, true);
  render(
    <AgentDock
      api={api}
      courseId={2}
      context={{ view: "learning" }}
      requestedMode="learning"
      variant="workspace"
    />,
  );

  await userEvent.click(await screen.findByRole("button", { name: "选择学习资料" }));
  expect(api.get).toHaveBeenCalledWith("/api/courses/2/documents");
  const picker = screen.getByRole("region", { name: "学习资料" });
  expect(within(picker).getByText("阅读文档")).toBeInTheDocument();
  expect(within(picker).getByText("表格数据")).toBeInTheDocument();

  await userEvent.click(within(picker).getByRole("button", { name: "全选全部资料" }));
  expect(within(picker).getByText("3 / 3")).toBeInTheDocument();
  await userEvent.click(within(picker).getByRole("button", { name: "完成资料选择" }));
  expect(screen.getByRole("button", { name: "从这些资料开始" })).toBeEnabled();
});

test("does not silently use the whole library when no learning source mode was chosen", async () => {
  const api = workspaceApi();
  render(
    <AgentDock
      api={api}
      courseId={2}
      context={{ view: "learning" }}
      requestedMode="learning"
      variant="workspace"
    />,
  );

  const materialStart = await screen.findByRole("button", { name: "从这些资料开始" });
  expect(materialStart).toBeDisabled();
  await userEvent.type(screen.getByRole("textbox", { name: "学习回答" }), "直接开始讲矩阵");
  await userEvent.click(screen.getByRole("button", { name: "发送给 PILOT" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("先选择学习资料，或在上方输入主题使用自主规划");
  expect(api.post).not.toHaveBeenCalledWith(
    expect.stringContaining("/messages"),
    expect.anything(),
    expect.anything(),
  );
});


test("shows learning history in a pinnable left hover rail and opens a new chat", async () => {
  const api = workspaceApi(true);
  render(
    <AgentDock
      api={api}
      courseId={2}
      context={{ view: "learning" }}
      requestedMode="learning"
      variant="workspace"
    />,
  );

  await screen.findByRole("heading", { name: "变量" });
  const rail = screen.getByTestId("learning-history-rail");
  const edge = screen.getByTestId("learning-history-edge");
  expect(rail).toHaveAttribute("data-open", "false");

  fireEvent.pointerEnter(edge);
  expect(rail).toHaveAttribute("data-open", "true");
  fireEvent.pointerLeave(edge, { relatedTarget: document.body });
  expect(rail).toHaveAttribute("data-open", "false");

  const toggle = screen.getByRole("button", { name: "历史对话" });
  expect(toggle).toHaveTextContent("☰");
  await userEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(rail).toHaveAttribute("data-open", "true");

  expect(within(rail).getByText("Python 零基础实践路线")).toBeInTheDocument();
  expect(within(rail).getByText(/已学习 1 个知识点/)).toBeInTheDocument();
  expect(screen.getByText(/当前：变量/)).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "新建学习对话" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/agent/threads",
    expect.objectContaining({ course_id: 2, mode: "learning" }),
  ));
  expect(await screen.findByRole("textbox", { name: "想学习的主题" })).toBeInTheDocument();
});

test("pins one learning thread and deletes all learning history from the hover rail", async () => {
  const api = workspaceApi(true);
  render(
    <AgentDock
      api={api}
      courseId={2}
      context={{ view: "learning" }}
      requestedMode="learning"
      variant="workspace"
    />,
  );

  await screen.findByRole("heading", { name: /变量/ });
  await userEvent.click(screen.getByRole("button", { name: "历史对话" }));
  const rail = screen.getByTestId("learning-history-rail");
  const pin = within(rail).getByRole("button", { name: /置顶对话/ });
  await userEvent.click(pin);

  await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
    "/api/agent/threads/41",
    { pinned: true },
  ));
  expect(within(rail).getByRole("button", { name: /取消置顶对话/ })).toBeInTheDocument();

  await userEvent.click(within(rail).getByRole("button", { name: "删除全部学习对话" }));
  const confirm = screen.getByRole("alertdialog", { name: "删除全部对话确认" });
  expect(within(confirm).getByText(/删除全部 1 个学习对话/)).toBeInTheDocument();
  await userEvent.click(within(confirm).getByRole("button", { name: "确认删除全部对话" }));

  await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/api/agent/threads/41"));
  expect(within(rail).getByText(/还没有学习记录/)).toBeInTheDocument();
});
