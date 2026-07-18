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

export class ApiClient {
  constructor(public readonly baseUrl: string) {}

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) });
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: "PUT", body: JSON.stringify(body) });
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

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    } catch (error) {
      throw new ApiError("无法连接本地服务，请重新启动 StudyPilot Desk", "NETWORK_ERROR", 0, String(error));
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = payload?.error;
      throw new ApiError(error?.message || `请求失败（${response.status}）`, error?.code, response.status, error?.details);
    }
    return payload.data as T;
  }
}
