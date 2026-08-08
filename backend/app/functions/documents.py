"""Document mutation domain callables (Rust-owned routes)."""

from __future__ import annotations

from typing import Any

from ..domain import DomainContext, DomainResult, register, ok
from ..schemas import DocumentUpdate
from . import as_int


@register("documents.update")
def documents_update(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = DocumentUpdate(**(body or {}))
    return ok(
        ctx.documents.update_document(
            as_int((path or {}).get("document_id"), "document_id"),
            payload.model_dump(exclude_unset=True),
        )
    )


@register("documents.delete")
def documents_delete(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    ctx.documents.trash_document(
        as_int((path or {}).get("document_id"), "document_id")
    )
    return DomainResult(status=204)


@register("documents.restore")
def documents_restore(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(
        ctx.documents.restore_document(
            as_int((path or {}).get("document_id"), "document_id")
        )
    )
