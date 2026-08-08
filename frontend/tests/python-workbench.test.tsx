import { beforeEach, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Lab } from "../src/features/Lab";

beforeEach(() => {
  window.sessionStorage.removeItem("studypilot.python-workbench.draft");
  window.sessionStorage.removeItem("studypilot.python-workbench.draft.1");
  window.sessionStorage.removeItem("studypilot.python-workbench.draft.2");
  window.localStorage.removeItem("studypilot.python-workbench.draft");
  window.localStorage.removeItem("studypilot.python-workbench.draft.1");
  window.localStorage.removeItem("studypilot.python-workbench.draft.2");
  window.localStorage.removeItem("studypilot.python-workbench.draft.101");
  window.localStorage.removeItem("studypilot.python-workbench.draft.202");
});

test("opens directly into the full-height Python workbench without a descriptive masthead", async () => {
  const api = { get: vi.fn(async () => []), post: vi.fn(), put: vi.fn() } as any;
  const { container } = render(<Lab api={api} />);

  await screen.findByRole("button", { name: "运行代码" });
  expect(screen.queryByRole("heading", { name: "Python 实验室" })).not.toBeInTheDocument();
  expect(container.querySelector(".lab-page")).toHaveAttribute("data-layout", "full-workbench");
});

test("selects a real Python environment without exposing a duplicate console theme", async () => {
  window.localStorage.removeItem("studypilot.python-workbench.environment");
  const posts: any[] = [];
  let runReads = 0;
  const api = {
    get: vi.fn(async (path: string) => {
      if (path === "/api/python/environments") return [
        { id: "managed", label: "StudyPilot Python", version: "3.10.12", path: "C:/Study/.venv/python.exe", kind: "managed", current: true },
        { id: "conda-ml", label: "Conda · ml", version: "3.11.9", path: "C:/conda/envs/ml/python.exe", kind: "conda", current: false },
      ];
      if (path === "/api/python/runs") return [];
      if (path === "/api/python/runs/run-2") {
        runReads += 1;
        return { id: "run-2", status: runReads > 1 ? "passed" : "running", stdout: "environment ok\n", stderr: "", environment_id: "conda-ml", duration_ms: 34 };
      }
      return [];
    }),
    post: vi.fn(async (path: string, body?: any) => {
      posts.push({ path, body });
      if (path === "/api/python/runs") return { id: "run-2", status: "running", stdout: "", stderr: "" };
      return {};
    }),
    put: vi.fn(async () => ({})),
  } as any;

  const firstView = render(<Lab api={api} />);
  const environments = await screen.findByLabelText("Python 环境");
  await userEvent.selectOptions(environments, "conda-ml");
  expect(screen.queryByLabelText("控制台主题")).not.toBeInTheDocument();
  expect(screen.getByTestId("output-console")).not.toHaveAttribute("data-theme-preference");
  expect(screen.getByTestId("output-console").className).not.toMatch(/terminal-theme--/);

  await userEvent.clear(screen.getByLabelText("Python 代码"));
  await userEvent.type(screen.getByLabelText("Python 代码"), "print('environment ok')");
  await userEvent.click(screen.getByRole("button", { name: "运行代码" }));
  expect(await screen.findByText("environment ok", { exact: false })).toBeInTheDocument();
  await waitFor(() => expect(posts.some((item) => item.path === "/api/python/runs" && item.body.environment_id === "conda-ml")).toBe(true));

  firstView.unmount();
  render(<Lab api={api} />);
  const restoredEnvironment = await screen.findByLabelText("Python 环境");
  await waitFor(() => expect(restoredEnvironment).toHaveValue("conda-ml"));
});

test("renders stderr-only failures as error output", async () => {
  const api = {
    get: vi.fn(async (path: string) => {
      if (path === "/api/python/environments" || path === "/api/python/runs") return [];
      return [];
    }),
    post: vi.fn(async () => ({
      id: "run-error",
      status: "failed",
      stdout: "",
      stderr: "RuntimeError: boom",
      duration_ms: 12,
    })),
  } as any;

  render(<Lab api={api} />);
  await userEvent.click(await screen.findByRole("button", { name: "运行代码" }));
  expect(await screen.findByText("RuntimeError: boom")).toHaveClass("stderr");
});

