import { useEffect, useMemo, useRef, useState, type CSSProperties, type UIEvent } from "react";
import { SplitDivider } from "../components/SplitDivider";
import type { ApiClient } from "../services/api";
import { useWorkspaceToolbarVisibility } from "../workspace/WorkspaceToolbarVisibility";
import type { DocumentAnnotation, DocumentBlock, DocumentContent, DocumentFormat, DocumentItem, DocumentLocator } from "./types";
import { blockLabel, DocumentReader, type ReaderSelection } from "./readers";
import { AnnotationOverlay, type AnnotationTool } from "./AnnotationOverlay";
import { takeDocumentSourceFocus, type DocumentSourceFocus, type DocumentSourceOpenDetail } from "./sourceFocus";

interface RevisionState { can_undo: boolean; can_redo: boolean }
interface RevisionMove { block: DocumentBlock; history: RevisionState }
export interface DocumentAgentContext { documentIds: number[]; blockKey: string; selectedText: string; locator: DocumentLocator }

interface DocumentWorkspaceProps {
  api: ApiClient;
  courseId?: number;
  documentId: number;
  onBack: () => void;
  onAgentContextChange?: (context: DocumentAgentContext) => void;
  courseNavigationOpen?: boolean;
  onCourseNavigationChange?: (open: boolean) => void;
  knowledgeSplitOpen?: boolean;
  onKnowledgeSplitChange?: (open: boolean) => void;
}

function replaceBlock(content: DocumentContent | null, block: DocumentBlock): DocumentContent | null {
  return content ? { ...content, blocks: content.blocks.map((item) => item.block_key === block.block_key ? block : item) } : content;
}

function clampZoom(value: number) {
  return Math.min(200, Math.max(60, value));
}

function isEditingTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

type ReaderPane = "primary" | "secondary";

function readingPositionKey(documentId: number, pane: ReaderPane) {
  return `studypilot.reading-position.v1.${pane}.${documentId}`;
}

