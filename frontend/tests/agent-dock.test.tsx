import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { AgentDock } from "../src/agent/AgentDock";
import { AgentHost } from "../src/agent/AgentHost";
import { TitleBar } from "../src/components/TitleBar";


const provider = {
  id: "openai",
  label: "OpenAI",
  protocol: "openai_compatible",
  base_url: "https://api.openai.com/v1",
  model: "gpt-5.6-terra",
  max_output_tokens: 100000,
  has_api_key: true,
  enabled: true,
};

const deepSeekProvider = {
  id: "deepseek",
  label: "DeepSeek",
  protocol: "openai_compatible",
  base_url: "https://gateway.example/v1",
  model: "DeepSeek-V4-Flash",
  max_output_tokens: 100000,
  has_api_key: true,
  enabled: true,
};

const source = {
  kind: "document",
  title: "Optimization Notes",
  document_id: 10,
  block_key: "markdown:2",
  locator: { section: 2 },
  excerpt: "Newton's method uses curvature.",
  citation: "S1",
};

function apiFor(options: { withThread?: boolean; providers?: typeof provider[] } = {}) {
  const thread = {
    id: 4,
    course_id: 2,
    title: "Saved optimizer chat",
    provider_id: "openai",
    model: "gpt-5.6-terra",
    message_count: 2,
  };
  const detail = {
    ...thread,
    messages: [
      { id: 1, role: "user", content: "Compare optimizers", sources: [], status: "complete", error: "" },
      { id: 2, role: "assistant", content: "Saved answer", sources: [source], status: "complete", error: "" },
    ],
  };
  return {
    get: vi.fn((path: string) => Promise.resolve(
      path === "/api/agent/providers" ? (options.providers || [provider])
        : path === "/api/agent/threads?course_id=2" ? (options.withThread ? [thread] : [])
          : path === "/api/agent/threads/4" ? detail
            : [],
    )),
    post: vi.fn((path: string) => Promise.resolve(
      path === "/api/agent/threads"
        ? { ...thread, title: "新对话", message_count: 0 }
        : path === "/api/agent/threads/4/messages"
          ? { thread, message: { id: 8, role: "assistant", content: "Fresh grounded answer", sources: [source], status: "complete", error: "" } }
        : path === "/api/agent/threads/4/generate-title"
          ? { ...thread, title: "AI generated optimizer title" }
          : { ok: true, reply: "OK", provider_id: "openai" },
    )),
    put: vi.fn().mockResolvedValue(provider),
    patch: vi.fn().mockResolvedValue({ ...thread, title: "Renamed chat" }),
    delete: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function renderHost(api = apiFor()) {
  const onOpenSource = vi.fn();
  const view = render(
    <>
      <TitleBar />
      <AgentHost
        api={api}
        courseId={2}
        context={{
          view: "library",
          documentId: 10,
          blockKey: "markdown:1",
          selectedText: "Gradient descent",
          locator: { section: 1 },
        }}
        onOpenSource={onOpenSource}
      >
        <main data-testid="study-content">Reading surface</main>
      </AgentHost>
    </>,
  );
  return { ...view, api, onOpenSource };
}

test("opens as a reflowing complementary panel with explicit document context", async () => {
  const { container } = renderHost();

  expect(container.querySelector(".agent-host")).not.toHaveClass("is-agent-open");
  fireEvent(window, new CustomEvent("studypilot:open-agent", { detail: { view: "chat" } }));

  expect(await screen.findByRole("complementary", { name: "PILOT 学习助手" })).toBeInTheDocument();
  expect(container.querySelector(".agent-host")).toHaveClass("is-agent-open");
  expect(screen.getByRole("button", { name: "当前资料" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "课程笔记" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByTestId("study-content")).toBeInTheDocument();
});

test("keeps the empty PILOT start screen concise", async () => {
  renderHost();
  fireEvent(window, new CustomEvent("studypilot:open-agent", { detail: { view: "chat" } }));

  expect(await screen.findByRole("button", { name: "总结" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "解释" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "对比" })).toBeInTheDocument();
  expect(screen.queryByText("CONTEXT READY")).not.toBeInTheDocument();
  expect(screen.queryByText("从你正在学习的地方开始")).not.toBeInTheDocument();
  expect(screen.queryByText(/我可以结合当前资料/)).not.toBeInTheDocument();
});
test("learning mode has no meaningless current-page scope outside a document", async () => {
  const api = apiFor();
  render(
    <AgentHost api={api} courseId={2} context={{ view: "dashboard" }}>
      <main>Course home</main>
    </AgentHost>,
  );

  fireEvent(window, new CustomEvent("studypilot:open-agent", { detail: { view: "chat", mode: "learning" } }));
  expect(await screen.findByRole("complementary", { name: "PILOT 学习助手" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "当前页面" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "资料库" })).toHaveAttribute("aria-pressed", "false");
});
test("grounds assistant questions in the current course page outside a document", async () => {
  const api = apiFor();
  render(
    <AgentHost api={api} courseId={2} context={{ view: "home", title: "算法" }}>
      <main>Course home</main>
    </AgentHost>,
  );

  fireEvent(window, new CustomEvent("studypilot:open-agent", { detail: { view: "chat", mode: "assistant" } }));
  const currentPage = await screen.findByRole("button", { name: "当前页面" });
  expect(currentPage).toHaveAttribute("aria-pressed", "true");
  expect(currentPage).not.toBeDisabled();

  const composer = screen.getByRole("textbox", { name: "向 PILOT 提问" });
  await userEvent.type(composer, "我现在在哪个页面？");
  fireEvent.keyDown(composer, { key: "Enter", shiftKey: false });

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/agent/threads/4/messages",
    expect.objectContaining({
      context: expect.objectContaining({
        page_view: "home",
        page_title: "算法",
        include_current: true,
      }),
    }),
    expect.anything(),
  ));
});

test("toggles from the fixed title-bar event and clears the obsolete launcher position", async () => {
  window.localStorage.setItem("studypilot.agent-launcher-position", JSON.stringify({ left: 900, top: 700 }));
  const { container } = renderHost();

  expect(window.localStorage.getItem("studypilot.agent-launcher-position")).toBeNull();
  window.dispatchEvent(new CustomEvent("studypilot:toggle-agent"));
  expect(await screen.findByRole("complementary", { name: "PILOT 学习助手" })).toBeInTheDocument();
  expect(container.querySelector(".agent-host")).toHaveClass("is-agent-open");

  window.dispatchEvent(new CustomEvent("studypilot:toggle-agent"));
  await waitFor(() => expect(screen.queryByRole("complementary", { name: "PILOT 学习助手" })).not.toBeInTheDocument());
  expect(container.querySelector(".agent-host")).not.toHaveClass("is-agent-open");
});

test("keeps attachment actions, model selection, and send in one compact command bar", async () => {
  renderHost();
  fireEvent(window, new CustomEvent("studypilot:open-agent", { detail: { view: "chat" } }));

  const commandBar = await screen.findByTestId("agent-composer-commandbar");
  expect(within(commandBar).getByLabelText("上传文件或图片")).toBeInTheDocument();
  expect(within(commandBar).getByRole("button", { name: "截取当前窗口" })).toBeInTheDocument();
  expect(within(commandBar).getByRole("combobox", { name: "当前模型" })).toBeInTheDocument();
  expect(within(commandBar).getByRole("button", { name: "发送给 PILOT" })).toBeInTheDocument();
  expect(screen.queryByText("可粘贴或拖入")).not.toBeInTheDocument();
});
  expect(screen.queryByText("Enter 发送 · Shift+Enter 换行")).not.toBeInTheDocument();

test("switching the model immediately synchronizes the active conversation provider", async () => {
  const api = apiFor({ withThread: true, providers: [provider, deepSeekProvider] });
  api.patch.mockImplementation((path: string, payload: Record<string, unknown>) => Promise.resolve({
    id: 4,
    course_id: 2,
    title: "Saved optimizer chat",
    provider_id: String(payload.provider_id || "openai"),
    model: payload.provider_id === "deepseek" ? "DeepSeek-V4-Flash" : "gpt-5.6-terra",
    message_count: 2,
  }));
  renderHost(api);
  fireEvent(window, new CustomEvent("studypilot:open-agent", { detail: { view: "chat" } }));

  const selector = await screen.findByRole("combobox", { name: "当前模型" });
  await userEvent.selectOptions(selector, "deepseek");

  await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
    "/api/agent/threads/4",
    { provider_id: "deepseek" },
  ));
  expect(selector).toHaveValue("deepseek");
});