test("cancels run polling when leaving the workbench", async () => {
  let detailReads = 0;
  const api = {
    get: vi.fn(async (path: string) => {
      if (path === "/api/python/environments" || path === "/api/python/runs") return [];
      if (path === "/api/python/runs/run-live") detailReads += 1;
      return { id: "run-live", status: "running", stdout: "", stderr: "" };
    }),
    post: vi.fn(async () => ({ id: "run-live", status: "running", stdout: "", stderr: "" })),
  } as any;

  const view = render(<Lab api={api} />);
  await userEvent.click(await screen.findByRole("button", { name: "运行代码" }));
  view.unmount();
  await new Promise((resolve) => window.setTimeout(resolve, 230));
  expect(detailReads).toBe(0);
});

test("autosaves both files and restores the latest unsaved edits after navigation", async () => {
  const api = {
    get: vi.fn(async () => []),
    post: vi.fn(async () => ({})),
  } as any;

  const firstView = render(<Lab api={api} />);
  const codeEditor = await screen.findByLabelText("Python 代码");
  await userEvent.clear(codeEditor);
  await userEvent.type(codeEditor, "print('draft survives')");
  await userEvent.click(screen.getByRole("tab", { name: "tests.py" }));
  await userEvent.type(screen.getByLabelText("公共测试"), "assert True");

  await waitFor(() => {
    expect(JSON.parse(window.localStorage.getItem("studypilot.python-workbench.draft.1") || "{}")).toEqual({
      code: "print('draft survives')",
      tests: "assert True",
    });
  }, { timeout: 1400 });

  await userEvent.type(screen.getByLabelText("公共测试"), "\n# leave immediately");
  firstView.unmount();
  window.sessionStorage.clear();
  render(<Lab api={api} />);
  expect(await screen.findByLabelText("Python 代码")).toHaveValue("print('draft survives')");
  await userEvent.click(screen.getByRole("tab", { name: "tests.py" }));
  expect(screen.getByLabelText("公共测试")).toHaveValue("assert True\n# leave immediately");
});

test("migrates a legacy session draft into persistent course storage", async () => {
  window.sessionStorage.setItem("studypilot.python-workbench.draft.1", JSON.stringify({
    code: "print('legacy session')",
    tests: "assert 'legacy'",
  }));
  const api = { get: vi.fn(async () => []), post: vi.fn(async () => ({})) } as any;

  render(<Lab api={api} courseId={1} />);

  expect(await screen.findByLabelText("Python 代码")).toHaveValue("print('legacy session')");
  expect(JSON.parse(window.localStorage.getItem("studypilot.python-workbench.draft.1") || "{}")).toEqual({
    code: "print('legacy session')",
    tests: "assert 'legacy'",
  });
  expect(window.sessionStorage.getItem("studypilot.python-workbench.draft.1")).toBeNull();
});

test("can undo and swap template or history replacements", async () => {
  const api = {
    get: vi.fn(async (path: string) => path === "/api/python/runs" ? [{
      id: "history-1",
      status: "passed",
      stdout: "restored",
      stderr: "",
      code: "print('from history')",
      tests: "assert 2 + 2 == 4",
    }] : []),
    post: vi.fn(async () => ({})),
  } as any;

  render(<Lab api={api} />);
  const editor = await screen.findByLabelText("Python 代码");
  await userEvent.clear(editor);
  await userEvent.type(editor, "print('my work')");
  await userEvent.selectOptions(screen.getByLabelText("代码模板"), "blank");
  await userEvent.click(screen.getByRole("button", { name: "应用模板" }));
  expect(editor).toHaveValue("# 从这里开始\n");
  await userEvent.click(screen.getByRole("button", { name: "撤销替换" }));
  expect(editor).toHaveValue("print('my work')");
  await userEvent.click(screen.getByRole("button", { name: "撤销替换" }));
  expect(editor).toHaveValue("# 从这里开始\n");

  await userEvent.click(screen.getByRole("button", { name: "查看运行 history-" }));
  expect(editor).toHaveValue("print('from history')");
  await userEvent.click(screen.getByRole("button", { name: "撤销替换" }));
  expect(editor).toHaveValue("# 从这里开始\n");
});

