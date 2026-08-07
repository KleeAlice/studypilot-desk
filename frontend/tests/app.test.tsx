import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { App } from "../src/app/App";


const roadmap = {
  phases: [{ phase: 1, title: "基础底座与设计", gate: "G1", acceptance: "基础可运行", start_week: 1, end_week: 4 }],
  weeks: [{ week: 1, phase: 1, gate: "G1", foundation: "Python 工程", tasks: ["StudyPilot：建仓库"], deliverables: ["baseline_assessment.md"] }],
};

const learningStats = {
  current_streak: 3,
  active_days_14: 5,
  activity_total_14: 18,
  weekly_active_days: 4,
  completed_tasks: 6,
  total_tasks: 10,
  completion_rate: 60,
  knowledge_nodes: 12,
  knowledge_edges: 8,
  notebooks: 2,
  documents: 3,
  python_runs: 4,
  daily_activity: Array.from({ length: 14 }, (_, index) => ({ date: `2026-07-${String(index + 1).padStart(2, "0")}`, count: index % 4 })),
};

function response(data: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json" } }));
}

beforeEach(() => {
  window.history.replaceState({}, "", "/courses/1/dashboard");
  window.localStorage.removeItem("studypilot.python-workbench.draft.1");
  window.localStorage.removeItem("studypilot.agent.active-thread.learning.1");
  window.localStorage.removeItem("studypilot.agent.active-thread.assistant.1");
  window.localStorage.removeItem("studypilot.learning.document-scope.1");
  window.localStorage.removeItem("studypilot.course-library.last-document.v1.1");
  window.localStorage.removeItem("studypilot.python-workbench.draft.2");
  window.sessionStorage.removeItem("studypilot.python-workbench.draft.1");
  window.sessionStorage.removeItem("studypilot.python-workbench.draft.2");
  (window as any).studypilot = {
    runtime: vi.fn().mockResolvedValue({ apiBase: "http://127.0.0.1:9000", dataDir: "C:/Study/data" }),
    window: { minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() },
    files: { chooseDocuments: vi.fn().mockResolvedValue([]) },
    fonts: { list: vi.fn().mockResolvedValue(["Aptos", "霞鹜文楷"]) },
    appearance: { setZoomFactor: vi.fn().mockResolvedValue(undefined) },
    clipboard: { readText: vi.fn().mockResolvedValue("") },
  };
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return response({ onboarding_complete: true, theme: "dark", current_week: 1 });
    if (url.endsWith("/api/courses")) return response([]);
    if (url.endsWith("/api/today")) return response({ week: roadmap.weeks[0], phase: roadmap.phases[0], tasks: [] });
    if (url.endsWith("/api/roadmaps")) return response(roadmap);
    if (url.endsWith("/api/courses/1/roadmap")) return response({ course_id: 1, ...roadmap, generation: null });
    if (url.endsWith("/api/courses/1/stats")) return response(learningStats);
    if (url.endsWith("/api/system/status")) return response({ status: "ready", ai_required: false });
    if (url.endsWith("/api/knowledge")) return response({ nodes: [], edges: [] });
    if (url.endsWith("/api/library") || url.endsWith("/api/documents")) return response([]);
    if (url.endsWith("/api/python/runs")) return response([]);
    if (url.endsWith("/api/projects") || url.endsWith("/api/research")) return response([]);
    if (url.endsWith("/api/reviews") || url.endsWith("/api/weekly-reviews") || url.endsWith("/api/interviews")) return response([]);
    return response([]);
  }));
});

test("all primary navigation destinations are reachable", async () => {
  render(<App />);
  await screen.findByRole("heading", { name: "本周执行" });

  await userEvent.click(screen.getByRole("button", { name: "学习中心" }));
  expect(await screen.findByLabelText("学习中心工作区")).toBeInTheDocument();
  const destinations = [
    ["学习路线", "学习路线"],
    ["知识网络", "知识笔记"],
    ["资料书架", "本地资料库"],
    ["项目与研究", "项目与研究工作台"],
    ["学习统计", "学习统计"],
    ["设置", "系统设置"],
  ];
  for (const [button, heading] of destinations) {
    await userEvent.click(screen.getByRole("button", { name: button }));
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  }

  await userEvent.click(screen.getByRole("button", { name: "Python 实验室" }));
  expect(await screen.findByLabelText("Python 代码")).toBeInTheDocument();
});

