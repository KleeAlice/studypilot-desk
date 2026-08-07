import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type SyntheticEvent,
} from "react";
import type { ApiClient } from "../services/api";
import type { PythonEnvironment } from "../types";

type RunStatus = "running" | "passed" | "failed" | "timeout" | "stopped" | "stopping";
type OutputFilter = "all" | "stdout" | "stderr";
type ActiveFile = "main.py" | "tests.py";
type ActivityView = "explorer" | "run" | "history";
type BottomPanel = "problems" | "console" | "history";
type Draft = { code: string; tests: string };
type ConsoleClearOffsets = { runId: string; stdout: number; stderr: number };
type EnvironmentDiscoveryResult = {
  items: PythonEnvironment[];
  error: unknown | null;
  current: boolean;
};

interface Run {
  id: string;
  status: RunStatus;
  stdout: string;
  stderr: string;
  code?: string;
  tests?: string;
  environment_id?: string;
  duration_ms?: number;
  truncated?: number;
  created_at?: string;
}

type RunPayload = Omit<Run, "stdout" | "stderr"> & {
  stdout?: unknown;
  stderr?: unknown;
};

interface Template extends Draft {
  id: string;
  label: string;
}

const DEFAULT_CODE = `def reciprocal_rank_fusion(rankings, k=60):
    scores = {}
    for ranking in rankings:
        for rank, item in enumerate(ranking, 1):
            scores[item] = scores.get(item, 0) + 1 / (k + rank)
    return sorted(scores, key=scores.get, reverse=True)

print(reciprocal_rank_fusion([['A', 'B'], ['B', 'A']]))`;

const TEMPLATES: Template[] = [
  {
    id: "rrf",
    label: "检索融合示例",
    code: DEFAULT_CODE,
    tests: "assert reciprocal_rank_fusion([['A'], ['A']]) == ['A']",
  },
  { id: "blank", label: "空白 Python 文件", code: "# 从这里开始\n", tests: "" },
  {
    id: "function",
    label: "函数与公共测试",
    code: "def solve(value):\n    return value\n\nprint(solve(42))",
    tests: "assert solve(42) == 42",
  },
  {
    id: "algorithm",
    label: "算法练习",
    code: "def two_sum(numbers, target):\n    # 返回两个元素的下标\n    return []\n",
    tests: "assert two_sum([2, 7, 11, 15], 9) == [0, 1]",
  },
];

const TIMEOUT_OPTIONS = [
  { value: 1000, label: "1 秒" },
  { value: 5000, label: "5 秒" },
  { value: 10000, label: "10 秒" },
  { value: 30000, label: "30 秒" },
];
const OUTPUT_OPTIONS = [
  { value: 2000, label: "2,000 字符" },
  { value: 20000, label: "20,000 字符" },
  { value: 50000, label: "50,000 字符" },
  { value: 200000, label: "200,000 字符" },
];

const terminalStatuses = new Set<RunStatus>(["passed", "failed", "timeout", "stopped"]);
const DRAFT_KEY = "studypilot.python-workbench.draft";
const ENVIRONMENT_KEY = "studypilot.python-workbench.environment";
const FONT_SIZE_KEY = "studypilot.python-workbench.font-size";

function courseDraftKey(courseId: number): string {
  return `${DRAFT_KEY}.${courseId}`;
}

function readPreference(key: string): string {
  try { return window.localStorage.getItem(key) || ""; }
  catch { return ""; }
}

function savePreference(key: string, value: string) {
  try { window.localStorage.setItem(key, value); }
  catch { /* Preferences remain active for this view. */ }
}

function requestErrorCode(reason: unknown): string {
  if (!reason || typeof reason !== "object" || !("code" in reason)) return "";
  return typeof reason.code === "string" ? reason.code : "";
}

function normalizeRun(payload: RunPayload): Run {
  return {
    ...payload,
    stdout: typeof payload.stdout === "string" ? payload.stdout : "",
    stderr: typeof payload.stderr === "string" ? payload.stderr : "",
  };
}

function parseDraft(saved: string | null): Draft | null {
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved) as { code?: unknown; tests?: unknown };
    return typeof parsed.code === "string" && typeof parsed.tests === "string"
      ? { code: parsed.code, tests: parsed.tests }
      : null;
  } catch {
    return null;
  }
}

