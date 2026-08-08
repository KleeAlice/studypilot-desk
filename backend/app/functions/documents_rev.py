"""Document revision / annotation / highlight domain callables (Rust-owned)."""

from __future__ import annotations

from typing import Any

from ..domain import DomainContext, DomainResult, ok, register
from ..schemas import (
    DocumentAnnotationCreate,
    DocumentAnnotationUpdate,
    DocumentRevisionCreate,
    HighlightCreate,
)
from . import as_int


def _doc(path: dict[str, Any] | None) -> int:
    return as_int((path or {}).get("document_id"), "document_id")


def _annotation(path: dict[str, Any] | None) -> int:
    return as_int((path or {}).get("annotation_id"), "annotation_id")


@register("documents.revisions.list")
def documents_revisions_list(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.documents.revision_state(_doc(path)))


@register("documents.revisions.create")
def documents_revisions_create(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = DocumentRevisionCreate(**(body or {}))
    return ok(ctx.documents.add_revision(_doc(path), payload.model_dump()))


@register("documents.revisions.undo")
def documents_revisions_undo(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.documents.undo_revision(_doc(path)))


@register("documents.revisions.redo")
def documents_revisions_redo(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.documents.redo_revision(_doc(path)))


@register("documents.annotations.list")
def documents_annotations_list(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.documents.list_annotations(_doc(path)))


@register("documents.annotations.create")
def documents_annotations_create(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = DocumentAnnotationCreate(**(body or {}))
    return ok(ctx.documents.add_annotation(_doc(path), payload.model_dump()))


@register("documents.annotations.update")
def documents_annotations_update(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = DocumentAnnotationUpdate(**(body or {}))
    return ok(
        ctx.documents.update_annotation(
            _doc(path), _annotation(path), payload.model_dump(exclude_unset=True)
        )
    )


@register("documents.annotations.delete")
def documents_annotations_delete(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    ctx.documents.delete_annotation(_doc(path), _annotation(path))
    return DomainResult(status=204)


@register("documents.highlights.create")
def documents_highlights_create(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = HighlightCreate(**(body or {}))
    return ok(ctx.documents.add_highlight(_doc(path), payload.model_dump()))