test("sends selected timeout and output limits with a run", async () => {
  const posts: any[] = [];
  const api = {
    get: vi.fn(async () => []),
    post: vi.fn(async (path: string, body?: any) => {
      posts.push({ path, body });
      return { id: "configured", status: "passed", stdout: "ok", stderr: "" };
    }),
  } as any;

  render(<Lab api={api} />);
  await screen.findByLabelText("运行超时");
  await userEvent.selectOptions(screen.getByLabelText("运行超时"), "10000");
  await userEvent.selectOptions(screen.getByLabelText("最大输出"), "50000");
  await userEvent.click(screen.getByRole("button", { name: "运行代码" }));
  await waitFor(() => expect(posts[0]?.body).toMatchObject({ timeout_ms: 10000, max_output_chars: 50000 }));
});

test("offers VS Code style activity, panel tabs, status and font controls", async () => {
  const api = {
    get: vi.fn(async (path: string) => {
      if (path === "/api/python/environments") return [{
        id: "study-python",
        label: "StudyPilot Python",
        version: "3.12.4",
        path: "C:/Study/.venv/python.exe",
        kind: "venv",
        current: true,
      }];
      if (path === "/api/python/runs") return [{ id: "recent-1", status: "failed", stdout: "", stderr: "ValueError: bad", duration_ms: 9 }];
      return [];
    }),
    post: vi.fn(async () => ({})),
  } as any;

  render(<Lab api={api} />);
  expect(await screen.findByRole("navigation", { name: "Python 活动栏" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "资源管理器" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "活动栏：运行与调试" }));
  expect(screen.getByRole("heading", { name: "运行与调试" })).toBeInTheDocument();
  expect(screen.getByLabelText("运行超时")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "活动栏：运行历史" }));
  expect(screen.getByText("recent-1", { exact: false })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("tab", { name: "问题" }));
  expect(screen.getByText("没有检测到问题。")).toBeInTheDocument();
  expect(screen.queryByText("ValueError: bad")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "控制台" }));
  expect(screen.getByText("运行输出会显示在这里。")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "运行历史" }));
  expect(screen.getByRole("heading", { name: "最近运行" })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("tab", { name: /main\.py/ }));
  const editor = screen.getByLabelText("Python 代码") as HTMLTextAreaElement;
  editor.setSelectionRange(5, 5);
  fireEvent.select(editor);
  expect(screen.getByText("Ln 1, Col 6")).toBeInTheDocument();
  expect(screen.getByText("StudyPilot Python · Python 3.12.4")).toBeInTheDocument();
  expect(screen.getByText("UTF-8")).toBeInTheDocument();
  expect(screen.getByText("Spaces: 4")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "增大编辑器字号" }));
  expect(editor).toHaveStyle({ fontSize: "13px" });
});

