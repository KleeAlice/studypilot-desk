"""Agent read/config domain callables (Rust-owned routes).

Messaging, streaming and action-plan confirmation remain on the legacy
passthrough until their async/streaming semantics migrate.
"""

from __future__ import annotations

from typing import Any

from ..domain import DomainContext, DomainResult, register, ok
from ..schemas import AgentThreadCreate, AgentThreadUpdate
from . import as_int


@register("agent.providers.list")
def agent_providers_list(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.agent.list_providers())


@register("agent.threads.list")
def agent_threads_list(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    course_id = as_int((query or {}).get("course_id"), "course_id")
    return ok(ctx.agent.list_threads(course_id))


@register("agent.threads.create")
def agent_threads_create(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = AgentThreadCreate(**(body or {}))
    values = payload.model_dump()
    return ok(ctx.agent.create_thread(values.pop("course_id"), values))


@register("agent.threads.get")
def agent_threads_get(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(
        ctx.agent.get_thread(as_int((path or {}).get("thread_id"), "thread_id"))
    )


@register("agent.threads.update")
def agent_threads_update(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = AgentThreadUpdate(**(body or {}))
    return ok(
        ctx.agent.update_thread(
            as_int((path or {}).get("thread_id"), "thread_id"),
            payload.model_dump(exclude_unset=True, exclude_none=True),
        )
    )


@register("agent.threads.delete")
def agent_threads_delete(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    ctx.agent.delete_thread(as_int((path or {}).get("thread_id"), "thread_id"))
    return DomainResult(status=204)


@register("agent.providers.update")
def agent_providers_update(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    from ..schemas import AgentProviderUpdate

    payload = AgentProviderUpdate(**(body or {}))
    return ok(
        ctx.agent.configure_provider(
            (path or {}).get("provider_id", ""),
            payload.model_dump(exclude_none=True),
        )
    )


@register("agent.providers.delete")
def agent_providers_delete(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    ctx.agent.delete_provider((path or {}).get("provider_id", ""))
    return DomainResult(status=204)


@register("agent.providers.test")
def agent_providers_test(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.agent.test_provider((path or {}).get("provider_id", "")))


@register("agent.providers.diagnostics")
def agent_providers_diagnostics(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.agent.diagnose_provider((path or {}).get("provider_id", "")))


@register("agent.threads.generate_title")
def agent_threads_generate_title(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(
        ctx.agent.generate_thread_title(
            as_int((path or {}).get("thread_id"), "thread_id")
        )
    )


@register("agent.threads.messages.create")
def agent_threads_messages_create(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    from ..schemas import AgentMessageCreate

    payload = AgentMessageCreate(**(body or {}))
    return ok(
        ctx.agent.reply(
            as_int((path or {}).get("thread_id"), "thread_id"),
            payload.model_dump(exclude_none=True),
        )
    )


@register("agent.messages.stream")
def agent_messages_stream(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> Any:
    """Streaming variant: returns an iterator of NDJSON event dicts.

    The worker iterates this generator and forwards each event to Rust, which
    relays it to the renderer as an ``application/x-ndjson`` stream.
    """
    from ..schemas import AgentMessageCreate

    payload = AgentMessageCreate(**(body or {}))
    return ctx.agent.reply_events(
        as_int((path or {}).get("thread_id"), "thread_id"),
        payload.model_dump(exclude_none=True),
    )


@register("agent.actions.confirm")
def agent_actions_confirm(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(
        ctx.agent.actions.confirm(as_int((path or {}).get("plan_id"), "plan_id"))
    )


@register("agent.actions.cancel")
def agent_actions_cancel(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(
        ctx.agent.actions.cancel(as_int((path or {}).get("plan_id"), "plan_id"))
    )


@register("agent.actions.undo")
def agent_actions_undo(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(
        ctx.agent.actions.undo(as_int((path or {}).get("plan_id"), "plan_id"))
    )
