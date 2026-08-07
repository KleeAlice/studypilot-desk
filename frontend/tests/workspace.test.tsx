import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { App } from "../src/app/App";

function json(data: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/json" } }));
}

beforeEach(() => {
  window.history.replaceState({}, "", "/courses/1/dashboard");
  (window as any).studypilot = {
    runtime: vi.fn().mockResolvedValue({ apiBase: "http://127.0.0.1:9000", dataDir: "C:/Study/data" }),
    window: { minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() },
    files: { chooseDocuments: vi.fn().mockResolvedValue([]) },
    clipboard: { readText: vi.fn().mockResolvedValue("") },
  };
});

test("creates and activates a course then opens its knowledge canvas", async () => {
  const requests: Array<{ url: string; method: string; body?: any }> = [];
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ url, method, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    if (url.endsWith("/api/settings")) return json({ onboarding_complete: true, theme: "dark", current_week: 1, active_course: 1 });
    if (url.endsWith("/api/system/status")) return json({ status: "ready", active_course: 1 });
    if (url.endsWith("/api/courses") && method === "GET") return json([{ id: 1, title: "半年路线", description: "默认课程", is_default: 1 }]);
    if (url.endsWith("/api/courses") && method === "POST") return json({ id: 2, title: "RAG 专项", description: "建立检索知识图谱", is_default: 0 }, 201);
    if (url.endsWith("/api/courses/2/activate")) return json({ id: 2, title: "RAG 专项", description: "建立检索知识图谱" });
    if (url.endsWith("/api/today")) return json({ week: { week: 1, tasks: [], deliverables: [], foundation: "知识创作" }, phase: { title: "半年路线", gate: "G1" }, tasks: [] });
    if (url.endsWith("/api/knowledge")) return json({ nodes: [], edges: [] });
    if (url.endsWith("/api/documents")) return json([]);
    return json([]);
  }));

  render(<App />);
  await screen.findByRole("heading", { name: "本周执行" });
  await userEvent.click(screen.getByRole("button", { name: /当前课程/ }));
  expect(screen.getByRole("dialog", { name: "课程空间" })).toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("dialog", { name: "课程空间" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /当前课程/ })).toHaveFocus();
  await userEvent.click(screen.getByRole("button", { name: /当前课程/ }));
  await userEvent.click(screen.getByRole("button", { name: "关闭课程空间" }));
  expect(screen.getByRole("button", { name: /当前课程/ })).toHaveFocus();
  await userEvent.click(screen.getByRole("button", { name: /当前课程/ }));
  await userEvent.click(screen.getByRole("button", { name: "新建课程" }));
  await userEvent.type(screen.getByLabelText("课程名称"), "RAG 专项");
  await userEvent.type(screen.getByLabelText("课程描述"), "建立检索知识图谱");
  await userEvent.click(screen.getByRole("button", { name: "创建并进入知识画布" }));

  expect(await screen.findByRole("heading", { name: "RAG 专项" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "知识网络" }));
  expect(await screen.findByRole("heading", { name: "知识笔记" })).toBeInTheDocument();
  await waitFor(() => expect(requests.some((item) => item.url.endsWith("/api/courses") && item.method === "POST")).toBe(true));
  expect(requests.some((item) => item.url.endsWith("/api/courses/2/activate") && item.method === "POST")).toBe(true);
});

test("opens the current course knowledge notebook collection and enters a notebook canvas", async () => {
  const requests: Array<{ url: string; method: string }> = [];
  const courses = [
    { id: 1, title: "半年路线", description: "默认课程", is_default: 1, node_count: 8, edge_count: 5 },
    { id: 2, title: "RAG 专项", description: "检索与生成", is_default: 0, node_count: 3, edge_count: 2 },
  ];
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ url, method });
    if (url.endsWith("/api/settings")) return json({ onboarding_complete: true, theme: "dark", current_week: 1, active_course: 1 });
    if (url.endsWith("/api/system/status")) return json({ status: "ready", active_course: 1 });
    if (url.endsWith("/api/courses") && method === "GET") return json(courses);
    if (url.endsWith("/api/courses/1/notebooks")) return json([{ id: 10, course_id: 1, title: "半年路线笔记", description: "课程知识", kind: "mixed", cover_style: "plum", node_count: 8, edge_count: 5 }]);
    if (url.endsWith("/api/courses/1/notebooks/10/graph")) return json({ nodes: [], edges: [] });
    if (url.endsWith("/api/today")) return json({ week: { week: 1, tasks: [], deliverables: [], foundation: "知识创作" }, phase: { title: "半年路线", gate: "G1" }, tasks: [] });
    if (url.endsWith("/api/knowledge")) return json({ nodes: [], edges: [] });
    if (url.endsWith("/api/documents")) return json([]);
    return json([]);
  }));

  render(<App />);
  await screen.findByRole("heading", { name: "本周执行" });
  await userEvent.click(screen.getByRole("button", { name: "知识网络" }));

  expect(await screen.findByRole("heading", { name: "知识笔记" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "知识画布" })).not.toBeInTheDocument();
  expect(screen.getByText("8 个节点 · 5 条关系")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "打开知识笔记：半年路线笔记" }));
  expect(await screen.findByRole("button", { name: "返回笔记本书架" })).toBeInTheDocument();
  expect(requests).toContainEqual(expect.objectContaining({ url: expect.stringMatching(/\/api\/courses\/1\/notebooks\/10\/graph$/), method: "GET" }));
});

