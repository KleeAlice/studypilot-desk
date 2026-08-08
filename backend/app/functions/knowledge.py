"""Knowledge graph domain callables (Rust-owned routes)."""

from __future__ import annotations

from typing import Any

from ..domain import DomainContext, DomainResult, register, ok
from ..schemas import KnowledgeEdgeCreate, KnowledgeNodeCreate, KnowledgeNodeUpdate
from . import as_int


def _node_id(path: dict[str, Any] | None) -> int:
    return as_int((path or {}).get("node_id"), "node_id")


@register("knowledge.graph")
def knowledge_graph(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(
        {
            "nodes": ctx.knowledge.list_nodes(),
            "edges": ctx.knowledge.list_edges(),
        }
    )


@register("knowledge.nodes.list")
def knowledge_nodes_list(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.knowledge.list_nodes())


@register("knowledge.nodes.create")
def knowledge_nodes_create(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = KnowledgeNodeCreate(**(body or {}))
    return ok(ctx.knowledge.create_node(payload.model_dump()))


@register("knowledge.nodes.update")
def knowledge_nodes_update(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = KnowledgeNodeUpdate(**(body or {}))
    return ok(
        ctx.knowledge.update_node(
            _node_id(path), payload.model_dump(exclude_unset=True)
        )
    )


@register("knowledge.nodes.delete")
def knowledge_nodes_delete(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    ctx.knowledge.delete_node(_node_id(path))
    return DomainResult(status=204)


@register("knowledge.nodes.prerequisites")
def knowledge_nodes_prerequisites(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.knowledge.prerequisites(_node_id(path)))


@register("knowledge.edges.create")
def knowledge_edges_create(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = KnowledgeEdgeCreate(**(body or {}))
    return ok(
        ctx.knowledge.create_edge(
            payload.source_id, payload.target_id, payload.relation
        )
    )


@register("knowledge.edges.delete")
def knowledge_edges_delete(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    edge_id = as_int((path or {}).get("edge_id"), "edge_id")
    ctx.knowledge.delete_edge(edge_id)
    return DomainResult(status=204)


@register("mastery")
def mastery(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.knowledge.list_nodes())
