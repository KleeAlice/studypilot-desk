import type { AgentMode } from "../agent/types";
import type { DocumentLocator } from "./types";

export interface DocumentSourceFocus {
  documentId: number;
  blockKey: string;
  locator: DocumentLocator;
  locationLabel?: string;
  quote?: string;
  originMode?: AgentMode;
  returnRoute?: string;
}

export interface DocumentSourceOpenDetail {
  focus: DocumentSourceFocus;
  placement: "primary" | "secondary";
}

const FOCUS_PREFIX = "studypilot.document.locator.";

export function documentSourceFocusKey(documentId: number) {
  return `${FOCUS_PREFIX}${documentId}`;
}

export function storeDocumentSourceFocus(focus: DocumentSourceFocus) {
  window.sessionStorage.setItem(documentSourceFocusKey(focus.documentId), JSON.stringify(focus));
}

export function takeDocumentSourceFocus(documentId: number): DocumentSourceFocus | null {
  const key = documentSourceFocusKey(documentId);
  const raw = window.sessionStorage.getItem(key);
  if (!raw) return null;
  window.sessionStorage.removeItem(key);
  try {
    const parsed = JSON.parse(raw) as Partial<DocumentSourceFocus>;
    return {
      documentId,
      blockKey: String(parsed.blockKey || ""),
      locator: parsed.locator && typeof parsed.locator === "object" ? parsed.locator : {},
      locationLabel: typeof parsed.locationLabel === "string" ? parsed.locationLabel : undefined,
      quote: typeof parsed.quote === "string" ? parsed.quote : undefined,
      originMode: parsed.originMode === "learning" ? "learning" : parsed.originMode === "assistant" ? "assistant" : undefined,
      returnRoute: typeof parsed.returnRoute === "string" ? parsed.returnRoute : undefined,
    };
  } catch {
    return null;
  }
}

export function announceDocumentSource(detail: DocumentSourceOpenDetail) {
  window.dispatchEvent(new CustomEvent<DocumentSourceOpenDetail>("studypilot:open-document-source", { detail }));
}
