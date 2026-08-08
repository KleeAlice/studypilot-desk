"""Notebook domain callables (Rust-owned routes)."""

from __future__ import annotations

from typing import Any

from ..domain import DomainContext, DomainResult, register, ok
from ..schemas import (
    KnowledgeEdgeCreate,
    KnowledgeNodeCreate,
    KnowledgeNodeUpdate,
    NotebookCreate,
    NotebookUpdate,
)
from . import as_int


def _course_id(path: dict[str, Any] | None) -> int:
    return as_int((path or {}).get("course_id"), "course_id")


def _notebook_id(path: dict[str, Any] | None) -> int:
    return as_int((path or {}).get("notebook_id"), "notebook_id")


def _node_id(path: dict[str, Any] | None) -> int:
    return as_int((path or {}).get("node_id"), "node_id")


def _edge_id(path: dict[str, Any] | None) -> int:
    return as_int((path or {}).get("edge_id"), "edge_id")


@register("notebooks.list")
def notebooks_list(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.notebooks.list(_course_id(path)))


@register("notebooks.create")
def notebooks_create(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = NotebookCreate(**(body or {}))
    return ok(ctx.notebooks.create(_course_id(path), payload.model_dump()))


@register("notebooks.update")
def notebooks_update(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = NotebookUpdate(**(body or {}))
    return ok(
        ctx.notebooks.update(
            _course_id(path),
            _notebook_id(path),
            payload.model_dump(exclude_none=True),
        )
    )


@register("notebooks.trash")
def notebooks_trash(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.notebooks.trash(_course_id(path), _notebook_id(path)))


@register("notebooks.graph")
def notebooks_graph(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    course_id = _course_id(path)
    notebook_id = _notebook_id(path)
    ctx.notebooks.require(course_id, notebook_id)
    return ok(
        {
            "nodes": ctx.knowledge.list_nodes(course_id, notebook_id),
            "edges": ctx.knowledge.list_edges(course_id, notebook_id),
        }
    )


@register("notebooks.nodes.create")
def notebooks_nodes_create(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = KnowledgeNodeCreate(**(body or {}))
    return ok(
        ctx.knowledge.create_node(
            payload.model_dump(), _course_id(path), _notebook_id(path)
        )
    )


@register("notebooks.nodes.update")
def notebooks_nodes_update(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = KnowledgeNodeUpdate(**(body or {}))
    return ok(
        ctx.knowledge.update_node(
            _node_id(path),
            payload.model_dump(exclude_unset=True),
            _course_id(path),
            _notebook_id(path),
        )
    )


@register("notebooks.nodes.delete")
def notebooks_nodes_delete(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    ctx.knowledge.delete_node(
        _node_id(path), _course_id(path), _notebook_id(path)
    )
    return DomainResult(status=204)


@register("notebooks.edges.create")
def notebooks_edges_create(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = KnowledgeEdgeCreate(**(body or {}))
    return ok(
        ctx.knowledge.create_edge(
            payload.source_id,
            payload.target_id,
            payload.relation,
            _course_id(path),
            _notebook_id(path),
        )
    )


@register("notebooks.edges.delete")
def notebooks_edges_delete(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    ctx.knowledge.delete_edge(
        _edge_id(path), _course_id(path), _notebook_id(path)
    )
    return DomainResult(status=204)
