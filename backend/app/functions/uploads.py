"""Multipart upload domain callables (Rust-owned routes).

Rust forwards the raw request body (base64) plus the Content-Type header; the
multipart payload is parsed here with python-multipart.  Routing, auth and the
HTTP envelope stay in Rust.
"""

from __future__ import annotations

import base64
import json
from typing import Any
from uuid import uuid4

from ..domain import DomainContext, DomainResult, ok, register
from ..errors import AppError
from ..services.appearance import MAX_WALLPAPER_BYTES
from ..services.media import MAX_IMAGE_BYTES


def parse_multipart(
    raw: bytes, content_type: str
) -> tuple[list[tuple[str, str]], list[tuple[str, bytes, str, str]]]:
    from python_multipart.multipart import MultipartParser, parse_options_header

    _, options = parse_options_header(content_type)
    boundary = options.get(b"boundary")
    if not boundary:
        raise AppError("BAD_REQUEST", "缺少 multipart boundary", 400)
    state = {
        "hf": bytearray(),
        "hv": bytearray(),
        "name": "",
        "filename": "",
        "part_content_type": "",
        "data": bytearray(),
    }
    fields: list[tuple[str, str]] = []
    files: list[tuple[str, bytes, str, str]] = []

    def flush() -> None:
        if state["name"] or state["filename"]:
            data = bytes(state["data"])
            if state["filename"]:
                files.append(
                    (state["name"], data, state["filename"], state["part_content_type"])
                )
            else:
                fields.append((state["name"], data.decode("utf-8", "replace")))
            state["name"] = state["filename"] = state["part_content_type"] = ""
            state["data"] = bytearray()

    def part_begin() -> None:
        state["hf"] = bytearray()
        state["hv"] = bytearray()
        state["name"] = state["filename"] = state["part_content_type"] = ""
        state["data"] = bytearray()

    def header_begin() -> None:
        state["hf"] = bytearray()
        state["hv"] = bytearray()

    def header_field(data: bytes, start: int, end: int) -> None:
        state["hf"] += data[start:end]

    def header_value(data: bytes, start: int, end: int) -> None:
        state["hv"] += data[start:end]

    def header_end() -> None:
        key = state["hf"].decode("latin-1").strip().lower()
        value = state["hv"].decode("latin-1").strip()
        if key == "content-disposition":
            _, disposition = parse_options_header(value)
            state["name"] = (disposition.get(b"name") or b"").decode("utf-8", "replace")
            state["filename"] = (disposition.get(b"filename") or b"").decode("utf-8", "replace")
        elif key == "content-type":
            state["part_content_type"] = value
        state["hf"] = bytearray()
        state["hv"] = bytearray()

    def part_data(data: bytes, start: int, end: int) -> None:
        state["data"] += data[start:end]

    def part_end() -> None:
        flush()

    def end() -> None:
        flush()

    parser = MultipartParser(
        boundary,
        {
            "on_part_begin": part_begin,
            "on_header_begin": header_begin,
            "on_header_field": header_field,
            "on_header_value": header_value,
            "on_header_end": header_end,
            "on_headers_finished": lambda: None,
            "on_part_data": part_data,
            "on_part_end": part_end,
            "on_end": end,
        },
    )
    parser.write(raw)
    parser.finalize()
    return fields, files


def _body_bytes(body: Any) -> bytes:
    if not isinstance(body, str):
        raise AppError("BAD_REQUEST", "缺少上传内容", 400)
    return base64.b64decode(body)


def _envelope(status: int, data: Any, meta: dict[str, Any] | None = None) -> DomainResult:
    payload: dict[str, Any] = {"data": data}
    if meta is not None:
        payload["meta"] = meta
    encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return DomainResult(
        status=status,
        headers=[("content-type", "application/json; charset=utf-8")],
        body=encoded,
    )


@register("settings.wallpaper.upload")
def wallpaper_upload(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    content_type = (query or {}).get("content_type", "")
    fields, files = parse_multipart(_body_bytes(body), content_type)
    if not files:
        raise AppError("BAD_REQUEST", "缺少上传的图片", 400)
    _, content, filename, _ = files[0]
    if len(content) > MAX_WALLPAPER_BYTES:
        raise AppError("TOO_LARGE", "壁纸图片过大", 413)
    return ok(ctx.appearance.save_wallpaper(filename or "wallpaper", content))


@register("media.images.upload")
def media_images_upload(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    content_type = (query or {}).get("content_type", "")
    fields, files = parse_multipart(_body_bytes(body), content_type)
    if not files:
        raise AppError("BAD_REQUEST", "缺少上传的图片", 400)
    _, content, filename, _ = files[0]
    if len(content) > MAX_IMAGE_BYTES:
        raise AppError("TOO_LARGE", "图片过大", 413)
    asset = ctx.media.save_image(filename or "image", content)
    return ok(ctx.media.public(asset))


@register("documents.import")
def documents_import(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    content_type = (query or {}).get("content_type", "")
    fields, files = parse_multipart(_body_bytes(body), content_type)
    if not files:
        raise AppError("BAD_REQUEST", "缺少上传的文档", 400)
    _, content, filename, file_type = files[0]
    source_created_at = dict(fields).get("source_created_at")
    item, deduplicated = ctx.documents.import_bytes(
        filename or "document",
        file_type or "application/octet-stream",
        content,
        source_created_at,
    )
    return _envelope(200 if deduplicated else 201, item, {"deduplicated": deduplicated})


@register("backups.restore")
def backups_restore(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    content_type = (query or {}).get("content_type", "")
    fields, files = parse_multipart(_body_bytes(body), content_type)
    if not files:
        raise AppError("BAD_REQUEST", "缺少上传的备份文件", 400)
    _, content, _, _ = files[0]
    overwrite = dict(fields).get("overwrite") == "true"
    ctx.backups.backup_dir.mkdir(parents=True, exist_ok=True)
    temporary = ctx.backups.backup_dir / f".restore-upload-{uuid4().hex}.zip"
    try:
        temporary.write_bytes(content)
        return ok(ctx.backups.restore(temporary, overwrite=overwrite))
    finally:
        temporary.unlink(missing_ok=True)