test("creates a conversation, sends on Enter once, and opens a cited source", async () => {
  const { api, onOpenSource } = renderHost();
  await userEvent.click(screen.getByRole("button", { name: "打开 PILOT 助手" }));
  const composer = await screen.findByRole("textbox", { name: "向 PILOT 提问" });
  await userEvent.type(composer, "Compare the methods");
  fireEvent.keyDown(composer, { key: "Enter", shiftKey: false });

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/agent/threads",
    expect.objectContaining({ course_id: 2, provider_id: "openai" }),
  ));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/agent/threads/4/messages",
    expect.objectContaining({
      message: "Compare the methods",
      context: expect.objectContaining({
        document_id: 10,
        block_key: "markdown:1",
        selected_text: "Gradient descent",
        include_current: true,
      }),
    }),
    expect.anything(),
  ));
  expect(await screen.findByText("Fresh grounded answer")).toBeInTheDocument();
  await userEvent.click(screen.getByText("参考来源 · 1"));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/agent/threads/4/generate-title",
    {},
    expect.objectContaining({ timeoutMs: 120000 }),
  ));
  expect(await screen.findByText("AI generated optimizer title")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "来源：Optimization Notes" }));
  expect(onOpenSource).toHaveBeenCalledWith(source);
});

test("requires confirmation before applying an Agent workspace plan and supports batch undo", async () => {
  const plan = {
    id: 31,
    thread_id: 4,
    assistant_message_id: 2,
    course_id: 2,
    status: "pending",
    title: "整理 Markdown 并制作导图",
    summary: "修改 1 个段落，新建 1 个节点和 1 条关系",
    operations: [
      {
        type: "replace_document_block",
        document_id: 10,
        block_key: "markdown:1",
        expected_text: "before",
        new_text: "after",
        description: "补全段落",
      },
      {
        type: "create_knowledge_node",
        notebook_id: 7,
        temp_id: "root",
        title: "核心节点",
        description: "创建知识分支",
      },
      {
        type: "delete_knowledge_edge",
        notebook_id: 7,
        edge_id: 9,
        description: "删除错误连线",
      },
    ],
    before: {},
    result: {},
    destructive: true,
    error: "",
  };
  const thread = {
    id: 4, course_id: 2, title: "Plan chat", provider_id: "openai", model: "gpt-5.6-terra", message_count: 2,
  };
  const api = apiFor({ withThread: true });
  api.get.mockImplementation((path: string) => Promise.resolve(
    path === "/api/agent/providers" ? [provider]
      : path === "/api/agent/threads?course_id=2" ? [thread]
        : path === "/api/agent/threads/4" ? {
          ...thread,
          messages: [
            { id: 1, role: "user", content: "整理资料", sources: [], status: "complete", error: "" },
            { id: 2, role: "assistant", content: "请确认计划。", sources: [], status: "complete", error: "", action_plan: plan },
          ],
        } : [],
  ));
  api.post.mockImplementation((path: string) => Promise.resolve(
    path.endsWith("/confirm")
      ? { ...plan, status: "completed", result: { affected_document_ids: [10], affected_notebook_ids: [7] } }
      : path.endsWith("/undo")
        ? { ...plan, status: "undone", result: { affected_document_ids: [10], affected_notebook_ids: [7] } }
        : { ok: true },
  ));
  const mutated = vi.fn();
  window.addEventListener("studypilot:workspace-mutated", mutated);
  try {
    renderHost(api);
    await userEvent.click(screen.getByRole("button", { name: "打开 PILOT 助手" }));

    expect(await screen.findByRole("region", { name: "待确认操作计划" })).toHaveTextContent("整理 Markdown 并制作导图");
    expect(screen.getByText("补全段落")).toBeInTheDocument();
    expect(screen.getByText("删除错误连线")).toBeInTheDocument();
    expect(screen.getByText("包含删除操作")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "确认执行整批计划" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/agent/action-plans/31/confirm"));
    expect(await screen.findByText("整批操作已执行")).toBeInTheDocument();
    expect(mutated).toHaveBeenCalledTimes(1);
    expect((mutated.mock.calls[0][0] as CustomEvent).detail).toEqual({
      documentIds: [10], notebookIds: [7], reason: "agent-confirm",
    });

    await userEvent.click(screen.getByRole("button", { name: "撤销整批操作" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/agent/action-plans/31/undo"));
    expect(await screen.findByText("整批操作已撤销")).toBeInTheDocument();
  } finally {
    window.removeEventListener("studypilot:workspace-mutated", mutated);
  }
});

test("cancels a pending Agent plan without dispatching a workspace mutation", async () => {
  const plan = {
    id: 32,
    thread_id: 4,
    assistant_message_id: 2,
    course_id: 2,
    status: "pending",
    title: "不执行的计划",
    summary: "等待用户决定",
    operations: [{ type: "create_knowledge_node", notebook_id: 7, temp_id: "x", title: "X", description: "创建 X" }],
    before: {}, result: {}, destructive: false, error: "",
  };
  const thread = { id: 4, course_id: 2, title: "Plan chat", provider_id: "openai", model: "gpt-5.6-terra", message_count: 2 };
  const api = apiFor({ withThread: true });
  api.get.mockImplementation((path: string) => Promise.resolve(
    path === "/api/agent/providers" ? [provider]
      : path === "/api/agent/threads?course_id=2" ? [thread]
        : path === "/api/agent/threads/4" ? { ...thread, messages: [
          { id: 2, role: "assistant", content: "请确认。", sources: [], status: "complete", error: "", action_plan: plan },
        ] } : [],
  ));
  api.post.mockResolvedValue({ ...plan, status: "cancelled" });
  const mutated = vi.fn();
  window.addEventListener("studypilot:workspace-mutated", mutated);
  try {
    renderHost(api);
    await userEvent.click(screen.getByRole("button", { name: "打开 PILOT 助手" }));
    await userEvent.click(await screen.findByRole("button", { name: "取消整批计划" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/agent/action-plans/32/cancel"));
    expect(await screen.findByText("计划已取消，未修改任何内容")).toBeInTheDocument();
    expect(mutated).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener("studypilot:workspace-mutated", mutated);
  }
});

test("automatically grounds answers in the knowledge notebook currently on screen", async () => {
  const api = apiFor();
  render(
    <AgentHost api={api} courseId={2} context={{ view: "knowledge", notebookId: 7 }}>
      <main>Knowledge canvas</main>
    </AgentHost>,
  );
  fireEvent(window, new CustomEvent("studypilot:open-agent", { detail: { view: "chat" } }));
  expect(await screen.findByRole("button", { name: "当前知识图谱" })).toHaveAttribute("aria-pressed", "true");
  const composer = screen.getByRole("textbox", { name: "向 PILOT 提问" });
  await userEvent.type(composer, "Summarize this map");
  fireEvent.keyDown(composer, { key: "Enter", shiftKey: false });

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/agent/threads/4/messages",
    expect.objectContaining({
      context: expect.objectContaining({
        notebook_id: 7,
        include_current: true,
        include_knowledge: true,
      }),
    }),
    expect.anything(),
  ));
});

test("uses both split documents and lets the user replace full-library context with selected files", async () => {
  const api = apiFor();
  api.get.mockImplementation((path: string) => Promise.resolve(
    path === "/api/agent/providers" ? [provider]
      : path === "/api/agent/threads?course_id=2" ? []
        : path === "/api/courses/2/documents" ? [
          { id: 10, title: "Primary", filename: "primary.md", status: "ready" },
          { id: 12, title: "Secondary", filename: "secondary.pdf", status: "ready" },
          { id: 15, title: "Extra source", filename: "extra.docx", status: "ready" },
        ] : [],
  ));
  render(
    <AgentHost api={api} courseId={2} context={{ view: "library", documentId: 10, documentIds: [10, 12] }}>
      <main>Split reader</main>
    </AgentHost>,
  );
  fireEvent(window, new CustomEvent("studypilot:open-agent", { detail: { view: "chat" } }));
  expect(await screen.findByRole("button", { name: "当前 2 份资料" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "资料库" })).toHaveAttribute("aria-pressed", "true");

  await userEvent.click(screen.getByRole("button", { name: "选择指定资料" }));
  const pickerSlot = screen.getByTestId("agent-document-picker-slot");
  expect(pickerSlot).toHaveAttribute("data-state", "open");
  expect(await screen.findByRole("region", { name: "选择 Agent 阅读的资料" })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: "可选资料列表" })).toBeInTheDocument();
  await userEvent.click(await screen.findByRole("checkbox", { name: "Extra source · extra.docx" }));
  expect(screen.getByText("1 / 3")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "完成资料选择" }));
  expect(pickerSlot).toHaveAttribute("data-state", "closed");
  const composer = screen.getByRole("textbox", { name: "向 PILOT 提问" });
  await userEvent.type(composer, "Compare all visible and selected files");
  fireEvent.keyDown(composer, { key: "Enter" });

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/agent/threads/4/messages",
    expect.objectContaining({
      context: expect.objectContaining({
        document_ids: [10, 12],
        selected_document_ids: [15],
        include_library: false,
      }),
    }),
    expect.anything(),
  ));
});