function storedReadingPosition(documentId: number, pane: ReaderPane) {
  const value = Number(window.localStorage.getItem(readingPositionKey(documentId, pane)));
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function findSourceBlock(content: DocumentContent, focus: DocumentSourceFocus) {
  const exact = content.blocks.find((block) => block.block_key === focus.blockKey);
  if (exact) return exact;
  const locatorEntries = Object.entries(focus.locator || {});
  if (!locatorEntries.length) return undefined;
  return content.blocks.find((block) => locatorEntries.every(([key, value]) => block.locator[key] === value));
}

function LearningSourceBanner({ focus, onDismiss }: { focus: DocumentSourceFocus; onDismiss: () => void }) {
  const label = focus.locationLabel || "已定位到引用位置";
  return <aside className="document-source-focus-banner" role="status" aria-label={`学习出处：${label}`}>
    <span>{focus.originMode === "assistant" ? "PILOT 引用" : "学习出处"}</span>
    <strong>{label}</strong>
    {focus.quote && <q>{focus.quote.slice(0, 140)}</q>}
    <div>
      <button onClick={() => window.dispatchEvent(new CustomEvent("studypilot:open-agent", { detail: { view: "chat", mode: focus.originMode || "learning" } }))}>回到学习对话</button>
      <button aria-label="关闭出处高亮" onClick={onDismiss}>×</button>
    </div>
  </aside>;
}

interface OutlineNode {
  block: DocumentBlock;
  level: number;
  children: OutlineNode[];
}

function explicitHeadingLevel(format: DocumentFormat, block: DocumentBlock) {
  const stored = Number(block.data.heading_level || 0);
  if (stored > 0) return Math.min(6, stored);
  if (format === "markdown") {
    const match = /^\s{0,3}(#{1,6})\s+/.exec(block.text);
    return match ? match[1].length : 0;
  }
  if (format === "docx") {
    const match = /heading\s*(\d+)/i.exec(String(block.data.style || ""));
    return match ? Math.min(6, Number(match[1])) : 0;
  }
  return 0;
}

function buildOutlineTree(format: DocumentFormat, blocks: DocumentBlock[]) {
  const explicitBlocks = blocks.filter((block) => !block.data.outline_hidden && explicitHeadingLevel(format, block) > 0);
  const candidates = explicitBlocks.length ? explicitBlocks : blocks.filter((block) => !block.data.outline_hidden);
  const roots: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  candidates.forEach((block) => {
    const level = explicitHeadingLevel(format, block) || 1;
    const node: OutlineNode = { block, level, children: [] };
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    if (stack.length) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  });
  return roots;
}

function outlinePathTo(nodes: OutlineNode[], blockKey: string, ancestors: OutlineNode[] = []): OutlineNode[] {
  for (const node of nodes) {
    const path = [...ancestors, node];
    if (node.block.block_key === blockKey) return path;
    const nested = outlinePathTo(node.children, blockKey, path);
    if (nested.length) return nested;
  }
  return [];
}

function OutlineBranch({ nodes, activeBlockKey, collapsed, onToggle, onSelect, format }: {
  nodes: OutlineNode[];
  activeBlockKey: string;
  collapsed: Set<string>;
  onToggle: (blockKey: string) => void;
  onSelect: (blockKey: string) => void;
  format: DocumentFormat;
}) {
  return <>{nodes.map((node) => {
    const label = blockLabel(format, node.block);
    const closed = collapsed.has(node.block.block_key);
    return <div id={`document-outline-${node.block.block_key}`} className="document-outline-item" data-outline-level={node.level} data-outline-active={String(node.block.block_key === activeBlockKey)} key={node.block.block_key}>
      <div className="document-outline-row" style={{ "--outline-depth": Math.max(0, node.level - 1) } as CSSProperties}>
        {node.children.length
          ? <button type="button" className="document-outline-toggle" aria-label={`${closed ? "展开" : "折叠"} ${label}`} aria-expanded={!closed} onClick={() => onToggle(node.block.block_key)}>{closed ? "›" : "⌄"}</button>
          : <span className="document-outline-leaf" aria-hidden="true" />}
        <button type="button" aria-label={label} className={`document-outline-link ${node.block.block_key === activeBlockKey ? "is-active" : ""}`} onClick={() => onSelect(node.block.block_key)}>
          <span>{String(node.block.ordinal + 1).padStart(2, "0")}</span><strong>{label}</strong>
        </button>
      </div>
      {!closed && node.children.length > 0 && <OutlineBranch nodes={node.children} activeBlockKey={activeBlockKey} collapsed={collapsed} onToggle={onToggle} onSelect={onSelect} format={format} />}
    </div>;
  })}</>;
}

export function DocumentWorkspace({ api, documentId, onBack, onAgentContextChange, courseNavigationOpen = false, onCourseNavigationChange, knowledgeSplitOpen = false, onKnowledgeSplitChange }: DocumentWorkspaceProps) {
  const workspaceToolbar = useWorkspaceToolbarVisibility();
  const [content, setContent] = useState<DocumentContent | null>(null);
  const [annotations, setAnnotations] = useState<DocumentAnnotation[]>([]);
  const [history, setHistory] = useState<RevisionState>({ can_undo: false, can_redo: false });
  const [activeBlockKey, setActiveBlockKey] = useState("");
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const historyRef = useRef(history);
  const saveStatusRef = useRef(saveStatus);
  const [error, setError] = useState("");
  const [tool, setTool] = useState<AnnotationTool>("select");

  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outlinePinned, setOutlinePinned] = useState(false);
  const outlineHoverRef = useRef(false);
  useEffect(() => {
    if (!courseNavigationOpen) return;
    // Only one left-side drawer may own the edge at a time.
    outlineHoverRef.current = false;
    setOutlinePinned(false);
    setOutlineOpen(false);
  }, [courseNavigationOpen]);

  const [collapsedOutlineKeys, setCollapsedOutlineKeys] = useState<Set<string>>(() => new Set());
  const [notesOpen, setNotesOpen] = useState(false);
  const [zoom, setZoom] = useState(100);
  historyRef.current = history;
  saveStatusRef.current = saveStatus;
  const [splitOpen, setSplitOpen] = useState(false);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [secondaryContent, setSecondaryContent] = useState<DocumentContent | null>(null);
  const [secondaryActiveBlockKey, setSecondaryActiveBlockKey] = useState("");
  const [secondaryZoom, setSecondaryZoom] = useState(100);
  const [splitLeading, setSplitLeading] = useState(50);
  const [splitSwapped, setSplitSwapped] = useState(false);
  const readersRef = useRef<HTMLDivElement>(null);
  const primaryStageRef = useRef<HTMLElement>(null);
  const secondaryStageRef = useRef<HTMLElement>(null);
  const readerSurfaceRef = useRef<HTMLDivElement>(null);
  const pendingOutlineNavigationRef = useRef<{ blockKey: string; expiresAt: number } | null>(null);
  const [primarySourceFocus, setPrimarySourceFocus] = useState<DocumentSourceFocus | null>(null);
  const [secondarySourceFocus, setSecondarySourceFocus] = useState<DocumentSourceFocus | null>(null);
  const pendingReadingPositions = useRef(new Map<string, number>());
  const readingPositionTimers = useRef(new Map<string, number>());

  useEffect(() => {
    let active = true;
    setError("");
    setContent(null);
    setPrimarySourceFocus(null);
    setSplitOpen(false);
    setSecondaryContent(null);
    setSecondarySourceFocus(null);
    setOutlineOpen(false);
    setOutlinePinned(false);
    outlineHoverRef.current = false;
    setCollapsedOutlineKeys(new Set());
    setZoom(100);
    Promise.all([
      api.get<DocumentContent>(`/api/documents/${documentId}/content`),
      api.get<DocumentAnnotation[]>(`/api/documents/${documentId}/annotations`),
      api.get<RevisionState>(`/api/documents/${documentId}/revisions`),
    ]).then(([nextContent, nextAnnotations, nextHistory]) => {
      if (!active) return;
      setContent(nextContent);
      setAnnotations(nextAnnotations);
      setNotesOpen(nextAnnotations.length > 0);
      setHistory(nextHistory);
      const requestedFocus = takeDocumentSourceFocus(documentId);
      const requestedBlock = requestedFocus ? findSourceBlock(nextContent, requestedFocus) : undefined;
      setPrimarySourceFocus(requestedFocus);
      setActiveBlockKey(requestedBlock?.block_key || nextContent.blocks[0]?.block_key || "");
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "资料加载失败");
    });
    return () => { active = false; };
  }, [api, documentId]);

  useEffect(() => {
    if (!content || !primaryStageRef.current) return;
    const position = storedReadingPosition(content.document.id, "primary");
    try {
      primaryStageRef.current.scrollTop = position;
    } catch {
      try { primaryStageRef.current.scrollTo({ top: position }); } catch {
        // Some embedded readers expose a read-only scrolling surface.
      }
    }
  }, [content?.document.id]);

  useEffect(() => {
    if (!secondaryContent || !secondaryStageRef.current) return;
    const position = storedReadingPosition(secondaryContent.document.id, "secondary");
    try {
      secondaryStageRef.current.scrollTop = position;
    } catch {
      try { secondaryStageRef.current.scrollTo({ top: position }); } catch {
        // Some embedded readers expose a read-only scrolling surface.
      }
    }
  }, [secondaryContent?.document.id]);

  useEffect(() => () => {
    readingPositionTimers.current.forEach((timer) => window.clearTimeout(timer));
    pendingReadingPositions.current.forEach((position, key) => {
      try { window.localStorage.setItem(key, String(position)); } catch { /* storage can be unavailable */ }
    });
    readingPositionTimers.current.clear();
    pendingReadingPositions.current.clear();
  }, []);


  const activeBlock = useMemo(() => content?.blocks.find((block) => block.block_key === activeBlockKey) || null, [activeBlockKey, content]);
  const outlineTree = useMemo(
    () => content ? buildOutlineTree(content.document.format, content.blocks) : [],
    [content],
  );
  const activeOutlinePath = useMemo(
    () => outlinePathTo(outlineTree, activeBlockKey),
    [activeBlockKey, outlineTree],
  );

  useEffect(() => {
    if (!activeOutlinePath.length) return;
    const ancestorKeys = activeOutlinePath.slice(0, -1).map((node) => node.block.block_key);
    setCollapsedOutlineKeys((current) => {
      if (!ancestorKeys.some((key) => current.has(key))) return current;
      const next = new Set(current);
      ancestorKeys.forEach((key) => next.delete(key));
      return next;
    });
    if (!outlineOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(`document-outline-${activeBlockKey}`);
      if (target && typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ block: "nearest" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeBlockKey, activeOutlinePath, outlineOpen]);

  useEffect(() => {
    if (!content || !primarySourceFocus || !primaryStageRef.current) return;
    const block = findSourceBlock(content, primarySourceFocus);
    if (!block) return;
    setActiveBlockKey(block.block_key);
    const timer = window.setTimeout(() => {
      const target = Array.from(primaryStageRef.current?.querySelectorAll<HTMLElement>("[data-document-block]") || [])
        .find((item) => item.dataset.documentBlock === block.block_key);
      target?.classList.add("is-source-focus");
      if (target && typeof target.scrollIntoView === "function") target.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      primaryStageRef.current?.querySelectorAll(".is-source-focus").forEach((item) => item.classList.remove("is-source-focus"));
    };
  }, [content, primarySourceFocus]);

  useEffect(() => {
    if (!secondaryContent || !secondarySourceFocus || !secondaryStageRef.current) return;
    const block = findSourceBlock(secondaryContent, secondarySourceFocus);
    if (!block) return;
    setSecondaryActiveBlockKey(block.block_key);
    const timer = window.setTimeout(() => {
      const target = Array.from(secondaryStageRef.current?.querySelectorAll<HTMLElement>("[data-document-block]") || [])
        .find((item) => item.dataset.documentBlock === block.block_key);
      target?.classList.add("is-source-focus");
      if (target && typeof target.scrollIntoView === "function") target.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      secondaryStageRef.current?.querySelectorAll(".is-source-focus").forEach((item) => item.classList.remove("is-source-focus"));
    };
  }, [secondaryContent, secondarySourceFocus]);

  useEffect(() => {
    function openDocumentSource(event: Event) {
      const detail = (event as CustomEvent<DocumentSourceOpenDetail>).detail;
      if (!detail?.focus?.documentId) return;
      if (detail.placement === "primary" && detail.focus.documentId === documentId) {
        setPrimarySourceFocus(detail.focus);
        return;
      }
      if (detail.placement !== "secondary" || detail.focus.documentId === documentId) return;
      if (knowledgeSplitOpen) onKnowledgeSplitChange?.(false);
      setSplitOpen(true);
      setNotesOpen(false);
      void api.get<DocumentItem[]>("/api/documents").then(setDocuments).catch(() => undefined);
      void loadSecondary(detail.focus.documentId, detail.focus);
    }
    window.addEventListener("studypilot:open-document-source", openDocumentSource);
    return () => window.removeEventListener("studypilot:open-document-source", openDocumentSource);
  }, [api, documentId, knowledgeSplitOpen, onKnowledgeSplitChange]);

  useEffect(() => {
    if (!activeBlock || !onAgentContextChange) return;
    const activeSelection = selection?.blockKey === activeBlock.block_key ? selection : null;
    onAgentContextChange({
      documentIds: [documentId, ...(secondaryContent ? [secondaryContent.document.id] : [])],
      blockKey: activeBlock.block_key,
      selectedText: activeSelection?.quote || "",
      locator: activeSelection?.locator || activeBlock.locator,
    });
  }, [activeBlock, documentId, onAgentContextChange, secondaryContent, selection]);

  useEffect(() => {
    function handleHistoryShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || isEditingTarget(event.target) || event.altKey || !(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      const redo = (key === "z" && event.shiftKey) || key === "y";
      const undo = key === "z" && !event.shiftKey;
      if (saveStatusRef.current === "saving" || (undo && !historyRef.current.can_undo) || (redo && !historyRef.current.can_redo) || (!undo && !redo)) return;
      event.preventDefault();
      void moveRevision(redo ? "redo" : "undo");
    }
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, [api, documentId]);

  async function revise(block: DocumentBlock, after: { text: string; data?: Record<string, any> }) {
    setSaveStatus("saving");
    setError("");
    try {
      const result = await api.post<{ block: DocumentBlock; history?: RevisionState }>(`/api/documents/${documentId}/revisions`, {
        block_key: block.block_key,
        before: after.data ? { text: block.text, data: block.data } : { text: block.text },
        after,
      });
      setContent((current) => replaceBlock(current, result.block));
      setHistory(result.history || { can_undo: true, can_redo: false });
      setSaveStatus("saved");
    } catch (reason) {
      setSaveStatus("error");
      setError(reason instanceof Error ? reason.message : "资料修订保存失败");
      throw reason;
    }
  }

  async function reviseSecondary(block: DocumentBlock, after: { text: string; data?: Record<string, any> }) {
    if (!secondaryContent) return;
    const result = await api.post<{ block: DocumentBlock }>(`/api/documents/${secondaryContent.document.id}/revisions`, {
      block_key: block.block_key,
      before: after.data ? { text: block.text, data: block.data } : { text: block.text },
      after,
    });
    setSecondaryContent((current) => replaceBlock(current, result.block));
  }

  async function moveRevision(direction: "undo" | "redo") {
    saveStatusRef.current = "saving";
    setSaveStatus("saving");
    setError("");
    try {
      const result = await api.post<RevisionMove>(`/api/documents/${documentId}/revisions/${direction}`, {});
      setContent((current) => replaceBlock(current, result.block));
      historyRef.current = result.history;
      setHistory(result.history);
      setActiveBlockKey(result.block.block_key);
      saveStatusRef.current = "saved";
      setSaveStatus("saved");
    } catch (reason) {
      saveStatusRef.current = "error";
      setSaveStatus("error");
      setError(reason instanceof Error ? reason.message : "无法恢复修订");
    }
  }

  async function addAnnotation(kind: DocumentAnnotation["kind"], geometry: Record<string, unknown> = {}, annotationNote = "") {
    if (!activeBlock) return;
    setError("");
    try {
      const created = await api.post<DocumentAnnotation>(`/api/documents/${documentId}/annotations`, {
        block_key: activeBlock.block_key,
        kind,
        locator: selection?.blockKey === activeBlock.block_key ? selection.locator : activeBlock.locator,
        quote: selection?.blockKey === activeBlock.block_key ? selection.quote : "",
        note: annotationNote,
        color: kind === "marker" || kind === "highlight" ? "yellow" : kind === "note" ? "blue" : "red",
        geometry,
      });
      setAnnotations((items) => [...items, created]);
      if (!["pen", "marker", "rectangle", "ellipse"].includes(kind)) setTool("select");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "批注保存失败");
    }
  }

  async function eraseAnnotation(annotationId: number) {
    setError("");
    try {
      await api.delete(`/api/documents/${documentId}/annotations/${annotationId}`);
      setAnnotations((items) => items.filter((annotation) => annotation.id !== annotationId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "批注删除失败");
    }
  }

  async function toggleBookmark() {
    if (!activeBlock) return;
    const existing = annotations.find((annotation) => annotation.kind === "tag" && annotation.block_key === activeBlock.block_key);
    if (existing) await eraseAnnotation(existing.id);
    else await addAnnotation("tag", {}, `书签 · ${blockLabel(content?.document.format || "text", activeBlock)}`);
  }

  function chooseTool(nextTool: AnnotationTool) {
    setTool(nextTool);
    if (nextTool === "highlight" && selection) void addAnnotation("highlight");
  }

  function selectOutlineBlock(blockKey: string) {
    pendingOutlineNavigationRef.current = { blockKey, expiresAt: Date.now() + 1800 };
    setActiveBlockKey(blockKey);
    let attempts = 0;
    const scrollWhenRendered = () => {
      const target = document.getElementById(`document-block-${blockKey}`);
      if (target && typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (!target && attempts < 10) {
        attempts += 1;
        window.setTimeout(scrollWhenRendered, 16);
      }
    };
    window.setTimeout(scrollWhenRendered, 0);
    if (!outlinePinned) setOutlineOpen(false);
  }

  function handleReaderScroll(event: UIEvent<HTMLElement>) {
    rememberReadingPosition(documentId, "primary", event.currentTarget.scrollTop);
    const pendingNavigation = pendingOutlineNavigationRef.current;
    if (pendingNavigation && Date.now() < pendingNavigation.expiresAt) {
      if (activeBlockKey !== pendingNavigation.blockKey) {
        setActiveBlockKey(pendingNavigation.blockKey);
      }
      return;
    }
    if (pendingNavigation) {
      pendingOutlineNavigationRef.current = null;
    }
    if (event.currentTarget.scrollTop > 72 && !outlinePinned && !outlineHoverRef.current) setOutlineOpen(false);
    const stageTop = event.currentTarget.getBoundingClientRect().top + 56;
    const candidates = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-document-block]"));
    const closest = candidates.reduce<HTMLElement | null>((best, item) => {
      if (!best) return item;
      return Math.abs(item.getBoundingClientRect().top - stageTop) < Math.abs(best.getBoundingClientRect().top - stageTop) ? item : best;
    }, null);
    const key = closest?.dataset.documentBlock;
    if (key) setActiveBlockKey(key);
  }

  function rememberReadingPosition(id: number, pane: ReaderPane, position: number) {
    const key = readingPositionKey(id, pane);
    pendingReadingPositions.current.set(key, Math.max(0, Math.round(position)));
    if (readingPositionTimers.current.has(key)) return;
    const timer = window.setTimeout(() => {
      const pending = pendingReadingPositions.current.get(key);
      if (pending !== undefined) {
        try { window.localStorage.setItem(key, String(pending)); } catch { /* storage can be unavailable */ }
        pendingReadingPositions.current.delete(key);
      }
      readingPositionTimers.current.delete(key);
    }, 120);
    readingPositionTimers.current.set(key, timer);
  }

  function handleSecondaryReaderScroll(event: UIEvent<HTMLElement>) {
    if (!secondaryContent) return;
    rememberReadingPosition(
      secondaryContent.document.id,
      "secondary",
      event.currentTarget.scrollTop,
    );
  }

  async function toggleSplit() {
    if (splitOpen) {
      setSplitOpen(false);
      setSecondaryContent(null);
      setSecondarySourceFocus(null);
      return;
    }
    if (knowledgeSplitOpen) onKnowledgeSplitChange?.(false);
    setSplitOpen(true);
    setNotesOpen(false);
    try {
      const items = await api.get<DocumentItem[]>("/api/documents");
      setDocuments(items);
      const candidate = items.find((item) => item.id !== documentId && item.status === "ready");
      if (candidate) await loadSecondary(candidate.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "第二份资料加载失败");
    }
  }

  async function loadSecondary(id: number, focus: DocumentSourceFocus | null = null) {
    setSecondaryContent(null);
    setSecondarySourceFocus(focus);
    try {
      const next = await api.get<DocumentContent>(`/api/documents/${id}/content`);
      const requestedBlock = focus ? findSourceBlock(next, focus) : undefined;
      setSecondaryContent(next);
      setSecondaryActiveBlockKey(requestedBlock?.block_key || next.blocks[0]?.block_key || "");
      setSecondaryZoom(100);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "第二份资料加载失败");
    }
  }

  if (error && !content) return <section className="document-workspace document-workspace--state"><button className="back-link" onClick={onBack}>← 返回资料库</button><div className="workspace-reader-error" role="alert"><strong>资料没有打开</strong><p>{error}</p></div></section>;
  if (!content) return <section className="document-workspace document-workspace--state" aria-busy="true"><div className="document-loading"><span/><strong>正在整理资料结构</strong><small>读取页、段落、工作表与幻灯片…</small></div></section>;

  const { document: source, blocks } = content;
  const bodyClass = ["document-workspace__body", !outlineOpen ? "is-outline-collapsed" : !outlinePinned ? "is-outline-peeking" : "", splitOpen ? "is-split" : "", !notesOpen ? "is-notes-collapsed" : ""].filter(Boolean).join(" ");
  const activeBookmark = annotations.find((annotation) => annotation.kind === "tag" && annotation.block_key === activeBlockKey);
  const tools: Array<[AnnotationTool, string]> = [["select", "选择"], ["highlight", "高亮"], ["pen", "自由笔"], ["marker", "荧光笔"], ["rectangle", "矩形"], ["ellipse", "椭圆"], ["eraser", "橡皮擦"]];

  return <section className="document-workspace document-workspace--opening">
    <div
      className="document-annotation-toolbar workspace-auto-toolbar"
      role="toolbar"
      aria-label="资料批注工具"
      data-toolbar-auto-hide={String(workspaceToolbar.autoHide)}
      data-toolbar-visible={String(workspaceToolbar.visible)}
      {...workspaceToolbar.toolbarProps}
    >
      {onCourseNavigationChange && <button className="document-course-navigation-button" aria-label={courseNavigationOpen ? "关闭课程导航" : "打开课程导航"} aria-expanded={courseNavigationOpen} onClick={() => onCourseNavigationChange(!courseNavigationOpen)}>☰</button>}
      <button className="document-toolbar-back" aria-label="返回资料库" title="返回资料库" onClick={onBack}>←</button>
      <i />
      <button aria-label={outlinePinned ? "隐藏章节目录" : "显示章节目录"} className={outlinePinned ? "is-active" : ""} onClick={() => { const next = !outlinePinned; setOutlinePinned(next); setOutlineOpen(next); }}>目录</button>
      <button aria-label={activeBookmark ? "移除当前书签" : "添加当前书签"} className={activeBookmark ? "is-active" : ""} onClick={() => void toggleBookmark()}>书签</button>
      <button aria-label="撤销上次编辑" title="撤销 · Ctrl+Z" disabled={!history.can_undo || saveStatus === "saving"} onClick={() => void moveRevision("undo")}>↶ 撤销</button>
      <button aria-label="重做上次编辑" title="重做 · Ctrl+Shift+Z" disabled={!history.can_redo || saveStatus === "saving"} onClick={() => void moveRevision("redo")}>↷ 重做</button>
      <i />
      {tools.map(([value, label]) => <button key={value} aria-label={label} className={tool === value ? "is-active" : ""} onClick={() => chooseTool(value)}>{label}</button>)}
      <i />
      <button aria-label="缩小资料" onClick={() => setZoom((value) => clampZoom(value - 10))}>−</button>
      <button aria-label="重置缩放" className="reader-zoom-value" onClick={() => setZoom(100)}>{zoom}%</button>
      <button aria-label="放大资料" onClick={() => setZoom((value) => clampZoom(value + 10))}>＋</button>
      <button aria-label={splitOpen ? "关闭分栏阅读" : "打开分栏阅读"} className={splitOpen ? "is-active" : ""} onClick={() => void toggleSplit()}>分栏</button>
      {onKnowledgeSplitChange && <button aria-label={knowledgeSplitOpen ? "关闭知识图谱分屏" : "分屏打开知识图谱"} className={knowledgeSplitOpen ? "is-active" : ""} onClick={() => { if (!knowledgeSplitOpen) { setSplitOpen(false); setSecondaryContent(null); setSecondarySourceFocus(null); } onKnowledgeSplitChange(!knowledgeSplitOpen); }}>图谱</button>}
      <button aria-label={notesOpen ? "隐藏批注侧栏" : "显示批注侧栏"} className={notesOpen ? "is-active" : ""} onClick={() => setNotesOpen((value) => !value)}>批注</button>
      <span>{selection ? `已选择：${selection.quote.slice(0, 30)}` : activeBlock ? blockLabel(source.format, activeBlock) : "选择内容后可使用上方菜单或添加高亮"}</span>
      <div className="document-save-state" data-state={saveStatus} title={source.filename}>{saveStatus === "saving" ? "保存中…" : saveStatus === "saved" ? "已保存" : saveStatus === "error" ? "保存失败" : "本地资料"}</div>
    </div>

    {error && <p className="error-message document-workspace__error" role="alert">{error}</p>}
    <div
      className={bodyClass}
      data-toolbar-clearance={!workspaceToolbar.autoHide ? "static" : workspaceToolbar.visible ? "visible" : "hidden"}
    >
      <div
        className="document-outline-hotspot"
        aria-hidden="true"
        data-disabled={String(courseNavigationOpen)}
        onMouseEnter={() => {
          outlineHoverRef.current = true;
          if (!courseNavigationOpen && !outlinePinned) setOutlineOpen(true);
        }}
        onMouseLeave={() => { outlineHoverRef.current = false; }}
      />
      <nav
        className="document-outline"
        aria-label="资料大纲"
        aria-hidden={!outlineOpen}
        onMouseEnter={() => { outlineHoverRef.current = true; setOutlineOpen(true); }}
        onMouseLeave={() => { outlineHoverRef.current = false; if (!outlinePinned) setOutlineOpen(false); }}
      >
        <header><strong>资料结构</strong><button aria-label="收起章节目录" onClick={() => { setOutlinePinned(false); setOutlineOpen(false); }}>×</button></header>
        <div className="document-outline-tree">
          <OutlineBranch nodes={outlineTree} activeBlockKey={activeBlockKey} collapsed={collapsedOutlineKeys} format={source.format} onSelect={selectOutlineBlock} onToggle={(blockKey) => {
            setCollapsedOutlineKeys((current) => {
              const next = new Set(current);
              if (next.has(blockKey)) next.delete(blockKey); else next.add(blockKey);
              return next;
            });
          }} />
        </div>
      </nav>

      <div
        ref={readersRef}
        className="document-readers"
        data-swapped={String(splitOpen && splitSwapped)}
        style={splitOpen ? { "--split-leading": `${splitLeading}%` } as CSSProperties : undefined}
      >
        <section className={`document-primary-pane ${splitOpen ? "document-split-pane is-split" : ""}`}>
          {splitOpen && <header>
            <label><span>主资料</span><strong title={source.title}>{source.title}</strong></label>
            <div><span>{zoom}%</span></div>
          </header>}
          <main ref={primaryStageRef} className="document-reader-stage" aria-label="主资料阅读区" onScroll={handleReaderScroll} data-document-id={documentId}>
            {primarySourceFocus && <LearningSourceBanner focus={primarySourceFocus} onDismiss={() => setPrimarySourceFocus(null)} />}
            <div className="document-reader-surface">
              <div className="document-reader-zoom" ref={readerSurfaceRef} data-zoom={zoom} style={{ zoom: zoom / 100 }}>
                <DocumentReader rawUrl={`${api.baseUrl}/api/documents/${source.id}/file`} format={source.format} blocks={blocks} activeBlockKey={activeBlockKey} onActivate={setActiveBlockKey} onRevise={revise} onSelect={setSelection} />
                <AnnotationOverlay surfaceRef={readerSurfaceRef} block={activeBlock} annotations={annotations} tool={tool} onCreate={addAnnotation} onErase={eraseAnnotation} />
              </div>
            </div>
          </main>
        </section>

        {splitOpen && <SplitDivider
          containerRef={readersRef}
          value={splitLeading}
          label="调整两份资料宽度"
          swapLabel="交换两份资料位置"
          onChange={setSplitLeading}
          onSwap={() => setSplitSwapped((value) => !value)}
        />}
        {splitOpen && <section className="document-split-pane" aria-label="第二份资料">
          <header>
            <label>第二份资料<select aria-label="选择第二份资料" value={secondaryContent?.document.id || ""} onChange={(event) => void loadSecondary(Number(event.target.value))}><option value="">选择资料</option>{documents.filter((item) => item.id !== documentId && item.status === "ready").map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <div><button aria-label="缩小第二份资料" onClick={() => setSecondaryZoom((value) => clampZoom(value - 10))}>−</button><span>{secondaryZoom}%</span><button aria-label="放大第二份资料" onClick={() => setSecondaryZoom((value) => clampZoom(value + 10))}>＋</button><button aria-label="关闭第二份资料" onClick={() => { setSplitOpen(false); setSecondaryContent(null); setSecondarySourceFocus(null); }}>×</button></div>
          </header>
          {secondaryContent ? <main ref={secondaryStageRef} className="document-reader-stage" aria-label="第二资料阅读区" onScroll={handleSecondaryReaderScroll}>
            {secondarySourceFocus && <LearningSourceBanner focus={secondarySourceFocus} onDismiss={() => setSecondarySourceFocus(null)} />}
            <div className="document-reader-surface"><div className="document-reader-zoom" data-zoom={secondaryZoom} style={{ zoom: secondaryZoom / 100 }}>
              <div className="document-secondary-title"><strong>{secondaryContent.document.title}</strong><small>{secondaryContent.document.filename}</small></div>
              <DocumentReader rawUrl={`${api.baseUrl}/api/documents/${secondaryContent.document.id}/file`} format={secondaryContent.document.format} blocks={secondaryContent.blocks} activeBlockKey={secondaryActiveBlockKey} onActivate={setSecondaryActiveBlockKey} onRevise={reviseSecondary} onSelect={() => undefined} />
            </div></div>
          </main> : <div className="document-split-empty">选择另一份资料开始并排阅读</div>}
        </section>}
      </div>

      {notesOpen && !splitOpen && <aside className="document-notes" aria-label="资料批注">
        <header><small>ANNOTATIONS</small><strong>批注记录</strong><button aria-label="收起批注侧栏" onClick={() => setNotesOpen(false)}>×</button></header>

        <div className="annotation-list">{annotations.length ? annotations.map((annotation) => <article key={annotation.id} data-kind={annotation.kind}>
          <i data-kind={annotation.kind}/>
          <button type="button" onClick={() => selectOutlineBlock(annotation.block_key)}><strong>{annotation.kind === "tag" ? "书签" : annotation.note || annotation.kind}</strong><p>{annotation.note || annotation.quote}</p></button>
          {annotation.kind === "tag" && <button type="button" aria-label="删除书签" onClick={() => void eraseAnnotation(annotation.id)}>×</button>}
        </article>) : <div className="annotation-empty"><span>⌁</span><p>高亮、圈画和书签会保存在这里。</p></div>}</div>
      </aside>}
    </div>
  </section>;
}
