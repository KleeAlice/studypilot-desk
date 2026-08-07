import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { App } from "../src/app/App";
import { buildNavigationTarget, buildRoute, parseRoute } from "../src/app/router";

function json(data: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify({ data }), {
    status,
    headers: { "content-type": "application/json" },
  }));
}

const course = {
  id: 1,
  title: "机器学习基础",
  description: "从线性模型到神经网络",
  is_default: 1,
  cover_style: "cobalt",
  icon: "network",
  progress: 0.32,
  node_count: 12,
  edge_count: 8,
};

beforeEach(() => {
  window.history.replaceState({}, "", "/courses");
  (window as any).studypilot = {
    runtime: vi.fn().mockResolvedValue({ apiBase: "http://127.0.0.1:9000", dataDir: "C:/Study/data" }),
    window: { minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() },
    files: { chooseDocuments: vi.fn().mockResolvedValue([]) },
    clipboard: { readText: vi.fn().mockResolvedValue("") },
  };
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return json({ onboarding_complete: true, theme: "dark", startup_destination: "library" });
    if (url.endsWith("/api/courses")) return json([course]);
    if (url.endsWith("/api/courses/1/home")) return json({ course, task_counts: { todo: 2, doing: 1, blocked: 0, done: 4 }, notebook_count: 1, document_count: 0, run_count: 0, recent_items: [], continue_route: "/courses/1/dashboard" });
    if (url.endsWith("/api/system/status")) return json({ status: "ready", active_course: 1 });
    if (url.endsWith("/api/today")) return json({ week: { week: 1, tasks: [], deliverables: [] }, phase: { title: course.title, gate: "G1" }, tasks: [] });
    return json([]);
  }));
});

test("parses and builds application-level course routes", () => {
  expect(parseRoute("/courses")).toEqual({ level: "library" });
  expect(parseRoute("/courses/7/home")).toEqual({ level: "course", courseId: 7, view: "home" });
  expect(parseRoute("/courses/7/learning")).toEqual({ level: "course", courseId: 7, view: "learning" });
  expect(parseRoute("#/courses/7/home")).toEqual({ level: "course", courseId: 7, view: "home" });
  expect(parseRoute("/C:/courses/7/home")).toEqual({ level: "course", courseId: 7, view: "home" });
  expect(parseRoute("/courses/7/knowledge/12")).toEqual({ level: "course", courseId: 7, view: "knowledge", notebookId: 12 });
  expect(parseRoute("/courses/7/library/documents/23")).toEqual({ level: "course", courseId: 7, view: "library", documentId: 23 });
  expect(buildRoute({ level: "course", courseId: 7, view: "lab" })).toBe("/courses/7/lab");
  expect(buildRoute({ level: "course", courseId: 7, view: "library", documentId: 23 })).toBe("/courses/7/library/documents/23");
  expect(buildNavigationTarget({ level: "course", courseId: 7, view: "lab" }, "file:")).toBe("#/courses/7/lab");
});

test("starts on the application-level course bookshelf before the dashboard", async () => {
  render(<App />);

  expect(await screen.findByRole("heading", { name: "课程书架" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "今日驾驶舱" })).not.toBeInTheDocument();
  expect(screen.getByText("机器学习基础")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "进入课程：机器学习基础" }));
  await waitFor(() => expect(window.location.pathname).toBe("/courses/1/home"));
  expect(await screen.findByRole("heading", { name: "机器学习基础" })).toBeInTheDocument();
  expect(screen.getByLabelText("新任务")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "今日驾驶舱" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "复盘与求职" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /打开知识网络/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "返回课程书架" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "课程主页" })).toHaveAttribute("aria-current", "page");
});

test("fully hides the navigation rail and restores it from the title bar", async () => {
  const { container } = render(<App />);
  await screen.findByRole("heading", { name: "课程书架" });
  await userEvent.click(screen.getByRole("button", { name: "进入课程：机器学习基础" }));
  await waitFor(() => expect(window.location.pathname).toBe("/courses/1/home"));
  await screen.findByRole("heading", { name: "机器学习基础" });

  await userEvent.click(screen.getByRole("button", { name: "收起导航" }));
  expect(container.querySelector(".navrail")).toHaveClass("navrail--collapsed");
  expect(screen.queryByRole("button", { name: "收起导航" })).not.toBeInTheDocument();

  const restore = screen.getByRole("button", { name: "展开导航" });
  expect(restore.closest(".titlebar")).not.toBeNull();
  expect(container.querySelector(".navrail .nav-toggle")).toBeNull();
  await userEvent.click(restore);
  expect(container.querySelector(".navrail")).not.toHaveClass("navrail--collapsed");
  expect(screen.queryByRole("button", { name: "展开导航" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "收起导航" })).toBeInTheDocument();
});

test("keeps the empty course library usable when there is no active course", async () => {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return json({ onboarding_complete: true, theme: "dark", startup_destination: "library" });
    if (url.endsWith("/api/courses")) return json([]);
    if (url.endsWith("/api/system/status")) return json({ status: "ready", active_course: null });
    if (url.endsWith("/api/today")) return json({ message: "No active course" }, 404);
    return json([]);
  }));

  render(<App />);

  expect(await screen.findByRole("heading", { name: "\u8bfe\u7a0b\u4e66\u67b6" })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /\u65b0\u5efa\u8bfe\u7a0b/ })[0]).toBeEnabled();
  expect(screen.queryByText("\u672c\u5730\u670d\u52a1\u672a\u5c31\u7eea")).not.toBeInTheDocument();
});

