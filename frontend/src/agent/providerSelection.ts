const STORAGE_KEY = "studypilot.selected-provider";
export const PROVIDER_SELECTION_EVENT = "studypilot:provider-selection-changed";

export function readProviderSelection(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function selectProviderGlobally(providerId: string): void {
  const normalized = String(providerId || "").trim();
  try {
    if (normalized) window.localStorage.setItem(STORAGE_KEY, normalized);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private browser shells.
  }
  window.dispatchEvent(new CustomEvent(PROVIDER_SELECTION_EVENT, {
    detail: { providerId: normalized },
  }));
}

export function providerSelectionFromEvent(event: Event): string {
  return String(
    (event as CustomEvent<{ providerId?: string }>).detail?.providerId || "",
  ).trim();
}