test("keeps Shift+Enter as a newline and locks duplicate sends", async () => {
  const { api } = renderHost();
  await userEvent.click(screen.getByRole("button", { name: "打开 PILOT 助手" }));
  const composer = await screen.findByRole("textbox", { name: "向 PILOT 提问" });
  await userEvent.type(composer, "Line one");
  fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });

  expect(api.post).not.toHaveBeenCalled();
  expect(composer).toHaveValue("Line one");
});

test("uploads documents and images from the composer and sends them as grounded attachments", async () => {
  const api = apiFor();
  api.post.mockImplementation((path: string) => Promise.resolve(
    path === "/api/documents/import"
      ? { id: 15, title: "Attachment", filename: "attachment.md", status: "ready" }
      : path === "/api/media/images"
        ? { id: "image-1", filename: "diagram.png", media_type: "image/png", url: "/api/courses/2/media/images/image-1" }
        : path === "/api/agent/threads"
          ? { id: 4, course_id: 2, title: "新对话", provider_id: "openai", model: "gpt-5.6-terra", message_count: 0 }
          : path === "/api/agent/threads/4/messages"
            ? { thread: { id: 4, course_id: 2, title: "附件", provider_id: "openai", model: "gpt-5.6-terra" }, message: { id: 9, role: "assistant", content: "附件已读取", sources: [], status: "complete", error: "" } }
            : { ok: true },
  ));
  renderHost(api);
  await userEvent.click(screen.getByRole("button", { name: "打开 PILOT 助手" }));
  const input = await screen.findByLabelText("上传文件或图片");
  const markdown = new File(["# Notes"], "attachment.md", { type: "text/markdown" });
  const image = new File([new Uint8Array([137, 80, 78, 71])], "diagram.png", { type: "image/png" });
  await userEvent.upload(input, [markdown, image]);

  expect(screen.getByText("attachment.md")).toBeInTheDocument();
  expect(screen.getByText("diagram.png")).toBeInTheDocument();
  const composer = screen.getByRole("textbox", { name: "向 PILOT 提问" });
  await userEvent.type(composer, "比较这些附件");
  fireEvent.keyDown(composer, { key: "Enter" });

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/agent/threads/4/messages",
    expect.objectContaining({
      message: "比较这些附件",
      attachments: [
        expect.objectContaining({ kind: "document", document_id: 15, name: "attachment.md" }),
        expect.objectContaining({ kind: "image", image_asset_id: "image-1", name: "diagram.png" }),
      ],
      context: expect.objectContaining({ selected_document_ids: [15] }),
    }),
    expect.anything(),
  ));
  expect(await screen.findByText("附件已读取")).toBeInTheDocument();
});