test("Python workbench delegates appearance entirely to the app theme", async () => {
  const matchMedia = vi.fn(() => ({
    matches: false,
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: matchMedia,
  });
  const api = { get: vi.fn(async () => []), post: vi.fn(async () => ({})) } as any;

  render(<Lab api={api} />);
  await screen.findByTestId("output-console");
  expect(screen.queryByRole("button", { name: "跟随系统" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "深色控制台" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "浅色控制台" })).not.toBeInTheDocument();
  expect(matchMedia).not.toHaveBeenCalled();
});

test("can reconnect run polling after a temporary detail request failure", async () => {
  let detailReads = 0;
  const api = {
    get: vi.fn(async (path: string) => {
      if (path === "/api/python/environments" || path === "/api/python/runs") return [];
      if (path === "/api/python/runs/reconnect-1") {
        detailReads += 1;
        if (detailReads === 1) throw new Error("detail request lost");
        return { id: "reconnect-1", status: "passed", stdout: "reconnected\n", stderr: "" };
      }
      return [];
    }),
    post: vi.fn(async () => ({ id: "reconnect-1", status: "running", stdout: "", stderr: "" })),
  } as any;

  render(<Lab api={api} />);
  await userEvent.click(await screen.findByRole("button", { name: "运行代码" }));
  expect(await screen.findByRole("button", { name: "重新连接运行" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("detail request lost");
  await userEvent.click(screen.getByRole("button", { name: "重新连接运行" }));
  expect(await screen.findByText("reconnected", { exact: false })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "重新连接运行" })).not.toBeInTheDocument();
});

test("does not introduce a nested main landmark", async () => {
  const api = { get: vi.fn(async () => []), post: vi.fn(async () => ({})) } as any;
  render(<main data-testid="application-main"><Lab api={api} /></main>);
  expect((await screen.findByTestId("application-main")).querySelector("main")).toBeNull();
});

test("locks the selected interpreter while an active run is polling", async () => {
  window.localStorage.removeItem("studypilot.python-workbench.environment");
  const api = {
    get: vi.fn(async (path: string) => {
      if (path === "/api/python/environments") return [
        { id: "python-a", label: "Python Alpha", version: "3.10.9", path: "C:/a/python.exe", kind: "venv", current: true },
        { id: "python-b", label: "Python Beta", version: "3.12.4", path: "C:/b/python.exe", kind: "conda", current: false },
      ];
      if (path === "/api/python/runs") return [];
      if (path === "/api/python/runs/active-1") return new Promise(() => {});
      return [];
    }),
    post: vi.fn(async () => ({ id: "active-1", status: "running", stdout: "", stderr: "", environment_id: "python-a" })),
  } as any;

  const view = render(<Lab api={api} courseId={1} />);
  const selector = await screen.findByLabelText("Python 环境");
  await userEvent.click(screen.getByRole("button", { name: "运行代码" }));
  expect(selector).toBeDisabled();
  view.unmount();
});

test("labels terminal and status with the run interpreter snapshot", async () => {
  window.localStorage.removeItem("studypilot.python-workbench.environment");
  const api = {
    get: vi.fn(async (path: string) => {
      if (path === "/api/python/environments") return [
        { id: "python-a", label: "Python Alpha", version: "3.10.9", path: "C:/a/python.exe", kind: "venv", current: false },
        { id: "python-b", label: "Python Beta", version: "3.12.4", path: "C:/b/python.exe", kind: "conda", current: true },
      ];
      if (path === "/api/python/runs") return [];
      return [];
    }),
    post: vi.fn(async () => ({
      id: "snapshot-1",
      status: "passed",
      stdout: "snapshot ok\n",
      stderr: "",
      environment_id: "python-a",
    })),
  } as any;

  render(<Lab api={api} courseId={1} />);
  const selector = await screen.findByLabelText("Python 环境");
  await waitFor(() => expect(selector).toHaveValue("python-b"));
  await userEvent.click(screen.getByRole("button", { name: "运行代码" }));
  expect(await screen.findByText("snapshot ok", { exact: false })).toBeInTheDocument();
  expect(within(screen.getByTestId("output-console")).getByText("Python Alpha")).toBeInTheDocument();
  expect(within(screen.getByRole("contentinfo", { name: "Python 编辑器状态栏" })).getByText("Python Alpha · Python 3.10.9")).toBeInTheDocument();
});

test("cannot restore history over an active run", async () => {
  const api = {
    get: vi.fn(async (path: string) => {
      if (path === "/api/python/environments") return [];
      if (path === "/api/python/runs") return [{ id: "old-pass", status: "passed", stdout: "old", stderr: "", code: "print('old')" }];
      if (path === "/api/python/runs/live-1") return new Promise(() => {});
      return [];
    }),
    post: vi.fn(async () => ({ id: "live-1", status: "running", stdout: "", stderr: "" })),
  } as any;

  const view = render(<Lab api={api} courseId={1} />);
  const historyButton = await screen.findByRole("button", { name: "查看运行 old-pass" });
  await userEvent.click(screen.getByRole("button", { name: "运行代码" }));
  expect(historyButton).toBeDisabled();
  expect(screen.getByText("正在运行")).toBeInTheDocument();
  view.unmount();
});

test("isolates autosaved drafts by course", async () => {
  window.localStorage.removeItem("studypilot.python-workbench.draft.101");
  window.localStorage.removeItem("studypilot.python-workbench.draft.202");
  const api = { get: vi.fn(async () => []), post: vi.fn(async () => ({})) } as any;

  const courseOne = render(<Lab api={api} courseId={101} />);
  const firstEditor = await screen.findByLabelText("Python 代码");
  await userEvent.clear(firstEditor);
  await userEvent.type(firstEditor, "print('course one')");
  courseOne.unmount();

  const courseTwo = render(<Lab api={api} courseId={202} />);
  expect(await screen.findByLabelText("Python 代码")).not.toHaveValue("print('course one')");
  courseTwo.unmount();

  render(<Lab api={api} courseId={101} />);
  expect(await screen.findByLabelText("Python 代码")).toHaveValue("print('course one')");
  expect(JSON.parse(window.localStorage.getItem("studypilot.python-workbench.draft.101") || "{}").code).toBe("print('course one')");
});

test("prevents duplicate launches before the create-run request resolves", async () => {
  let resolvePost: ((run: any) => void) | undefined;
  const created = new Promise((resolve) => { resolvePost = resolve; });
  const api = {
    get: vi.fn(async () => []),
    post: vi.fn(() => created),
  } as any;

  render(<Lab api={api} courseId={1} />);
  const runButton = await screen.findByRole("button", { name: "运行代码" });
  await userEvent.dblClick(runButton);
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(runButton).toBeDisabled();
  resolvePost?.({ id: "single-run", status: "passed", stdout: "once", stderr: "" });
  expect(await screen.findByText("once")).toBeInTheDocument();
});

test("keeps pre-clear output hidden while showing output from later polling ticks", async () => {
  let detailReads = 0;
  const api = {
    get: vi.fn(async (path: string) => {
      if (path === "/api/python/environments" || path === "/api/python/runs") return [];
      if (path === "/api/python/runs/clear-1") {
        detailReads += 1;
        return detailReads > 1
          ? { id: "clear-1", status: "passed", stdout: "first\nsecond\ndone\n", stderr: "" }
          : { id: "clear-1", status: "running", stdout: "first\nsecond\n", stderr: "" };
      }
      return [];
    }),
    post: vi.fn(async () => ({ id: "clear-1", status: "running", stdout: "first\n", stderr: "" })),
  } as any;

  render(<Lab api={api} courseId={1} />);
  await userEvent.click(await screen.findByRole("button", { name: "运行代码" }));
  expect(await screen.findByText("first", { exact: false })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "清屏" }));
  expect(screen.getByText("控制台已清空。")).toBeInTheDocument();
  await waitFor(() => expect(detailReads).toBe(2), { timeout: 1200 });
  expect(await screen.findByText("done", { exact: false })).toBeInTheDocument();
  expect(screen.queryByText("first", { exact: false })).not.toBeInTheDocument();
});

