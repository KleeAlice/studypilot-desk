export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code = "REQUEST_FAILED",
    public readonly status = 0,
    public readonly details: unknown = null,
  ) {
    super(message);
  }
}

export interface DownloadArtifact {
  bytes: Uint8Array;
  filename: string;
  mediaType: string;
}

export interface ApiRequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class ApiClient {
  constructor(public readonly baseUrl: string) {}

  async get<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(path, {}, options);
  }


  async streamNDJSON<T>(
    path: string,
    body: unknown,
    onEvent: (event: T) => void | Promise<void>,
    options: ApiRequestOptions = {},
  ): Promise<void> {
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = options.timeoutMs && options.timeoutMs > 0
      ? window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, options.timeoutMs)
      : undefined;
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
        signal: controller.signal,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        const error = payload?.error;
        throw new ApiError(
          error?.message || `请求失败（${response.status}）`,
          error?.code,
          response.status,
          error?.details,
        );
      }
      if (!response.body) {
        throw new ApiError("本地服务未返回流式内容", "STREAM_UNAVAILABLE", response.status);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const consume = async (line: string) => {
        const normalized = line.trim();
        if (!normalized) return;
        let event: T & { type?: string; error?: { code?: string; message?: string; status_code?: number } };
        try {
          event = JSON.parse(normalized);
        } catch {
          throw new ApiError("收到无法解析的流式响应", "STREAM_INVALID", response.status);
        }
        if (event.type === "error") {
          throw new ApiError(
            event.error?.message || "回复生成失败",
            event.error?.code || "AGENT_STREAM_ERROR",
            event.error?.status_code || 500,
          );
        }
        await onEvent(event);
      };
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          await consume(buffer.slice(0, newline));
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
        }
        if (done) break;
      }
      if (buffer.trim()) await consume(buffer);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (timedOut) {
        throw new ApiError("本地服务响应时间较长，请稍后重试", "REQUEST_TIMEOUT", 0, String(error));
      }
      if (controller.signal.aborted) {
        throw new ApiError("请求已取消", "REQUEST_ABORTED", 0, String(error));
      }
      throw new ApiError("无法连接本地服务，请重新启动 StudyPilot Desk", "NETWORK_ERROR", 0, String(error));
    } finally {
      if (timeout !== undefined) window.clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
  async post<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }, options);
  }

  async patch<T>(path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(path, { method: "PATCH", body: JSON.stringify(body) }, options);
  }

  async put<T>(path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>(path, { method: "PUT", body: JSON.stringify(body) }, options);
  }

  async delete<T = void>(path: string): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, { method: "DELETE" });
    const payload = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (response.ok) return payload.data as T;
    const error = payload?.error;
    throw new ApiError(error?.message || `删除失败（${response.status}）`, error?.code, response.status, error?.details);
  }

  async download(path: string, body: unknown): Promise<DownloadArtifact> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
    } catch (error) {
      throw new ApiError("无法连接本地服务，请重新启动 StudyPilot Desk", "NETWORK_ERROR", 0, String(error));
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = payload?.error;
      throw new ApiError(error?.message || `导出失败（${response.status}）`, error?.code, response.status, error?.details);
    }
    const disposition = response.headers.get("content-disposition") || "";
    const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const fallbackName = disposition.match(/filename="?([^";]+)"?/i)?.[1] || "knowledge-export";
    let filename = fallbackName;
    if (encodedName) {
      try { filename = decodeURIComponent(encodedName); }
      catch { filename = fallbackName; }
    }
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      filename,
      mediaType: response.headers.get("content-type")?.split(";")[0] || "application/octet-stream",
    };
  }

  private async request<T>(path: string, init: RequestInit = {}, options: ApiRequestOptions = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
    const controller = new AbortController();
    let timedOut = false;
    const abortFromCaller = () => controller.abort();
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = options.timeoutMs && options.timeoutMs > 0
      ? window.setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs)
      : undefined;
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...init, headers, signal: controller.signal });
    } catch (error) {
      if (timedOut) throw new ApiError("本地服务响应时间较长，请稍后重试", "REQUEST_TIMEOUT", 0, String(error));
      if (controller.signal.aborted) throw new ApiError("请求已取消", "REQUEST_ABORTED", 0, String(error));
      throw new ApiError("无法连接本地服务，请重新启动 StudyPilot Desk", "NETWORK_ERROR", 0, String(error));
    } finally {
      if (timeout !== undefined) window.clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortFromCaller);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = payload?.error;
      throw new ApiError(error?.message || `请求失败（${response.status}）`, error?.code, response.status, error?.details);
    }
    return payload.data as T;
  }
}