test("accepts a pasted image and can remove it before sending", async () => {
  renderHost();
  await userEvent.click(screen.getByRole("button", { name: "打开 PILOT 助手" }));
  const composer = screen.getByRole("textbox", { name: "向 PILOT 提问" });
  const image = new File([new Uint8Array([137, 80, 78, 71])], "pasted.png", { type: "image/png" });
  fireEvent.paste(composer, {
    clipboardData: {
      files: [image],
      items: [{ kind: "file", type: "image/png", getAsFile: () => image }],
    },
  });

  expect(await screen.findByText("pasted.png")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "移除附件 pasted.png" }));
  expect(screen.queryByText("pasted.png")).not.toBeInTheDocument();
});

test("captures the current window into the same image attachment queue", async () => {
  const originalBridge = (window as any).studypilot;
  const captureWindow = vi.fn().mockResolvedValue(new Uint8Array([137, 80, 78, 71]));
  (window as any).studypilot = { ...originalBridge, capture: { window: captureWindow } };
  try {
    renderHost();
    await userEvent.click(screen.getByRole("button", { name: "打开 PILOT 助手" }));
    await userEvent.click(await screen.findByRole("button", { name: "截取当前窗口" }));

    expect(captureWindow).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/StudyPilot-截图-.*\.png/)).toBeInTheDocument();
  } finally {
    (window as any).studypilot = originalBridge;
  }
});

