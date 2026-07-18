import { afterEach, expect, test, vi } from "vitest";
import { ApiClient } from "../src/services/api";

afterEach(() => vi.unstubAllGlobals());

test("downloads binary exports and decodes the RFC 5987 filename", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: {
      "content-type": "image/png",
      "content-disposition": "attachment; filename=\"fallback.png\"; filename*=UTF-8''%E6%A8%A1%E5%9E%8B-%E7%94%BB%E5%B8%83.png",
    },
  })));
  const client = new ApiClient("http://127.0.0.1:9000");

  const artifact = await client.download("/api/export", { format: "png" });

  expect(artifact.filename).toBe("模型-画布.png");
  expect(artifact.mediaType).toBe("image/png");
  expect([...artifact.bytes]).toEqual([1, 2, 3]);
});

test("surfaces the API error envelope when a binary export fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    error: { code: "NOTEBOOK_NOT_FOUND", message: "知识笔记不存在" },
  }), { status: 404, headers: { "content-type": "application/json" } })));
  const client = new ApiClient("http://127.0.0.1:9000");

  await expect(client.download("/api/export", { format: "md" })).rejects.toEqual(
    expect.objectContaining({ code: "NOTEBOOK_NOT_FOUND", status: 404, message: "知识笔记不存在" }),
  );
});
