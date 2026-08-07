import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ApiClient } from "../services/api";
import { speakLanguageText, stopLanguageSpeech } from "../language/speech";
import { AgentActionPlanCard } from "./AgentActionPlanCard";
import { AgentModeSwitch } from "./AgentModeSwitch";
import {
  LearningGenerationIndicator,
  type LearningGenerationProgress,
} from "./LearningGenerationIndicator";
import { LearningHistoryRail } from "./LearningHistoryRail";
import { LearningMessageCard } from "./LearningMessageCard";
import { LearningStartCard } from "./LearningStartCard";
import { LearningWorkspaceHeader } from "./LearningWorkspaceHeader";
import { MaterialPicker, type MaterialDocument } from "./MaterialPicker";
import {
  ProviderBrandIcon,
  PROVIDER_BRAND_ICONS,
  type ProviderBrandIconName,
} from "./ProviderBrandIcon";
import { createProviderId, providerIconName } from "./providerPresentation";
import {
  PROVIDER_SELECTION_EVENT, providerSelectionFromEvent, readProviderSelection, selectProviderGlobally,
} from "./providerSelection";
import { createTypewriterQueue, type TypewriterQueue } from "./typewriterQueue";
import type {
  AgentActionPlan,
  AgentAttachment,
  AgentMessage,
  AgentMode,
  AgentPageContext,
  AgentProvider,
  AgentProviderProtocol,
  AgentReply,
  AgentRequestedAction,
  AgentSource,
  AgentThread,
  LearningExplanationLength,
  LearningFeedbackKind,
} from "./types";


type DockView = "chat" | "history" | "settings";
type ContextDocument = MaterialDocument;
type AgentStreamEvent =
  | { type: "start" }
  | { type: "delta"; text: string }
  | { type: "done"; content: string }
  | { type: "cancelled"; content: string }
  | {
    type: "learning_progress";
    phase: string;
    label: string;
    schema: string;
    fields: LearningGenerationProgress["fields"];
  }
  | { type: "final"; data: AgentReply };
type PendingAttachment = {
  id: string;
  file: File;
  kind: AgentAttachment["kind"];
  previewUrl: string;
};

const agentDocumentExtensions = new Set(["pdf", "docx", "md", "markdown", "txt", "csv", "tsv", "json", "yaml", "yml", "xml", "html", "css", "js", "jsx", "ts", "tsx", "py", "java", "c", "cpp", "h", "hpp", "sql", "log", "ini", "toml", "xlsx", "pptx", "ipynb"]);
const agentImageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function decodeJsonStringFragment(value: string) {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "")
      .replace(/\\t/g, " ")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  }
}

const learningPreviewTextFields = [
  "concept",
  "direct_answer",
  "plain_explanation",
  "explanation",
  "scenario",
  "analysis",
  "question",
  "text",
  "reference_answer",
] as const;


/**
 * A learning response is streamed as fenced JSON so the final payload can be
 * validated. The learner should still see useful words on the first data
 * packet, but must never see protocol fences, property names, or punctuation.
 * Extract completed and currently-growing string values into a stable prefix
 * that can be fed into the normal typewriter queue.
 */