test("reopens saved conversations and supports history deletion", async () => {
  const api = apiFor({ withThread: true });
  renderHost(api);
  await userEvent.click(screen.getByRole("button", { name: "打开 PILOT 助手" }));

  expect(await screen.findByText("Saved answer")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "对话历史" }));
  expect(screen.getByRole("button", { name: "打开对话 Saved optimizer chat" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "删除对话 Saved optimizer chat" }));
  await userEvent.click(screen.getByRole("button", { name: "确认删除对话" }));

  expect(api.delete).toHaveBeenCalledWith("/api/agent/threads/4");
});

test("exports all local conversations to the archive and opens its folder", async () => {
  const originalBridge = (window as any).studypilot;
  const saveToArchive = vi.fn().mockResolvedValue("C:/Study/data/exports/PILOT-对话历史.md");
  const openExportDirectory = vi.fn().mockResolvedValue(undefined);
  (window as any).studypilot = { files: { saveToArchive, openExportDirectory }, clipboard: {} };
  const api = apiFor({ withThread: true });
  try {
    renderHost(api);
    await userEvent.click(screen.getByRole("button", { name: "打开 PILOT 助手" }));
    await userEvent.click(await screen.findByRole("button", { name: "对话历史" }));
    await userEvent.click(screen.getByRole("button", { name: "导出全部对话" }));

    await waitFor(() => expect(saveToArchive).toHaveBeenCalledTimes(1));
    expect(saveToArchive.mock.calls[0][0].suggestedName).toMatch(/^PILOT-对话历史-.*\.md$/);
    expect(ArrayBuffer.isView(saveToArchive.mock.calls[0][0].bytes)).toBe(true);
    const markdown = new TextDecoder().decode(saveToArchive.mock.calls[0][0].bytes);
    expect(markdown).toContain("Saved optimizer chat");
    expect(markdown).toContain("Saved answer");
    await userEvent.click(screen.getByRole("button", { name: "打开导出文件夹" }));
    expect(openExportDirectory).toHaveBeenCalled();
  } finally {
    (window as any).studypilot = originalBridge;
  }
});

