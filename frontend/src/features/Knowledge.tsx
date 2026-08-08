import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ApiClient } from "../services/api";
import type { KnowledgeEdge, KnowledgeNode, KnowledgeNodeKind, KnowledgeRelation, MediaAsset } from "../types";
import { MotionPresence } from "../components/MotionPresence";
import { AnchoredMenu } from "../components/AnchoredMenu";
import { useWorkspaceToolbarVisibility } from "../workspace/WorkspaceToolbarVisibility";
import { platform } from "../platform";

interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

interface DocumentItem {
  id: number;
  title: string;
  filename: string;
  body?: string;
}

interface DragState {
  id: number;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startNodeX: number;
  startNodeY: number;
  latestX: number;
  latestY: number;
  revision: number;
}

type ResizeDirection = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

interface ResizeState {
  id: number;
  pointerId: number;
  direction: ResizeDirection;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  startFontScale: number;
  latest: { x: number; y: number; width: number; height: number; fontScale: number };
}

interface ImagePreview {
  src: string;
  alt: string;
  title: string;
}

interface CanvasHistoryEntry {
  nodeId: number;
  label: string;
  before: Partial<KnowledgeNode>;
  after: Partial<KnowledgeNode>;
}

interface FlashcardSides {
  front: string;
  back: string;
}

type NotebookExportFormat = "png" | "pdf" | "docx" | "md";

const palette: Record<KnowledgeNodeKind, string> = {
  concept: "indigo",
  sticky_note: "sun",
  flashcard: "mint",
  citation: "coral",
  image: "slate",
};

const kindLabels: Record<KnowledgeNodeKind, string> = {
  concept: "概念",
  sticky_note: "便签",
  flashcard: "记忆卡",
  citation: "引用",
  image: "图片",
};

const relationLabels: Record<KnowledgeRelation, string> = {
  prerequisite: "前置依赖",
  mindmap: "思维分支",
  association: "自由关联",
};

const nodeDefaultSizes: Record<KnowledgeNodeKind, { width: number; height: number }> = {
  concept: { width: 232, height: 146 },
  sticky_note: { width: 232, height: 168 },
  flashcard: { width: 232, height: 190 },
  citation: { width: 232, height: 160 },
  image: { width: 278, height: 250 },
};

const resizeHandleLabels: Record<ResizeDirection, string> = {
  n: "上边",
  ne: "右上角",
  e: "右边",
  se: "右下角",
  s: "下边",
  sw: "左下角",
  w: "左边",
  nw: "左上角",
};

function normalizeNode(node: KnowledgeNode, index: number): KnowledgeNode {
  const kind = node.kind || "concept";
  const defaults = nodeDefaultSizes[kind];
  return {
    ...node,
    kind,
    content: node.content || node.description || "",
    color: node.color || palette[node.kind || "concept"],
    position_x: node.position_x ?? 120 + (index % 3) * 310,
    position_y: node.position_y ?? 110 + Math.floor(index / 3) * 190,
    width: Math.min(900, Math.max(160, Number(node.width) || defaults.width)),
    height: Math.min(800, Math.max(100, Number(node.height) || defaults.height)),
    font_scale: Math.min(2, Math.max(.7, Number(node.font_scale) || 1)),
  };
}

function parseFlashcard(content = ""): FlashcardSides {
  const normalized = content.replace(/\r\n/g, "\n");
  const match = normalized.match(/^正面[：:]\s*([\s\S]*?)\n背面[：:]\s*([\s\S]*)$/);
  if (match) return { front: match[1].trim(), back: match[2].trim() };
  const [front = "", ...back] = normalized.split("\n---\n");
  return { front: front.trim(), back: back.join("\n---\n").trim() };
}

function serializeFlashcard(sides: FlashcardSides) {
  return `正面：${sides.front}\n背面：${sides.back}`;
}

const pendingEditKey = (courseId: number) => `studypilot.knowledge.pending.v1.${courseId}`;
const canvasPreferenceKey = (courseId: number) => `studypilot.knowledge.canvas.v1.${courseId}`;

interface CanvasPreferences {
  width: number;
  height: number;
  fontFamily: string;
  fontScale: number;
  resizeTextWithCard: boolean;
}

const defaultCanvasPreferences: CanvasPreferences = {
  width: 1800,
  height: 1100,
  fontFamily: "Microsoft YaHei UI",
  fontScale: 100,
  resizeTextWithCard: false,
};

function readCanvasPreferences(storageKey: string): CanvasPreferences {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "null");
    if (!parsed || typeof parsed !== "object") return { ...defaultCanvasPreferences };
    return {
      width: Math.min(4200, Math.max(1200, Number(parsed.width) || defaultCanvasPreferences.width)),
      height: Math.min(2800, Math.max(800, Number(parsed.height) || defaultCanvasPreferences.height)),
      fontFamily: typeof parsed.fontFamily === "string" ? parsed.fontFamily : defaultCanvasPreferences.fontFamily,
      fontScale: Math.min(150, Math.max(80, Number(parsed.fontScale) || defaultCanvasPreferences.fontScale)),
      resizeTextWithCard: parsed.resizeTextWithCard === true,
    };
  } catch {
    return { ...defaultCanvasPreferences };
  }
}