test("opens the typed course wizard from the global shelf", async () => {
  render(<App />);
  await screen.findByRole("heading", { name: "课程书架" });
  await userEvent.click(screen.getAllByRole("button", { name: /新建课程/ })[0]);
  expect(screen.getByRole("dialog", { name: "选择这门课程的学习方式" })).toBeInTheDocument();
});

test("enters the newly created course home instead of leaving the shelf rendered", async () => {
  let createPayload: Record<string, unknown> | null = null;
  const created = { ...course, id: 2, title: "新建课程", is_default: 0 };
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return json({ onboarding_complete: true, theme: "dark", startup_destination: "library" });
    if (url.endsWith("/api/courses") && init?.method === "POST") {
      createPayload = JSON.parse(String(init.body || "{}"));
      return json(created);
    }
    if (url.endsWith("/api/courses/2/activate") && init?.method === "POST") return json(created);
    if (url.endsWith("/api/courses/2/home")) return json({ course: created, task_counts: { todo: 0, doing: 0, blocked: 0, done: 0 }, notebook_count: 0, document_count: 0, run_count: 0, recent_items: [], continue_route: "/courses/2/dashboard" });
    if (url.endsWith("/api/courses")) return json([course, created]);
    if (url.endsWith("/api/system/status")) return json({ status: "ready", active_course: 1 });
    if (url.endsWith("/api/today")) return json({ week: { week: 1, tasks: [], deliverables: [] }, phase: { title: created.title, gate: "G1" }, tasks: [] });
    return json([]);
  }));

  render(<App />);
  await screen.findByRole("heading", { name: "课程书架" });
  await userEvent.click(screen.getAllByRole("button", { name: /新建课程/ })[0]);
  await userEvent.click(screen.getByRole("button", { name: "默认学习课程" }));
  await userEvent.click(screen.getByRole("button", { name: "下一步" }));
  await userEvent.type(screen.getByLabelText("课程名称"), created.title);
  await userEvent.click(screen.getByRole("button", { name: "创建并进入课程" }));
  expect(createPayload).toMatchObject({
    goal: "", start_date: null, target_weeks: null, weekly_hours: null,
  });

  await waitFor(() => expect(window.location.pathname).toBe("/courses/2/home"));
  expect(await screen.findByRole("heading", { name: created.title })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "课程书架" })).not.toBeInTheDocument();
});

test("opens a document in an immersive shell without the course navigation", async () => {
  window.history.replaceState({}, "", "/courses/1/library/documents/9");
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return json({ onboarding_complete: true, theme: "dark", startup_destination: "library" });
    if (url.endsWith("/api/courses")) return json([course]);
    if (url.endsWith("/api/courses/1/home")) return json({ course, task_counts: {}, notebook_count: 0, document_count: 1, run_count: 0, recent_items: [], continue_route: "/courses/1/library" });
    if (url.endsWith("/api/system/status")) return json({ status: "ready", active_course: 1 });
    if (url.endsWith("/api/today")) return json({ week: { week: 1, tasks: [], deliverables: [] }, phase: { title: course.title, gate: "G1" }, tasks: [] });
    if (url.endsWith("/api/documents/9/content")) return json({ document: { id: 9, title: "Immersive Markdown", filename: "reader.md", format: "markdown", status: "ready", body: "# Reader", metadata: {}, structure: {} }, blocks: [{ id: 1, document_id: 9, block_key: "markdown:1", block_type: "markdown", ordinal: 0, locator: { section: 0 }, text: "# Reader", data: {} }] });
    if (url.endsWith("/api/documents/9/annotations")) return json([]);
    if (url.endsWith("/api/documents/9/revisions")) return json({ can_undo: false, can_redo: false });
    if (url.endsWith("/api/courses/1/notebooks")) return json([]);
    return json([]);
  }));

  const { container } = render(<App />);

  expect(await screen.findByRole("toolbar", { name: "资料批注工具" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Reader" })).toBeInTheDocument();
  expect(container.querySelector(".desktop-shell--document")).not.toBeNull();
  const navigationFlyout = container.querySelector(".document-navigation-flyout");
  const navigationTrigger = screen.getByRole("button", { name: "打开课程导航" });
  const navigationHotspot = container.querySelector(".document-navigation-hotspot");
  const outlineHotspot = container.querySelector(".document-outline-hotspot");
  expect(screen.getByRole("navigation", { name: "主导航" })).toBeInTheDocument();
  expect(navigationFlyout).toHaveAttribute("data-open", "false");
  expect(navigationHotspot).not.toBeNull();
  fireEvent.mouseEnter(navigationHotspot!);
  expect(navigationFlyout).toHaveAttribute("data-open", "true");
  fireEvent.click(navigationTrigger);
  expect(navigationFlyout).toHaveAttribute("data-open", "false");
  fireEvent.mouseEnter(outlineHotspot!);
  expect(navigationFlyout).toHaveAttribute("data-open", "false");
  fireEvent.click(navigationTrigger);
  expect(navigationFlyout).toHaveAttribute("data-open", "true");
  expect(container.querySelector(".page-scroll")).toBeNull();
});