test("imports dropped files globally even when the document library is not open", async () => {
  render(<App />);
  await screen.findByRole("heading", { name: "本周执行" });
  const file = new File(["# Global drop"], "global.md", { type: "text/markdown" });
  const dataTransfer = { files: [file], types: ["Files"] };

  fireEvent.dragOver(window, { dataTransfer });
  expect(document.documentElement.dataset.fileDropActive).toBe("true");
  fireEvent.drop(window, { dataTransfer });

  await waitFor(() => expect(fetch).toHaveBeenCalledWith(
    "http://127.0.0.1:9000/api/documents/import",
    expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
  ));
  expect(await screen.findByRole("status")).toHaveTextContent("已导入 1 份资料");
  expect(document.documentElement.dataset.fileDropActive).toBeUndefined();
});

test("exposes the docked PILOT assistant from a course page", async () => {
  render(<App />);
  expect(await screen.findByRole("button", { name: /PILOT/ })).toBeInTheDocument();
});
test("connects the primary Learning Center to cited documents and the right-side assistant", async () => {
  window.history.replaceState({}, "", "/courses/1/learning");
  const thread = {
    id: 71,
    course_id: 1,
    title: "分类学习",
    provider_id: "deepseek",
    model: "DeepSeek-V4-Flash",
    mode: "learning",
    message_count: 1,
    messages: [{
      id: 7101,
      role: "assistant",
      content: "同一个学习线程",
      status: "complete",
      error: "",
      sources: [{
        kind: "document",
        id: 9,
        document_id: 9,
        title: "演示资料",
        block_key: "line-12-14",
        locator: { start_line: 12, end_line: 14 },
        excerpt: "梯度下降会沿着损失减小的方向更新参数。",
        citation: "S1",
        location_label: "第 12-14 行",
      }],
    }],
  };
  const provider = {
    id: "deepseek",
    label: "DeepSeek",
    protocol: "openai_compatible",
    base_url: "http://127.0.0.1:32880",
    model: "DeepSeek-V4-Flash",
    max_output_tokens: 32000,
    has_api_key: true,
    enabled: true,
  };
  const document = {
    id: 9,
    title: "演示资料",
    filename: "demo.md",
    body: "梯度下降",
    format: "markdown",
    status: "ready",
    metadata: {},
    structure: {},
  };
  (fetch as any).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return response({ onboarding_complete: true, theme: "light", current_week: 1, active_course: 1 });
    if (url.endsWith("/api/courses")) return response([{ id: 1, title: "机器学习基础", is_default: 1 }]);
    if (url.endsWith("/api/courses/1/notebooks")) return response([]);
    if (url.endsWith("/api/today")) return response({ week: roadmap.weeks[0], phase: roadmap.phases[0], tasks: [] });
    if (url.endsWith("/api/system/status")) return response({ status: "ready", active_course: 1 });
    if (url.endsWith("/api/agent/providers")) return response([provider]);
    if (url.endsWith("/api/agent/threads?course_id=1")) return response([thread]);
    if (url.endsWith("/api/agent/threads/71")) return response(thread);
    if (url.endsWith("/api/documents/9/content")) return response({
      document,
      blocks: [{ id: 91, document_id: 9, block_key: "line-12-14", block_type: "paragraph", ordinal: 0, locator: { start_line: 12, end_line: 14 }, text: "梯度下降会沿着损失减小的方向更新参数。", data: {} }],
    });
    if (url.endsWith("/api/documents/9/annotations")) return response([]);
    if (url.endsWith("/api/documents/9/revisions")) return response({ can_undo: false, can_redo: false });
    if (url.endsWith("/api/courses/1/documents")) return response([document]);
    if (url.endsWith("/api/documents")) return response([document]);
    return response([]);
  });

  render(<App />);
  expect(await screen.findByLabelText("学习中心工作区")).toBeInTheDocument();
  expect(await screen.findByText("同一个学习线程")).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "学习资料" })).not.toBeInTheDocument();
  expect(screen.queryByRole("complementary", { name: "本轮学习轨迹" })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "查看学习进度" }));
  expect(screen.getByRole("complementary", { name: "本轮学习轨迹" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "查看学习进度" }));
  expect(screen.queryByRole("complementary", { name: "本轮学习轨迹" })).not.toBeInTheDocument();
  expect(screen.queryByRole("tablist", { name: "PILOT 模式" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "当前页面" })).not.toBeInTheDocument();
  expect(screen.queryByText("STUDY AGENT")).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "选择学习资料" }));
  expect(await screen.findByRole("region", { name: "学习资料" })).toBeInTheDocument();
  await userEvent.click(await screen.findByRole("checkbox", { name: "演示资料 · demo.md" }));
  await userEvent.click(screen.getByRole("button", { name: "完成资料选择" }));
  await waitFor(() => expect(window.localStorage.getItem("studypilot.learning.document-scope.1")).toBe("[9]"));

  await userEvent.click(screen.getByRole("button", { name: "来源：演示资料 · 第 12-14 行" }));
  expect(await screen.findByRole("complementary", { name: "联动分屏：资料阅读" })).toBeInTheDocument();
  expect(window.location.pathname).toBe("/courses/1/learning");
  expect(screen.getByRole("region", { name: "主工作区：学习中心" })).toBeInTheDocument();
  expect(await screen.findByRole("status", { name: "学习出处：第 12-14 行" })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "在右侧助手继续" }));
  expect(await screen.findByLabelText("PILOT 学习助手")).toBeInTheDocument();
  expect((await screen.findAllByText("同一个学习线程")).length).toBeGreaterThanOrEqual(2);
  expect(screen.getByRole("button", { name: "选择指定资料" })).toHaveTextContent("已选 1 份");
  expect(window.localStorage.getItem("studypilot.agent.active-thread.learning.1")).toBe("71");
});