function readPendingEdits(storageKey: string): Record<string, Partial<KnowledgeNode>> {
  try {
    const value = window.localStorage.getItem(storageKey);
    if (!value) return {};
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export interface KnowledgeSourceFocus {
  nodeId?: number;
  edgeId?: number;
  title: string;
  requestId: number;
}

export function Knowledge({ api, courseId = 1, notebookId, onBack, onOpenSource, onOpenLibrarySplit, sourceFocus, systemFonts = [], librarySplitOpen = false }: { api: ApiClient; courseId?: number; notebookId?: number; courseTitle?: string; onBack?: () => void; onOpenSource?: (documentId: number, locator: Record<string, string | number | boolean | null>, blockKey: string) => void; onOpenLibrarySplit?: () => void; sourceFocus?: KnowledgeSourceFocus; systemFonts?: string[]; librarySplitOpen?: boolean }) {
  const workspaceToolbar = useWorkspaceToolbarVisibility();
  const storageScope = notebookId || courseId;
  const editStorageKey = useMemo(() => pendingEditKey(storageScope), [storageScope]);
  const canvasStorageKey = useMemo(() => canvasPreferenceKey(storageScope), [storageScope]);
  const notebookBase = notebookId ? `/api/courses/${courseId}/notebooks/${notebookId}` : "/api/knowledge";
  const nodesBase = notebookId ? `${notebookBase}/nodes` : "/api/knowledge/nodes";
  const edgesBase = notebookId ? `${notebookBase}/edges` : "/api/knowledge/edges";
  const restoredEdits = useMemo(() => readPendingEdits(editStorageKey), [editStorageKey]);
  const [graph, setGraph] = useState<KnowledgeGraph>({ nodes: [], edges: [] });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<number | null>(null);
  const [linkSource, setLinkSource] = useState<number | null>(null);
  const [relation, setRelation] = useState<KnowledgeRelation>("mindmap");
  const [viewport, setViewport] = useState({ x: 12, y: 12, zoom: 1 });
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [activeDocument, setActiveDocument] = useState<DocumentItem | null>(null);
  const [quote, setQuote] = useState("");
  const [quoteSelection, setQuoteSelection] = useState({ start: 0, end: 0 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [canvasSettingsOpen, setCanvasSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState<NotebookExportFormat | null>(null);
  const [exportNotice, setExportNotice] = useState("");
  const [historyAvailability, setHistoryAvailability] = useState({ canUndo: false, canRedo: false });
  const [imagePreview, setImagePreview] = useState<ImagePreview | null>(null);
  const [canvasPreferences, setCanvasPreferences] = useState<CanvasPreferences>(() => readCanvasPreferences(canvasStorageKey));
  const [nodeSaveStatus, setNodeSaveStatus] = useState<Record<number, "dirty" | "saving" | "saved" | "error">>({});
  const [flippedCards, setFlippedCards] = useState<Set<number>>(() => new Set());
  const [reviewPendingIds, setReviewPendingIds] = useState<Set<number>>(() => new Set());
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const reviewPendingRef = useRef<Set<number>>(new Set());
  const nodeSaveQueueRef = useRef<Map<number, Promise<boolean>>>(new Map());
  const nodePatchTimerRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const pendingNodePatchRef = useRef<Map<number, Partial<KnowledgeNode>>>(new Map());
  const nodePatchRevisionRef = useRef<Map<number, number>>(new Map());
  const desiredNodePatchRef = useRef<Map<number, Partial<KnowledgeNode>>>(new Map(
    Object.entries(restoredEdits).map(([nodeId, patch]) => [Number(nodeId), patch]),
  ));
  const nodeRetryCountRef = useRef<Map<number, number>>(new Map());
  const aliveRef = useRef(true);
  const graphMutationRevisionRef = useRef(0);
  const positionRevisionRef = useRef<Map<number, number>>(new Map());
  const confirmedPositionRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const positionSaveQueueRef = useRef<Map<number, Promise<void>>>(new Map());
  const sourceRequestRef = useRef(0);
  const panRef = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const sourceButtonRef = useRef<HTMLButtonElement>(null);
  const sourceDrawerRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const exportRootRef = useRef<HTMLDivElement>(null);
  const canvasSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const imagePreviewReturnRef = useRef<HTMLButtonElement | null>(null);
  const undoStackRef = useRef<CanvasHistoryEntry[]>([]);
  const redoStackRef = useRef<CanvasHistoryEntry[]>([]);
  const historyBusyRef = useRef(false);
  const sourceFocusAppliedRef = useRef("");
  const canvasFontOptions = useMemo(() => Array.from(new Set([
    "Microsoft YaHei UI", "KaiTi", "FangSong", "SimSun", "Consolas",
    ...systemFonts,
    canvasPreferences.fontFamily,
  ].filter(Boolean))).sort((left, right) => left.localeCompare(right, "zh-CN")), [canvasPreferences.fontFamily, systemFonts]);

  useEffect(() => {
    function handleGlobalKey(event: KeyboardEvent) {
      const editingText = isTextEditingTarget(event.target);
      const commandKey = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (!editingText && commandKey && key === "z") {
        event.preventDefault();
        void (event.shiftKey ? redoCanvas() : undoCanvas());
        return;
      }
      if (!editingText && commandKey && key === "y") {
        event.preventDefault();
        void redoCanvas();
        return;
      }
      if (!editingText && (event.key === "Delete" || event.key === "Backspace")) {
        if (selectedEdge) {
          event.preventDefault();
          void removeEdge(selectedEdge);
          return;
        }
        if (selected) {
          event.preventDefault();
          void removeSelected();
          return;
        }
      }
      if (event.key === "Escape") {
        if (imagePreview) {
          setImagePreview(null);
          window.setTimeout(() => imagePreviewReturnRef.current?.focus(), 0);
          return;
        }
        if (sourceOpen) return;
        setLinkSource(null);
        setSelectedId(null);
        setSelectedEdgeId(null);
        setExportOpen(false);
      }
    }
    function closeExportMenu(event: MouseEvent) {
      if (!exportRootRef.current?.contains(event.target as Node)) setExportOpen(false);
    }
    window.addEventListener("keydown", handleGlobalKey);
    document.addEventListener("mousedown", closeExportMenu);
    return () => {
      window.removeEventListener("keydown", handleGlobalKey);
      document.removeEventListener("mousedown", closeExportMenu);
    };
  }, [imagePreview, selectedId, selectedEdgeId, sourceOpen, historyAvailability.canUndo, historyAvailability.canRedo]);

  useEffect(() => {
    try {
      window.localStorage.setItem(canvasStorageKey, JSON.stringify(canvasPreferences));
    } catch {
      // Visual preferences remain active for this session when storage is unavailable.
    }
  }, [canvasPreferences, canvasStorageKey]);

  function persistDesiredNodePatches() {
    try {
      if (!desiredNodePatchRef.current.size) {
        window.localStorage.removeItem(editStorageKey);
        return;
      }
      window.localStorage.setItem(editStorageKey, JSON.stringify(
        Object.fromEntries([...desiredNodePatchRef.current].map(([nodeId, patch]) => [String(nodeId), patch])),
      ));
    } catch {
      // Autosave still continues in memory when storage is unavailable.
    }
  }

  function rememberNodePatch(nodeId: number, patch: Partial<KnowledgeNode>) {
    desiredNodePatchRef.current.set(nodeId, {
      ...(desiredNodePatchRef.current.get(nodeId) || {}),
      ...patch,
    });
    persistDesiredNodePatches();
  }

  function forgetNodePatch(nodeId: number) {
    desiredNodePatchRef.current.delete(nodeId);
    persistDesiredNodePatches();
  }

  async function loadGraph() {
    const requestedAtRevision = graphMutationRevisionRef.current;
    const next = await api.get<KnowledgeGraph>(notebookId ? `${notebookBase}/graph` : notebookBase);
    const pendingEdits = readPendingEdits(editStorageKey);
    const nodes = (next.nodes || []).map((node, index) => {
      const normalized = normalizeNode(node, index);
      return pendingEdits[String(normalized.id)] ? { ...normalized, ...pendingEdits[String(normalized.id)] } : normalized;
    });
    if (requestedAtRevision !== graphMutationRevisionRef.current) {
      for (const node of nodes) {
        if (!confirmedPositionRef.current.has(node.id)) {
          confirmedPositionRef.current.set(node.id, {
            x: Number(node.position_x || 0),
            y: Number(node.position_y || 0),
          });
        }
      }
      setGraph((current) => {
        const mergedNodes = new Map(nodes.map((node) => [node.id, node]));
        const mergedEdges = new Map((next.edges || []).map((edge) => [edge.id, edge]));
        for (const node of current.nodes) mergedNodes.set(node.id, node);
        for (const edge of current.edges) mergedEdges.set(edge.id, edge);
        return { nodes: [...mergedNodes.values()], edges: [...mergedEdges.values()] };
      });
    } else {
      confirmedPositionRef.current = new Map(nodes.map((node) => [node.id, {
        x: Number(node.position_x || 0),
        y: Number(node.position_y || 0),
      }]));
      setGraph({
        nodes,
        edges: next.edges || [],
      });
    }
    const nodeIds = new Set(nodes.map((node) => node.id));
    for (const [nodeId, patch] of Object.entries(pendingEdits)) {
      const numericId = Number(nodeId);
      if (nodeIds.has(numericId)) scheduleNodePatch(numericId, patch, false);
    }
  }

  useEffect(() => {
    void loadGraph().catch((reason) => setError(reason instanceof Error ? reason.message : "知识画布加载失败"));
  }, [api, editStorageKey]);

  useEffect(() => () => {
    sourceRequestRef.current += 1;
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    function flushPendingOnExit() {
      for (const [nodeId, patch] of pendingNodePatchRef.current) {
        const timer = nodePatchTimerRef.current.get(nodeId);
        if (timer) clearTimeout(timer);
        const predecessor = nodeSaveQueueRef.current.get(nodeId);
        const save = predecessor
          ? predecessor.then(() => api.patch(`${nodesBase}/${nodeId}`, patch))
          : api.patch(`${nodesBase}/${nodeId}`, patch);
        void save.then(() => forgetNodePatch(nodeId)).catch(() => undefined);
      }
      nodePatchTimerRef.current.clear();
      pendingNodePatchRef.current.clear();
    }
    window.addEventListener("beforeunload", flushPendingOnExit);
    return () => {
      aliveRef.current = false;
      window.removeEventListener("beforeunload", flushPendingOnExit);
      flushPendingOnExit();
    };
  }, [api, editStorageKey]);

  useEffect(() => {
    if (!sourceOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSourceOpen(false);
        sourceButtonRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(sourceDrawerRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])") || []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !sourceDrawerRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    const focusTimer = window.setTimeout(() => sourceDrawerRef.current?.querySelector<HTMLElement>("[data-source-close]")?.focus(), 0);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [sourceOpen]);

  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph.nodes]);
  const selected = selectedId === null ? null : nodeById.get(selectedId) || null;
  const selectedEdge = selectedEdgeId === null ? null : graph.edges.find((edge) => edge.id === selectedEdgeId) || null;
  const selectedFlashcard = selected?.kind === "flashcard" ? parseFlashcard(selected.content || selected.description || "") : null;

  useEffect(() => {
    if (!sourceFocus) return;
    const focusKey = `${notebookId || 0}:${sourceFocus.requestId}:${sourceFocus.nodeId || 0}:${sourceFocus.edgeId || 0}`;
    if (sourceFocusAppliedRef.current === focusKey) return;
    const node = sourceFocus.nodeId ? nodeById.get(sourceFocus.nodeId) : null;
    const edge = sourceFocus.edgeId ? graph.edges.find((item) => item.id === sourceFocus.edgeId) || null : null;
    if (!node && !edge) return;
    sourceFocusAppliedRef.current = focusKey;
    const rect = canvasRef.current?.getBoundingClientRect();
    const canvasWidth = rect?.width || 900;
    const canvasHeight = rect?.height || 550;
    if (node) {
      setSelectedEdgeId(null);
      setLinkSource(null);
      setSelectedId(node.id);
      setViewport((current) => {
        const zoom = Math.min(1.25, Math.max(.72, current.zoom || 1));
        const width = Number(node.width || nodeDefaultSizes[node.kind].width);
        const height = Number(node.height || nodeDefaultSizes[node.kind].height);
        return {
          zoom,
          x: Math.round(canvasWidth / 2 - (Number(node.position_x || 0) + width / 2) * zoom),
          y: Math.round(canvasHeight / 2 - (Number(node.position_y || 0) + height / 2) * zoom),
        };
      });
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="knowledge-node-${node.id}"]`)?.focus({ preventScroll: true }));
      return;
    }
    if (edge) {
      const sourceNode = nodeById.get(edge.source_id);
      const targetNode = nodeById.get(edge.target_id);
      setSelectedId(null);
      setLinkSource(null);
      setSelectedEdgeId(edge.id);
      if (sourceNode && targetNode) {
        setViewport((current) => {
          const zoom = Math.min(1.25, Math.max(.72, current.zoom || 1));
          const sourceWidth = Number(sourceNode.width || nodeDefaultSizes[sourceNode.kind].width);
          const targetWidth = Number(targetNode.width || nodeDefaultSizes[targetNode.kind].width);
          const sourceHeight = Number(sourceNode.height || nodeDefaultSizes[sourceNode.kind].height);
          const targetHeight = Number(targetNode.height || nodeDefaultSizes[targetNode.kind].height);
          const centerX = (Number(sourceNode.position_x || 0) + sourceWidth / 2 + Number(targetNode.position_x || 0) + targetWidth / 2) / 2;
          const centerY = (Number(sourceNode.position_y || 0) + sourceHeight / 2 + Number(targetNode.position_y || 0) + targetHeight / 2) / 2;
          return { zoom, x: Math.round(canvasWidth / 2 - centerX * zoom), y: Math.round(canvasHeight / 2 - centerY * zoom) };
        });
      }
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-testid="knowledge-edge-${edge.id}"]`)?.focus({ preventScroll: true }));
    }
  }, [graph.edges, graph.nodes, nodeById, notebookId, sourceFocus]);
  const selectedQuote = quoteSelection.end > quoteSelection.start
    ? quote.slice(quoteSelection.start, quoteSelection.end).trim()
    : "";
  const citationText = selectedQuote || quote.trim();

  useEffect(() => {
    function handleImagePaste(event: ClipboardEvent) {
      const imageItem = [...(event.clipboardData?.items || [])].find(
        (item) => item.kind === "file" && item.type.startsWith("image/"),
      );
      const file = imageItem?.getAsFile() || [...(event.clipboardData?.files || [])].find((item) => item.type.startsWith("image/"));
      if (!file) return;
      event.preventDefault();
      void importImage(file);
    }
    window.addEventListener("paste", handleImagePaste);
    return () => window.removeEventListener("paste", handleImagePaste);
  }, [api, selectedId]);

  function nextPositionRevision(nodeId: number) {
    const revision = (positionRevisionRef.current.get(nodeId) || 0) + 1;
    positionRevisionRef.current.set(nodeId, revision);
    return revision;
  }

  function queuePositionSave(
    nodeId: number,
    position: { x: number; y: number },
    previous: { x: number; y: number },
    revision: number,
  ) {
    const predecessor = positionSaveQueueRef.current.get(nodeId) || Promise.resolve();
    const operation = predecessor.catch(() => undefined).then(async () => {
      try {
        await api.patch(`${nodesBase}/${nodeId}`, {
          position_x: position.x,
          position_y: position.y,
        });
        confirmedPositionRef.current.set(nodeId, { ...position });
      } catch (reason) {
        if (positionRevisionRef.current.get(nodeId) === revision) {
          const confirmed = confirmedPositionRef.current.get(nodeId) || previous;
          setGraph((current) => ({
            ...current,
            nodes: current.nodes.map((node) => node.id === nodeId
              && Number(node.position_x || 0) === position.x
              && Number(node.position_y || 0) === position.y
              ? { ...node, position_x: confirmed.x, position_y: confirmed.y }
              : node),
          }));
        }
        setError(reason instanceof Error ? reason.message : "位置保存失败");
      }
    });
    positionSaveQueueRef.current.set(nodeId, operation);
    void operation.finally(() => {
      if (positionSaveQueueRef.current.get(nodeId) === operation) positionSaveQueueRef.current.delete(nodeId);
    });
    return operation;
  }

  function queueNodePatch(nodeId: number, patch: Partial<KnowledgeNode>) {
    const predecessor = nodeSaveQueueRef.current.get(nodeId) || Promise.resolve(true);
    const operation = predecessor.catch(() => false).then(async () => {
      try {
        await api.patch(`${nodesBase}/${nodeId}`, patch);
        return true;
      } catch (reason) {
        if (aliveRef.current) setError(reason instanceof Error ? reason.message : "卡片保存失败");
        return false;
      }
    });
    nodeSaveQueueRef.current.set(nodeId, operation);
    void operation.finally(() => {
      if (nodeSaveQueueRef.current.get(nodeId) === operation) nodeSaveQueueRef.current.delete(nodeId);
    });
    return operation;
  }

  function scheduleNodePatch(nodeId: number, patch: Partial<KnowledgeNode>, resetRetry = true) {
    rememberNodePatch(nodeId, patch);
    pendingNodePatchRef.current.set(nodeId, {
      ...(pendingNodePatchRef.current.get(nodeId) || {}),
      ...patch,
    });
    if (resetRetry) nodeRetryCountRef.current.set(nodeId, 0);
    const revision = (nodePatchRevisionRef.current.get(nodeId) || 0) + 1;
    nodePatchRevisionRef.current.set(nodeId, revision);
    setNodeSaveStatus((current) => ({ ...current, [nodeId]: "dirty" }));
    const previousTimer = nodePatchTimerRef.current.get(nodeId);
    if (previousTimer) clearTimeout(previousTimer);
    nodePatchTimerRef.current.set(nodeId, setTimeout(() => {
      void flushScheduledNodePatch(nodeId);
    }, 650));
  }

  function settleNodePatch(nodeId: number, patch: Partial<KnowledgeNode>, revision: number, saved: boolean) {
    if (!saved) {
      const retryPatch = desiredNodePatchRef.current.get(nodeId) || patch;
      pendingNodePatchRef.current.set(nodeId, { ...retryPatch });
      const retryCount = (nodeRetryCountRef.current.get(nodeId) || 0) + 1;
      nodeRetryCountRef.current.set(nodeId, retryCount);
      if (aliveRef.current) {
        setNodeSaveStatus((current) => ({ ...current, [nodeId]: retryCount <= 3 ? "dirty" : "error" }));
        if (retryCount <= 3 && !nodePatchTimerRef.current.has(nodeId)) {
          const delay = Math.min(5_000, 1_200 * (2 ** (retryCount - 1)));
          nodePatchTimerRef.current.set(nodeId, setTimeout(() => {
            void flushScheduledNodePatch(nodeId);
          }, delay));
        }
      }
      return;
    }
    if (nodePatchRevisionRef.current.get(nodeId) !== revision || pendingNodePatchRef.current.has(nodeId)) return;
    nodeRetryCountRef.current.delete(nodeId);
    forgetNodePatch(nodeId);
    if (aliveRef.current) setNodeSaveStatus((current) => ({ ...current, [nodeId]: "saved" }));
  }

  function flushScheduledNodePatch(nodeId: number) {
    const timer = nodePatchTimerRef.current.get(nodeId);
    if (timer) clearTimeout(timer);
    nodePatchTimerRef.current.delete(nodeId);
    const patch = pendingNodePatchRef.current.get(nodeId);
    if (!patch) return nodeSaveQueueRef.current.get(nodeId);
    pendingNodePatchRef.current.delete(nodeId);
    const revision = nodePatchRevisionRef.current.get(nodeId) || 0;
    setNodeSaveStatus((current) => ({ ...current, [nodeId]: "saving" }));
    const operation = queueNodePatch(nodeId, patch);
    void operation.then((saved) => settleNodePatch(nodeId, patch, revision, saved));
    return operation;
  }

  function refreshHistoryAvailability() {
    if (!aliveRef.current) return;
    setHistoryAvailability({
      canUndo: undoStackRef.current.length > 0,
      canRedo: redoStackRef.current.length > 0,
    });
  }

  function pushCanvasHistory(entry: CanvasHistoryEntry) {
    const keys = new Set([...Object.keys(entry.before), ...Object.keys(entry.after)]);
    const changed = [...keys].some((key) => (
      entry.before[key as keyof KnowledgeNode] !== entry.after[key as keyof KnowledgeNode]
    ));
    if (!changed) return;
    undoStackRef.current.push(entry);
    if (undoStackRef.current.length > 80) undoStackRef.current.shift();
    redoStackRef.current = [];
    refreshHistoryAvailability();
  }

  function removeNodeFromHistory(nodeId: number) {
    undoStackRef.current = undoStackRef.current.filter((entry) => entry.nodeId !== nodeId);
    redoStackRef.current = redoStackRef.current.filter((entry) => entry.nodeId !== nodeId);
    refreshHistoryAvailability();
  }

  async function travelCanvasHistory(direction: "undo" | "redo") {
    if (historyBusyRef.current) return;
    const source = direction === "undo" ? undoStackRef.current : redoStackRef.current;
    const destination = direction === "undo" ? redoStackRef.current : undoStackRef.current;
    const entry = source.pop();
    if (!entry) return;
    historyBusyRef.current = true;
    refreshHistoryAvailability();
    const patch = direction === "undo" ? entry.before : entry.after;
    const rollback = direction === "undo" ? entry.after : entry.before;
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.id === entry.nodeId ? { ...node, ...patch } : node),
    }));
    try {
      await flushScheduledNodePatch(entry.nodeId);
      const saved = await queueNodePatch(entry.nodeId, patch);
      if (!saved) throw new Error(`${entry.label}未能保存`);
      if (patch.position_x !== undefined || patch.position_y !== undefined) {
        setGraph((current) => {
          const node = current.nodes.find((item) => item.id === entry.nodeId);
          if (node) confirmedPositionRef.current.set(entry.nodeId, {
            x: Number(node.position_x || 0),
            y: Number(node.position_y || 0),
          });
          return current;
        });
      }
      destination.push(entry);
      setError("");
    } catch (reason) {
      source.push(entry);
      setGraph((current) => ({
        ...current,
        nodes: current.nodes.map((node) => node.id === entry.nodeId ? { ...node, ...rollback } : node),
      }));
      setError(reason instanceof Error ? reason.message : `${entry.label}失败`);
    } finally {
      historyBusyRef.current = false;
      refreshHistoryAvailability();
    }
  }

  function undoCanvas() {
    return travelCanvasHistory("undo");
  }

  function redoCanvas() {
    return travelCanvasHistory("redo");
  }

  function viewportPosition(index: number) {
    return {
      position_x: Math.round((180 + (index % 3) * 260 - viewport.x) / viewport.zoom),
      position_y: Math.round((140 + Math.floor(index / 3) * 170 - viewport.y) / viewport.zoom),
    };
  }

  function imageUrl(value?: string | null) {
    if (!value || value.startsWith("data:") || /^https?:\/\//i.test(value)) return value || "";
    return `${api.baseUrl || ""}${value}`;
  }

  async function importImage(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("请选择 PNG、JPEG、WebP 或 GIF 图片");
      return;
    }
    const stickyId = selected?.kind === "sticky_note" ? selected.id : null;
    setImageBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file, file.name || "clipboard.png");
      const asset = await api.post<MediaAsset>("/api/media/images", form);
      if (stickyId !== null) {
        const patch = {
          image_asset_id: asset.id,
          image_alt: file.name || "剪贴板图片",
        };
        const saved = await api.patch<KnowledgeNode>(`${nodesBase}/${stickyId}`, patch);
        setGraph((current) => ({
          ...current,
          nodes: current.nodes.map((node) => node.id === stickyId ? {
            ...node,
            ...patch,
            image_url: saved?.image_url || asset.url,
          } : node),
        }));
      } else {
        graphMutationRevisionRef.current += 1;
        const count = graph.nodes.length;
        const title = (file.name || "图片").replace(/\.[^.]+$/, "") || "图片";
        const created = await api.post<KnowledgeNode>(nodesBase, {
          title,
          description: "",
          content: "",
          module: "图片",
          kind: "image",
          color: palette.image,
          image_asset_id: asset.id,
          image_alt: file.name || "剪贴板图片",
          ...viewportPosition(count),
        });
        const node = normalizeNode({ ...created, image_url: created.image_url || asset.url }, count);
        confirmedPositionRef.current.set(node.id, { x: Number(node.position_x || 0), y: Number(node.position_y || 0) });
        setGraph((current) => ({ ...current, nodes: [...current.nodes.filter((item) => item.id !== node.id), node] }));
        setSelectedId(node.id);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "图片导入失败");
    } finally {
      setImageBusy(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  }

  async function pasteNativeImage() {
    const readImage = platform().clipboard.readImage;
    if (!readImage) {
      setError("请按 Ctrl + V 粘贴剪贴板图片");
      return;
    }
    setImageBusy(true);
    try {
      const bytes = await readImage();
      if (!bytes?.byteLength) {
        setError("剪贴板中没有图片");
        return;
      }
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      await importImage(new File([copy.buffer], `clipboard-${Date.now()}.png`, { type: "image/png" }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法读取剪贴板图片");
    } finally {
      setImageBusy(false);
    }
  }

  function fitCanvas() {
    if (!graph.nodes.length) {
      setViewport({ x: 12, y: 12, zoom: 1 });
      return;
    }
    const rect = canvasRef.current?.getBoundingClientRect();
    const width = rect?.width || 900;
    const height = rect?.height || 550;
    const minX = Math.min(...graph.nodes.map((node) => Number(node.position_x || 0)));
    const minY = Math.min(...graph.nodes.map((node) => Number(node.position_y || 0)));
    const maxX = Math.max(...graph.nodes.map((node) => Number(node.position_x || 0) + Number(node.width || nodeDefaultSizes[node.kind].width)));
    const maxY = Math.max(...graph.nodes.map((node) => Number(node.position_y || 0) + Number(node.height || nodeDefaultSizes[node.kind].height)));
    const boundsWidth = Math.max(160, maxX - minX);
    const boundsHeight = Math.max(100, maxY - minY);
    const padding = 64;
    const zoom = Math.min(1.25, Math.max(.55, Math.min(
      Math.max(1, width - padding * 2) / boundsWidth,
      Math.max(1, height - padding * 2) / boundsHeight,
    )));
    setViewport({
      x: Math.round((width - boundsWidth * zoom) / 2 - minX * zoom),
      y: Math.round((height - boundsHeight * zoom) / 2 - minY * zoom),
      zoom: Math.round(zoom * 1000) / 1000,
    });
  }

  async function createNode(kind: KnowledgeNodeKind) {
    setError("");
    graphMutationRevisionRef.current += 1;
    const count = graph.nodes.length;
    const defaults: Record<KnowledgeNodeKind, { title: string; content: string }> = {
      concept: { title: "新概念", content: "写下这个概念的定义、例子与边界。" },
      sticky_note: { title: "新便签", content: "随手记下一条还需要继续整理的想法。" },
      flashcard: { title: "新记忆卡", content: "正面：问题\n背面：答案" },
      citation: { title: "新引用", content: "" },
      image: { title: "新图片", content: "" },
    };
    try {
      const created = await api.post<KnowledgeNode>(nodesBase, {
        ...defaults[kind],
        description: defaults[kind].content,
        module: kindLabels[kind],
        kind,
        color: palette[kind],
        ...viewportPosition(count),
      });
      const node = normalizeNode(created, count);
      confirmedPositionRef.current.set(node.id, { x: Number(node.position_x || 0), y: Number(node.position_y || 0) });
      setGraph((current) => ({ ...current, nodes: [...current.nodes.filter((item) => item.id !== node.id), node] }));
      setSelectedId(node.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "节点创建失败");
    }
  }

  function startDrag(event: React.PointerEvent<HTMLElement>, node: KnowledgeNode) {
    if ((event.target as HTMLElement).closest("button, input, textarea, select, [data-resize-handle]")) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const x = Number(node.position_x || 0);
    const y = Number(node.position_y || 0);
    dragRef.current = {
      id: node.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startNodeX: x,
      startNodeY: y,
      latestX: x,
      latestY: y,
      revision: nextPositionRevision(node.id),
    };
    setSelectedId(node.id);
    setSelectedEdgeId(null);
  }

  function moveNode(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const x = Math.max(24, Math.round(drag.startNodeX + (event.clientX - drag.startClientX) / viewport.zoom));
    const y = Math.max(24, Math.round(drag.startNodeY + (event.clientY - drag.startClientY) / viewport.zoom));
    drag.latestX = x;
    drag.latestY = y;
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.id === drag.id ? { ...node, position_x: x, position_y: y } : node),
    }));
  }

  async function finishDrag(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    await queuePositionSave(
      drag.id,
      { x: drag.latestX, y: drag.latestY },
      { x: drag.startNodeX, y: drag.startNodeY },
      drag.revision,
    );
    const confirmed = confirmedPositionRef.current.get(drag.id);
    if (confirmed?.x === drag.latestX && confirmed.y === drag.latestY) {
      pushCanvasHistory({
        nodeId: drag.id,
        label: "撤销卡片移动",
        before: { position_x: drag.startNodeX, position_y: drag.startNodeY },
        after: { position_x: drag.latestX, position_y: drag.latestY },
      });
    }
  }

  function startResize(event: React.PointerEvent<HTMLButtonElement>, node: KnowledgeNode, direction: ResizeDirection) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const width = Number(node.width) || nodeDefaultSizes[node.kind].width;
    const height = Number(node.height) || nodeDefaultSizes[node.kind].height;
    const x = Number(node.position_x || 0);
    const y = Number(node.position_y || 0);
    const fontScale = Number(node.font_scale) || 1;
    resizeRef.current = {
      id: node.id,
      pointerId: event.pointerId,
      direction,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: x,
      startY: y,
      startWidth: width,
      startHeight: height,
      startFontScale: fontScale,
      latest: { x, y, width, height, fontScale },
    };
    setSelectedId(node.id);
    setSelectedEdgeId(null);
  }

  function moveResize(event: React.PointerEvent<HTMLButtonElement>) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = (event.clientX - resize.startClientX) / viewport.zoom;
    const dy = (event.clientY - resize.startClientY) / viewport.zoom;
    const fromLeft = resize.direction.includes("w");
    const fromRight = resize.direction.includes("e");
    const fromTop = resize.direction.includes("n");
    const fromBottom = resize.direction.includes("s");
    const width = Math.round(Math.min(900, Math.max(160, resize.startWidth + (fromRight ? dx : fromLeft ? -dx : 0))));
    const height = Math.round(Math.min(800, Math.max(100, resize.startHeight + (fromBottom ? dy : fromTop ? -dy : 0))));
    const x = Math.round(fromLeft ? resize.startX + resize.startWidth - width : resize.startX);
    const y = Math.round(fromTop ? resize.startY + resize.startHeight - height : resize.startY);
    const areaRatio = (width * height) / (resize.startWidth * resize.startHeight);
    const fontScale = resize.direction === "sw" && canvasPreferences.resizeTextWithCard
      ? Math.round(Math.min(2, Math.max(.7, resize.startFontScale * Math.sqrt(areaRatio))) * 100) / 100
      : resize.startFontScale;
    resize.latest = { x, y, width, height, fontScale };
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.id === resize.id ? {
        ...node,
        position_x: x,
        position_y: y,
        width,
        height,
        font_scale: fontScale,
      } : node),
    }));
  }

  function finishResize(event: React.PointerEvent<HTMLButtonElement>) {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const patch = {
      position_x: resize.latest.x,
      position_y: resize.latest.y,
      width: resize.latest.width,
      height: resize.latest.height,
      font_scale: resize.latest.fontScale,
    };
    scheduleNodePatch(resize.id, patch);
    const operation = flushScheduledNodePatch(resize.id);
    void operation?.then((saved) => {
      if (!saved) return;
      pushCanvasHistory({
        nodeId: resize.id,
        label: "撤销卡片缩放",
        before: {
          position_x: resize.startX,
          position_y: resize.startY,
          width: resize.startWidth,
          height: resize.startHeight,
          font_scale: resize.startFontScale,
        },
        after: patch,
      });
    });
  }

  function changeMastery(node: KnowledgeNode, value: number) {
    const mastery = Math.min(1, Math.max(0, value / 100));
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.map((item) => item.id === node.id ? { ...item, mastery } : item),
    }));
    scheduleNodePatch(node.id, { mastery });
  }

  function openImagePreview(event: React.MouseEvent<HTMLButtonElement>, node: KnowledgeNode) {
    event.stopPropagation();
    imagePreviewReturnRef.current = event.currentTarget;
    setImagePreview({
      src: imageUrl(node.image_url),
      alt: node.image_alt || node.title,
      title: node.title,
    });
  }

  function closeImagePreview() {
    setImagePreview(null);
    window.setTimeout(() => imagePreviewReturnRef.current?.focus(), 0);
  }

  function handleNodeKey(event: React.KeyboardEvent<HTMLElement>, node: KnowledgeNode) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedId(node.id);
      return;
    }
    const step = event.shiftKey ? 24 : 8;
    const offsets: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const position_x = Math.max(24, Number(node.position_x || 0) + offset[0]);
    const position_y = Math.max(24, Number(node.position_y || 0) + offset[1]);
    const previousX = Number(node.position_x || 0);
    const previousY = Number(node.position_y || 0);
    const revision = nextPositionRevision(node.id);
    setSelectedId(node.id);
    setSelectedEdgeId(null);
    setGraph((current) => ({ ...current, nodes: current.nodes.map((item) => item.id === node.id ? { ...item, position_x, position_y } : item) }));
    void queuePositionSave(
      node.id,
      { x: position_x, y: position_y },
      { x: previousX, y: previousY },
      revision,
    ).then(() => {
      const confirmed = confirmedPositionRef.current.get(node.id);
      if (confirmed?.x !== position_x || confirmed.y !== position_y) return;
      pushCanvasHistory({
        nodeId: node.id,
        label: "撤销卡片移动",
        before: { position_x: previousX, position_y: previousY },
        after: { position_x, position_y },
      });
    });
  }

  function flipFlashcard(nodeId: number, showBack: boolean) {
    setFlippedCards((current) => {
      const next = new Set(current);
      if (showBack) next.add(nodeId);
      else next.delete(nodeId);
      return next;
    });
  }

  async function reviewFlashcard(node: KnowledgeNode, remembered: boolean) {
    if (reviewPendingRef.current.has(node.id)) return;
    reviewPendingRef.current.add(node.id);
    setReviewPendingIds((current) => new Set(current).add(node.id));
    const previous = Number(node.mastery || 0);
    const mastery = Math.min(1, Math.max(0, previous + (remembered ? .1 : -.06)));
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.map((item) => item.id === node.id ? { ...item, mastery } : item),
    }));
    try {
      const result = await api.post<{ mastery: number }>(`/api/mastery/${node.id}/evidence`, {
        success: remembered,
        weight: 1,
        source: "flashcard-review",
      });
      const savedMastery = Number(result.mastery);
      if (Number.isFinite(savedMastery)) {
        setGraph((current) => ({
          ...current,
          nodes: current.nodes.map((item) => item.id === node.id && item.mastery === mastery ? { ...item, mastery: savedMastery } : item),
        }));
      }
      if (remembered) flipFlashcard(node.id, false);
    } catch (reason) {
      setGraph((current) => ({
        ...current,
        nodes: current.nodes.map((item) => item.id === node.id && item.mastery === mastery ? { ...item, mastery: previous } : item),
      }));
      setError(reason instanceof Error ? reason.message : "复习结果保存失败");
    } finally {
      reviewPendingRef.current.delete(node.id);
      setReviewPendingIds((current) => {
        const next = new Set(current);
        next.delete(node.id);
        return next;
      });
    }
  }

  async function removeEdge(edge: KnowledgeEdge) {
    try {
      await api.delete(`${edgesBase}/${edge.id}`);
      setGraph((current) => ({ ...current, edges: current.edges.filter((item) => item.id !== edge.id) }));
      setSelectedEdgeId((current) => current === edge.id ? null : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "关系删除失败");
    }
  }

  async function chooseLinkTarget(targetId: number) {
    setSelectedEdgeId(null);
    if (linkSource === null) {
      setLinkSource(targetId);
      return;
    }
    if (linkSource === targetId) {
      setLinkSource(null);
      return;
    }
    try {
      const edge = await api.post<KnowledgeEdge>(edgesBase, {
        source_id: linkSource,
        target_id: targetId,
        relation,
      });
      setGraph((current) => ({ ...current, edges: [...current.edges, edge] }));
      setLinkSource(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "连接创建失败");
    }
  }

  async function updateSelected(patch: Partial<KnowledgeNode>) {
    if (!selected) return;
    setGraph((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.id === selected.id ? { ...node, ...patch } : node),
    }));
    scheduleNodePatch(selected.id, patch);
    await flushScheduledNodePatch(selected.id);
  }

  async function removeSelected() {
    if (!selected) return;
    try {
      await flushScheduledNodePatch(selected.id);
      await api.delete(`${nodesBase}/${selected.id}`);
      setGraph((current) => ({
        nodes: current.nodes.filter((node) => node.id !== selected.id),
        edges: current.edges.filter((edge) => edge.source_id !== selected.id && edge.target_id !== selected.id),
      }));
      setSelectedId(null);
      removeNodeFromHistory(selected.id);
      confirmedPositionRef.current.delete(selected.id);
      const timer = nodePatchTimerRef.current.get(selected.id);
      if (timer) clearTimeout(timer);
      nodePatchTimerRef.current.delete(selected.id);
      pendingNodePatchRef.current.delete(selected.id);
      nodeRetryCountRef.current.delete(selected.id);
      forgetNodePatch(selected.id);
      setNodeSaveStatus((current) => {
        const next = { ...current };
        delete next[selected.id];
        return next;
      });
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "卡片删除失败");
    }
  }

  async function openSources() {
    sourceRequestRef.current += 1;
    setSourceOpen(true);
    setActiveDocument(null);
    setQuote("");
    setQuoteSelection({ start: 0, end: 0 });
    try {
      setDocuments(await api.get<DocumentItem[]>("/api/documents"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "资料加载失败");
    }
  }

  function closeSources() {
    sourceRequestRef.current += 1;
    setSourceOpen(false);
    sourceButtonRef.current?.focus();
  }

  async function chooseDocument(document: DocumentItem) {
    const requestId = ++sourceRequestRef.current;
    try {
      const detail = await api.get<DocumentItem>(`/api/documents/${document.id}`);
      if (requestId !== sourceRequestRef.current) return;
      setActiveDocument(detail);
      setQuote(detail.body || "");
      setQuoteSelection({ start: 0, end: 0 });
    } catch (reason) {
      if (requestId !== sourceRequestRef.current) return;
      setError(reason instanceof Error ? reason.message : "资料正文加载失败");
    }
  }

  async function addCitation() {
    if (!activeDocument || !citationText || busy) return;
    setBusy(true);
    graphMutationRevisionRef.current += 1;
    try {
      const created = await api.post<KnowledgeNode>(nodesBase, {
        title: `摘录 · ${activeDocument.title}`,
        description: citationText,
        content: citationText,
        module: "资料摘录",
        kind: "citation",
        color: palette.citation,
        source_document_id: activeDocument.id,
        source_title: activeDocument.title,
        source_quote: citationText,
        ...viewportPosition(graph.nodes.length),
      });
      const node = normalizeNode(created, graph.nodes.length);
      confirmedPositionRef.current.set(node.id, { x: Number(node.position_x || 0), y: Number(node.position_y || 0) });
      setGraph((current) => ({ ...current, nodes: [...current.nodes.filter((item) => item.id !== node.id), node] }));
      setSelectedId(node.id);
      closeSources();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "引用卡片创建失败");
    } finally {
      setBusy(false);
    }
  }

  function beginPan(event: React.PointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    panRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: viewport.x, originY: viewport.y };
    setSelectedId(null);
    setSelectedEdgeId(null);
  }

  function moveCanvas(event: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    setViewport((current) => ({ ...current, x: pan.originX + event.clientX - pan.x, y: pan.originY + event.clientY - pan.y }));
  }

  function finishPan(event: React.PointerEvent<HTMLDivElement>) {
    if (panRef.current?.pointerId !== event.pointerId) return;
    panRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  async function exportNotebook(format: NotebookExportFormat) {
    if (exportBusy) return;
    setExportOpen(false);
    setExportBusy(format);
    const formatLabels: Record<NotebookExportFormat, string> = { png: "PNG 画布", pdf: "PDF 画布", docx: "Word 文档", md: "Markdown 文档" };
    setExportNotice(`正在生成 ${formatLabels[format]}…`);
    setError("");
    try {
      const artifact = await api.download(
        notebookId ? `/api/courses/${courseId}/notebooks/${notebookId}/export` : "/api/knowledge/export",
        { format, canvas_width: canvasPreferences.width, canvas_height: canvasPreferences.height },
      );
      const savedPath = await platform().files.saveToArchive({ suggestedName: artifact.filename, bytes: artifact.bytes });
      if (savedPath) {
      } else {
        if (platform().kind !== "web") {
          setExportNotice("已取消导出");
          return;
        }
        const blobBytes = artifact.bytes.buffer.slice(
          artifact.bytes.byteOffset,
          artifact.bytes.byteOffset + artifact.bytes.byteLength,
        ) as ArrayBuffer;
        const url = URL.createObjectURL(new Blob([blobBytes], { type: artifact.mediaType }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = artifact.filename;
        anchor.click();
        URL.revokeObjectURL(url);
      }
      setExportNotice(`已导出 ${artifact.filename}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "知识笔记导出失败";
      setExportNotice(`导出失败：${message}`);
      setError(message);
    } finally {
      setExportBusy(null);
    }
  }

  return (
    <section className="page knowledge-page">
      <div className="knowledge-studio">
        <div
          className="canvas-toolbar workspace-auto-toolbar"
          role="toolbar"
          aria-label="知识画布工具栏"
          data-toolbar-auto-hide={String(workspaceToolbar.autoHide)}
          data-toolbar-visible={String(workspaceToolbar.visible)}
          {...workspaceToolbar.toolbarProps}
          onPointerLeave={(canvasSettingsOpen || exportOpen) ? workspaceToolbar.toolbarProps.onPointerEnter : workspaceToolbar.toolbarProps.onPointerLeave}
        >
          {onBack && <div className="tool-group canvas-toolbar__back"><button type="button" className="back-to-shelf" onClick={onBack} aria-label="返回笔记本书架" title="返回知识笔记">←</button></div>}
          <div className="tool-group tool-group--create canvas-toolbar__scroll-actions">
            {onOpenLibrarySplit && <button aria-label={librarySplitOpen ? "关闭资料库分屏" : "分屏打开资料库"} aria-pressed={librarySplitOpen} className={`linked-split-trigger ${librarySplitOpen ? "is-active" : ""}`} onClick={onOpenLibrarySplit}><span>◫</span>{librarySplitOpen ? "关闭资料分屏" : "分屏资料库"}</button>}
            <button aria-label="新建概念" onClick={() => void createNode("concept")}><span>◇</span>新建概念</button>
            <button aria-label="新建便签" onClick={() => void createNode("sticky_note")}><span>▤</span>新建便签</button>
            <button aria-label="新建记忆卡" onClick={() => void createNode("flashcard")}><span>▣</span>新建记忆卡</button>
            <button ref={sourceButtonRef} aria-label="引用资料" className="tool-accent" onClick={() => void openSources()}><span>↗</span>引用资料</button>
            <input ref={imageInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="选择图片文件" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importImage(file); }} />
            <button aria-label="导入图片" disabled={imageBusy} onClick={() => imageInputRef.current?.click()}><span>▧</span>{imageBusy ? "导入中…" : "导入图片"}</button>
            <button aria-label="粘贴图片" disabled={imageBusy} onClick={() => void pasteNativeImage()}><span>⌘</span>粘贴图片</button>
          </div>
          <div className="canvas-toolbar__secondary">
          <div className="tool-group tool-group--canvas-nav">
            <label>关系<select aria-label="关系类型" value={relation} onChange={(event) => setRelation(event.target.value as KnowledgeRelation)}>{Object.entries(relationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <button aria-label="撤销画布操作" title="撤销 · Ctrl+Z" disabled={!historyAvailability.canUndo} onClick={() => void undoCanvas()}>↶</button>
            <button aria-label="重做画布操作" title="重做 · Ctrl+Shift+Z / Ctrl+Y" disabled={!historyAvailability.canRedo} onClick={() => void redoCanvas()}>↷</button>
            <button aria-label="缩小画布" onClick={() => setViewport((current) => ({ ...current, zoom: Math.max(.55, current.zoom - .1) }))}>−</button>
            <span className="zoom-readout">{Math.round(viewport.zoom * 100)}%</span>
            <button aria-label="放大画布" onClick={() => setViewport((current) => ({ ...current, zoom: Math.min(1.6, current.zoom + .1) }))}>＋</button>
            <button aria-label="重置画布" onClick={() => setViewport({ x: 12, y: 12, zoom: 1 })}>100%</button>
            <button aria-label="适合全部内容" onClick={fitCanvas}>适合</button>
          </div>
          <div className="tool-group canvas-toolbar__primary-actions">
            <div className="canvas-export-anchor" ref={exportRootRef}>
              <button aria-label="导出知识画布" aria-haspopup="menu" aria-expanded={exportOpen} disabled={exportBusy !== null} onClick={() => setExportOpen((value) => !value)}>{exportBusy ? "导出中…" : "⇩ 导出"}</button>
              <MotionPresence present={exportOpen} exitMs={120}>{(phase) => <div className="canvas-export-menu" data-presence={phase} role="menu" aria-label="导出知识笔记">
                <header><strong>导出与整理</strong><span>完整画布或可继续编辑的文档</span></header>
                <button role="menuitem" aria-label="导出 PNG 画布" onClick={() => void exportNotebook("png")}><i>PNG</i><span><strong>导出 PNG 画布</strong><small>完整布局与关系连线</small></span></button>
                <button role="menuitem" aria-label="导出 PDF 画布" onClick={() => void exportNotebook("pdf")}><i>PDF</i><span><strong>导出 PDF 画布</strong><small>适合分享与归档</small></span></button>
                <button role="menuitem" aria-label="整理为 Word" onClick={() => void exportNotebook("docx")}><i>DOC</i><span><strong>整理为 Word</strong><small>按空间顺序生成章节</small></span></button>
                <button role="menuitem" aria-label="整理为 Markdown" onClick={() => void exportNotebook("md")}><i>MD</i><span><strong>整理为 Markdown</strong><small>自包含图片与关系清单</small></span></button>
              </div>}</MotionPresence>
            </div>
            <div className="canvas-settings-anchor">
              <button ref={canvasSettingsButtonRef} aria-label="画布设置" aria-expanded={canvasSettingsOpen} onClick={() => setCanvasSettingsOpen((value) => !value)}>Aa · 设置</button>
              <AnchoredMenu open={canvasSettingsOpen} anchorRef={canvasSettingsButtonRef} ariaLabel="画布设置面板" role="dialog" className="canvas-settings" onClose={() => setCanvasSettingsOpen(false)}>
                <header><div><strong>画布与排版</strong></div><button aria-label="关闭画布设置" onClick={() => setCanvasSettingsOpen(false)}>×</button></header>
                <label>画布尺寸<select aria-label="画布尺寸" value={`${canvasPreferences.width}x${canvasPreferences.height}`} onChange={(event) => {
                  const [width, height] = event.target.value.split("x").map(Number);
                  setCanvasPreferences((current) => ({ ...current, width, height }));
                }}><option value="1400x900">紧凑 · 1400 × 900</option><option value="1800x1100">标准 · 1800 × 1100</option><option value="2400x1400">宽幅 · 2400 × 1400</option><option value="3200x1800">大型 · 3200 × 1800</option></select></label>
                <div className="canvas-size-fields"><label>宽度<input aria-label="画布宽度" type="number" min={1200} max={4200} value={canvasPreferences.width} onChange={(event) => setCanvasPreferences((current) => ({ ...current, width: Math.min(4200, Math.max(1200, Number(event.target.value) || 1200)) }))} /></label><label>高度<input aria-label="画布高度" type="number" min={800} max={2800} value={canvasPreferences.height} onChange={(event) => setCanvasPreferences((current) => ({ ...current, height: Math.min(2800, Math.max(800, Number(event.target.value) || 800)) }))} /></label></div>
                <label>画布字体<select aria-label="画布字体" value={canvasPreferences.fontFamily} style={{ fontFamily: canvasPreferences.fontFamily }} onChange={(event) => setCanvasPreferences((current) => ({ ...current, fontFamily: event.target.value }))}>{canvasFontOptions.map((font) => <option key={font} value={font} style={{ fontFamily: font }}>{font}</option>)}</select></label>
                <div className="canvas-font-scale"><label htmlFor="canvas-font-scale">卡片字号</label><output>{canvasPreferences.fontScale}%</output><input id="canvas-font-scale" aria-label="卡片字号" type="range" min={80} max={150} step={5} value={canvasPreferences.fontScale} onChange={(event) => setCanvasPreferences((current) => ({ ...current, fontScale: Number(event.target.value) }))} /></div>
                <label>卡片缩放模式<select aria-label="卡片缩放模式" value={canvasPreferences.resizeTextWithCard ? "scale-text" : "reflow"} onChange={(event) => setCanvasPreferences((current) => ({ ...current, resizeTextWithCard: event.target.value === "scale-text" }))}><option value="reflow">仅调整卡片 · 文字自动重排</option><option value="scale-text">左下角联动 · 同步调整字号</option></select></label>
                <button className="canvas-settings__reset" onClick={() => setCanvasPreferences({ ...defaultCanvasPreferences })}>恢复默认排版</button>
              </AnchoredMenu>
            </div>
          </div>
          </div>
        </div>

        <div className={`knowledge-workspace ${selected ? "has-inspector" : ""}`}>
          <div
            ref={canvasRef}
            className="knowledge-canvas"
            onPointerDown={beginPan}
            onPointerMove={moveCanvas}
            onPointerUp={finishPan}
            onPointerCancel={finishPan}
            onWheel={(event) => {
              if (!event.ctrlKey) return;
              event.preventDefault();
              setViewport((current) => ({ ...current, zoom: Math.min(1.6, Math.max(.55, current.zoom + (event.deltaY < 0 ? .08 : -.08))) }));
            }}
          >
            <div className="canvas-grid" aria-hidden="true" />
            <div className="canvas-world" data-resize-mode={canvasPreferences.resizeTextWithCard ? "scale-text" : "reflow"} style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`, width: canvasPreferences.width, height: canvasPreferences.height, fontFamily: `"${canvasPreferences.fontFamily.replaceAll('"', '\\"')}"`, "--canvas-font-scale": String(canvasPreferences.fontScale / 100) } as CSSProperties}>
              <svg className="edge-layer" width={canvasPreferences.width} height={canvasPreferences.height} aria-label="知识关系">
                <defs><marker id="edge-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
                {graph.edges.map((edge) => {
                  const source = nodeById.get(edge.source_id);
                  const target = nodeById.get(edge.target_id);
                  if (!source || !target) return null;
                  const sourceWidth = Number(source.width || nodeDefaultSizes[source.kind].width);
                  const sourceHeight = Number(source.height || nodeDefaultSizes[source.kind].height);
                  const targetHeight = Number(target.height || nodeDefaultSizes[target.kind].height);
                  const sx = Number(source.position_x || 0) + sourceWidth;
                  const sy = Number(source.position_y || 0) + sourceHeight / 2;
                  const tx = Number(target.position_x || 0);
                  const ty = Number(target.position_y || 0) + targetHeight / 2;
                  const bend = Math.max(70, Math.abs(tx - sx) * .45);
                  const edgeLabel = `关系：${source.title} 到 ${target.title}，${relationLabels[edge.relation || "prerequisite"]}`;
                  const path = `M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx} ${ty}`;
                  return <g
                    key={edge.id}
                    data-testid={`knowledge-edge-${edge.id}`}
                    data-source-focus={sourceFocus?.edgeId === edge.id ? "true" : undefined}
                    role="button"
                    tabIndex={0}
                    aria-label={edgeLabel}
                    className={`knowledge-edge-group ${selectedEdgeId === edge.id ? "is-selected" : ""} ${sourceFocus?.edgeId === edge.id ? "is-source-focus" : ""}`}
                    onClick={(event) => { event.stopPropagation(); setSelectedId(null); setLinkSource(null); setSelectedEdgeId(edge.id); }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault(); setSelectedId(null); setLinkSource(null); setSelectedEdgeId(edge.id);
                      } else if (event.key === "Delete" || event.key === "Backspace") {
                        event.preventDefault(); event.stopPropagation(); void removeEdge(edge);
                      }
                    }}
                  >
                    <path className={`knowledge-edge relation--${edge.relation || "prerequisite"}`} d={path} markerEnd="url(#edge-arrow)" />
                    <path aria-hidden="true" className="knowledge-edge-hit" d={path} />
                  </g>;
                })}
              </svg>

              {graph.nodes.map((node) => {
                const isSource = linkSource === node.id;
                const flashcard = node.kind === "flashcard" ? parseFlashcard(node.content || node.description || "") : null;
                const isFlipped = flippedCards.has(node.id);
                const linkLabel = linkSource === null
                  ? `从 ${node.title}开始连接`
                  : isSource ? `取消从 ${node.title}连接` : `连接到 ${node.title}`;
                return (
                  <article
                    key={node.id}
                    data-testid={`knowledge-node-${node.id}`}
                    data-source-focus={sourceFocus?.nodeId === node.id ? "true" : undefined}
                    tabIndex={0}
                    aria-label={`知识卡片：${node.title}`}
                    className={`canvas-card kind--${node.kind} color--${node.color} ${selectedId === node.id ? "is-selected" : ""} ${isSource ? "is-link-source" : ""} ${sourceFocus?.nodeId === node.id ? "is-source-focus" : ""}`}
                    style={{
                      left: Number(node.position_x || 0),
                      top: Number(node.position_y || 0),
                      width: Number(node.width || nodeDefaultSizes[node.kind].width),
                      height: Number(node.height || nodeDefaultSizes[node.kind].height),
                      "--node-font-scale": String(Number(node.font_scale) || 1),
                    } as CSSProperties}
                    onPointerDown={(event) => startDrag(event, node)}
                    onPointerMove={moveNode}
                    onPointerUp={(event) => void finishDrag(event)}
                    onPointerCancel={(event) => void finishDrag(event)}
                    onKeyDown={(event) => handleNodeKey(event, node)}
                    onDoubleClick={() => setSelectedId(node.id)}
                  >
                    <header><span>{kindLabels[node.kind]}</span><small>{node.module || "未分类"}</small></header>
                    <strong>{node.title}</strong>
                    {node.image_url && <button type="button" className="canvas-card__image-button" aria-label={`查看完整图片：${node.image_alt || node.title}`} onClick={(event) => openImagePreview(event, node)}><img className="canvas-card__image" src={imageUrl(node.image_url)} alt={node.image_alt || node.title} draggable={false} /><span aria-hidden="true">↗</span></button>}
                    {flashcard ? (
                      <div className={`flashcard-face ${isFlipped ? "is-back" : "is-front"}`} aria-live="polite">
                        <small>{isFlipped ? "背面 · 答案" : "正面 · 问题"}</small>
                        <p>{(isFlipped ? flashcard.back : flashcard.front) || (isFlipped ? "还没有填写答案" : "还没有填写问题")}</p>
                        <div className="flashcard-actions">
                          {isFlipped ? (
                            <>
                              <button disabled={reviewPendingIds.has(node.id)} aria-label="没记住" onClick={(event) => { event.stopPropagation(); void reviewFlashcard(node, false); }}>再复习</button>
                              <button disabled={reviewPendingIds.has(node.id)} aria-label="记住了" onClick={(event) => { event.stopPropagation(); void reviewFlashcard(node, true); }}>{reviewPendingIds.has(node.id) ? "记录中…" : "记住了"}</button>
                              <button disabled={reviewPendingIds.has(node.id)} aria-label="再看问题" onClick={(event) => { event.stopPropagation(); flipFlashcard(node.id, false); }}>看问题</button>
                            </>
                          ) : <button aria-label="显示答案" onClick={(event) => { event.stopPropagation(); flipFlashcard(node.id, true); }}>显示答案</button>}
                        </div>
                      </div>
                    ) : node.kind !== "image" ? <p>{node.content || node.description || "双击补充内容"}</p> : !node.image_url ? <p className="image-placeholder">图片正在准备中…</p> : null}
                    {node.kind === "concept" && <footer className="mastery-control" style={{ "--mastery": `${Math.round((node.mastery || 0) * 100)}%` } as CSSProperties}><input type="range" min={0} max={100} step={10} value={Math.round((node.mastery || 0) * 100)} aria-label={`调整“${node.title}”掌握度`} onChange={(event) => changeMastery(node, Number(event.target.value))} onPointerUp={() => void flushScheduledNodePatch(node.id)} onBlur={() => void flushScheduledNodePatch(node.id)} /><small>{Math.round((node.mastery || 0) * 100)}% 掌握</small></footer>}
                    {node.kind === "citation" && node.source_title && (node.source_document_id && onOpenSource ? <button type="button" className="citation-source-link" aria-label={`打开来源：${node.source_title}`} onClick={(event) => { event.stopPropagation(); onOpenSource(node.source_document_id!, node.source_locator || {}, node.source_block_key || ""); }}>来自 · {node.source_title}</button> : <em>来自 · {node.source_title}</em>)}
                    <button className="node-link-port" aria-label={linkLabel} title={linkLabel} onClick={(event) => { event.stopPropagation(); void chooseLinkTarget(node.id); }}><span /></button>
                    {selectedId === node.id && (Object.keys(resizeHandleLabels) as ResizeDirection[]).map((direction) => {
                      const textCoupled = direction === "sw" && canvasPreferences.resizeTextWithCard;
                      return <button
                        type="button"
                        key={direction}
                        data-resize-handle={direction}
                        className={`node-resize-handle node-resize-handle--${direction} ${textCoupled ? "is-text-coupled" : ""}`}
                        aria-label={`调整“${node.title}”大小：${resizeHandleLabels[direction]}${textCoupled ? "并同步字号" : ""}`}
                        title={textCoupled ? "拖动左下角，同时调整卡片与文字大小" : `拖动${resizeHandleLabels[direction]}调整卡片大小`}
                        onPointerDown={(event) => startResize(event, node, direction)}
                        onPointerMove={moveResize}
                        onPointerUp={finishResize}
                        onPointerCancel={finishResize}
                      >{textCoupled ? <span>Aa</span> : null}</button>;
                    })}
                  </article>
                );
              })}

              {!graph.nodes.length && (
                <div className="canvas-empty">
                  <span>✦</span><h2>从第一张卡片开始</h2><p>创建概念、便签或从资料中摘录一句话，画布会记住每张卡的位置。</p>
                  <button onClick={() => void createNode("sticky_note")}>创建第一张便签</button>
                </div>
              )}
            </div>
            <div className="canvas-hint">拖动空白处平移 · 边角调整大小 · Delete 删除 · Ctrl + Z 撤销 · Ctrl + 滚轮缩放</div>
          </div>

          {selected && (
            <aside className="node-inspector" aria-label="卡片检查器">
              <header><div><h2>编辑卡片</h2></div><button aria-label="关闭卡片检查器" onClick={() => { void flushScheduledNodePatch(selected.id); setSelectedId(null); }}>×</button></header>
              <label>标题<input value={selected.title} onChange={(event) => {
                const title = event.target.value;
                setGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === selected.id ? { ...node, title } : node) }));
                scheduleNodePatch(selected.id, { title });
              }} onBlur={() => void flushScheduledNodePatch(selected.id)} /></label>
              <label>类型<select value={selected.kind} onChange={(event) => void updateSelected({ kind: event.target.value as KnowledgeNodeKind })}>{Object.entries(kindLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              {selected.image_url && <div className="inspector-image"><img src={imageUrl(selected.image_url)} alt="" aria-hidden="true" /><label>图片说明<input value={selected.image_alt || ""} onChange={(event) => {
                const image_alt = event.target.value;
                setGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === selected.id ? { ...node, image_alt } : node) }));
                scheduleNodePatch(selected.id, { image_alt });
              }} onBlur={() => void flushScheduledNodePatch(selected.id)} /></label></div>}
              {selectedFlashcard ? (
                <div className="flashcard-editor">
                  <label>记忆卡正面<textarea rows={4} value={selectedFlashcard.front} onChange={(event) => {
                    const content = serializeFlashcard({ front: event.target.value, back: selectedFlashcard.back });
                    setGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === selected.id ? { ...node, content, description: content } : node) }));
                    scheduleNodePatch(selected.id, { content, description: content });
                  }} onBlur={() => void flushScheduledNodePatch(selected.id)} /></label>
                  <label>记忆卡背面<textarea rows={5} value={selectedFlashcard.back} onChange={(event) => {
                    const content = serializeFlashcard({ front: selectedFlashcard.front, back: event.target.value });
                    setGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === selected.id ? { ...node, content, description: content } : node) }));
                    scheduleNodePatch(selected.id, { content, description: content });
                  }} onBlur={() => void flushScheduledNodePatch(selected.id)} /></label>
                  <p className="flashcard-editor__hint">学习时先回忆，再翻面核对；反馈会更新掌握度。</p>
                </div>
              ) : <label>内容<textarea rows={8} value={selected.content || ""} onChange={(event) => {
                const content = event.target.value;
                setGraph((current) => ({ ...current, nodes: current.nodes.map((node) => node.id === selected.id ? { ...node, content, description: content } : node) }));
                scheduleNodePatch(selected.id, { content, description: content });
              }} onBlur={() => void flushScheduledNodePatch(selected.id)} /></label>}
              <fieldset><legend>卡片颜色</legend><div className="color-options">{["indigo", "sun", "mint", "coral", "slate"].map((color) => <button key={color} aria-label={`使用 ${color} 色`} className={`${color} ${selected.color === color ? "is-active" : ""}`} onClick={() => void updateSelected({ color })} />)}</div></fieldset>
              <div className="inspector-tip" role="status">{nodeSaveStatus[selected.id] === "dirty" ? "等待自动保存…" : nodeSaveStatus[selected.id] === "saving" ? "正在自动保存…" : nodeSaveStatus[selected.id] === "saved" ? "已自动保存" : nodeSaveStatus[selected.id] === "error" ? "保存未完成；继续编辑或重新打开后会重试。" : "自动保存已开启；改动只影响当前课程。"}</div>
              <button className="danger-text" onClick={() => void removeSelected()}>删除这张卡片</button>
            </aside>
          )}
        </div>
      </div>

      <MotionPresence present={sourceOpen} exitMs={220}>{(phase) => (
        <div className="source-backdrop" data-presence={phase} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSources(); }}>
          <aside ref={sourceDrawerRef} className="source-drawer" role="dialog" aria-modal="true" aria-label="引用资料">
            <header><div><h2>引用资料</h2><p>选择已导入的资料，摘录原文生成可回溯的引用卡片。</p></div><button data-source-close aria-label="关闭引用资料" onClick={closeSources}>×</button></header>
            <div className="source-drawer__body">
              <nav aria-label="资料列表">
                {documents.length ? documents.map((document) => <button key={document.id} className={activeDocument?.id === document.id ? "is-active" : ""} aria-label={`${document.title} · ${document.filename}`} onClick={() => void chooseDocument(document)}><span>{document.title}</span><small>{document.filename}</small></button>) : <div className="source-empty"><strong>资料书架还是空的</strong><span>先在“资料书架”导入 PDF、Markdown 或文本文件。</span></div>}
              </nav>
              <section>
                {activeDocument ? <><div className="source-document-title"><small>正在摘录</small><strong>{activeDocument.title}</strong></div><label>引用内容<textarea rows={14} value={quote} onChange={(event) => { setQuote(event.target.value); setQuoteSelection({ start: 0, end: 0 }); }} onSelect={(event) => setQuoteSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })} /></label><p className="source-note">{selectedQuote ? `已选择 ${selectedQuote.length} 个字符，将只引用选中文字。` : "选择原文中的一句或一段；未选择时会引用当前编辑区全文。"}</p><button className="primary-action" disabled={!citationText || busy} onClick={() => void addCitation()}>{busy ? "正在添加…" : selectedQuote ? "引用选中文字" : "添加整段为引用卡片"}</button></> : <div className="source-preview-empty"><span>↗</span><strong>选择一份资料</strong><p>正文将在这里打开，你可以选取或编辑要引用的内容。</p></div>}
              </section>
            </div>
          </aside>
        </div>
      )}</MotionPresence>

      <MotionPresence present={imagePreview !== null} exitMs={180}>{(phase) => imagePreview && (
        <div className="image-preview-backdrop" data-presence={phase} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeImagePreview(); }}>
          <section className="image-preview" role="dialog" aria-modal="true" aria-label="图片预览">
            <header><div><small>FULL IMAGE / {Math.round(viewport.zoom * 100)}%</small><strong>{imagePreview.title}</strong><span>{imagePreview.alt}</span></div><button type="button" aria-label="关闭图片预览" onClick={closeImagePreview}>×</button></header>
            <div className="image-preview__stage"><img src={imagePreview.src} alt={imagePreview.alt} /></div>
            <footer>图片按原始比例完整显示 · 按 Esc 关闭</footer>
          </section>
        </div>
      )}</MotionPresence>

      {selectedEdge && <div className="edge-toast" role="status"><span>已选择关系：{nodeById.get(selectedEdge.source_id)?.title} → {nodeById.get(selectedEdge.target_id)?.title} · {relationLabels[selectedEdge.relation || "prerequisite"]}</span><button aria-label="删除关系" onClick={() => void removeEdge(selectedEdge)}>删除关系</button><button aria-label="取消选择关系" onClick={() => setSelectedEdgeId(null)}>取消</button></div>}
      {linkSource !== null && <div className="link-toast" role="status">已选择起点：{nodeById.get(linkSource)?.title} · 点击另一张卡片右侧圆点完成连接 <button onClick={() => setLinkSource(null)}>取消</button></div>}
      {exportNotice && <div className="export-notice" role="status"><span>{exportNotice}</span>{exportNotice.startsWith("已导出") && platform().files.canOpenExportDirectory && <button aria-label="打开导出文件夹" onClick={() => void platform().files.openExportDirectory()}>打开导出文件夹</button>}<button aria-label="关闭导出提示" onClick={() => setExportNotice("")}>×</button></div>}
      {error && <div className="floating-error" role="alert">{error}<button aria-label="关闭错误提示" onClick={() => setError("")}>×</button></div>}
    </section>
  );
}
