import { render, screen, waitFor } from "@testing-library/react";
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
  window.localStorage.removeItem("studypilot.python-workbench.draft.2");
  window.sessionStorage.removeItem("studypilot.python-workbench.draft.1");
  window.sessionStorage.removeItem("studypilot.python-workbench.draft.2");
  (window as any).studypilot = {
    runtime: vi.fn().mockResolvedValue({ apiBase: "http://127.0.0.1:9000", dataDir: "C:/Study/data" }),
    window: { minimize: vi.fn(), toggleMaximize: vi.fn(), close: vi.fn() },
    files: { chooseDocuments: vi.fn().mockResolvedValue([]) },
    clipboard: { readText: vi.fn().mockResolvedValue("") },
  };
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return response({ onboarding_complete: true, theme: "dark", current_week: 1 });
    if (url.endsWith("/api/courses")) return response([]);
    if (url.endsWith("/api/today")) return response({ week: roadmap.weeks[0], phase: roadmap.phases[0], tasks: [] });
    if (url.endsWith("/api/roadmaps")) return response(roadmap);
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
  await screen.findByRole("heading", { name: "今日驾驶舱" });

  const destinations = [
    ["24 周路线", "路线与阶段闸门"],
    ["知识网络", "知识笔记"],
    ["资料书架", "本地资料库"],
    ["Python 实验室", "Python 实验室"],
    ["项目与研究", "项目与研究工作台"],
    ["复盘与求职", "复盘、面试与证据"],
    ["学习统计", "学习统计"],
    ["设置", "系统设置"],
  ];
  for (const [button, heading] of destinations) {
    await userEvent.click(screen.getByRole("button", { name: button }));
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  }
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
  await screen.findByRole("heading", { name: "今日驾驶舱" });

  expect(document.documentElement.style.getPropertyValue("--ui-font-family")).toContain("SimSun");
  expect(document.documentElement.style.getPropertyValue("--code-font-family")).toContain("Consolas");
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

  await userEvent.click(screen.getByRole("button", { name: "今日驾驶舱" }));
  await userEvent.click(screen.getByRole("button", { name: "设置" }));
  expect(screen.getByRole("button", { name: "深色" })).toHaveClass("is-active");
});

test("first run requires a learning profile and persists completion", async () => {
  (fetch as any).mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/api/settings")) return response({ onboarding_complete: false, theme: "system" });
    if (url.endsWith("/api/courses")) return response([]);
    if (url.includes("/api/settings/")) return response({ saved: true });
    if (url.endsWith("/api/today")) return response({ week: roadmap.weeks[0], phase: roadmap.phases[0], tasks: [] });
    if (url.endsWith("/api/system/status")) return response({ status: "ready" });
    return response(roadmap);
  });
  render(<App />);

  expect(await screen.findByRole("heading", { name: "建立学习画像" })).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("目标岗位"), "大模型应用算法工程师");
  await userEvent.click(screen.getByRole("button", { name: "生成第一周计划" }));

  await waitFor(() => expect(screen.queryByRole("heading", { name: "建立学习画像" })).not.toBeInTheDocument());
  expect(fetch).toHaveBeenCalledWith(
    "http://127.0.0.1:9000/api/settings/onboarding_complete",
    expect.objectContaining({ method: "PUT" }),
  );
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
  await screen.findByRole("heading", { name: "今日驾驶舱" });
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