test("normalizes legacy run payloads that omit one or both output fields", async () => {
  const api = {
    get: vi.fn(async (path: string) => {
      if (path === "/api/python/environments" || path === "/api/python/runs") return [];
      if (path === "/api/python/runs/legacy-output") {
        return { id: "legacy-output", status: "passed", stdout: "legacy stdout" };
      }
      return [];
    }),
    post: vi.fn(async () => ({ id: "legacy-output", status: "running" })),
  } as any;

  render(<Lab api={api} courseId={1} />);
  await userEvent.click(await screen.findByRole("button", { name: "运行代码" }));
  expect(await screen.findByText("legacy stdout")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "清屏" }));
  expect(screen.queryByText("legacy stdout")).not.toBeInTheDocument();
  expect(screen.getByText("控制台已清空。")).toBeInTheDocument();
});

test("recovers when the selected Python environment no longer exists", async () => {
  window.localStorage.setItem("studypilot.python-workbench.environment", "deleted-python");
  let environmentReads = 0;
  const api = {
    get: vi.fn(async (path: string) => {
      if (path.startsWith("/api/python/environments")) {
        environmentReads += 1;
        return environmentReads === 1
          ? [{ id: "deleted-python", label: "Old Python", version: "3.10.0", path: "C:/old/python.exe", kind: "venv", current: true }]
          : [{ id: "fallback-python", label: "System Python", version: "3.12.4", path: "C:/Python312/python.exe", kind: "system", current: true }];
      }
      if (path === "/api/python/runs") return [];
      return [];
    }),
    post: vi.fn(async () => {
      throw Object.assign(new Error("Python 环境不存在"), { code: "PYTHON_ENV_NOT_FOUND" });
    }),
  } as any;

  render(<Lab api={api} courseId={1} />);
  const selector = await screen.findByLabelText("Python 环境");
  await waitFor(() => expect(selector).toHaveValue("deleted-python"));
  await userEvent.click(screen.getByRole("button", { name: "运行代码" }));

  await waitFor(() => expect(selector).toHaveValue("fallback-python"));
  expect(environmentReads).toBe(2);
  expect(api.get).toHaveBeenCalledWith("/api/python/environments?force=true");
  expect(screen.getByText(/所选 Python 环境已失效/)).toHaveTextContent("System Python");
  expect(screen.getByRole("button", { name: "刷新 Python 环境" })).toBeEnabled();
});

