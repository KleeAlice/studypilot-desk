import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { AgentPageContext } from "../agent/types";
import type { ApiClient } from "../services/api";
import { platform } from "../platform";


export interface SelectionActionContext {
  text: string;
  paragraphText: string;
  documentId?: number;
  blockKey: string;
  locator: Record<string, string | number | boolean | null>;
}

interface SelectionSnapshot extends SelectionActionContext {
  range: Range;
  paragraphElement: Element;
  left: number;
  top: number;
}

const paragraphSelector = [
  "p", "li", "blockquote", "pre", "td", "th", "dd", "dt",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "[data-selection-paragraph]", "[data-document-block]",
].join(",");

function textElement(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
}

function isIgnoredSelection(element: Element | null) {
  return Boolean(element?.closest(
    ".text-selection-toolbar, input, textarea, select, button, [contenteditable='true'], [role='textbox']",
  ));
}

function rangeRect(range: Range, fallback: Element) {
  const measured = (range as Range & {
    getBoundingClientRect?: () => DOMRect;
  }).getBoundingClientRect?.();
  if (measured && (measured.width > 0 || measured.height > 0)) return measured;
  return fallback.getBoundingClientRect();
}

function toolbarPosition(rect: Pick<DOMRect, "left" | "right" | "top" | "bottom">) {
  const estimatedWidth = 490;
  const left = Math.max(8, Math.min(
    window.innerWidth - estimatedWidth - 8,
    (rect.left + rect.right) / 2 - estimatedWidth / 2,
  ));
  const above = rect.top - 50;
  return {
    left: Math.max(8, left),
    top: above >= 8 ? above : rect.bottom + 10,
  };
}

async function writeClipboard(text: string) {
  try {
    await platform().clipboard.writeText(text);
    return;
  } catch {
    // The selection fallback below handles restricted browser contexts.
  }
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = (document as Document & {
    execCommand?: (command: string) => boolean;
  }).execCommand?.("copy");
  textarea.remove();
  if (!copied) throw new Error("当前环境无法写入剪贴板");
}

export function TextSelectionToolbar({
  api,
  courseId,
  context,
  onExplain,
}: {
  api: ApiClient;
  courseId: number;
  context: AgentPageContext;
  onExplain: (selection: SelectionActionContext) => void;
}) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [snapshot, setSnapshot] = useState<SelectionSnapshot | null>(null);
  const [status, setStatus] = useState("");
  const [busyAction, setBusyAction] = useState<"memo" | "vocabulary" | "">("");

  function captureSelection() {
    const selection = window.getSelection();
    const text = selection?.toString().trim() || "";
    if (!selection || selection.rangeCount !== 1 || selection.isCollapsed || !text) {
      setSnapshot(null);
      setStatus("");
      return;
    }
    const range = selection.getRangeAt(0);
    const anchorElement = textElement(selection.anchorNode || range.commonAncestorContainer);
    if (!anchorElement || isIgnoredSelection(anchorElement)) {
      setSnapshot(null);
      return;
    }
    const paragraphElement = anchorElement.closest(paragraphSelector) || anchorElement;
    const paragraphText = paragraphElement.textContent?.trim() || text;
    const rect = rangeRect(range, paragraphElement);
    const position = toolbarPosition(rect);
    const documentBlock = anchorElement.closest("[data-document-block]");
    setSnapshot({
      text,
      paragraphText,
      range: range.cloneRange(),
      paragraphElement,
      documentId: context.documentId,
      blockKey: documentBlock?.getAttribute("data-document-block") || context.blockKey || "",
      locator: context.locator || {},
      ...position,
    });
    setStatus("");
  }

  useEffect(() => {
    const capture = () => captureSelection();
    const onPointerDown = (event: PointerEvent) => {
      if (toolbarRef.current?.contains(event.target as Node)) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setSnapshot(null);
        setStatus("");
      }
    };
    document.addEventListener("mouseup", capture);
    document.addEventListener("keyup", capture);
    document.addEventListener("touchend", capture);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", capture);
    return () => {
      document.removeEventListener("mouseup", capture);
      document.removeEventListener("keyup", capture);
      document.removeEventListener("touchend", capture);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", capture);
    };
  }, [context.blockKey, context.documentId, context.locator]);

  function preserveSelection(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  function selectParagraph() {
    if (!snapshot) return;
    const range = document.createRange();
    range.selectNodeContents(snapshot.paragraphElement);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const text = selection?.toString().trim() || snapshot.paragraphText;
    const rect = rangeRect(range, snapshot.paragraphElement);
    setSnapshot({
      ...snapshot,
      text,
      paragraphText: text,
      range: range.cloneRange(),
      ...toolbarPosition(rect),
    });
    setStatus("已选中本段");
  }

  async function copySelection() {
    if (!snapshot) return;
    try {
      await writeClipboard(snapshot.text);
      setStatus("已复制");
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "复制失败");
    }
  }

  async function addMemo() {
    if (!snapshot || busyAction) return;
    setBusyAction("memo");
    setStatus("");
    try {
      await api.post("/api/notes", {
        title: snapshot.text.slice(0, 48),
        payload: {
          content: snapshot.text,
          source_view: context.view,
          document_id: snapshot.documentId,
          block_key: snapshot.blockKey,
          locator: snapshot.locator,
          source_kind: "selection",
        },
      });
      setStatus("已加入备忘录");
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "加入备忘录失败");
    } finally {
      setBusyAction("");
    }
  }

  async function addVocabulary() {
    if (!snapshot || busyAction) return;
    setBusyAction("vocabulary");
    setStatus("");
    try {
      await api.post("/api/vocabulary", {
        course_id: courseId,
        language_tag: context.languageTag || "",
        term: snapshot.text,
        meaning: "",
        example: snapshot.paragraphText === snapshot.text ? "" : snapshot.paragraphText,
        source_kind: "selection",
        source_id: `${context.view}:${snapshot.documentId || ""}`,
        document_id: snapshot.documentId,
        block_key: snapshot.blockKey,
        locator: snapshot.locator,
      });
      setStatus("已加入生词本");
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "加入生词本失败");
    } finally {
      setBusyAction("");
    }
  }

  if (!snapshot) return null;

  return (
    <div
      ref={toolbarRef}
      className="text-selection-toolbar"
      role="toolbar"
      aria-label="文本选择操作"
      style={{ position: "fixed", left: snapshot.left, top: snapshot.top }}
      onMouseDown={preserveSelection}
    >
      <div>
        <button type="button" onClick={() => void copySelection()}>复制</button>
        <button type="button" onClick={selectParagraph}>全选本段</button>
        <button type="button" onClick={() => onExplain(snapshot)}>AI 解释</button>
        <button type="button" disabled={Boolean(busyAction)} onClick={() => void addMemo()}>
          {busyAction === "memo" ? "保存中…" : "加入备忘录"}
        </button>
        <button type="button" disabled={Boolean(busyAction)} onClick={() => void addVocabulary()}>
          {busyAction === "vocabulary" ? "保存中…" : "加入生词本"}
        </button>
      </div>
      {status && <span role="status">{status}</span>}
    </div>
  );
}