export function learningStreamPreview(raw: string) {

  const body = raw
    .replace(/^\s*```studypilot-learning\s*/i, "")
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "");
  const fieldPattern = new RegExp(
    `"(${learningPreviewTextFields.join("|")})"\\s*:\\s*"`,
    "g",
  );
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = fieldPattern.exec(body)) !== null) {
    const start = fieldPattern.lastIndex;
    let end = start;
    let escaped = false;
    for (; end < body.length; end += 1) {
      const character = body[end];
      if (!escaped && character === '"') break;
      if (!escaped && character === "\\") {
        escaped = true;
      } else {
        escaped = false;
      }
    }
    const closed = end < body.length && body[end] === '"';
    if (!closed) break;
    const fragment = body.slice(start, end);
    const readable = decodeJsonStringFragment(fragment).trim();
    if (readable) values.push(readable);
    fieldPattern.lastIndex = end + 1;
  }

  const readable = values
    .filter((value, index, all) => all.indexOf(value) === index);
  if (readable.length) return readable.join("\n\n");

  const looksStructured = /^\s*(?:```|[\[{])/u.test(raw)
    || new RegExp(
      `"(?:thread_title|${learningPreviewTextFields.join("|")}|practice|example)"\\s*:`,
      "i",
    ).test(raw);
  if (looksStructured) return "";
  return raw.trimStart();
}

function attachmentKind(file: File): AgentAttachment["kind"] | null {
  if (agentImageTypes.has(file.type.toLowerCase())) return "image";
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  return agentDocumentExtensions.has(extension) ? "document" : null;
}

function attachmentPreview(file: File, kind: AgentAttachment["kind"]) {
  return kind === "image" && typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(file)
    : "";
}

const emptyContext = {
  notes: false,
  knowledge: false,
  library: false,
};

const OUTPUT_STRATEGY_TOKEN_LIMITS: Record<LearningExplanationLength, number> = {
  short: 8192,
  medium: 32000,
  long: 100000,
  unlimited: 0,
};

function normalizeLearningExplanationLength(value: unknown): LearningExplanationLength {
  return value === "short" || value === "long" || value === "unlimited" ? value : "medium";
}

function explanationLengthForTokenLimit(value: unknown): LearningExplanationLength {
  const tokenLimit = Number(value);
  if (tokenLimit === 0) return "unlimited";
  if (tokenLimit <= 8192) return "short";
  if (tokenLimit <= 32000) return "medium";
  return "long";
}

function outputStrategyLabel(value: LearningExplanationLength) {
  if (value === "short") return "短";
  if (value === "medium") return "中";
  if (value === "long") return "长";
  return "无上限";
}

function outputStrategySummary(value: LearningExplanationLength, tokenLimit: number) {
  const tokenSummary = tokenLimit === 0
    ? "模型自身上限"
    : `${tokenLimit >= 1000 ? `${Math.round(tokenLimit / 1000)}K` : tokenLimit} tokens`;
  if (value === "short") return `一段话 · ${tokenSummary}`;
  if (value === "medium") return `约 400–500 字 · ${tokenSummary}`;
  if (value === "long") return `充分展开 · ${tokenSummary}`;
  return "不限制篇幅 · 模型自身上限";
}

function providerDraft(provider: AgentProvider | undefined) {
  return {
    label: provider?.label || "自定义模型",
    icon: (provider?.icon || (provider ? providerIconName(provider) : "custom")) as ProviderBrandIconName,
    protocol: provider?.protocol || "openai_compatible" as AgentProviderProtocol,
    base_url: provider?.base_url || "",
    model: provider?.model || "",
    max_output_tokens: provider?.max_output_tokens ?? 32000,
    connect_timeout_seconds: provider?.connect_timeout_seconds || 10,
    first_byte_timeout_seconds: provider?.first_byte_timeout_seconds || 90,
    idle_timeout_seconds: provider?.idle_timeout_seconds || 45,
    api_key: "",
    enabled: provider?.enabled ?? true,
  };
}

function sourceLabel(source: AgentSource) {
  const prefix = source.citation ? `[${source.citation}] ` : "";
  const location = source.location_label ? ` · ${source.location_label}` : "";
  return `${prefix}${source.title}${location}`;
}
function inlineCitationMarkdown(content: string) {
  return content.replace(/\[(S\d+)\](?!\s*\()/g, "[$1](#studypilot-source-$1)");
}


function isProviderReady(provider: AgentProvider) {
  if (!provider.enabled) return false;
  if (provider.has_api_key) return true;
  try {
    const hostname = new URL(provider.base_url).hostname;
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  } catch {
    return false;
  }
}

function providerOptionLabel(provider: AgentProvider) {
  return `${provider.label} · ${provider.model || "未设置模型"}`;
}
type AgentDockVariant = "dock" | "workspace";

function activeThreadStorageKey(courseId: number, mode: AgentMode) {
  return `studypilot.agent.active-thread.${mode}.${courseId}`;
}

function readActiveThreadId(courseId: number, mode: AgentMode) {
  try {
    const value = Number(window.localStorage.getItem(activeThreadStorageKey(courseId, mode)));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function rememberActiveThread(courseId: number, thread: AgentThread) {
  try {
    window.localStorage.setItem(
      activeThreadStorageKey(courseId, thread.mode || "assistant"),
      String(thread.id),
    );
  } catch {
    // Local persistence is optional; the in-memory thread still works.
  }
}

function forgetActiveThread(courseId: number, thread: AgentThread) {
  try {
    const key = activeThreadStorageKey(courseId, thread.mode || "assistant");
    if (window.localStorage.getItem(key) === String(thread.id)) window.localStorage.removeItem(key);
  } catch {
    // Ignore unavailable local storage.
  }
}

function orderThreads(items: AgentThread[]) {
  return [...items].sort((left, right) => (
    Number(right.pinned === true) - Number(left.pinned === true)
  ));
}

function learningScopeStorageKey(courseId: number) {
  return `studypilot.learning.document-scope.${courseId}`;
}

function readLearningDocumentIds(courseId: number) {
  try {
    const value = JSON.parse(window.localStorage.getItem(learningScopeStorageKey(courseId)) || "[]");
    return Array.isArray(value)
      ? value.map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 200)
      : [];
  } catch {
    return [];
  }
}

function rememberLearningDocumentIds(courseId: number, documentIds: number[]) {
  try {
    window.localStorage.setItem(learningScopeStorageKey(courseId), JSON.stringify(documentIds));
  } catch {
    // Scope still works for the current session when local storage is unavailable.
  }
}

export function AgentDock({
  api,
  courseId,
  context,
  requestedView = "chat",
  requestedMode = "assistant",
  requestedAction,
  variant = "dock",
  onOpenSource,
  onClose,
}: {
  api: ApiClient;
  courseId: number;
  context: AgentPageContext;
  requestedView?: DockView;
  requestedMode?: AgentMode;
  requestedAction?: AgentRequestedAction;
  variant?: AgentDockVariant;
  onOpenSource?: (source: AgentSource) => void;
  onClose?: () => void;
}) {
  const [view, setView] = useState<DockView>("chat");
  const [mode, setMode] = useState<AgentMode>(requestedMode);
  const [historyFilter, setHistoryFilter] = useState<"all" | AgentMode>("all");
  const [providers, setProviders] = useState<AgentProvider[]>([]);
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [activeThread, setActiveThread] = useState<AgentThread | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [activeQuestionId, setActiveQuestionId] = useState<number | null>(null);
  const [selectedProviderId, setSelectedProviderId] = useState(() => readProviderSelection());
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [attachmentDragging, setAttachmentDragging] = useState(false);
  const [scope, setScope] = useState(emptyContext);
  const [contextDocuments, setContextDocuments] = useState<ContextDocument[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<number[]>(() => requestedMode === "learning" ? readLearningDocumentIds(courseId) : []);
  const [documentPickerOpen, setDocumentPickerOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [explanationLength, setExplanationLength] = useState<LearningExplanationLength>("medium");
  const [thinkingStage, setThinkingStage] = useState("正在整理所选资料");
  const [learningProgress, setLearningProgress] =
    useState<LearningGenerationProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [savingProvider, setSavingProvider] = useState(false);
  const [testingProvider, setTestingProvider] = useState(false);
  const [exportingHistory, setExportingHistory] = useState(false);
  const [exportedHistoryPath, setExportedHistoryPath] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingDelete, setPendingDelete] = useState<AgentThread | null>(null);
  const [pendingProviderDelete, setPendingProviderDelete] = useState<AgentProvider | null>(null);
  const [pendingDeleteAll, setPendingDeleteAll] = useState<"threads" | "providers" | null>(null);
  const [draftProviderId, setDraftProviderId] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState(() => providerDraft(undefined));
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const providerLabelInputRef = useRef<HTMLInputElement | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const handledActionRef = useRef("");
  const dockInstanceId = useRef(`agent-dock-${Date.now()}-${Math.random().toString(36).slice(2)}`).current;
  const workspace = variant === "workspace";
  const questionMessages = useMemo(
    () => messages.filter((message) => message.role === "user" && message.content.trim()),
    [messages],
  );
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const visibleDocumentIds = useMemo(() => Array.from(new Set([
    ...(context.documentId ? [context.documentId] : []),
    ...(context.documentIds || []),
  ])), [context.documentId, context.documentIds]);
  const hasCurrentDocument = visibleDocumentIds.length > 0;
  const hasCurrentNotebook = Boolean(context.notebookId);
  const currentAvailable = hasCurrentDocument || hasCurrentNotebook || (mode === "assistant" && Boolean(context.view));
  const currentContextLabel = hasCurrentDocument
    ? visibleDocumentIds.length > 1 ? `当前 ${visibleDocumentIds.length} 份资料` : "当前资料"
    : hasCurrentNotebook ? "当前知识图谱" : "当前页面";
  const libraryPage = context.view === "library";
  const libraryEnabled = selectedDocumentIds.length === 0 && (libraryPage || scope.library);
  const filteredThreads = workspace
    ? threads.filter((thread) => (thread.mode || "assistant") === "learning")
    : historyFilter === "all"
      ? threads
      : threads.filter((thread) => (thread.mode || "assistant") === historyFilter);
  const learningConcepts = useMemo(() => Array.from(new Set(messages
    .map((message) => message.metadata?.learning_card?.concept?.trim())
    .filter((concept): concept is string => Boolean(concept)))), [messages]);
  const learningSources = useMemo(() => {
    const seen = new Set<string>();
    return messages.flatMap((message) => message.sources || []).filter((source) => {
      const key = `${source.kind}:${source.id || ""}:${source.document_id || ""}:${source.block_key || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [messages]);
  function openAgentSource(source: AgentSource) {
    window.sessionStorage.setItem("studypilot.agent.source-mode", mode);
    try {
      onOpenSource?.(source);
    } finally {
      window.sessionStorage.removeItem("studypilot.agent.source-mode");
    }
  }

  const selectedProvider = useMemo(
    () => providers.find((item) => item.id === selectedProviderId) || providers[0],
    [providers, selectedProviderId],
  );
  const configuredProviders = useMemo(
    () => providers.filter(isProviderReady),
    [providers],
  );
  const modelChoices = useMemo(() => {
    if (!selectedProvider || configuredProviders.some((item) => item.id === selectedProvider.id)) {
      return configuredProviders;
    }
    return [...configuredProviders, selectedProvider];
  }, [configuredProviders, selectedProvider]);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<AgentProvider[]>("/api/agent/providers"),
      api.get<AgentThread[]>(`/api/agent/threads?course_id=${courseId}`),
      api.get<Record<string, unknown>>("/api/settings"),
    ]).then(async ([nextProviders, nextThreads, appSettings]) => {
      if (!active) return;
      setProviders(nextProviders);
      setThreads(orderThreads(nextThreads));
      const rememberedProviderId = readProviderSelection();
      const providerId = nextProviders.some((item) => item.id === rememberedProviderId && isProviderReady(item))
        ? rememberedProviderId
        : nextThreads[0]?.provider_id || nextProviders.find(isProviderReady)?.id || nextProviders[0]?.id || "";
      setSelectedProviderId(providerId);
      const initialProvider = nextProviders.find((item) => item.id === providerId);
      setExplanationLength(initialProvider
        ? explanationLengthForTokenLimit(initialProvider.max_output_tokens)
        : normalizeLearningExplanationLength(appSettings?.learning_explanation_length));
      setSettingsDraft(providerDraft(initialProvider));
      if (providerId) selectProviderGlobally(providerId);
      const rememberedThreadId = readActiveThreadId(courseId, requestedMode);
      const preferredThread = nextThreads.find(
        (thread) => thread.id === rememberedThreadId && (thread.mode || "assistant") === requestedMode,
      ) || nextThreads.find(
        (thread) => (thread.mode || "assistant") === requestedMode,
      );
      if (preferredThread) {
        await openThread(preferredThread, active);
        setSelectedProviderId(providerId);
        setSettingsDraft(providerDraft(nextProviders.find((item) => item.id === providerId)));
      }
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "无法加载助手");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [api, courseId]);

  useEffect(() => {
    function syncProvider(event: Event) {
      const providerId = providerSelectionFromEvent(event);
      const provider = providers.find((item) => item.id === providerId);
      if (!provider || providerId === selectedProviderId) return;
      setSelectedProviderId(providerId);
      setDraftProviderId(null);
      setSettingsDraft(providerDraft(provider));
      setExplanationLength(explanationLengthForTokenLimit(provider.max_output_tokens));
      persistActiveThreadProvider(providerId);
    }
    window.addEventListener(PROVIDER_SELECTION_EVENT, syncProvider);
    return () => window.removeEventListener(PROVIDER_SELECTION_EVENT, syncProvider);
  }, [providers, selectedProviderId]);

  useEffect(() => setView(requestedView), [requestedView]);
  useEffect(() => {
    if (!workspace) return;
    let active = true;
    api.get<ContextDocument[]>(`/api/courses/${courseId}/documents`)
      .then((items) => {
        if (!active) return;
        const available = items.filter((item) => item.status !== "error");
        setContextDocuments(available);
        setSelectedDocumentIds((current) => current.filter((id) => available.some((item) => item.id === id)));
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "无法读取这门课程的资料");
      });
    return () => { active = false; };
  }, [api, courseId, workspace]);
  useEffect(() => {
    if (mode !== "learning") return;
    rememberLearningDocumentIds(courseId, selectedDocumentIds);
    window.dispatchEvent(new CustomEvent("studypilot:learning-scope-changed", {
      detail: { courseId, documentIds: selectedDocumentIds, origin: dockInstanceId },
    }));
  }, [courseId, mode, selectedDocumentIds, dockInstanceId]);

  useEffect(() => {
    function syncLearningScope(event: Event) {
      const detail = (event as CustomEvent<{ courseId?: number; documentIds?: number[]; origin?: string }>).detail;
      if (detail?.courseId !== courseId || detail.origin === dockInstanceId || !Array.isArray(detail.documentIds)) return;
      const nextIds = detail.documentIds.map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 200);
      setSelectedDocumentIds((current) => (
        current.length === nextIds.length && current.every((id, index) => id === nextIds[index]) ? current : nextIds
      ));
    }
    window.addEventListener("studypilot:learning-scope-changed", syncLearningScope);
    return () => window.removeEventListener("studypilot:learning-scope-changed", syncLearningScope);
  }, [courseId, dockInstanceId]);

  useEffect(() => {
    function syncExplanationLength(event: Event) {
      const detail = (event as CustomEvent<{
        value?: unknown;
        tokenLimit?: unknown;
        providerId?: string;
        origin?: string;
      }>).detail;
      if (!detail || detail.origin === dockInstanceId) return;
      setExplanationLength(normalizeLearningExplanationLength(detail.value));
      const tokenLimit = Number(detail.tokenLimit);
      if (!Number.isFinite(tokenLimit) || tokenLimit < 0) return;
      setProviders((current) => current.map((provider) => (
        provider.id === detail.providerId
          ? { ...provider, max_output_tokens: tokenLimit }
          : provider
      )));
      if (
        !draftProviderId
        && (!detail.providerId || detail.providerId === selectedProviderId)
      ) {
        setSettingsDraft((current) => ({ ...current, max_output_tokens: tokenLimit }));
      }
    }
    window.addEventListener("studypilot:learning-length-changed", syncExplanationLength);
    return () => window.removeEventListener("studypilot:learning-length-changed", syncExplanationLength);
  }, [dockInstanceId, draftProviderId, selectedProviderId]);
  useEffect(() => {
    function syncActiveThread(event: Event) {
      const detail = (event as CustomEvent<{ courseId?: number; mode?: AgentMode; threadId?: number; origin?: string }>).detail;
      if (
        detail?.courseId !== courseId
        || detail.mode !== mode
        || detail.origin === dockInstanceId
        || !Number.isInteger(detail.threadId)
      ) return;
      void openThread({ id: detail.threadId } as AgentThread, true, false);
    }
    window.addEventListener("studypilot:agent-thread-active", syncActiveThread);
    return () => window.removeEventListener("studypilot:agent-thread-active", syncActiveThread);
  }, [api, courseId, mode, dockInstanceId]);

  useEffect(() => {
    setMode(requestedMode);
    if (requestedMode === "learning") setSelectedDocumentIds(readLearningDocumentIds(courseId));
    if (activeThread && (activeThread.mode || "assistant") !== requestedMode) {
      setActiveThread(null);
      setMessages([]);
    }
  }, [courseId, requestedMode]);

  useEffect(() => () => {
    attachmentsRef.current.forEach((attachment) => {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    });
  }, []);

  useEffect(() => {
    transcriptRef.current?.scrollTo?.({ top: transcriptRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (!sending) {
      setThinkingStage("正在整理所选资料");
      return;
    }
    const connectTimer = window.setTimeout(() => setThinkingStage("正在连接模型服务"), 900);
    const answerTimer = window.setTimeout(() => setThinkingStage("模型正在生成较完整的回答"), 4200);
    return () => {
      window.clearTimeout(connectTimer);
      window.clearTimeout(answerTimer);
    };
  }, [sending]);

  async function toggleDocumentPicker() {
    const next = !documentPickerOpen;
    setDocumentPickerOpen(next);
    if (!next || contextDocuments.length) return;
    try {
      const items = await api.get<ContextDocument[]>(`/api/courses/${courseId}/documents`);
      const available = items.filter((item) => item.status !== "error");
      setContextDocuments(available);
      setSelectedDocumentIds((current) => current.filter((id) => available.some((item) => item.id === id)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取这门课程的资料");
    }
  }

  function toggleSelectedDocument(documentId: number) {
    setSelectedDocumentIds((current) => current.includes(documentId)
      ? current.filter((id) => id !== documentId)
      : [...current, documentId]);
  }

  async function openThread(thread: AgentThread, mounted = true, announce = true) {
    const detail = await api.get<AgentThread>(`/api/agent/threads/${thread.id}`);
    if (!mounted) return;
    setActiveThread(detail);
    setMessages(detail.messages || []);
    setThreads((current) => orderThreads([detail, ...current.filter((item) => item.id !== detail.id)]));
    setSelectedProviderId(detail.provider_id);
    setMode(detail.mode || "assistant");
    setView("chat");
    rememberActiveThread(courseId, detail);
    if (announce) {
      window.dispatchEvent(new CustomEvent("studypilot:agent-thread-active", {
        detail: { courseId, mode: detail.mode || "assistant", threadId: detail.id, origin: dockInstanceId },
      }));
    }
  }

  async function createThread(nextMode: AgentMode = mode) {
    const created = await api.post<AgentThread>("/api/agent/threads", {
      course_id: courseId,
      provider_id: selectedProviderId || "openai",
      mode: nextMode,
    });
    setActiveThread(created);
    setMessages([]);
    setMode(created.mode || nextMode);
    setThreads((current) => orderThreads([created, ...current.filter((item) => item.id !== created.id)]));
    setView("chat");
    rememberActiveThread(courseId, created);
    window.dispatchEvent(new CustomEvent("studypilot:agent-thread-active", {
      detail: { courseId, mode: created.mode || nextMode, threadId: created.id, origin: dockInstanceId },
    }));
    return created;
  }

  async function send(
    messageOverride?: string,
    feedbackKind?: LearningFeedbackKind,
    contextOverride: Partial<AgentPageContext> = {},
  ) {
    const question = messageOverride?.trim() || draft.trim() || (attachments.length ? "请分析这些附件。" : "");
    if (!question || sending) return;
    const shouldGenerateThreadTitle = !messages.some((message) => message.role === "user");
    const requestContext = { ...context, ...contextOverride };
    const continuingAutonomousLearning = mode === "learning"
      && selectedDocumentIds.length === 0
      && messages.some((message) => message.role === "user" && message.metadata?.source_free === true);
    const sourceFreeRequest = mode === "learning"
      && (Boolean(requestContext.sourceFree) || continuingAutonomousLearning);
    const queuedDocuments = attachments.some((attachment) => attachment.kind === "document");
    if (
      workspace
      && mode === "learning"
      && !sourceFreeRequest
      && selectedDocumentIds.length === 0
      && !queuedDocuments
    ) {
      setError("先选择学习资料，或在上方输入主题使用自主规划");
      return;
    }
    setSending(true);
    setLearningProgress(null);
    setError("");
    let thread = activeThread;
    let requestController: AbortController | null = null;
    let typewriter: TypewriterQueue | null = null;
    try {
      const uploadedAttachments: AgentAttachment[] = [];
      const uploadedDocumentIds: number[] = [];
      for (const attachment of attachments) {
        const form = new FormData();
        form.append("file", attachment.file, attachment.file.name);
        if (attachment.kind === "document") {
          const item = await api.post<ContextDocument & { media_type?: string }>(
            "/api/documents/import",
            form,
            { timeoutMs: 600000 },
          );
          uploadedDocumentIds.push(item.id);
          uploadedAttachments.push({
            kind: "document",
            name: attachment.file.name,
            media_type: attachment.file.type || item.media_type || "application/octet-stream",
            document_id: item.id,
          });
        } else {
          const item = await api.post<{ id: string; filename: string; media_type: string; url: string }>(
            "/api/media/images",
            form,
            { timeoutMs: 120000 },
          );
          uploadedAttachments.push({
            kind: "image",
            name: attachment.file.name,
            media_type: item.media_type,
            image_asset_id: item.id,
            url: item.url,
          });
        }
      }
      if (!thread) thread = await createThread();
      const optimistic: AgentMessage = {
        id: -Date.now(), role: "user", content: question, sources: [], status: "complete", error: "",
        attachments: uploadedAttachments,
        metadata: { ...(feedbackKind ? { feedback_kind: feedbackKind } : {}), source_free: sourceFreeRequest },
      };
      setMessages((current) => [...current, optimistic]);
      const requestDocumentIds = Array.from(new Set([
        ...visibleDocumentIds,
        ...(requestContext.documentIds || []),
        ...(requestContext.documentId ? [requestContext.documentId] : []),
      ]));
      const requestPayload = {
        message: question,
        provider_id: selectedProviderId,
        feedback_kind: feedbackKind,
        ...(mode === "learning" ? { explanation_length: explanationLength } : {}),
        attachments: uploadedAttachments,
        context: {
          page_view: requestContext.view || "",
          page_title: requestContext.title || "",
          document_id: sourceFreeRequest ? undefined : requestContext.documentId,
          document_ids: sourceFreeRequest ? [] : requestDocumentIds,
          selected_document_ids: sourceFreeRequest
            ? []
            : Array.from(new Set([
              ...selectedDocumentIds,
              ...uploadedDocumentIds,
            ])).slice(0, 200),
          block_key: requestContext.blockKey || "",
          selected_text: requestContext.selectedText || "",
          locator: requestContext.locator || {},
          notebook_id: sourceFreeRequest ? undefined : requestContext.notebookId,
          include_current: sourceFreeRequest
            ? false
            : currentAvailable || Boolean(requestContext.documentId || requestContext.notebookId),
          include_notes: sourceFreeRequest ? false : scope.notes,
          include_knowledge: sourceFreeRequest
            ? false
            : scope.knowledge || hasCurrentNotebook || Boolean(requestContext.notebookId),
          include_library: sourceFreeRequest ? false : libraryEnabled,
          source_free: sourceFreeRequest,
          learning_topic: sourceFreeRequest ? requestContext.learningTopic || undefined : undefined,
          learning_goal: sourceFreeRequest ? requestContext.learningGoal || undefined : undefined,
        },
      };
      requestController = new AbortController();
      streamAbortRef.current = requestController;
      const streamClient = (api as ApiClient & {
        streamNDJSON?: ApiClient["streamNDJSON"];
      }).streamNDJSON;
      const streamingMessageId = optimistic.id - 1;
      let usedStream = false;
      let streamedResult: AgentReply | undefined;
      if (typeof streamClient === "function") {
        usedStream = true;
        let learningRawStream = "";
        let learningReadablePreview = "";
        let draftStarted = false;
        const ensureDraft = () => {
          if (draftStarted) return;
          draftStarted = true;
          setMessages((current) => [...current, {
            id: streamingMessageId,
            role: "assistant",
            content: "",
            sources: [],
            status: "streaming",
            error: "",
          }]);
        };
        typewriter = createTypewriterQueue((fragment) => {
          ensureDraft();
          setMessages((current) => current.map((message) => (
            message.id === streamingMessageId
              ? { ...message, content: message.content + fragment }
              : message
          )));
        }, 6);
        await streamClient.call(
          api,
          `/api/agent/threads/${thread.id}/messages/stream`,
          requestPayload,
          (rawEvent: unknown) => {
            const event = rawEvent as AgentStreamEvent;
            if (event.type === "learning_progress") {
              setLearningProgress({
                phase: event.phase,
                label: event.label,
                schema: event.schema,
                fields: event.fields,
              });
            }
            if (event.type === "start") ensureDraft();
            if (event.type === "delta") {
              if (mode !== "learning") {
                typewriter?.enqueue(event.text);
              } else {
                learningRawStream += event.text;
                const nextPreview = learningStreamPreview(learningRawStream);
                if (nextPreview.startsWith(learningReadablePreview)) {
                  typewriter?.enqueue(nextPreview.slice(learningReadablePreview.length));
                } else if (nextPreview && nextPreview !== learningReadablePreview) {
                  // A malformed provider chunk should not expose JSON. Continue
                  // with the newly readable text instead of replacing the draft.
                  typewriter?.enqueue(`${learningReadablePreview ? "\n\n" : ""}${nextPreview}`);
                }
                learningReadablePreview = nextPreview;
              }
            }
            if (event.type === "final") streamedResult = event.data;
          },
          { timeoutMs: 195000, signal: requestController.signal },
        );
        // The server's final message is authoritative. Stop any local reveal backlog so
        // a throttled renderer can never delay or lose the completed answer.
        typewriter?.cancel();
        if (!streamedResult) throw new Error("流式回复未返回最终消息");
      }
      const result = usedStream
        ? streamedResult as AgentReply
        : await api.post<AgentReply>(
          `/api/agent/threads/${thread.id}/messages`,
          requestPayload,
          { timeoutMs: 195000, signal: requestController.signal },
        );
      setActiveThread(result.thread);
      rememberActiveThread(courseId, result.thread);
      window.dispatchEvent(new CustomEvent("studypilot:agent-thread-active", {
        detail: { courseId, mode: result.thread.mode || mode, threadId: result.thread.id, origin: dockInstanceId },
      }));
      setMode(result.thread.mode || mode);
      setThreads((current) => orderThreads([result.thread, ...current.filter((item) => item.id !== result.thread.id)]));
      setMessages((current) => [
        ...current.filter((message) => !usedStream || message.id !== streamingMessageId),
        result.message,
      ]);
      setDraft("");
      setAttachments((current) => {
        current.forEach((attachment) => {
          if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
        });
        return [];
      });
      if (shouldGenerateThreadTitle && result.message.status === "complete") {
        void api.post<AgentThread>(
          `/api/agent/threads/${result.thread.id}/generate-title`,
          {},
          { timeoutMs: 120000 },
        ).then((titledThread) => {
          setThreads((current) => orderThreads([
            titledThread,
            ...current.filter((item) => item.id !== titledThread.id),
          ]));
          setActiveThread((current) => {
            if (!current || current.id !== titledThread.id) return current;
            const merged = { ...current, ...titledThread };
            rememberActiveThread(courseId, merged);
            return merged;
          });
        }).catch(() => {
          // The question-prefix fallback remains usable when a title-only request fails.
        });
      }
    } catch (reason) {
      setMessages((current) => current.filter((message) => message.status !== "streaming"));
      setError(reason instanceof Error ? reason.message : "PILOT 暂时无法生成回复");
    } finally {
      typewriter?.cancel();
      setSending(false);
      setLearningProgress(null);
      if (streamAbortRef.current === requestController) streamAbortRef.current = null;
      requestController = null;
    }
  }

  useEffect(() => {
    if (
      !requestedAction
      || loading
      || sending
      || handledActionRef.current === requestedAction.id
    ) return;
    if (mode !== "assistant") {
      changeMode("assistant");
      return;
    }
    handledActionRef.current = requestedAction.id;
    void send(requestedAction.prompt, undefined, requestedAction.context);
  }, [requestedAction?.id, loading, sending, mode, activeThread?.id]);

  useEffect(() => () => {
    stopLanguageSpeech();
  }, []);

  function speakText(text: string, languageTag = "") {
    const utterance = speakLanguageText(
      text,
      languageTag || context.languageTag || "",
      1,
    );
    if (!utterance) {
      setError("当前系统没有可用的语音朗读引擎");
    }
  }

  function changeMode(nextMode: AgentMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    if (nextMode === "learning") setSelectedDocumentIds(readLearningDocumentIds(courseId));
    setActiveThread(null);
    setMessages([]);
    setDraft("");
    setError("");
    setView("chat");
    const rememberedThreadId = readActiveThreadId(courseId, nextMode);
    const rememberedThread = threads.find(
      (thread) => thread.id === rememberedThreadId && (thread.mode || "assistant") === nextMode,
    );
    if (rememberedThread) void openThread(rememberedThread);
  }

  function addAttachmentFiles(files: File[]) {
    setError("");
    setAttachments((current) => {
      const next = [...current];
      const existing = new Set(current.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
      let unsupported = false;
      for (const file of files) {
        if (next.length >= 8) break;
        const kind = attachmentKind(file);
        if (!kind) {
          unsupported = true;
          continue;
        }
        const signature = `${file.name}:${file.size}:${file.lastModified}`;
        if (existing.has(signature)) continue;
        existing.add(signature);
        next.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          kind,
          previewUrl: attachmentPreview(file, kind),
        });
      }
      if (unsupported) window.setTimeout(() => setError("仅支持资料文档与 PNG、JPEG、WebP、GIF 图片"), 0);
      return next;
    });
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  function onAttachmentInput(event: ChangeEvent<HTMLInputElement>) {
    addAttachmentFiles(Array.from(event.target.files || []));
    event.target.value = "";
  }

  function onComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files || []);
    if (!files.length) {
      for (const item of Array.from(event.clipboardData.items || [])) {
        const file = item.kind === "file" ? item.getAsFile() : null;
        if (file) files.push(file);
      }
    }
    if (!files.length) return;
    event.preventDefault();
    addAttachmentFiles(files);
  }

  function onComposerDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setAttachmentDragging(false);
    addAttachmentFiles(Array.from(event.dataTransfer.files || []));
  }

  async function captureCurrentWindow() {
    const capture = window.studypilot?.capture?.window;
    if (!capture) {
      setError("当前环境不支持窗口截图");
      return;
    }
    try {
      const bytes = await capture();
      if (!bytes?.length) throw new Error("没有捕获到截图");
      const copy = Uint8Array.from(bytes);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      addAttachmentFiles([
        new File([copy.buffer], `StudyPilot-截图-${stamp}.png`, { type: "image/png" }),
      ]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "窗口截图失败");
    }
  }

  async function runActionPlan(
    messageId: number,
    planId: number,
    action: "confirm" | "cancel" | "undo",
  ) {
    const updated = await api.post<AgentActionPlan>(`/api/agent/action-plans/${planId}/${action}`);
    setMessages((current) => current.map((message) => (
      message.id === messageId ? { ...message, action_plan: updated } : message
    )));
    if (action === "confirm" || action === "undo") {
      window.dispatchEvent(new CustomEvent("studypilot:workspace-mutated", {
        detail: {
          documentIds: updated.result?.affected_document_ids || [],
          notebookIds: updated.result?.affected_notebook_ids || [],
          reason: action === "confirm" ? "agent-confirm" : "agent-undo",
        },
      }));
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void send();
  }

  function openSettings() {
    setSettingsDraft(providerDraft(selectedProvider));
    setDraftProviderId(null);
    setNotice("");
    setView("settings");
  }

  async function changeOutputStrategy(
    value: LearningExplanationLength,
    tokenLimit = OUTPUT_STRATEGY_TOKEN_LIMITS[value],
  ) {
    const previousLength = explanationLength;
    const previousTokenLimit = settingsDraft.max_output_tokens;
    setExplanationLength(value);
    setSettingsDraft((current) => ({ ...current, max_output_tokens: tokenLimit }));
    setError("");
    setNotice("");
    try {
      const providerToLink = draftProviderId ? undefined : selectedProvider;
      const linkedProviderRequest: Promise<AgentProvider | null> = providerToLink
        ? (() => {
          const { api_key: _apiKey, ...providerSettings } = providerDraft(providerToLink);
          return api.put<AgentProvider>(
            `/api/agent/providers/${providerToLink.id}`,
            { ...providerSettings, max_output_tokens: tokenLimit },
          );
        })()
        : Promise.resolve(null);
      const [, savedProvider] = await Promise.all([
        api.put("/api/settings/learning_explanation_length", { value }),
        linkedProviderRequest,
      ]);
      const linkedProvider = savedProvider
        ? { ...savedProvider, max_output_tokens: tokenLimit }
        : null;
      if (linkedProvider) {
        setProviders((current) => current.map((provider) => (
          provider.id === linkedProvider.id ? linkedProvider : provider
        )));
      }
      window.dispatchEvent(new CustomEvent("studypilot:learning-length-changed", {
        detail: {
          value,
          tokenLimit,
          providerId: linkedProvider?.id || providerToLink?.id,
          origin: dockInstanceId,
        },
      }));
      setNotice(`单次输出策略已设置为${outputStrategyLabel(value)}`);
    } catch (reason) {
      setExplanationLength(previousLength);
      setSettingsDraft((current) => ({ ...current, max_output_tokens: previousTokenLimit }));
      setError(reason instanceof Error ? reason.message : "单次输出策略保存失败");
    }
  }

  function persistActiveThreadProvider(providerId: string) {
    if (!activeThread || activeThread.provider_id === providerId) return;
    const threadId = activeThread.id;
    void api.patch<AgentThread>(`/api/agent/threads/${threadId}`, { provider_id: providerId })
      .then((updated) => {
        setActiveThread((current) => current?.id === threadId
          ? { ...current, ...updated }
          : current);
        setThreads((current) => current.map((item) => item.id === threadId
          ? { ...item, ...updated }
          : item));
        rememberActiveThread(courseId, { ...activeThread, ...updated });
      })
      .catch((reason) => {
        setError(reason instanceof Error ? reason.message : "无法切换当前对话模型");
      });
  }

  function chooseProvider(providerId: string) {
    const provider = providers.find((item) => item.id === providerId);
    setSelectedProviderId(providerId);
    selectProviderGlobally(providerId);
    setDraftProviderId(null);
    setSettingsDraft(providerDraft(provider));
    if (provider) {
      setExplanationLength(explanationLengthForTokenLimit(provider.max_output_tokens));
    }
    persistActiveThreadProvider(providerId);
  }

  function editProvider(provider: AgentProvider) {
    chooseProvider(provider.id);
    window.setTimeout(() => providerLabelInputRef.current?.focus(), 0);
  }

  function createProvider() {
    setDraftProviderId(createProviderId());
    setSettingsDraft({
      ...providerDraft(undefined),
      max_output_tokens: OUTPUT_STRATEGY_TOKEN_LIMITS[explanationLength],
    });
    setNotice("");
    setError("");
    window.setTimeout(() => providerLabelInputRef.current?.focus(), 0);
  }

  async function saveProvider(showNotice = true): Promise<AgentProvider | null> {
    const providerId = draftProviderId || selectedProvider?.id;
    if (!providerId || savingProvider) return null;
    setSavingProvider(true);
    setError("");
    if (showNotice) setNotice("正在保存模型配置…");
    const { api_key: draftApiKey, ...providerSettings } = settingsDraft;
    const payload = {
      ...providerSettings,
      ...(draftApiKey.trim() ? { api_key: draftApiKey.trim() } : {}),
    };
    try {
      const saved = await api.put<AgentProvider>(`/api/agent/providers/${providerId}`, payload);
      setProviders((current) => current.some((item) => item.id === saved.id)
        ? current.map((item) => item.id === saved.id ? saved : item)
        : [...current, saved]);
      setSelectedProviderId(saved.id);
      selectProviderGlobally(saved.id);
      setDraftProviderId(null);
      setSettingsDraft(providerDraft(saved));
      if (showNotice) setNotice("模型配置已保存；密钥不会回显");
      return saved;
    } catch (reason) {
      setNotice("");
      setError(reason instanceof Error ? reason.message : "模型配置保存失败");
      return null;
    } finally {
      setSavingProvider(false);
    }
  }

  async function testProvider() {
    if ((!selectedProvider && !draftProviderId) || savingProvider || testingProvider) return;
    setTestingProvider(true);
    setNotice("正在保存当前配置并测试连接…");
    setError("");
    try {
      const saved = await saveProvider(false);
      if (!saved) return;
      await api.post(`/api/agent/providers/${saved.id}/test`);
      setNotice("连接正常，可以开始提问");
    } catch (reason) {
      setNotice("");
      setError(reason instanceof Error ? reason.message : "连接测试失败");
    } finally {
      setTestingProvider(false);
    }
  }

  async function deleteProvider() {
    if (!pendingProviderDelete) return;
    const provider = pendingProviderDelete;
    setError("");
    try {
      await api.delete(`/api/agent/providers/${provider.id}`);
      const remaining = providers.filter((item) => item.id !== provider.id);
      setProviders(remaining);
      if (selectedProviderId === provider.id) {
        const replacement = remaining.find(isProviderReady) || remaining[0];
        setSelectedProviderId(replacement?.id || "");
        selectProviderGlobally(replacement?.id || "");
        setSettingsDraft(providerDraft(replacement));
      }
      setDraftProviderId(null);
      setPendingProviderDelete(null);
      setNotice(`已删除模型配置“${provider.label}”`);
    } catch (reason) {
      setPendingProviderDelete(null);
      setError(reason instanceof Error ? reason.message : "模型配置删除失败");
    }
  }

  async function deleteThread() {
    if (!pendingDelete) return;
    await api.delete(`/api/agent/threads/${pendingDelete.id}`);
    forgetActiveThread(courseId, pendingDelete);
    setThreads((current) => current.filter((item) => item.id !== pendingDelete.id));
    if (activeThread?.id === pendingDelete.id) {
      setActiveThread(null);
      setMessages([]);
    }
    setPendingDelete(null);
  }

  async function toggleThreadPin(thread: AgentThread) {
    setError("");
    try {
      const updated = await api.patch<AgentThread>(
        `/api/agent/threads/${thread.id}`,
        { pinned: thread.pinned !== true },
      );
      setThreads((current) => orderThreads(current.map((item) => (
        item.id === thread.id ? { ...item, ...updated } : item
      ))));
      setActiveThread((current) => current?.id === thread.id
        ? { ...current, ...updated }
        : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法更新对话置顶状态");
    }
  }

  async function deleteAllThreads() {
    if (!threads.length) return;
    setError("");
    try {
      await Promise.all(threads.map((thread) => api.delete(`/api/agent/threads/${thread.id}`)));
      threads.forEach((thread) => forgetActiveThread(courseId, thread));
      setThreads([]);
      setActiveThread(null);
      setMessages([]);
      setPendingDeleteAll(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "全部对话删除失败");
    }
  }

  async function deleteAllProviders() {
    if (!providers.length) return;
    setError("");
    try {
      await Promise.all(providers.map((provider) => api.delete(`/api/agent/providers/${provider.id}`)));
      setProviders([]);
      setSelectedProviderId("");
      selectProviderGlobally("");
      setDraftProviderId(null);
      setSettingsDraft(providerDraft(undefined));
      setPendingDeleteAll(null);
      setNotice("全部模型配置已删除");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "全部模型配置删除失败");
    }
  }

  async function exportHistory() {
    if (exportingHistory || threads.length === 0) return;
    setExportingHistory(true);
    setError("");
    setExportedHistoryPath("");
    try {
      const details = await Promise.all(threads.map((thread) => (
        activeThread?.id === thread.id && activeThread.messages
          ? activeThread
          : api.get<AgentThread>(`/api/agent/threads/${thread.id}`)
      )));
      const markdown = [
        "# PILOT 对话历史",
        "",
        `导出时间：${new Date().toLocaleString("zh-CN")}`,
        "",
        ...details.flatMap((thread) => [
          `## ${thread.title || "未命名对话"}`,
          "",
          `模型：${thread.model || thread.provider_id}`,
          `模式：${(thread.mode || "assistant") === "learning" ? "学习" : "助手"}`,
          "",
          ...(thread.messages || []).flatMap((message) => [
            `### ${message.role === "user" ? "你" : "PILOT"}`,
            "",
            message.content || message.error || "（空消息）",
            "",
            ...(message.sources?.length ? ["来源：", ...message.sources.map((source) => `- ${sourceLabel(source)}`), ""] : []),
          ]),
          "---",
          "",
        ]),
      ].join("\n");
      const bytes = new TextEncoder().encode(markdown);
      const date = new Date().toISOString().slice(0, 10);
      const saveToArchive = window.studypilot?.files?.saveToArchive;
      if (!saveToArchive) throw new Error("当前环境不支持存档导出");
      const path = await saveToArchive({ suggestedName: `PILOT-对话历史-${date}.md`, bytes });
      setExportedHistoryPath(path);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "对话历史导出失败");
    } finally {
      setExportingHistory(false);
    }
  }

  return (
    <aside className={`agent-dock agent-dock--${variant}`} data-variant={variant} aria-label={variant === "workspace" ? "学习中心工作区" : "PILOT 学习助手"}>
      {workspace ? (
        <LearningWorkspaceHeader
          title={activeThread?.title || "新学习对话"}
          lessonIndex={activeThread?.learning_state?.lesson_index}
          selectedDocumentCount={selectedDocumentIds.length}
          documentPickerOpen={documentPickerOpen}
          progressOpen={progressOpen}
          view={view}
          onToggleDocuments={() => void toggleDocumentPicker()}
          onToggleProgress={() => setProgressOpen((value) => !value)}
          onNewSession={() => void createThread("learning")}
          onOpenSettings={openSettings}
          onContinueInDock={() => window.dispatchEvent(new CustomEvent(
            "studypilot:open-agent",
            { detail: { view: "chat", mode: "learning" } },
          ))}
        />
      ) : (
        <header className="agent-dock__header">
          <div className="agent-identity">
            <span>P</span>
            <div><strong>PILOT</strong></div>
          </div>
          <div className="agent-header-actions">
            <button aria-label="新建对话" title="新建对话" onClick={() => void createThread()}>＋</button>
            <button aria-label="对话历史" title="对话历史" className={view === "history" ? "is-active" : ""} onClick={() => setView("history")}>◫</button>
            <button aria-label="模型设置" title="模型设置" className={view === "settings" ? "is-active" : ""} onClick={openSettings}>⚙</button>
            <button aria-label="关闭助手" title="关闭助手" onClick={onClose}>×</button>
          </div>
        </header>
      )}

      {workspace && (
        <LearningHistoryRail
          threads={filteredThreads}
          activeThreadId={activeThread?.id}
          onNew={async () => { await createThread("learning"); }}
          onOpen={(thread) => openThread(thread)}
          onTogglePin={toggleThreadPin}
          onRequestDelete={setPendingDelete}
          onRequestDeleteAll={() => setPendingDeleteAll("threads")}
        />
      )}

      {view === "chat" && (
        <section className={workspace ? "agent-chat learning-workbench__body" : "agent-chat"}>
          {!workspace && <div className="agent-thread-bar">
            <div><strong>{activeThread?.title || "新对话"}</strong></div>
            <span className={selectedProvider?.has_api_key || selectedProvider?.base_url.includes("127.0.0.1") ? "is-ready" : ""}>
              {selectedProvider?.label || "未选择模型"}
            </span>
          </div>}
          {!workspace && <AgentModeSwitch value={mode} disabled={sending} onChange={changeMode} />}
          {!workspace && (
            <div className="agent-context-rail" aria-label="回答上下文">
              {(mode !== "learning" || currentAvailable) && <button aria-pressed={currentAvailable} disabled={!currentAvailable}>{currentContextLabel}</button>}
              <button aria-pressed={scope.notes} onClick={() => setScope((value) => ({ ...value, notes: !value.notes }))}>课程笔记</button>
              <button aria-pressed={scope.knowledge} onClick={() => setScope((value) => ({ ...value, knowledge: !value.knowledge }))}>知识图谱</button>
              <button aria-pressed={libraryEnabled} onClick={() => setScope((value) => ({ ...value, library: !value.library }))}>资料库</button>
              <button aria-expanded={documentPickerOpen} aria-label="选择指定资料" aria-pressed={selectedDocumentIds.length > 0} onClick={() => void toggleDocumentPicker()}>{selectedDocumentIds.length ? `已选 ${selectedDocumentIds.length} 份` : "选择资料"}</button>
            </div>
          )}
          <MaterialPicker
            workspace={workspace}
            open={documentPickerOpen}
            documents={contextDocuments}
            selectedIds={selectedDocumentIds}
            onClear={() => setSelectedDocumentIds([])}
            onSelectionChange={setSelectedDocumentIds}
            onClose={() => setDocumentPickerOpen(false)}
            onToggle={toggleSelectedDocument}
          />
          <div className={`agent-conversation ${!workspace && questionMessages.length ? "has-question-guide" : ""}`}>
            {!workspace && questionMessages.length > 0 && (
              <nav className="agent-question-guide" aria-label="本次对话问题导览">
                <header><span>问题</span><strong>{questionMessages.length}</strong></header>
                <div>
                  {questionMessages.map((message, index) => (
                    <button
                      key={message.id}
                      type="button"
                      className={activeQuestionId === message.id ? "is-active" : ""}
                      aria-label={`定位问题 ${index + 1}：${message.content}`}
                      title={message.content}
                      onClick={() => {
                        setActiveQuestionId(message.id);
                        document.getElementById(`agent-question-${message.id}`)?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                      }}
                    ><i>Q{index + 1}</i><span>{message.content}</span></button>
                  ))}
                </div>
              </nav>
            )}
          <div className="agent-transcript" ref={transcriptRef} role="log" aria-live="polite" aria-label={workspace ? "学习对话" : "PILOT 对话记录"}>
            {loading && <div className="agent-loading">正在恢复本地对话…</div>}
            {!loading && messages.length === 0 && (mode === "learning"
              ? <LearningStartCard
                hasSelectedMaterials={selectedDocumentIds.length > 0}
                selectedMaterials={contextDocuments.filter((document) => selectedDocumentIds.includes(document.id))}
                availableMaterialCount={contextDocuments.length}
                onManageMaterials={() => void toggleDocumentPicker()}
                onRemoveMaterial={toggleSelectedDocument}
                onStart={(prompt) => void send(prompt)}
                onAutonomousStart={(subject, goal) => void send(
                  [subject, goal].filter(Boolean).join("\n"), undefined, {
                    sourceFree: true,
                    learningTopic: subject,
                    learningGoal: goal,
                  },
                )}
              />
              : <div className="agent-welcome agent-welcome--compact">
                <header>
                  <small>PILOT</small><h2>今天想先处理什么？</h2><p>选择一种快捷方式，或直接在下方输入问题。</p>
                </header>
                <div>
                  {[
                    ["总结", "总结当前内容"], ["解释", "解释这个概念"], ["对比", "对比资料中的方法"],
                  ].map(([label, prompt]) => (
                    <button key={label} onClick={() => setDraft(prompt)}>{label}</button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message) => (
              <article
                key={message.id}
                id={message.role === "user" ? `agent-question-${message.id}` : undefined}
                className={`agent-message is-${message.role} ${message.status === "error" ? "is-error" : ""}`}
              >
                <small>{message.role === "user" ? "你" : "PILOT"}</small>
                {message.content
                  && !(message.role === "assistant" && message.metadata?.learning_card)
                  && (message.role === "assistant"
                  ? <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: ({ href, children }) => {
                        const citation = href?.startsWith("#studypilot-source-")
                          ? href.slice("#studypilot-source-".length)
                          : "";
                        const source = message.sources?.find((item) => item.citation === citation);
                        return source
                          ? <button
                            type="button"
                            className="agent-inline-citation"
                            aria-label={`打开来源 ${source.title}`}
                            title={sourceLabel(source)}
                            onClick={() => openAgentSource(source)}
                          >{children}</button>
                          : <a href={href}>{children}</a>;
                      },
                    }}
                  >{inlineCitationMarkdown(message.content)}</ReactMarkdown>
                  : <p>{message.content}</p>)}
                {message.role === "assistant" && message.metadata?.learning_card && (
                  <LearningMessageCard
                    card={message.metadata.learning_card}
                    generationTrace={message.metadata.generation_trace}
                    disabled={sending}
                    onAnswer={(answer) => void send(answer)}
                    onFeedback={(kind, label) => void send(label, kind)}
                  />
                )}
                {message.role === "assistant" && message.content && message.status !== "streaming" && (
                  <button
                    type="button"
                    className="agent-message__speech"
                    aria-label="朗读这条回复"
                    onClick={() => speakText(message.content)}
                  >
                    朗读
                  </button>
                )}
                {!!message.attachments?.length && <div className="agent-message-attachments" aria-label="消息附件">
                  {message.attachments.map((attachment, index) => (
                    <span key={`${attachment.kind}-${attachment.document_id || attachment.image_asset_id || index}`}>
                      {attachment.kind === "image" ? "图片" : "资料"} · {attachment.name}
                    </span>
                  ))}
                </div>}
                {message.status === "error" && <p>{message.error || "回复生成失败"}</p>}
                {message.action_plan && (
                  <AgentActionPlanCard
                    plan={message.action_plan}
                    onAction={(action) => runActionPlan(message.id, message.action_plan!.id, action)}
                  />
                )}
                {message.sources?.length > 0 && (
                  <details className="agent-sources">
                    <summary>参考来源 · {message.sources.length}</summary>
                    <div aria-label="回复来源">
                      {message.sources.map((source, index) => (
                        <button
                          key={`${source.kind}-${source.id || index}-${source.block_key || ""}`}
                          aria-label={`来源：${source.title}${source.location_label ? ` · ${source.location_label}` : ""}`}
                          title={source.excerpt}
                          onClick={() => {
                            window.sessionStorage.setItem("studypilot.agent.source-mode", mode);
                            try {
                              onOpenSource?.(source);
                            } finally {
                              window.sessionStorage.removeItem("studypilot.agent.source-mode");
                            }
                          }}
                        >{sourceLabel(source)}</button>
                      ))}
                    </div>
                  </details>
                )}
              </article>
            ))}
            {sending && !(mode === "learning" && messages.some((message) => message.status === "streaming" && message.content.length > 0)) && (mode === "learning"
              ? <LearningGenerationIndicator progress={learningProgress} />
              : <div className="agent-thinking"><i /><span>{thinkingStage}</span></div>
            )}
          </div>
          </div>
          {workspace && progressOpen && <aside className="learning-progress-drawer" aria-label="本轮学习轨迹">
            {activeThread?.learning_state?.learning_path && <section className="learning-progress-drawer__path">
              <strong>{activeThread.learning_state.learning_path.subject} · 完整路径</strong>
              <ol>{activeThread.learning_state.learning_path.stages.map((stage, index) => (
                <li key={`${stage.title}-${index}`}>
                  <i>{String(index + 1).padStart(2, "0")}</i>
                  <span><b>{stage.title}</b><small>{stage.objective}</small></span>
                </li>
              ))}</ol>
            </section>}
            <section>
              <strong>知识点</strong>
              <ol>{learningConcepts.map((concept, index) => <li key={concept} className={index === learningConcepts.length - 1 ? "is-current" : ""}><i>{index + 1}</i><span>{concept}</span></li>)}</ol>
            </section>
            <section>
              <strong>出处</strong>
              <div>{learningSources.map((source, index) => <button
                key={`${source.kind}-${source.id || index}-${source.block_key || ""}`}
                aria-label={`学习出处：${source.title}${source.location_label ? ` · ${source.location_label}` : ""}`}
                title={source.excerpt}
                onClick={() => {
                  window.sessionStorage.setItem("studypilot.agent.source-mode", mode);
                  try { onOpenSource?.(source); } finally { window.sessionStorage.removeItem("studypilot.agent.source-mode"); }
                }}
              >{sourceLabel(source)}</button>)}</div>
            </section>
          </aside>}
          <div className="agent-status-slot">{error && <p className="agent-error" role="alert">{error}</p>}</div>
          <div
            className={`agent-composer ${attachmentDragging ? "is-dragging" : ""}`}
            onDragEnter={(event) => { event.preventDefault(); setAttachmentDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setAttachmentDragging(false);
            }}
            onDrop={onComposerDrop}
          >
            <textarea
              aria-label={workspace ? "学习回答" : "向 PILOT 提问"}
              placeholder={workspace ? "输入回答或提问…" : "询问当前内容，或勾选资料库后跨资料比较…"}
              value={draft}
              disabled={sending}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onComposerKeyDown}
              onPaste={onComposerPaste}
            />
            {!!attachments.length && <div className="agent-composer-attachments" aria-label="待发送附件">
              {attachments.map((attachment) => <article key={attachment.id}>
                {attachment.previewUrl
                  ? <img src={attachment.previewUrl} alt="" />
                  : <span>{attachment.kind === "image" ? "IMG" : "DOC"}</span>}
                <strong title={attachment.file.name}>{attachment.file.name}</strong>
                <button aria-label={`移除附件 ${attachment.file.name}`} onClick={() => removeAttachment(attachment.id)}>×</button>
              </article>)}
            </div>}
            <footer
              className="agent-composer-commandbar"
              data-testid="agent-composer-commandbar"
              title="可粘贴或拖入附件 · Enter 发送 · Shift+Enter 换行"
            >
              <div className="agent-composer-tools">
                <label title="上传资料或图片">
                  ＋ 文件
                  <input
                    ref={attachmentInputRef}
                    aria-label="上传文件或图片"
                    type="file"
                    multiple
                    accept=".pdf,.docx,.md,.markdown,.txt,.csv,.tsv,.json,.yaml,.yml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.h,.hpp,.sql,.log,.ini,.toml,.xlsx,.pptx,.ipynb,image/png,image/jpeg,image/webp,image/gif"
                    onChange={onAttachmentInput}
                  />
                </label>
                <button type="button" aria-label="截取当前窗口" title="截取当前窗口" onClick={() => void captureCurrentWindow()}>▣ 截图</button>
              </div>
              <div className="agent-composer-model">
                <select
                  aria-label="当前模型"
                  title="切换当前对话使用的模型"
                  value={selectedProviderId}
                  disabled={modelChoices.length === 0 || sending}
                  onChange={(event) => chooseProvider(event.target.value)}
                >
                  {modelChoices.map((item) => (
                    <option key={item.id} value={item.id} disabled={!isProviderReady(item)}>
                      {providerOptionLabel(item)}{isProviderReady(item) ? "" : " · 未配置"}
                    </option>
                  ))}
                </select>
              </div>
              {sending
                ? <button className="agent-composer-send is-cancel" aria-label="停止生成" title="停止生成" onClick={() => streamAbortRef.current?.abort()}>■</button>
                : <button className="agent-composer-send" aria-label="发送给 PILOT" title="发送 · Enter" disabled={!draft.trim() && !attachments.length} onClick={() => void send()}>↑</button>
              }
            </footer>
          </div>
        </section>
      )}

      {view === "history" && !workspace && (
        <section className="agent-sheet agent-history-sheet">
          <header><div><h2>{workspace ? "学习历史" : "对话历史"}</h2></div><button onClick={() => setView("chat")}>返回</button></header>
          <button
            className="agent-sheet-primary"
            aria-label={workspace ? "新建学习对话" : "新建空白对话"}
            onClick={() => void createThread(workspace ? "learning" : mode)}
          >
            ＋ {workspace ? "新建学习对话" : "新建空白对话"}
          </button>
          <div className="agent-history-export">
            <button aria-label="导出全部对话" disabled={threads.length === 0 || exportingHistory} onClick={() => void exportHistory()}>{exportingHistory ? "导出中…" : "⇩ 导出全部对话"}</button>
            <button className="is-danger" aria-label="删除全部对话" disabled={threads.length === 0} onClick={() => setPendingDeleteAll("threads")}>删除全部对话</button>
            {exportedHistoryPath && <div role="status"><span>已导出到 {exportedHistoryPath}</span><button aria-label="打开导出文件夹" onClick={() => void window.studypilot.files.openExportDirectory?.()}>打开导出文件夹</button></div>}
            {error && <p className="agent-error" role="alert">{error}</p>}
          </div>
          {!workspace && <div className="agent-history-filters" role="group" aria-label="对话模式筛选">
            {([ ["all", "全部"], ["assistant", "助手"], ["learning", "学习"] ] as const).map(([value, label]) => (
              <button key={value} aria-pressed={historyFilter === value} onClick={() => setHistoryFilter(value)}>{label}</button>
            ))}
          </div>}
          <div className="agent-thread-list">
            {filteredThreads.length === 0 && <p>{workspace ? "还没有学习记录。新建一次学习后会自动保存在这里。" : "还没有符合条件的对话。"}</p>}
            {filteredThreads.map((thread) => (
              <article key={thread.id} className={thread.pinned ? "is-pinned" : ""}>
                <button aria-label={`打开对话 ${thread.title}`} onClick={() => void openThread(thread)}>
                  <strong>{thread.title}</strong>
                  {workspace
                    ? <small className="agent-thread-learning-meta">
                      <span>已学习 {thread.learning_state?.completed_concepts?.length || thread.learning_state?.lesson_index || 0} 个知识点</span>
                      <span>当前：{thread.learning_state?.current_concept || "尚未开始"}</span>
                    </small>
                    : <small><span>{(thread.mode || "assistant") === "learning" ? "学习" : "助手"}</span>{thread.message_count || 0} 条消息</small>}
                </button>
                <button
                  className="agent-thread-pin"
                  aria-label={`${thread.pinned ? "取消置顶" : "置顶"}对话 ${thread.title}`}
                  aria-pressed={thread.pinned === true}
                  onClick={() => void toggleThreadPin(thread)}
                >{thread.pinned ? "★" : "☆"}</button>
                <button className="agent-thread-delete" aria-label={`删除对话 ${thread.title}`} onClick={() => setPendingDelete(thread)}>×</button>
              </article>
            ))}
          </div>
          {pendingDelete && (
            <div className="agent-delete-confirm" role="alertdialog" aria-label="删除对话确认">
              <p>删除“{pendingDelete.title}”及全部消息？</p>
              <div><button onClick={() => setPendingDelete(null)}>取消</button><button aria-label="确认删除对话" onClick={() => void deleteThread()}>确认删除</button></div>
            </div>
          )}
          {pendingDeleteAll === "threads" && (
            <div className="agent-delete-confirm" role="alertdialog" aria-label="删除全部对话确认">
              <p>删除全部 {threads.length} 个对话及其消息？</p>
              <div><button onClick={() => setPendingDeleteAll(null)}>取消</button><button aria-label="确认删除全部对话" onClick={() => void deleteAllThreads()}>确认全部删除</button></div>
            </div>
          )}
        </section>
      )}

      {workspace && pendingDelete && (
        <div className="agent-delete-confirm agent-delete-confirm--overlay" role="alertdialog" aria-label="删除对话确认">
          <p>删除“{pendingDelete.title}”及全部消息？</p>
          <div><button onClick={() => setPendingDelete(null)}>取消</button><button aria-label="确认删除对话" onClick={() => void deleteThread()}>确认删除</button></div>
        </div>
      )}

      {workspace && pendingDeleteAll === "threads" && (
        <div className="agent-delete-confirm agent-delete-confirm--overlay" role="alertdialog" aria-label="删除全部对话确认">
          <p>删除全部 {threads.length} 个学习对话及其消息？</p>
          <div><button onClick={() => setPendingDeleteAll(null)}>取消</button><button aria-label="确认删除全部对话" onClick={() => void deleteAllThreads()}>确认全部删除</button></div>
        </div>
      )}

      {view === "settings" && (
        <section className="agent-sheet agent-settings-sheet">
          <header><div><h2>PILOT 设置</h2></div><button onClick={() => setView("chat")}>返回</button></header>
          <section className="agent-learning-length-setting">
            <header><div><strong>单次输出策略</strong><small>学习篇幅与当前模型 Token 上限联动</small></div><span>{outputStrategySummary(explanationLength, settingsDraft.max_output_tokens)}</span></header>
            <div role="group" aria-label="单次输出策略">
              {([
                ["short", "短", "一段话"],
                ["medium", "中", "400–500 字"],
                ["long", "长", "充分展开"],
                ["unlimited", "无上限", "模型自身限制"],
              ] as const).map(([value, label, detail]) => (
                <button
                  key={value}
                  type="button"
                  aria-label={label}
                  aria-pressed={explanationLength === value}
                  onClick={() => void changeOutputStrategy(value)}
                >
                  <strong>{label}</strong><small>{detail}</small>
                </button>
              ))}
            </div>
            <label className="agent-learning-token-limit">
              <span>单次 Token 上限</span>
              <select
                aria-label="单次 Token 上限"
                value={settingsDraft.max_output_tokens}
                onChange={(event) => {
                  const tokenLimit = Number(event.target.value);
                  void changeOutputStrategy(explanationLengthForTokenLimit(tokenLimit), tokenLimit);
                }}
              >
                <option value={8192}>8K tokens · 短</option>
                <option value={32000}>32K tokens · 中</option>
                <option value={64000}>64K tokens · 长</option>
                <option value={100000}>100K tokens · 长</option>
                <option value={0}>无上限 · 由模型决定</option>
              </select>
              <small>“无上限”不发送应用侧长度限制，仍受所选模型自身上下文和输出能力约束。</small>
            </label>
          </section>
          <p className="agent-privacy-note">提问时，只有你勾选的资料片段会发送到所选模型服务。API 密钥只保存在本机且不会回显。</p>
          <section className="agent-saved-models" aria-label="已保存模型配置">
            <header>
              <div><strong>模型库</strong></div>
              <span>
                <button type="button" className="is-danger" aria-label="删除全部模型配置" disabled={!providers.length} onClick={() => setPendingDeleteAll("providers")}>全部删除</button>
                <button type="button" aria-label="新建模型配置" onClick={createProvider}>＋ 新建</button>
              </span>
            </header>
            {providers.length > 0 ? (
              <div>
                {providers.map((item) => (
                  <article key={item.id} className={selectedProviderId === item.id ? "is-active" : ""}>
                    <button
                      type="button"
                      aria-label={`使用已保存模型 ${providerOptionLabel(item)}`}
                      onClick={() => chooseProvider(item.id)}
                    >
                      <span className="agent-provider-icon"><ProviderBrandIcon name={providerIconName(item)} /></span>
                      <div><strong>{item.label}</strong><small>{item.model || "尚未设置模型名称"}</small></div>
                      <i className={isProviderReady(item) ? "is-ready" : ""} aria-label={isProviderReady(item) ? "可用" : "未完成配置"} />
                    </button>
                    <div className="agent-provider-card-actions">
                      <button type="button" aria-label={`编辑模型 ${item.label}`} onClick={() => editProvider(item)}>编辑</button>
                      <button type="button" aria-label={`删除模型 ${item.label}`} onClick={() => setPendingProviderDelete(item)}>删除</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : <p>还没有模型配置。新建一个云端或本地模型后即可开始学习。</p>}
          </section>
          <div className="agent-provider-editor-heading">
            <div><strong>{draftProviderId ? "新建模型配置" : `编辑 ${selectedProvider?.label || "模型"}`}</strong></div>
            {draftProviderId && <button type="button" onClick={() => { setDraftProviderId(null); setSettingsDraft(providerDraft(selectedProvider)); }}>取消新建</button>}
          </div>
          <fieldset className="agent-provider-icon-picker">
            <legend>厂商图标</legend>
            <div>
              {PROVIDER_BRAND_ICONS.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  aria-label={`选择 ${item.label} 图标`}
                  aria-pressed={settingsDraft.icon === item.name}
                  onClick={() => setSettingsDraft((value) => ({ ...value, icon: item.name }))}
                >
                  <ProviderBrandIcon name={item.name} /><span>{item.label}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <label><span>配置名称</span><input ref={providerLabelInputRef} aria-label="配置名称" value={settingsDraft.label} onChange={(event) => setSettingsDraft((value) => ({ ...value, label: event.target.value }))} /></label>
          <label><span>协议</span><select value={settingsDraft.protocol} onChange={(event) => setSettingsDraft((value) => ({ ...value, protocol: event.target.value as AgentProviderProtocol }))}><option value="openai_compatible">OpenAI-compatible</option><option value="anthropic">Anthropic Messages</option><option value="gemini">Google Gemini</option><option value="azure_openai">Azure OpenAI</option></select></label>
          <label><span>接口地址</span><input aria-label="接口地址" value={settingsDraft.base_url} onChange={(event) => setSettingsDraft((value) => ({ ...value, base_url: event.target.value }))} /></label>
          <label><span>模型名称</span><input aria-label="模型名称" value={settingsDraft.model} onChange={(event) => setSettingsDraft((value) => ({ ...value, model: event.target.value }))} /></label>
          <div className="agent-timeout-grid" aria-label="模型超时设置">
            <label><span>连接超时</span><input aria-label="连接超时（秒）" type="number" min={1} max={120} value={settingsDraft.connect_timeout_seconds} onChange={(event) => setSettingsDraft((value) => ({ ...value, connect_timeout_seconds: Number(event.target.value) }))} /></label>
            <label><span>首字超时</span><input aria-label="首字超时（秒）" type="number" min={5} max={600} value={settingsDraft.first_byte_timeout_seconds} onChange={(event) => setSettingsDraft((value) => ({ ...value, first_byte_timeout_seconds: Number(event.target.value) }))} /></label>
            <label><span>流空闲超时</span><input aria-label="流空闲超时（秒）" type="number" min={5} max={300} value={settingsDraft.idle_timeout_seconds} onChange={(event) => setSettingsDraft((value) => ({ ...value, idle_timeout_seconds: Number(event.target.value) }))} /></label>
          </div>
          <label><span>API 密钥</span><input aria-label="API 密钥" type="password" autoComplete="off" placeholder={selectedProvider?.has_api_key ? "已配置 · 留空保持不变" : "sk-…"} value={settingsDraft.api_key} onChange={(event) => setSettingsDraft((value) => ({ ...value, api_key: event.target.value }))} /></label>
          <div className="agent-settings-actions"><button aria-label="保存模型配置" disabled={!settingsDraft.base_url || !settingsDraft.model || savingProvider || testingProvider} onClick={() => void saveProvider()}>{savingProvider ? "保存中…" : "保存配置"}</button><button aria-label="测试模型连接" disabled={!settingsDraft.base_url || !settingsDraft.model || savingProvider || testingProvider} onClick={() => void testProvider()}>{testingProvider ? "测试中…" : "测试连接"}</button></div>
          {notice && <p className="agent-notice" role="status">{notice}</p>}
          {error && <p className="agent-error" role="alert">{error}</p>}
          {pendingProviderDelete && (
            <div className="agent-delete-confirm" role="alertdialog" aria-label="删除模型配置确认">
              <p>删除“{pendingProviderDelete.label}”？历史对话仍会保留，但之后不能再使用这项配置。</p>
              <div>
                <button onClick={() => setPendingProviderDelete(null)}>取消</button>
                <button aria-label="确认删除模型" onClick={() => void deleteProvider()}>确认删除</button>
              </div>
            </div>
          )}
          {pendingDeleteAll === "providers" && (
            <div className="agent-delete-confirm" role="alertdialog" aria-label="删除全部模型确认">
              <p>删除全部 {providers.length} 个模型配置？历史对话仍会保留。</p>
              <div><button onClick={() => setPendingDeleteAll(null)}>取消</button><button aria-label="确认删除全部模型" onClick={() => void deleteAllProviders()}>确认全部删除</button></div>
            </div>
          )}
        </section>
      )}
    </aside>
  );
}