test("locks reconnect polling against rapid repeated clicks", async () => {
  let detailReads = 0;
  let resolveReconnect: ((run: any) => void) | undefined;
  const reconnectResult = new Promise<any>((resolve) => { resolveReconnect = resolve; });
  const api = {
    get: vi.fn(async (path: string) => {
      if (path === "/api/python/environments" || path === "/api/python/runs") return [];
      if (path === "/api/python/runs/reconnect-lock") {
        detailReads += 1;
        if (detailReads === 1) throw new Error("temporary disconnect");
        return reconnectResult;
      }
      return [];
    }),
    post: vi.fn(async () => ({ id: "reconnect-lock", status: "running", stdout: "", stderr: "" })),
  } as any;

  render(<Lab api={api} courseId={1} />);
  await userEvent.click(await screen.findByRole("button", { name: "运行代码" }));
  const reconnect = await screen.findByRole("button", { name: "重新连接运行" });
  fireEvent.click(reconnect);
  fireEvent.click(reconnect);

  expect(await screen.findByRole("button", { name: "正在连接运行" })).toBeDisabled();
  expect(detailReads).toBe(2);
  resolveReconnect?.({ id: "reconnect-lock", status: "passed", stdout: "one reconnect", stderr: "" });
  expect(await screen.findByText("one reconnect", { exact: false })).toBeInTheDocument();
});

