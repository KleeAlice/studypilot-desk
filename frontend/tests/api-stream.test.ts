import { afterEach, expect, test, vi } from "vitest";
import { ApiClient } from "../src/services/api";


afterEach(() => vi.unstubAllGlobals());

test("decodes partial NDJSON chunks and exposes deltas before the final event", async () => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('{"type":"start"}\n{"type":"del'));
      controller.enqueue(encoder.encode('ta","text":"first "}\n{"type":"delta","text":"second"}\n'));
      controller.enqueue(encoder.encode('{"type":"final","data":{"message":{"content":"first second"}}}\n'));
      controller.close();
    },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, {
    status: 200,
    headers: { "content-type": "application/x-ndjson" },
  })));
  const client = new ApiClient("http://127.0.0.1:9000");
  const events: Array<{ type: string; text?: string }> = [];

  await client.streamNDJSON(
    "/api/agent/threads/1/messages/stream",
    { message: "hello" },
    (event) => { events.push(event as { type: string; text?: string }); },
  );

  expect(events.map((event) => event.type)).toEqual([
    "start",
    "delta",
    "delta",
    "final",
  ]);
  expect(events[1]?.text).toBe("first ");
});
