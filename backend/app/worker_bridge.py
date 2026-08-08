"""Private stdio adapter for the Rust-owned desktop HTTP host.

Rust Actix-Web owns every HTTP route, auth and request parsing.  This process
runs plain domain functions (see ``backend.app.functions``) — there is no
FastAPI, Starlette or ASGI routing involved.
"""

from __future__ import annotations

import asyncio
import base64
import json
import multiprocessing
import os
import queue
import sys
from typing import Any

from backend.app.domain import (
    DOMAIN_FUNCTIONS,
    DomainContext,
    build_context,
    call as domain_call,
)


def to_wire(request_id: int, status: int, headers: list[tuple[str, str]], body: bytes) -> dict[str, Any]:
    return {
        "id": request_id,
        "status": status,
        "headers": headers,
        "body_base64": base64.b64encode(body).decode("ascii"),
    }


async def handle_stream(payload: dict[str, Any], ctx: DomainContext, write: Any) -> None:
    """Run a generator-backed domain function and stream its events as NDJSON.

    Each yielded event dict is forwarded to Rust as ``{"id":..., "event":...}``;
    a final response frame signals the end of the stream.
    """
    request_id = payload.get("id", 0)
    function = payload.get("function", "")
    fn = DOMAIN_FUNCTIONS.get(function)
    if fn is None:
        body = json.dumps(
            {"error": {"code": "ROUTE_NOT_FOUND", "message": f"领域函数不存在：{function}"}},
            ensure_ascii=False,
        ).encode("utf-8")
        await write(to_wire(request_id, 404, [("content-type", "application/json; charset=utf-8")], body))
        return

    events: queue.Queue[Any] = queue.Queue()

    def producer() -> None:
        try:
            for event in fn(ctx, **(payload.get("args") or {})):
                events.put(event)
        except Exception as exc:  # pragma: no cover - stream integrity
            events.put(
                {"type": "error", "error": {"code": "AGENT_STREAM_ERROR", "message": str(exc)}}
            )
        finally:
            events.put(None)

    await asyncio.to_thread(producer)
    while True:
        event = await asyncio.to_thread(events.get)
        if event is None:
            break
        await write({"id": request_id, "event": event})
    await write(
        {
            "id": request_id,
            "status": 200,
            "headers": [
                ("content-type", "application/x-ndjson; charset=utf-8"),
                ("cache-control", "no-cache, no-transform"),
                ("x-content-type-options", "nosniff"),
            ],
            "body_base64": "",
        }
    )


async def serve() -> None:
    ctx = build_context(
        os.environ.get("STUDYPILOT_DATA_DIR", "."),
        os.environ.get("STUDYPILOT_SESSION_TOKEN", ""),
    )
    write_lock = asyncio.Lock()

    async def write(payload: dict[str, Any]) -> None:
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        async with write_lock:
            await asyncio.to_thread(sys.stdout.write, encoded + "\n")
            await asyncio.to_thread(sys.stdout.flush)

    await write({"kind": "ready"})
    tasks: set[asyncio.Task[None]] = set()

    async def handle(payload: dict[str, Any]) -> None:
        try:
            kind = payload.get("kind")
            if kind == "call":
                result = await asyncio.to_thread(
                    domain_call,
                    ctx,
                    payload.get("function", ""),
                    payload.get("args") or {},
                )
                await write(
                    to_wire(
                        payload.get("id", 0),
                        result.status,
                        result.headers,
                        result.body,
                    )
                )
            elif kind == "stream":
                await handle_stream(payload, ctx, write)
            else:
                body = json.dumps(
                    {"error": {"code": "BAD_REQUEST", "message": "未知的协议消息"}},
                    ensure_ascii=False,
                ).encode("utf-8")
                await write(
                    to_wire(
                        payload.get("id", 0),
                        400,
                        [("content-type", "application/json; charset=utf-8")],
                        body,
                    )
                )
        except Exception as error:  # pragma: no cover - defence for protocol integrity
            await write(
                to_wire(
                    payload.get("id", 0),
                    500,
                    [("content-type", "application/json; charset=utf-8")],
                    json.dumps(
                        {"error": {"code": "PYTHON_ADAPTER_ERROR", "message": str(error)}},
                        ensure_ascii=False,
                    ).encode("utf-8"),
                )
            )

    while line := await asyncio.to_thread(sys.stdin.buffer.readline):
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        task = asyncio.create_task(handle(payload))
        tasks.add(task)
        task.add_done_callback(tasks.discard)
    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


def main() -> None:
    multiprocessing.freeze_support()
    asyncio.run(serve())


if __name__ == "__main__":
    main()