test("ignores a stale poll result after stopping run A and starting run B", async () => {
  let resolveRunA: ((run: any) => void) | undefined;
  const runADetail = new Promise<any>((resolve) => { resolveRunA = resolve; });
  const runBDetail = new Promise<any>(() => {});
  let launches = 0;
  const api = {
    get: vi.fn(async (path: string) => {
      if (path === "/api/python/environments" || path === "/api/python/runs") return [];
      if (path === "/api/python/runs/run-a") return runADetail;
      if (path === "/api/python/runs/run-b") return runBDetail;
      return [];
    }),
    post: vi.fn(async (path: string) => {
      if (path === "/api/python/runs/run-a/stop") return { id: "run-a", status: "stopped", stdout: "A stopped", stderr: "" };
      launches += 1;
      return launches === 1
        ? { id: "run-a", status: "running", stdout: "A active", stderr: "" }
        : { id: "run-b", status: "running", stdout: "B remains active", stderr: "" };
    }),
  } as any;

  const view = render(<Lab api={api} courseId={1} />);
  await userEvent.click(await screen.findByRole("button", { name: "运行代码" }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/api/python/runs/run-a"));
  await userEvent.click(await screen.findByRole("button", { name: "停止" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "运行代码" })).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "运行代码" }));
  expect(await screen.findByText("B remains active", { exact: false })).toBeInTheDocument();

  resolveRunA?.({ id: "run-a", status: "stopped", stdout: "stale A result", stderr: "" });
  await new Promise((resolve) => setTimeout(resolve, 250));
  expect(screen.getByText("B remains active", { exact: false })).toBeInTheDocument();
  expect(screen.queryByText("stale A result", { exact: false })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "运行代码" })).toBeDisabled();
  view.unmount();
});

test("does not claim output was copied when the Clipboard API is unavailable", async () => {
  const previousClipboard = navigator.clipboard;
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  const api = {
    get: vi.fn(async () => []),
    post: vi.fn(async () => ({ id: "copy-1", status: "passed", stdout: "copy me", stderr: "" })),
  } as any;

  render(<Lab api={api} courseId={1} />);
  await userEvent.click(await screen.findByRole("button", { name: "运行代码" }));
  expect(await screen.findByText("copy me", { exact: false })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "复制输出" }));
  expect(screen.getByRole("alert")).toHaveTextContent("无法复制输出");

  Object.defineProperty(navigator, "clipboard", { configurable: true, value: previousClipboard });
});