test("configures a write-only provider key and tests the connection", async () => {
  const { api } = renderHost();
  await userEvent.click(screen.getByRole("button", { name: "打开 PILOT 助手" }));
  await userEvent.click(await screen.findByRole("button", { name: "模型设置" }));
  expect(screen.getByLabelText("API 密钥")).toHaveValue("");
  expect(screen.getByRole("combobox", { name: "单次 Token 上限" })).toHaveValue("100000");
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "单次 Token 上限" }), "64000");
  await userEvent.type(screen.getByLabelText("API 密钥"), "new-secret");
  await userEvent.click(screen.getByRole("button", { name: "保存模型配置" }));

  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    "/api/agent/providers/openai",
    expect.objectContaining({
      api_key: "new-secret",
      base_url: "https://api.openai.com/v1",
      model: "gpt-5.6-terra",
      max_output_tokens: 64000,
    }),
  ));
  expect(await screen.findByRole("status")).toHaveTextContent("模型配置已保存");
  await userEvent.click(screen.getByRole("button", { name: "测试模型连接" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/agent/providers/openai/test"));
  expect(await screen.findByRole("status")).toHaveTextContent("连接正常");
});

test("edits, renames, creates, and deletes model configurations", async () => {
  const api = apiFor();
  api.put.mockImplementation((path: string, payload: Record<string, unknown>) => Promise.resolve({
    ...provider,
    ...payload,
    id: path.split("/").pop() || provider.id,
    has_api_key: true,
  }));
  const { container } = renderHost(api);
  await userEvent.click(screen.getByRole("button", { name: "打开 PILOT 助手" }));
  await userEvent.click(await screen.findByRole("button", { name: "模型设置" }));

  expect(screen.queryByText("选择使用，或进入编辑修改名称与连接参数")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "新建模型配置" })).toHaveTextContent("＋ 新建");
  expect(container.querySelector(".agent-provider-icon svg")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "编辑模型 OpenAI" }));
  const labelInput = screen.getByRole("textbox", { name: "配置名称" });
  await userEvent.clear(labelInput);
  await userEvent.type(labelInput, "我的主模型");
  await userEvent.click(screen.getByRole("button", { name: "保存模型配置" }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    "/api/agent/providers/openai",
    expect.objectContaining({ label: "我的主模型" }),
  ));

  await userEvent.click(screen.getByRole("button", { name: "新建模型配置" }));
  await userEvent.click(screen.getByRole("button", { name: "选择 DeepSeek 图标" }));
  const newLabelInput = screen.getByRole("textbox", { name: "配置名称" });
  await userEvent.clear(newLabelInput);
  await userEvent.type(newLabelInput, "本地学习模型");
  await userEvent.type(screen.getByRole("textbox", { name: "接口地址" }), "http://127.0.0.1:11434/v1");
  await userEvent.type(screen.getByRole("textbox", { name: "模型名称" }), "qwen3");
  await userEvent.click(screen.getByRole("button", { name: "保存模型配置" }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    expect.stringMatching(/^\/api\/agent\/providers\/custom_/),
    expect.objectContaining({ label: "本地学习模型", model: "qwen3", icon: "deepseek" }),
  ));

  await userEvent.click(screen.getByRole("button", { name: "删除模型 本地学习模型" }));
  await userEvent.click(screen.getByRole("button", { name: "确认删除模型" }));
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith(
    expect.stringMatching(/^\/api\/agent\/providers\/custom_/),
  ));
});

