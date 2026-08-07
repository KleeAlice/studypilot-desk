import { render, screen } from "@testing-library/react";
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
    clipboard: { readText: vi.fn().mockResolvedValue("待整理的问题") },
  };
});

test("task creation and Python output are real API flows", async () => {
  let runReads = 0;
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return json({ onboarding_complete: true, theme: "dark", current_week: 1 });
    if (url.endsWith("/api/system/status")) return json({ status: "ready" });
    if (url.endsWith("/api/today")) return json({ week: { week: 1, foundation: "Python", tasks: [], deliverables: [] }, phase: { title: "基础", gate: "G1", acceptance: "可运行" }, tasks: [] });
    if (url.endsWith("/api/tasks") && init?.method === "POST") return json({ id: 7, title: "完成 DAG 测试", status: "todo" }, 201);
    if (url.endsWith("/api/python/runs") && init?.method === "POST") return json({ id: "run-1", status: "running" }, 201);
    if (url.endsWith("/api/python/runs/run-1")) {
      runReads += 1;
      return json({ id: "run-1", status: runReads > 1 ? "passed" : "running", stdout: runReads > 1 ? "hello\n" : "", stderr: "" });
    }
    if (url.endsWith("/api/python/runs")) return json([]);
    return json([]);
  }));
  render(<App />);
  await screen.findByRole("heading", { name: "本周执行" });

  await userEvent.type(screen.getByLabelText("新任务"), "完成 DAG 测试");
  await userEvent.click(screen.getByRole("button", { name: "添加任务" }));
  expect(await screen.findByText("任务已写入本地数据库")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Python 实验室" }));
  await userEvent.clear(screen.getByLabelText("Python 代码"));
  await userEvent.type(screen.getByLabelText("Python 代码"), "print('hello')");
  await userEvent.click(screen.getByRole("button", { name: "运行代码" }));
  expect(await screen.findByText("hello", { exact: false })).toBeInTheDocument();
});

test("API failures are shown as friendly Chinese messages", async () => {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return json({ onboarding_complete: true, theme: "dark" });
    if (url.endsWith("/api/system/status")) return json({ status: "ready" });
    if (url.endsWith("/api/today")) return json({ week: { week: 1, tasks: [], deliverables: [] }, phase: { title: "基础", gate: "G1" }, tasks: [] });
    if (url.endsWith("/api/tasks") && init?.method === "POST") {
      return Promise.resolve(new Response(JSON.stringify({ error: { code: "DB_BUSY", message: "数据暂时繁忙", details: null } }), { status: 503 }));
    }
    return json([]);
  }));
  render(<App />);
  await screen.findByRole("heading", { name: "本周执行" });
  await userEvent.type(screen.getByLabelText("新任务"), "测试错误");
  await userEvent.click(screen.getByRole("button", { name: "添加任务" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("数据暂时繁忙");
});
