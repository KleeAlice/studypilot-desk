"""Language learning domain callables (Rust-owned routes)."""

from __future__ import annotations

from typing import Any

from ..domain import DomainContext, DomainResult, register, ok
from ..schemas import LanguageLessonComplete, LanguagePracticeCreate
from . import as_int


def _course_id(path: dict[str, Any] | None) -> int:
    return as_int((path or {}).get("course_id"), "course_id")


def _lesson_id(path: dict[str, Any] | None) -> str:
    return (path or {}).get("lesson_id", "")


@register("language.packs")
def language_packs(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.language_learning.packs())


@register("language.materials")
def language_materials(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    q = (query or {}).get("q", "")
    return ok(ctx.language_learning.materials(_course_id(path), query=q))


@register("language.journey")
def language_journey(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.language_learning.journey(_course_id(path)))


@register("language.start")
def language_start(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.language_learning.start(_course_id(path)))


@register("language.lesson")
def language_lesson(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.language_learning.lesson(_course_id(path), _lesson_id(path)))


@register("language.complete_lesson")
def language_complete_lesson(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = LanguageLessonComplete(**(body or {}))
    return ok(
        ctx.language_learning.complete_lesson(
            _course_id(path), _lesson_id(path), payload.model_dump()
        )
    )


@register("language.overview")
def language_overview(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.language_learning.overview(_course_id(path)))


@register("language.practice")
def language_practice(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = LanguagePracticeCreate(**(body or {}))
    return ok(
        ctx.language_learning.record_session(
            _course_id(path), payload.model_dump(exclude_none=True)
        )
    )


@register("language.sessions")
def language_sessions(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    limit = as_int((query or {}).get("limit", 100), "limit")
    return ok(ctx.language_learning.list_sessions(_course_id(path), limit=limit))