test("opens the knowledge graph beside the document library and closes it without navigation", async () => {
  window.history.replaceState({}, "", "/courses/1/library");
  (fetch as any).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return response({ onboarding_complete: true, theme: "light", current_week: 1, active_course: 1 });
    if (url.endsWith("/api/courses")) return response([{ id: 1, title: "联动课程", is_default: 1 }]);
    if (url.endsWith("/api/courses/1/notebooks")) return response([{ id: 5, course_id: 1, title: "联动图谱", description: "", kind: "mixed", cover_style: "plum" }]);
    if (url.endsWith("/api/courses/1/notebooks/5/graph")) return response({ nodes: [], edges: [] });
    if (url.endsWith("/api/documents")) return response([]);
    if (url.endsWith("/api/today")) return response({ week: roadmap.weeks[0], phase: roadmap.phases[0], tasks: [] });
    if (url.endsWith("/api/system/status")) return response({ status: "ready", active_course: 1 });
    return response([]);
  });

  render(<App />);
  await userEvent.click(await screen.findByRole("button", { name: "分屏打开知识图谱" }));
  expect(await screen.findByRole("complementary", { name: "联动分屏：知识图谱" })).toBeInTheDocument();
  expect(window.location.pathname).toBe("/courses/1/library");
  await userEvent.click(screen.getByRole("button", { name: "关闭知识图谱分屏" }));
  expect(screen.queryByRole("complementary", { name: "联动分屏：知识图谱" })).not.toBeInTheDocument();
});

test("opens the document library beside a knowledge notebook", async () => {
  window.history.replaceState({}, "", "/courses/1/knowledge/5");
  (fetch as any).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return response({ onboarding_complete: true, theme: "light", current_week: 1, active_course: 1 });
    if (url.endsWith("/api/courses")) return response([{ id: 1, title: "联动课程", is_default: 1 }]);
    if (url.endsWith("/api/courses/1/notebooks")) return response([{ id: 5, course_id: 1, title: "联动图谱", description: "", kind: "mixed", cover_style: "plum" }]);
    if (url.endsWith("/api/courses/1/notebooks/5/graph")) return response({ nodes: [], edges: [] });
    if (url.endsWith("/api/documents")) return response([]);
    if (url.endsWith("/api/today")) return response({ week: roadmap.weeks[0], phase: roadmap.phases[0], tasks: [] });
    if (url.endsWith("/api/system/status")) return response({ status: "ready", active_course: 1 });
    return response([]);
  });

  render(<App />);
  await userEvent.click(await screen.findByRole("button", { name: "分屏打开资料库" }));
  expect(await screen.findByRole("complementary", { name: "联动分屏：资料库" })).toBeInTheDocument();
  expect(screen.getAllByRole("heading", { name: "本地资料库" }).length).toBeGreaterThan(0);
});