function initialDraft(storageKey: string, allowLegacyFallback: boolean): Draft {
  const persistentKeys = allowLegacyFallback ? [storageKey, DRAFT_KEY] : [storageKey];
  for (const key of persistentKeys) {
    try {
      const saved = parseDraft(window.localStorage.getItem(key));
      if (saved) {
        if (key !== storageKey) writeDraft(storageKey, saved);
        return saved;
      }
    } catch {
      // Persistent storage may be disabled; legacy recovery can still work.
    }
  }

  const legacyKeys = allowLegacyFallback ? [storageKey, DRAFT_KEY] : [storageKey];
  for (const key of legacyKeys) {
    let saved: Draft | null = null;
    try { saved = parseDraft(window.sessionStorage.getItem(key)); }
    catch { /* Session storage can also be unavailable. */ }
    if (!saved) continue;

    if (writeDraft(storageKey, saved)) {
      try { window.sessionStorage.removeItem(key); }
      catch { /* The persistent copy is already safe. */ }
    }
    return saved;
  }

  return { code: DEFAULT_CODE, tests: "" };
}

function writeDraft(storageKey: string, draft: Draft): boolean {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

function describeEnvironment(environment: PythonEnvironment): string {
  const kind = environment.kind ? ` · ${environment.kind}` : "";
  const version = environment.version ? `Python ${environment.version}` : "Python";
  return `${environment.label} · ${version}${kind}`;
}

function statusEnvironment(environment?: PythonEnvironment, fallbackId = ""): string {
  if (!environment) return fallbackId ? `${fallbackId} · Python` : "正在发现 Python";
  return `${environment.label} · ${environment.version ? `Python ${environment.version}` : "Python"}`;
}

function workbenchStatusLabel(
  run: Run | null,
  starting: boolean,
  reconnecting: boolean,
  pollingPaused: boolean,
): string {
  if (starting) return "正在启动";
  if (reconnecting) return "正在重连";
  if (pollingPaused) return "运行连接中断";
  if (!run) return "工作区就绪";
  return {
    running: "正在运行",
    stopping: "正在停止",
    passed: "运行通过",
    failed: "运行失败",
    timeout: "运行超时",
    stopped: "已停止",
  }[run.status];
}

function combinedOutput(stdout: string, stderr: string, filter: OutputFilter): string {
  if (filter === "stdout") return stdout;
  if (filter === "stderr") return stderr;
  return [stdout, stderr].filter(Boolean).join(stdout && stderr ? "\n" : "");
}

function initialFontSize(): number {
  const saved = Number(readPreference(FONT_SIZE_KEY));
  return Number.isFinite(saved) && saved >= 11 && saved <= 20 ? saved : 12;
}

function ActivityIcon({ kind }: { kind: ActivityView }) {
  if (kind === "explorer") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6l2 2h8v14H4z M4 9h16" /></svg>;
  }
  if (kind === "run") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 10 7-10 7z M5 4v16" /></svg>;
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v5l3 2 M4 5v5h5 M5 10a8 8 0 1 0 2-5" /></svg>;
}