test("commits the active course even when non-critical workspace refreshes fail", async () => {
  let activated = false;
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/settings")) return json({ onboarding_complete: true, theme: "dark", current_week: 1, active_course: 1 });
    if (url.endsWith("/api/system/status")) return json({ status: "ready", active_course: 1 });
    if (url.endsWith("/api/courses/2/activate") && method === "POST") {
      activated = true;
      return json({ id: 2, title: "可靠系统", description: "课程二" });
    }
    if (url.endsWith("/api/courses") && method === "GET") {
      if (activated) return Promise.reject(new Error("课程列表暂时不可用"));
      return json([
        { id: 1, title: "半年路线", description: "默认课程" },
        { id: 2, title: "可靠系统", description: "课程二" },
      ]);
    }
    if (url.endsWith("/api/today")) {
      if (activated) return Promise.reject(new Error("今日摘要暂时不可用"));
      return json({ week: { week: 1, tasks: [], deliverables: [], foundation: "基础" }, phase: { title: "半年路线", gate: "G1" }, tasks: [] });
    }
    return json([]);
  }));

  render(<App />);
  await screen.findByRole("heading", { name: "本周执行" });
  await userEvent.click(screen.getByRole("button", { name: /当前课程/ }));
  await userEvent.click(screen.getByRole("button", { name: "切换到 可靠系统" }));

  expect(await screen.findByRole("button", { name: "当前课程：可靠系统" })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "当前课程：可靠系统" })).toHaveFocus());
  expect(screen.getByRole("status")).toHaveTextContent("已切换到“可靠系统”");
});

test("keeps a newly created course available when its first activation fails", async () => {
  let createCount = 0;
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.endsWith("/api/settings")) return json({ onboarding_complete: true, theme: "dark", current_week: 1, active_course: 1 });
    if (url.endsWith("/api/system/status")) return json({ status: "ready", active_course: 1 });
    if (url.endsWith("/api/courses") && method === "GET") return json([{ id: 1, title: "半年路线", description: "默认课程" }]);
    if (url.endsWith("/api/courses") && method === "POST") {
      createCount += 1;
      return json({ id: 2, title: "RAG 专项", description: "检索课程" }, 201);
    }
    if (url.endsWith("/api/courses/2/activate") && method === "POST") {
      return Promise.resolve(new Response(JSON.stringify({ error: { message: "激活服务暂时不可用" } }), { status: 503, headers: { "content-type": "application/json" } }));
    }
    if (url.endsWith("/api/today")) return json({ week: { week: 1, tasks: [], deliverables: [], foundation: "基础" }, phase: { title: "半年路线", gate: "G1" }, tasks: [] });
    return json([]);
  }));

  render(<App />);
  await screen.findByRole("heading", { name: "本周执行" });
  await userEvent.click(screen.getByRole("button", { name: /当前课程/ }));
  await userEvent.click(screen.getByRole("button", { name: "新建课程" }));
  await userEvent.type(screen.getByLabelText("课程名称"), "RAG 专项");
  await userEvent.type(screen.getByLabelText("课程描述"), "检索课程");
  await userEvent.click(screen.getByRole("button", { name: "创建并进入知识画布" }));

  expect(await screen.findByRole("status")).toHaveTextContent("课程“RAG 专项”已经创建");
  expect(screen.queryByRole("dialog", { name: "课程空间" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "当前课程：半年路线" })).toHaveFocus();
  await userEvent.click(screen.getByRole("button", { name: /当前课程/ }));
  expect(screen.getByRole("button", { name: "切换到 RAG 专项" })).toBeInTheDocument();
  expect(createCount).toBe(1);
});