test("applies saved global typography when the workspace boots", async () => {
  (fetch as any).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return response({ onboarding_complete: true, theme: "light", current_week: 1, ui_font: "song", code_font: "consolas" });
    if (url.endsWith("/api/courses")) return response([]);
    if (url.endsWith("/api/today")) return response({ week: roadmap.weeks[0], phase: roadmap.phases[0], tasks: [] });
    if (url.endsWith("/api/system/status")) return response({ status: "ready", ai_required: false });
    return response([]);
  });

  render(<App />);
  await screen.findByRole("heading", { name: "本周执行" });

  expect(document.documentElement.style.getPropertyValue("--ui-font-family")).toContain("SimSun");
  expect(document.documentElement.style.getPropertyValue("--code-font-family")).toContain("Consolas");
});

test("applies a saved local font and normalizes legacy text size to the four-level scale without page zoom", async () => {
  (fetch as any).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return response({
      onboarding_complete: true,
      theme: "light",
      current_week: 1,
      ui_font: "local:霞鹜文楷",
      code_font: "system",
      ui_font_scale: 1.12,
      wallpaper_mode: "dawn",
    });
    if (url.endsWith("/api/courses")) return response([]);
    if (url.endsWith("/api/today")) return response({ week: roadmap.weeks[0], phase: roadmap.phases[0], tasks: [] });
    if (url.endsWith("/api/system/status")) return response({ status: "ready", ai_required: false });
    return response([]);
  });

  render(<App />);
  await screen.findByRole("heading", { name: "本周执行" });

  expect(document.documentElement.style.getPropertyValue("--ui-font-family")).toContain("霞鹜文楷");
  expect(document.documentElement.style.getPropertyValue("--ui-font-scale")).toBe("1.2");
  expect(document.documentElement.style.getPropertyValue("--ui-root-font-size")).toBe("19.2px");
  expect(document.documentElement.style.getPropertyValue("--ui-body-font-size")).toBe("16.8px");
  expect(document.documentElement.dataset.wallpaper).toBe("dawn");
  expect((window as any).studypilot.appearance.setZoomFactor).not.toHaveBeenCalled();
});

test("keeps a theme change when leaving and reopening settings", async () => {
  (fetch as any).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return response({ onboarding_complete: true, theme: "light", current_week: 1 });
    if (url.endsWith("/api/courses")) return response([]);
    if (url.endsWith("/api/today")) return response({ week: roadmap.weeks[0], phase: roadmap.phases[0], tasks: [] });
    if (url.endsWith("/api/system/status")) return response({ status: "ready", ai_required: false });
    return response({ saved: true });
  });

  render(<App />);
  await userEvent.click(await screen.findByRole("button", { name: "设置" }));
  await userEvent.click(screen.getByRole("button", { name: "深色" }));
  expect(document.documentElement.dataset.theme).toBe("dark");

  await userEvent.click(screen.getByRole("button", { name: "课程主页" }));
  await userEvent.click(screen.getByRole("button", { name: "设置" }));
  expect(screen.getByRole("button", { name: "深色" })).toHaveClass("is-active");
});

test("first run opens without a role-based learning profile", async () => {
  (fetch as any).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return response({ onboarding_complete: false, theme: "system" });
    if (url.endsWith("/api/courses")) return response([]);
    if (url.endsWith("/api/today")) return response({ week: roadmap.weeks[0], phase: roadmap.phases[0], tasks: [] });
    if (url.endsWith("/api/system/status")) return response({ status: "ready" });
    return response([]);
  });
  render(<App />);

  expect(await screen.findByRole("heading", { name: "本周执行" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "建立学习画像" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("目标岗位")).not.toBeInTheDocument();
});