export function Lab({ api, courseId = 1 }: { api: ApiClient; courseId?: number }) {
  const draftKey = useMemo(() => courseDraftKey(courseId), [courseId]);
  const draft = useMemo(() => initialDraft(draftKey, courseId === 1), [courseId, draftKey]);
  const [code, setCode] = useState(draft.code);
  const [tests, setTests] = useState(draft.tests);
  const [activeFile, setActiveFile] = useState<ActiveFile>("main.py");
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [dirty, setDirty] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");
  const [undoDraft, setUndoDraft] = useState<Draft | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [starting, setStarting] = useState(false);
  const [pollingPaused, setPollingPaused] = useState(false);
  const [history, setHistory] = useState<Run[]>([]);
  const [environments, setEnvironments] = useState<PythonEnvironment[]>([]);
  const [environmentId, setEnvironmentId] = useState(() => readPreference(ENVIRONMENT_KEY));
  const [environmentError, setEnvironmentError] = useState("");
  const [refreshingEnvironments, setRefreshingEnvironments] = useState(false);
  const [error, setError] = useState("");
  const [timeoutMs, setTimeoutMs] = useState(5000);
  const [maxOutputChars, setMaxOutputChars] = useState(20000);
  const [outputFilter, setOutputFilter] = useState<OutputFilter>("all");
  const [clearOffsets, setClearOffsets] = useState<ConsoleClearOffsets>({ runId: "", stdout: 0, stderr: 0 });
  const [activityView, setActivityView] = useState<ActivityView>("explorer");
  const [bottomPanel, setBottomPanel] = useState<BottomPanel>("console");
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [fontSize, setFontSize] = useState(initialFontSize);
  const [reconnecting, setReconnecting] = useState(false);
  const [stoppingRequest, setStoppingRequest] = useState(false);
  const alive = useRef(true);
  const runLock = useRef(false);
  const reconnectLock = useRef(false);
  const stopLock = useRef(false);
  const pollGeneration = useRef(0);
  const stopRequestRevision = useRef(0);
  const historyRequestRevision = useRef(0);
  const environmentRequestRevision = useRef(0);
  const latestDraft = useRef<Draft>(draft);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLPreElement>(null);

  const activeContent = activeFile === "main.py" ? code : tests;
  const lineNumbers = useMemo(
    () => Array.from({ length: Math.max(1, activeContent.split("\n").length) }, (_, index) => index + 1).join("\n"),
    [activeContent],
  );
  const isRunning = Boolean(run && !terminalStatuses.has(run.status));
  const isBusy = starting || isRunning;
  const selectedEnvironment = environments.find((environment) => environment.id === environmentId);
  const runEnvironment = run?.environment_id
    ? environments.find((environment) => environment.id === run.environment_id)
    : undefined;
  const displayedEnvironment = run?.environment_id ? runEnvironment : selectedEnvironment;
  const displayedEnvironmentId = run?.environment_id || (run ? "" : environmentId);
  const clearApplies = Boolean(run && clearOffsets.runId === run.id);
  const runStdout = run?.stdout || "";
  const runStderr = run?.stderr || "";
  const visibleStdout = runStdout.slice(clearApplies ? Math.min(clearOffsets.stdout, runStdout.length) : 0);
  const visibleStderr = runStderr.slice(clearApplies ? Math.min(clearOffsets.stderr, runStderr.length) : 0);
  const visibleOutput = combinedOutput(visibleStdout, visibleStderr, outputFilter);
  const consoleWasCleared = clearApplies && (clearOffsets.stdout > 0 || clearOffsets.stderr > 0);
  const problemOutput = run?.stderr || "";

  async function discoverEnvironments(force = false): Promise<EnvironmentDiscoveryResult> {
    const revision = ++environmentRequestRevision.current;
    const path = force ? "/api/python/environments?force=true" : "/api/python/environments";
    try {
      const discovered = await api.get<PythonEnvironment[]>(path);
      const current = alive.current && environmentRequestRevision.current === revision;
      if (current) {
        setEnvironments(discovered);
        setEnvironmentId((selected) => {
          const next = discovered.some((item) => item.id === selected)
            ? selected
            : discovered.find((item) => item.current)?.id || discovered[0]?.id || "";
          savePreference(ENVIRONMENT_KEY, next);
          return next;
        });
      }
      return { items: discovered, error: null, current };
    } catch (reason) {
      return {
        items: [],
        error: reason,
        current: alive.current && environmentRequestRevision.current === revision,
      };
    }
  }

  async function refreshHistory(isRelevant: () => boolean = () => true) {
    const revision = ++historyRequestRevision.current;
    try {
      const recent = await api.get<RunPayload[]>("/api/python/runs");
      if (alive.current && historyRequestRevision.current === revision && isRelevant()) {
        setHistory(recent.map(normalizeRun));
      }
    } catch (reason) {
      if (alive.current && historyRequestRevision.current === revision && isRelevant()) {
        setError(reason instanceof Error ? reason.message : "运行历史刷新失败");
      }
    }
  }

  useEffect(() => {
    alive.current = true;
    async function loadWorkbench() {
      const discovery = await discoverEnvironments();
      if (discovery.current) {
        setEnvironmentError(discovery.error instanceof Error
          ? discovery.error.message
          : discovery.error ? "暂时无法发现 Python 环境" : "");
      }
      await refreshHistory();
    }
    void loadWorkbench();
    return () => { alive.current = false; };
  }, [api]);

  useEffect(() => () => {
    writeDraft(draftKey, latestDraft.current);
  }, [draftKey]);

  useEffect(() => {
    latestDraft.current = { code, tests };
    if (!dirty) return undefined;
    const timer = window.setTimeout(() => {
      const stored = writeDraft(draftKey, { code, tests });
      if (!alive.current) return;
      if (stored) {
        setDirty(false);
        setSavedMessage("草稿已自动保存");
      } else {
        setSavedMessage("浏览器存储不可用，草稿仅保留在当前页面");
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [code, tests, dirty, draftKey]);

  function persistDraft(nextCode = code, nextTests = tests) {
    const next = { code: nextCode, tests: nextTests };
    latestDraft.current = next;
    if (writeDraft(draftKey, next)) {
      setDirty(false);
      setSavedMessage("草稿已保存");
    } else {
      setSavedMessage("浏览器存储不可用，草稿仅保留在当前页面");
    }
  }

  function commitDraft(next: Draft, message: string) {
    latestDraft.current = next;
    setCode(next.code);
    setTests(next.tests);
    setActiveFile("main.py");
    setDirty(true);
    setSavedMessage(message);
    setCursor({ line: 1, column: 1 });
  }

  function updateActiveContent(value: string) {
    const next = activeFile === "main.py" ? { code: value, tests } : { code, tests: value };
    latestDraft.current = next;
    if (activeFile === "main.py") setCode(value);
    else setTests(value);
    setDirty(true);
    setSavedMessage("");
  }

  function applyTemplate() {
    const template = TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    setUndoDraft({ code, tests });
    commitDraft({ code: template.code, tests: template.tests }, `${template.label}已载入`);
    window.setTimeout(() => editorRef.current?.focus(), 0);
  }

  function undoReplacement() {
    if (!undoDraft) return;
    const current = { code, tests };
    commitDraft(undoDraft, "已恢复替换前内容");
    setUndoDraft(current);
    window.setTimeout(() => editorRef.current?.focus(), 0);
  }

  async function refreshEnvironments() {
    if (refreshingEnvironments) return;
    setRefreshingEnvironments(true);
    setEnvironmentError("");
    const discovery = await discoverEnvironments(true);
    if (discovery.current) {
      if (discovery.error) {
        setEnvironmentError(discovery.error instanceof Error ? discovery.error.message : "Python 环境刷新失败");
      } else {
        const fallback = discovery.items.find((item) => item.id === environmentId)
          || discovery.items.find((item) => item.current)
          || discovery.items[0];
        setEnvironmentError(fallback ? `Python 环境已刷新，当前使用 ${fallback.label}。` : "未发现可用的 Python 环境。");
      }
    }
    if (alive.current) setRefreshingEnvironments(false);
  }

  async function execute() {
    if (runLock.current || isBusy || !code.trim()) return;
    runLock.current = true;
    pollGeneration.current += 1;
    setStarting(true);
    setError("");
    setClearOffsets({ runId: "", stdout: 0, stderr: 0 });
    setOutputFilter("all");
    setBottomPanel("console");
    setPollingPaused(false);
    persistDraft();
    try {
      const payload: Record<string, unknown> = {
        code,
        tests,
        timeout_ms: timeoutMs,
        max_output_chars: maxOutputChars,
      };
      if (environmentId) payload.environment_id = environmentId;
      const created = normalizeRun(await api.post<RunPayload>("/api/python/runs", payload));
      if (!alive.current) {
        runLock.current = false;
        return;
      }
      setRun(created);
      setStarting(false);
      await pollRun(created.id, created);
    } catch (reason) {
      if (requestErrorCode(reason) === "PYTHON_ENV_NOT_FOUND") {
        const discovery = await discoverEnvironments(true);
        if (discovery.current) {
          if (discovery.error) {
            const detail = discovery.error instanceof Error ? discovery.error.message : "刷新失败";
            setEnvironmentError(`所选 Python 环境已失效；${detail}`);
          } else {
            const fallback = discovery.items.find((item) => item.current) || discovery.items[0];
            setEnvironmentError(fallback
              ? `所选 Python 环境已失效，已切换到 ${fallback.label}，请重新运行。`
              : "所选 Python 环境已失效，且未发现其他可用环境。");
            setError("");
          }
        }
      } else if (alive.current) {
        setError(reason instanceof Error ? reason.message : "运行失败");
      }
      runLock.current = false;
      if (alive.current) {
        setStarting(false);
      }
    }
  }

  async function pollRun(runId: string, initial?: RunPayload) {
    const generation = ++pollGeneration.current;
    const isCurrentPoll = () => alive.current && pollGeneration.current === generation;
    if (isCurrentPoll()) {
      setPollingPaused(false);
      setError("");
    }
    try {
      let current = normalizeRun(initial || await api.get<RunPayload>(`/api/python/runs/${runId}`));
      if (!isCurrentPoll()) return;
      if (isCurrentPoll()) {
        setRun(current);
      }
      while (isCurrentPoll() && !terminalStatuses.has(current.status)) {
        await new Promise((resolve) => setTimeout(resolve, 180));
        if (!isCurrentPoll()) return;
        current = normalizeRun(await api.get<RunPayload>(`/api/python/runs/${runId}`));
        if (!isCurrentPoll()) return;
        if (isCurrentPoll()) {
          setRun(current);
        }
      }
    } catch (reason) {
      if (isCurrentPoll()) {
        setPollingPaused(true);
        setError(reason instanceof Error ? reason.message : "运行状态连接中断");
      }
      return;
    }
    if (!isCurrentPoll()) return;
    runLock.current = false;
    setPollingPaused(false);
    await refreshHistory(isCurrentPoll);
  }

  async function reconnectRun() {
    if (!run || !pollingPaused || reconnectLock.current) return;
    reconnectLock.current = true;
    setReconnecting(true);
    try {
      await pollRun(run.id);
    } finally {
      reconnectLock.current = false;
      if (alive.current) setReconnecting(false);
    }
  }

  async function stop() {
    if (!run || terminalStatuses.has(run.status) || stopLock.current) return;
    stopLock.current = true;
    const stopRequest = ++stopRequestRevision.current;
    const stopGeneration = ++pollGeneration.current;
    const releaseStopLock = () => {
      if (stopRequestRevision.current !== stopRequest) return;
      stopLock.current = false;
      if (alive.current) setStoppingRequest(false);
    };
    setStoppingRequest(true);
    setError("");
    setRun({ ...run, status: "stopping" });
    try {
      const stopped = normalizeRun(await api.post<RunPayload>(`/api/python/runs/${run.id}/stop`));
      if (alive.current && pollGeneration.current === stopGeneration && stopped?.id) {
        setRun(stopped);
        setPollingPaused(false);
        if (terminalStatuses.has(stopped.status)) {
          runLock.current = false;
          releaseStopLock();
          await refreshHistory(() => pollGeneration.current === stopGeneration);
        } else {
          await pollRun(stopped.id, stopped);
        }
      }
    } catch (reason) {
      if (alive.current && pollGeneration.current === stopGeneration) {
        setRun(run);
        setPollingPaused(true);
        setError(reason instanceof Error ? reason.message : "停止失败");
      }
    } finally {
      releaseStopLock();
    }
  }

  function restoreRun(item: Run) {
    if (isBusy || runLock.current) return;
    runLock.current = false;
    setRun(item);
    setPollingPaused(false);
    setClearOffsets({ runId: "", stdout: 0, stderr: 0 });
    setOutputFilter("all");
    setBottomPanel("console");
    if (typeof item.code === "string") {
      setUndoDraft({ code, tests });
      commitDraft({ code: item.code, tests: item.tests || "" }, "已恢复历史代码");
    }
    if (item.environment_id && environments.some((environment) => environment.id === item.environment_id)) {
      setEnvironmentId(item.environment_id);
    }
  }

  async function copyOutput() {
    if (!visibleOutput) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(visibleOutput);
      setSavedMessage("输出已复制");
    } catch {
      setError("无法复制输出，请手动选择文本");
    }
  }

  function clearConsole() {
    if (!run) return;
    const stdout = run.stdout || "";
    const stderr = run.stderr || "";
    if (!stdout && !stderr) return;
    setClearOffsets({ runId: run.id, stdout: stdout.length, stderr: stderr.length });
  }

  function updateCursor(event: SyntheticEvent<HTMLTextAreaElement>) {
    const target = event.currentTarget;
    const position = target.selectionStart;
    const before = target.value.slice(0, position);
    const lastBreak = before.lastIndexOf("\n");
    setCursor({
      line: before.split("\n").length,
      column: position - lastBreak,
    });
  }

  function handleEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void execute();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      persistDraft();
      return;
    }
    if (event.key !== "Tab") return;
    event.preventDefault();
    const target = event.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    if (event.shiftKey) {
      const lineStart = activeContent.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      const removable = activeContent.slice(lineStart, start).match(/^ {1,4}/)?.[0].length || 0;
      if (!removable) return;
      updateActiveContent(activeContent.slice(0, lineStart) + activeContent.slice(lineStart + removable));
      window.setTimeout(() => target.setSelectionRange(start - removable, Math.max(start - removable, end - removable)), 0);
      return;
    }
    updateActiveContent(activeContent.slice(0, start) + "    " + activeContent.slice(end));
    window.setTimeout(() => target.setSelectionRange(start + 4, start + 4), 0);
  }

  function changeFontSize(delta: number) {
    setFontSize((current) => {
      const next = Math.min(20, Math.max(11, current + delta));
      savePreference(FONT_SIZE_KEY, String(next));
      return next;
    });
  }

  function renderHistory(limit = 10) {
    return (
      <div className="lab-v2-history-list">
        {!history.length && <small>完成一次运行后可在这里回看结果。</small>}
        {history.slice(0, limit).map((item) => (
          <div className="lab-v2-history-item" key={item.id}>
            <span className={`task-state task-state--${item.status}`} aria-hidden="true" />
            <button type="button" className="quiet-action" disabled={isBusy} onClick={() => restoreRun(item)} aria-label={`查看运行 ${item.id.slice(0, 8)}`}>
              <code>{item.id.slice(0, 8)}</code>
            </button>
            <small>{item.status}{item.duration_ms != null ? ` · ${item.duration_ms} ms` : ""}</small>
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className="page lab-page lab-v2-page" data-layout="full-workbench">
      <div className="lab-v2-toolbar" aria-label="Python 工作台工具栏">
        <div className="lab-v2-environment-control">
          <label>
            Python 环境
            <select
              aria-label="Python 环境"
              disabled={isBusy || refreshingEnvironments}
              value={environmentId}
              onChange={(event) => {
                setEnvironmentId(event.target.value);
                savePreference(ENVIRONMENT_KEY, event.target.value);
              }}
            >
              {!environments.length && <option value="">当前 Python 环境</option>}
              {environments.map((environment) => (
                <option key={environment.id} value={environment.id}>{describeEnvironment(environment)}</option>
              ))}
            </select>
          </label>
          <button
            className="quiet-action lab-v2-refresh-environments"
            type="button"
            aria-label="刷新 Python 环境"
            disabled={isBusy || refreshingEnvironments}
            onClick={() => void refreshEnvironments()}
          >
            {refreshingEnvironments ? "刷新中…" : "刷新"}
          </button>
        </div>
        <label>
          代码模板
          <select aria-label="代码模板" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            {TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}
          </select>
        </label>
        <button className="quiet-action" type="button" onClick={applyTemplate}>应用模板</button>
        <label className="lab-v2-runtime-option">
          运行超时
          <select aria-label="运行超时" value={timeoutMs} onChange={(event) => setTimeoutMs(Number(event.target.value))}>
            {TIMEOUT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="lab-v2-runtime-option">
          最大输出
          <select aria-label="最大输出" value={maxOutputChars} onChange={(event) => setMaxOutputChars(Number(event.target.value))}>
            {OUTPUT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        {selectedEnvironment && <small className="lab-v2-path" title={selectedEnvironment.path}>{selectedEnvironment.path}</small>}
      </div>
      {environmentError && <p role="status" className="warning-message">{environmentError}</p>}

      <div className="lab-v2-ide">
        <nav className="lab-v2-activity" aria-label="Python 活动栏">
          {([
            ["explorer", "资源管理器"],
            ["run", "运行与调试"],
            ["history", "运行历史"],
          ] as [ActivityView, string][]).map(([view, label]) => (
            <button
              key={view}
              type="button"
              aria-label={`活动栏：${label}`}
              aria-pressed={activityView === view}
              title={label}
              onClick={() => setActivityView(view)}
            >
              <ActivityIcon kind={view} />
            </button>
          ))}
        </nav>

        <aside className="lab-v2-sidebar" aria-live="polite">
          {activityView === "explorer" && (
            <>
              <h2>资源管理器</h2>
              <div className="lab-v2-tree-label">STUDYPILOT</div>
              <button type="button" className={activeFile === "main.py" ? "is-active" : ""} onClick={() => setActiveFile("main.py")}>
                <span className="lab-v2-python-badge">Py</span> main.py{dirty ? <i aria-label="未保存">●</i> : null}
              </button>
              <button type="button" className={activeFile === "tests.py" ? "is-active" : ""} onClick={() => setActiveFile("tests.py")}>
                <span className="lab-v2-python-badge">Py</span> tests.py
              </button>
              <div className="lab-v2-outline">
                <span>OUTLINE</span>
                <small>{activeContent.match(/^def\s+([\w_]+)/m)?.[1] || "当前文件暂无符号"}</small>
              </div>
            </>
          )}
          {activityView === "run" && (
            <>
              <h2>运行与调试</h2>
              <div className="lab-v2-run-card">
                <strong>Python：当前文件</strong>
                <small>{statusEnvironment(selectedEnvironment, environmentId)}</small>
                <small>超时 {timeoutMs / 1000}s · 输出 {maxOutputChars.toLocaleString()}</small>
                <button className="primary-action" type="button" disabled={isBusy || !code.trim()} onClick={() => void execute()}>运行当前文件</button>
              </div>
              <p className="lab-v2-hint">Ctrl+Enter 运行 · Ctrl+S 保存草稿</p>
            </>
          )}
          {activityView === "history" && (
            <>
              <h2>运行历史</h2>
              {renderHistory()}
            </>
          )}
        </aside>

        <section className="code-workbench lab-v2-editor" aria-label="Python 代码编辑器">
          <div className="editor-tabs" role="tablist" aria-label="Python 文件">
            <button
              type="button"
              role="tab"
              aria-selected={activeFile === "main.py"}
              className={activeFile === "main.py" ? "is-active" : ""}
              onClick={() => { setActiveFile("main.py"); setCursor({ line: 1, column: 1 }); }}
            >
              main.py{dirty ? " ●" : ""}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeFile === "tests.py"}
              className={activeFile === "tests.py" ? "is-active" : ""}
              onClick={() => { setActiveFile("tests.py"); setCursor({ line: 1, column: 1 }); }}
            >
              tests.py
            </button>
            <span>{savedMessage || "Ctrl+S 保存 · Ctrl+Enter 运行"}</span>
            <div className="lab-v2-font-controls" aria-label="编辑器字号">
              <button type="button" aria-label="减小编辑器字号" onClick={() => changeFontSize(-1)}>A−</button>
              <output aria-label="当前编辑器字号">{fontSize}px</output>
              <button type="button" aria-label="增大编辑器字号" onClick={() => changeFontSize(1)}>A+</button>
            </div>
          </div>
          <div className="editor-surface lab-v2-editor-surface">
            <pre
              ref={lineNumbersRef}
              aria-hidden="true"
              data-testid="editor-line-numbers"
              style={{ fontSize: `${fontSize}px` }}
            >
              {lineNumbers}
            </pre>
            <textarea
              ref={editorRef}
              aria-label={activeFile === "main.py" ? "Python 代码" : "公共测试"}
              spellCheck={false}
              value={activeContent}
              onChange={(event) => updateActiveContent(event.target.value)}
              onKeyDown={handleEditorKeyDown}
              onKeyUp={updateCursor}
              onClick={updateCursor}
              onSelect={updateCursor}
              onScroll={(event) => {
                if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop;
              }}
              placeholder={activeFile === "tests.py" ? "assert function(input) == expected" : undefined}
              style={{ fontSize: `${fontSize}px` }}
            />
          </div>
          <div className="editor-actions lab-v2-editor-actions">
            <button className="primary-action" type="button" disabled={isBusy || !code.trim()} onClick={() => void execute()}>运行代码</button>
            <button className="quiet-action" type="button" disabled={!isRunning || stoppingRequest || run?.status === "stopping"} onClick={() => void stop()}>停止</button>
            {(pollingPaused || reconnecting) && run && (
              <button
                className="quiet-action lab-v2-reconnect"
                type="button"
                aria-label={reconnecting ? "正在连接运行" : "重新连接运行"}
                disabled={reconnecting}
                onClick={() => void reconnectRun()}
              >
                {reconnecting ? "正在连接…" : "重新连接运行"}
              </button>
            )}
            <button className="quiet-action" type="button" onClick={() => persistDraft()}>保存草稿</button>
            {undoDraft && <button className="quiet-action lab-v2-undo" type="button" onClick={undoReplacement}>撤销替换</button>}
          </div>
        </section>
      </div>

      <section data-testid="output-console" className="terminal-panel lab-v2-panel">
        <div className="lab-v2-panel-tabs" role="tablist" aria-label="Python 底部面板">
          {([
            ["problems", "问题", problemOutput ? "1" : "0"],
            ["console", "控制台", ""],
            ["history", "运行历史", history.length ? String(history.length) : ""],
          ] as [BottomPanel, string, string][]).map(([panel, label, count]) => (
            <button
              key={panel}
              type="button"
              role="tab"
              aria-label={label}
              aria-selected={bottomPanel === panel}
              className={bottomPanel === panel ? "is-active" : ""}
              onClick={() => setBottomPanel(panel)}
            >
              {label}{count ? <span>{count}</span> : null}
            </button>
          ))}
        </div>

        {bottomPanel === "problems" && (
          <div className="lab-v2-panel-body lab-v2-problems" role="tabpanel" aria-label="问题">
            {problemOutput ? <pre className="stderr">{problemOutput}</pre> : <p>没有检测到问题。</p>}
          </div>
        )}

        {bottomPanel === "console" && (
          <div className="lab-v2-panel-body" role="tabpanel" aria-label="控制台">
            <div className="terminal-head">
              <span>PYTHON OUTPUT</span>
              <small>{displayedEnvironment?.label || displayedEnvironmentId || "等待运行"}{run?.duration_ms != null ? ` · ${run.duration_ms} ms` : ""}</small>
            </div>
            <div className="editor-actions lab-v2-console-tools" aria-label="输出控制台工具栏">
              {(["all", "stdout", "stderr"] as OutputFilter[]).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  className="quiet-action"
                  aria-pressed={outputFilter === filter}
                  onClick={() => setOutputFilter(filter)}
                >
                  {filter === "all" ? "全部" : filter.toUpperCase()}
                </button>
              ))}
              <button type="button" className="quiet-action" disabled={!run || (!run.stdout && !run.stderr)} onClick={clearConsole}>清屏</button>
              <button type="button" className="quiet-action" disabled={!visibleOutput} onClick={() => void copyOutput()}>复制输出</button>
            </div>
            <div className="lab-v2-output" aria-live="polite">
              {!visibleOutput && <pre>{consoleWasCleared ? "控制台已清空。" : "运行输出会显示在这里。"}</pre>}
              {visibleOutput && outputFilter !== "stderr" && Boolean(visibleStdout) && <pre>{outputFilter === "all" ? visibleStdout : visibleOutput}</pre>}
              {visibleOutput && (outputFilter === "stderr" || (outputFilter === "all" && !visibleStdout && Boolean(visibleStderr))) && <pre className="stderr">{outputFilter === "stderr" ? visibleOutput : visibleStderr}</pre>}
              {visibleOutput && outputFilter === "all" && visibleStdout && visibleStderr && <pre className="stderr">{visibleStderr}</pre>}
              {run?.truncated ? <p className="warning-message">输出已按安全上限截断</p> : null}
              {error && <p role="alert" className="error-message">{error}</p>}
            </div>
            {activityView !== "history" && history.length > 0 && (
              <div className="lab-v2-console-history" aria-label="最近运行快捷入口">{renderHistory(3)}</div>
            )}
          </div>
        )}

        {bottomPanel === "history" && (
          <div className="lab-v2-panel-body run-history" role="tabpanel" aria-label="运行历史">
            <h3>最近运行</h3>
            {renderHistory()}
          </div>
        )}
      </section>

      <footer className="lab-v2-statusbar" aria-label="Python 编辑器状态栏">
        <span className={`task-state task-state--${run?.status || "idle"}`} aria-hidden="true" />
        <span>{workbenchStatusLabel(run, starting, reconnecting, pollingPaused)}</span>
        <span className="lab-v2-status-spacer" />
        {run?.duration_ms != null && <span>{run.duration_ms} ms</span>}
        <span>{statusEnvironment(displayedEnvironment, displayedEnvironmentId)}</span>
        <span>Ln {cursor.line}, Col {cursor.column}</span>
        <span>Spaces: 4</span>
        <span>UTF-8</span>
        <span>LF</span>
      </footer>
    </section>
  );
}
