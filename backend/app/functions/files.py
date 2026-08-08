"""File download domain callables (Rust-owned routes).

Each function streams the underlying file through a ``DomainResult``; Rust
relays status, headers and body verbatim to the renderer.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import quote

from ..domain import DomainContext, DomainResult, ok, register
from . import as_int


def file_result(content: bytes, media_type: str, filename: str, inline: bool) -> DomainResult:
    encoded = quote(filename or "")
    disposition_type = "inline" if inline else "attachment"
    return DomainResult(
        status=200,
        headers=[
            ("content-type", media_type),
            ("content-length", str(len(content))),
            (
                "content-disposition",
                f'{disposition_type}; filename="{encoded}"; filename*=UTF-8\'\'{encoded}',
            ),
            ("cache-control", "no-store"),
        ],
        body=content,
    )


def _read(path: Path) -> bytes:
    return path.read_bytes()


@register("documents.file")
def documents_file(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    source, media_type, filename = ctx.documents.original_file(
        as_int((path or {}).get("document_id"), "document_id")
    )
    return file_result(_read(source), media_type, filename, inline=True)


@register("documents.export")
def documents_export(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    fmt = (body or {}).get("format", "source")
    content, filename, media_type = ctx.documents.export_document(
        as_int((path or {}).get("document_id"), "document_id"), fmt
    )
    return file_result(content, media_type, filename, inline=False)


@register("settings.wallpaper.image")
def wallpaper_image(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    source, media_type = ctx.appearance.wallpaper()
    return file_result(_read(source), media_type, source.name, inline=True)


@register("settings.wallpaper.clear")
def wallpaper_clear(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.appearance.clear_wallpaper())


@register("media.images.get")
def media_images_get(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    asset = ctx.media.get((path or {}).get("asset_id", ""))
    return file_result(
        _read(Path(asset["path"])), asset["media_type"], asset["filename"], inline=True
    )


@register("media.course_image")
def media_course_image(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    asset = ctx.media.get_for_course(
        (path or {}).get("asset_id", ""),
        as_int((path or {}).get("course_id"), "course_id"),
    )
    return file_result(
        _read(Path(asset["path"])), asset["media_type"], asset["filename"], inline=True
    )


@register("notebooks.export")
def notebooks_export(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    fmt = (body or {}).get("format", "png")
    canvas_width = as_int((body or {}).get("canvas_width", 1800), "canvas_width")
    canvas_height = as_int((body or {}).get("canvas_height", 1100), "canvas_height")
    artifact = ctx.exports.export(
        as_int((path or {}).get("course_id"), "course_id"),
        as_int((path or {}).get("notebook_id"), "notebook_id"),
        fmt,
        canvas_width,
        canvas_height,
    )
    return file_result(artifact.content, artifact.media_type, artifact.filename, inline=False)


@register("knowledge.export")
def knowledge_export(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    fmt = (body or {}).get("format", "png")
    canvas_width = as_int((body or {}).get("canvas_width", 1800), "canvas_width")
    canvas_height = as_int((body or {}).get("canvas_height", 1100), "canvas_height")
    course_id = ctx.knowledge.active_course_id()
    notebook_id = ctx.notebooks.default_id(course_id)
    artifact = ctx.exports.export(course_id, notebook_id, fmt, canvas_width, canvas_height)
    return file_result(artifact.content, artifact.media_type, artifact.filename, inline=False)