test("passes the active course into the Python workbench draft scope", async () => {
  window.localStorage.setItem("studypilot.python-workbench.draft.1", JSON.stringify({ code: "print('course one only')", tests: "" }));
  window.localStorage.removeItem("studypilot.python-workbench.draft.2");
  const courses = [
    { id: 1, title: "课程一", description: "第一课程", is_default: 1 },
    { id: 2, title: "课程二", description: "第二课程", is_default: 0 },
  ];
  (fetch as any).mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return response({ onboarding_complete: true, theme: "dark", current_week: 1, active_course: 1 });
    if (url.endsWith("/api/system/status")) return response({ status: "ready", active_course: 1 });
    if (url.endsWith("/api/courses/2/activate") && init?.method === "POST") return response(courses[1]);
    if (url.endsWith("/api/courses")) return response(courses);
    if (url.endsWith("/api/today")) return response({ week: roadmap.weeks[0], phase: roadmap.phases[0], tasks: [] });
    if (url.endsWith("/api/python/environments") || url.endsWith("/api/python/runs")) return response([]);
    return response([]);
  });

  render(<App />);
  await screen.findByRole("heading", { name: "本周执行" });
  await userEvent.click(screen.getByRole("button", { name: "Python 实验室" }));
  expect(await screen.findByLabelText("Python 代码")).toHaveValue("print('course one only')");
  await userEvent.click(screen.getByRole("button", { name: "当前课程：课程一" }));
  await userEvent.click(screen.getByRole("button", { name: "切换到 课程二" }));

  const switchedCourseTrigger = await screen.findByRole("button", { name: "当前课程：课程二" });
  expect(switchedCourseTrigger).toBeInTheDocument();
  await waitFor(() => expect(switchedCourseTrigger).not.toHaveAttribute("aria-busy", "true"));
  await userEvent.click(screen.getByRole("button", { name: "Python 实验室" }));
  expect(await screen.findByLabelText("Python 代码")).not.toHaveValue("print('course one only')");
});

test("refreshes the visible workspace after an agent action batch mutates documents or knowledge", async () => {
  window.history.replaceState({}, "", "/courses/1/library");
  let documentLoads = 0;
  (fetch as any).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return response({ onboarding_complete: true, theme: "light", current_week: 1, active_course: 1 });
    if (url.endsWith("/api/courses")) return response([{ id: 1, title: "Agent course", is_default: 1 }]);
    if (url.endsWith("/api/courses/1/notebooks")) return response([]);
    if (url.endsWith("/api/documents")) {
      documentLoads += 1;
      return response([]);
    }
    if (url.endsWith("/api/today")) return response({ week: roadmap.weeks[0], phase: roadmap.phases[0], tasks: [] });
    if (url.endsWith("/api/system/status")) return response({ status: "ready", active_course: 1 });
    return response([]);
  });

  render(<App />);
  await waitFor(() => expect(documentLoads).toBe(1));

  window.dispatchEvent(new CustomEvent("studypilot:workspace-mutated", {
    detail: { documentIds: [10], notebookIds: [5], reason: "agent-confirm" },
  }));

  await waitFor(() => expect(documentLoads).toBe(2));
});

test("reveals course navigation from the reader edge and returns to the last open document", async () => {
  window.history.replaceState({}, "", "/courses/1/library/documents/9");
  const source = {
    id: 9,
    title: "阅读中的资料",
    filename: "reading.md",
    body: "Keep reading",
    format: "markdown",
    status: "ready",
    metadata: {},
    structure: {},
  };
  (fetch as any).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return response({ onboarding_complete: true, theme: "light", current_week: 1, active_course: 1 });
    if (url.endsWith("/api/courses")) return response([{ id: 1, title: "状态课程", is_default: 1 }]);
    if (url.endsWith("/api/system/status")) return response({ status: "ready", active_course: 1 });
    if (url.endsWith("/api/today")) return response({ week: roadmap.weeks[0], phase: roadmap.phases[0], tasks: [] });
    if (url.endsWith("/api/documents/9/content")) return response({
      document: source,
      blocks: [{ id: 90, document_id: 9, block_key: "markdown:1", block_type: "markdown", ordinal: 0, locator: { section: 0 }, text: "Keep reading", data: {} }],
    });
    if (url.endsWith("/api/documents/9/annotations")) return response([]);
    if (url.endsWith("/api/documents/9/revisions")) return response({ can_undo: false, can_redo: false });
    if (url.endsWith("/api/courses/1/notebooks")) return response([]);
    if (url.endsWith("/api/documents")) return response([source]);
    return response([]);
  });

  const { container } = render(<App />);
  await screen.findByText("Keep reading");
  expect(window.localStorage.getItem("studypilot.course-library.last-document.v1.1")).toBe("9");

  fireEvent.click(screen.getByRole("button", { name: "打开课程导航" }));
  expect(container.querySelector(".document-navigation-flyout")).toHaveAttribute("data-open", "true");
  await userEvent.click(screen.getByRole("button", { name: "设置" }));
  expect(await screen.findByRole("heading", { name: "系统设置" })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "资料书架" }));
  expect(window.location.pathname).toBe("/courses/1/library/documents/9");
  expect(await screen.findByText("Keep reading")).toBeInTheDocument();
});