test("refreshes run history after stop returns a terminal result", async () => {
  let historyReads = 0;
  const stoppedRun = { id: "stopped-history", status: "stopped", stdout: "stopped", stderr: "" };
  const api = {
    get: vi.fn(async (path: string) => {
      if (path === "/api/python/environments") return [];
      if (path === "/api/python/runs") {
        historyReads += 1;
        return historyReads > 1 ? [stoppedRun] : [];
      }
      if (path === "/api/python/runs/stopped-history") return new Promise(() => {});
      return [];
    }),
    post: vi.fn(async (path: string) => path.endsWith("/stop")
      ? stoppedRun
      : { ...stoppedRun, status: "running" }),
  } as any;

  const view = render(<Lab api={api} courseId={1} />);
  await userEvent.click(await screen.findByRole("button", { name: "运行代码" }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/api/python/runs/stopped-history"));
  await userEvent.click(screen.getByRole("button", { name: "停止" }));

  expect(await screen.findByRole("button", { name: "查看运行 stopped-" })).toBeInTheDocument();
  expect(historyReads).toBe(2);
  view.unmount();
});

test("locks the stop request against rapid repeated clicks", async () => {
  let resolveStop: ((run: any) => void) | undefined;
  const stopped = new Promise<any>((resolve) => { resolveStop = resolve; });
  const api = {
    get: vi.fn(async (path: string) => {
      if (path === "/api/python/environments" || path === "/api/python/runs") return [];
      if (path === "/api/python/runs/stop-lock") return new Promise(() => {});
      return [];
    }),
    post: vi.fn((path: string) => path.endsWith("/stop")
      ? stopped
      : Promise.resolve({ id: "stop-lock", status: "running", stdout: "active", stderr: "" })),
  } as any;

  const view = render(<Lab api={api} courseId={1} />);
  await userEvent.click(await screen.findByRole("button", { name: "运行代码" }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/api/python/runs/stop-lock"));
  const stopButton = screen.getByRole("button", { name: "停止" });
  fireEvent.click(stopButton);
  fireEvent.click(stopButton);

  expect(api.post.mock.calls.filter(([path]: [string]) => path.endsWith("/stop"))).toHaveLength(1);
  expect(stopButton).toBeDisabled();
  resolveStop?.({ id: "stop-lock", status: "stopped", stdout: "stopped", stderr: "" });
  await waitFor(() => expect(screen.getByRole("button", { name: "运行代码" })).toBeEnabled());
  view.unmount();
});

test("ignores an older initial history response after a completed run refresh", async () => {
  let resolveInitialHistory: ((runs: any[]) => void) | undefined;
  const initialHistory = new Promise<any[]>((resolve) => { resolveInitialHistory = resolve; });
  let historyReads = 0;
  const freshRun = { id: "fresh-history", status: "passed", stdout: "fresh", stderr: "" };
  const api = {
    get: vi.fn(async (path: string) => {
      if (path === "/api/python/environments") return [];
      if (path === "/api/python/runs") {
        historyReads += 1;
        return historyReads === 1 ? initialHistory : [freshRun];
      }
      return [];
    }),
    post: vi.fn(async () => freshRun),
  } as any;

  render(<Lab api={api} courseId={1} />);
  await waitFor(() => expect(historyReads).toBe(1));
  await userEvent.click(screen.getByRole("button", { name: "运行代码" }));
  expect(await screen.findByRole("button", { name: "查看运行 fresh-hi" })).toBeInTheDocument();

  resolveInitialHistory?.([]);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.getByRole("button", { name: "查看运行 fresh-hi" })).toBeInTheDocument();
});

test("keeps a forced environment refresh when the older initial discovery arrives late", async () => {
  let resolveInitialEnvironments: ((environments: any[]) => void) | undefined;
  const initialEnvironments = new Promise<any[]>((resolve) => { resolveInitialEnvironments = resolve; });
  const api = {
    get: vi.fn(async (path: string) => {
      if (path === "/api/python/environments") return initialEnvironments;
      if (path === "/api/python/environments?force=true") return [
        { id: "fresh-python", label: "Fresh Python", version: "3.12.4", path: "C:/fresh/python.exe", kind: "system", current: true },
      ];
      if (path === "/api/python/runs") return [];
      return [];
    }),
    post: vi.fn(async () => ({})),
  } as any;

  render(<Lab api={api} courseId={1} />);
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/api/python/environments"));
  await userEvent.click(screen.getByRole("button", { name: "刷新 Python 环境" }));
  const selector = await screen.findByLabelText("Python 环境");
  await waitFor(() => expect(selector).toHaveValue("fresh-python"));

  resolveInitialEnvironments?.([
    { id: "stale-python", label: "Stale Python", version: "3.9.0", path: "C:/stale/python.exe", kind: "system", current: true },
  ]);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(selector).toHaveValue("fresh-python");
});

test("does not show an old failed run as a current problem", async () => {
  const api = {
    get: vi.fn(async (path: string) => path === "/api/python/runs"
      ? [{ id: "old-error", status: "failed", stdout: "", stderr: "old traceback" }]
      : []),
    post: vi.fn(async () => ({})),
  } as any;

  render(<Lab api={api} courseId={1} />);
  await screen.findByRole("button", { name: "查看运行 old-erro" });
  await userEvent.click(screen.getByRole("tab", { name: "问题" }));
  expect(screen.getByText("没有检测到问题。")).toBeInTheDocument();
  expect(screen.queryByText("old traceback")).not.toBeInTheDocument();
});

test("announces the terminal run state and duration in the status bar", async () => {
  const api = {
    get: vi.fn(async () => []),
    post: vi.fn(async () => ({ id: "status-1", status: "passed", stdout: "ok", stderr: "", duration_ms: 42 })),
  } as any;

  render(<Lab api={api} courseId={1} />);
  await userEvent.click(await screen.findByRole("button", { name: "运行代码" }));
  const statusbar = screen.getByLabelText("Python 编辑器状态栏");
  await waitFor(() => expect(statusbar).toHaveTextContent("运行通过"));
  expect(statusbar).toHaveTextContent("42 ms");
});
