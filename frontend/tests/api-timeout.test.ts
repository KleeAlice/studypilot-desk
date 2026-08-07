import { afterEach, describe, expect, test, vi } from "vitest";
import { ApiClient } from "../src/services/api";

describe("ApiClient request timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("aborts a stalled local request with an actionable error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));
    const client = new ApiClient("http://127.0.0.1:8765");

    const request = client.get("/api/documents/1", { timeoutMs: 250 });
    const rejection = expect(request).rejects.toMatchObject({
      code: "REQUEST_TIMEOUT",
      message: "本地服务响应时间较长，请稍后重试",
    });
    await vi.advanceTimersByTimeAsync(250);
    await rejection;
  });
});