test("keeps the stored write-only key when saving other provider settings", async () => {
  const { api } = renderHost();
  await userEvent.click(screen.getByRole("button", { name: "打开 PILOT 助手" }));
  await userEvent.click(await screen.findByRole("button", { name: "模型设置" }));
  await userEvent.selectOptions(screen.getByRole("combobox", { name: "单次 Token 上限" }), "64000");
  await userEvent.click(screen.getByRole("button", { name: "保存模型配置" }));

  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    "/api/agent/providers/openai",
    expect.not.objectContaining({ api_key: expect.anything() }),
  ));
});

test("keeps a failed provider draft visible and explains why saving failed", async () => {
  const api = apiFor();
  api.put.mockRejectedValueOnce(new Error("接口地址不可用"));
  renderHost(api);
  await userEvent.click(screen.getByRole("button", { name: "打开 PILOT 助手" }));
  await userEvent.click(await screen.findByRole("button", { name: "模型设置" }));
  const modelInput = screen.getByRole("textbox", { name: "模型名称" });
  await userEvent.clear(modelInput);
  await userEvent.type(modelInput, "draft-model");
  await userEvent.click(screen.getByRole("button", { name: "保存模型配置" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("接口地址不可用");
  expect(modelInput).toHaveValue("draft-model");
});

test("selects a saved model from the composer before creating a conversation", async () => {
  const api = apiFor({ providers: [provider, deepSeekProvider] });
  renderHost(api);
  await userEvent.click(screen.getByRole("button", { name: "打开 PILOT 助手" }));

  const selector = await screen.findByRole("combobox", { name: "当前模型" });
  expect(selector).toHaveValue("openai");
  await userEvent.selectOptions(selector, "deepseek");
  const composer = screen.getByRole("textbox", { name: "向 PILOT 提问" });
  await userEvent.type(composer, "Use the selected model");
  fireEvent.keyDown(composer, { key: "Enter", shiftKey: false });

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/agent/threads",
    expect.objectContaining({ provider_id: "deepseek" }),
  ));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/agent/threads/4/messages",
    expect.objectContaining({ provider_id: "deepseek" }),
    expect.anything(),
  ));
});