test("opens an assistant knowledge source in its notebook and focuses the exact node", async () => {
  window.history.replaceState({}, "", "/courses/1/knowledge/5");
  window.sessionStorage.setItem("studypilot.agent.continuity", JSON.stringify({ open: true, mode: "assistant" }));
  const provider = {
    id: "deepseek",
    label: "DeepSeek",
    protocol: "openai_compatible",
    base_url: "http://127.0.0.1:32880",
    model: "deepseek-v3",
    max_output_tokens: 32000,
    has_api_key: true,
    enabled: true,
  };
  const source = {
    kind: "knowledge",
    id: 61,
    notebook_id: 5,
    node_id: 61,
    title: "精确来源节点",
    excerpt: "这是知识节点里的原文。",
    citation: "S1",
  };
  const thread = {
    id: 91,
    course_id: 1,
    title: "知识来源",
    provider_id: "deepseek",
    model: "deepseek-v3",
    mode: "assistant",
    message_count: 2,
    messages: [
      { id: 9101, role: "user", content: "解释来源节点", sources: [], status: "complete", error: "" },
      { id: 9102, role: "assistant", content: "答案来自知识节点 [S1]。", sources: [source], status: "complete", error: "" },
    ],
  };
  (fetch as any).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return response({ onboarding_complete: true, theme: "light", current_week: 1, active_course: 1 });
    if (url.endsWith("/api/courses")) return response([{ id: 1, title: "知识来源课程", is_default: 1 }]);
    if (url.endsWith("/api/courses/1/notebooks")) return response([{ id: 5, course_id: 1, title: "来源笔记本", kind: "concept" }]);
    if (url.endsWith("/api/courses/1/notebooks/5/graph")) return response({
      nodes: [
        { id: 61, title: "精确来源节点", module: "来源", kind: "concept", content: "这是知识节点里的原文。", color: "blue", position_x: 1180, position_y: 720 },
        { id: 62, title: "其他节点", module: "来源", kind: "concept", content: "不应选中", color: "teal", position_x: 120, position_y: 100 },
      ],
      edges: [],
    });
    if (url.endsWith("/api/today")) return response({ week: roadmap.weeks[0], phase: roadmap.phases[0], tasks: [] });
    if (url.endsWith("/api/system/status")) return response({ status: "ready", active_course: 1 });
    if (url.endsWith("/api/agent/providers")) return response([provider]);
    if (url.endsWith("/api/agent/threads?course_id=1")) return response([thread]);
    if (url.endsWith("/api/agent/threads/91")) return response(thread);
    if (url.endsWith("/api/documents")) return response([]);
    return response([]);
  });

  render(<App />);
  expect(await screen.findByTestId("knowledge-node-61")).not.toHaveClass("is-source-focus");
  expect(await screen.findByText(/答案来自知识节点/)).toBeInTheDocument();
  await userEvent.click(screen.getByText("参考来源 · 1"));
  await userEvent.click(screen.getByRole("button", { name: "来源：精确来源节点" }));

  expect(window.location.pathname).toBe("/courses/1/knowledge/5");
  await waitFor(() => expect(screen.getByTestId("knowledge-node-61")).toHaveAttribute("data-source-focus", "true"));
  expect(screen.getByTestId("knowledge-node-61")).toHaveClass("is-selected", "is-source-focus");
  expect(screen.getByTestId("knowledge-node-62")).not.toHaveClass("is-selected", "is-source-focus");
});
