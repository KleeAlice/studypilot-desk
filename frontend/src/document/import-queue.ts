import type { ImportQueueItem } from "./types";

export type ImportAction =
  | { type: "enqueue"; items: ImportQueueItem[] }
  | { type: "start"; id: string }
  | { type: "finish"; id: string }
  | { type: "fail"; id: string; message: string }
  | { type: "dismiss"; id: string }
  | { type: "dismiss_completed" };

let sequence = 0;

export function createImportItems(files: File[]): ImportQueueItem[] {
  return files.map((file) => ({
    id: `import-${Date.now()}-${sequence++}`,
    file,
    state: "queued",
    message: "等待导入",
  }));
}

export function importQueueReducer(state: ImportQueueItem[], action: ImportAction): ImportQueueItem[] {
  if (action.type === "enqueue") return [...action.items, ...state].slice(0, 24);
  if (action.type === "dismiss") return state.filter((item) => item.id !== action.id);
  if (action.type === "dismiss_completed") return state.filter((item) => item.state !== "done");
  return state.map((item) => {
    if (item.id !== action.id) return item;
    if (action.type === "start") return { ...item, state: "uploading", message: "正在解析…" };
    if (action.type === "finish") return { ...item, state: "done", message: "导入完成" };
    return { ...item, state: "error", message: action.message };
  });
}