test("shows saved model configurations in settings and restores one click", async () => {
  const api = apiFor({ providers: [provider, deepSeekProvider] });
  renderHost(api);
  await userEvent.click(screen.getByRole("button", { name: "打开 PILOT 助手" }));
  await userEvent.click(await screen.findByRole("button", { name: "模型设置" }));

  expect(screen.getByRole("region", { name: "已保存模型配置" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "使用已保存模型 DeepSeek · DeepSeek-V4-Flash" }));
  expect(screen.getByRole("textbox", { name: "模型名称" })).toHaveValue("DeepSeek-V4-Flash");
  expect(screen.getByRole("textbox", { name: "接口地址" })).toHaveValue("https://gateway.example/v1");
});

test("uses one conversation column and opens materials as an on-demand drawer in workspace mode", async () => {
  const api = apiFor();
  const { container } = render(
    <AgentDock
      variant="workspace"
      api={api}
      courseId={2}
      context={{ view: "learning", title: "Course" }}
      requestedMode="learning"
    />,
  );

  expect(await screen.findByRole("log", { name: "\u5b66\u4e60\u5bf9\u8bdd" })).toBeInTheDocument();
  expect(container.querySelector(".learning-workbench__sources")).toBeNull();
  expect(container.querySelector(".learning-workbench__trail")).toBeNull();
  const materials = screen.getByRole("button", { name: "\u9009\u62e9\u5b66\u4e60\u8d44\u6599" });
  expect(screen.queryByRole("region", { name: "\u5b66\u4e60\u8d44\u6599" })).not.toBeInTheDocument();
  await userEvent.click(materials);
  expect(await screen.findByRole("region", { name: "\u5b66\u4e60\u8d44\u6599" })).toBeInTheDocument();
});

test("renders a saved [S1] citation as a real source button after Markdown URL sanitization", async () => {
  const api = apiFor({ withThread: true });
  api.get.mockImplementation((path: string) => Promise.resolve(
    path === "/api/agent/providers" ? [provider]
      : path === "/api/agent/threads?course_id=2" ? [{
          id: 4, course_id: 2, title: "Saved optimizer chat", provider_id: "openai", model: "gpt-5.6-terra", message_count: 2,
        }]
        : path === "/api/agent/threads/4" ? {
            id: 4,
            course_id: 2,
            title: "Saved optimizer chat",
            provider_id: "openai",
            model: "gpt-5.6-terra",
            message_count: 2,
            messages: [
              { id: 1, role: "user", content: "Compare optimizers", sources: [], status: "complete", error: "" },
              { id: 2, role: "assistant", content: "Newton uses curvature [S1].", sources: [source], status: "complete", error: "" },
            ],
          }
          : [],
  ));
  const { onOpenSource } = renderHost(api);
  fireEvent(window, new CustomEvent("studypilot:open-agent", { detail: { view: "chat" } }));

  const inline = await screen.findByRole("button", { name: "打开来源 Optimization Notes" });
  expect(inline).toHaveClass("agent-inline-citation");
  expect(inline).toHaveTextContent("S1");
  await userEvent.click(inline);
  expect(onOpenSource).toHaveBeenCalledWith(source);
});
