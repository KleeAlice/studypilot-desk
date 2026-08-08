"""Vocabulary, mastery and review domain callables (Rust-owned routes)."""

from __future__ import annotations

from typing import Any

from ..domain import DomainContext, DomainResult, register, ok
from ..schemas import (
    MasteryEvidence,
    VocabularyCheckIn,
    VocabularyCreate,
    VocabularyReview,
)
from . import as_int


@register("vocabulary.list")
def vocabulary_list(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    course_id = as_int((query or {}).get("course_id"), "course_id")
    due_only = (query or {}).get("due_only") == "true"
    limit = as_int((query or {}).get("limit", 40), "limit")
    return ok(ctx.vocabulary.list_items(course_id, due_only=due_only, limit=limit))


@register("vocabulary.create")
def vocabulary_create(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = VocabularyCreate(**(body or {}))
    values = payload.model_dump()
    course_id = values.pop("course_id")
    return ok(ctx.vocabulary.create_item(course_id, values))


@register("vocabulary.review")
def vocabulary_review(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = VocabularyReview(**(body or {}))
    item_id = as_int((path or {}).get("item_id"), "item_id")
    return ok(ctx.vocabulary.review(item_id, payload.rating))


@register("vocabulary.check_in")
def vocabulary_check_in(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = VocabularyCheckIn(**(body or {}))
    return ok(
        ctx.vocabulary.check_in(
            payload.course_id,
            payload.local_date,
            reviewed_count=payload.reviewed_count,
        )
    )


@register("reviews")
def reviews(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    include_superseded = (query or {}).get("include_superseded") == "true"
    return ok(ctx.learning.list_reviews(include_superseded))


@register("mastery.evidence")
def mastery_evidence(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = MasteryEvidence(**(body or {}))
    knowledge_id = as_int((path or {}).get("knowledge_id"), "knowledge_id")
    return ok(
        ctx.learning.update_mastery(knowledge_id, payload.success, payload.weight)
    )
