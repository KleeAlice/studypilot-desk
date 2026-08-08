"""Runtime / utility domain callables: python lab, speech, shutdown, quiz, generic.

``generic`` collections mirror the FastAPI fallback behaviour: unknown
collections are rejected with a 404.
"""

from __future__ import annotations

from typing import Any

from ..domain import DomainContext, DomainResult, error, ok, register
from ..errors import AppError
from . import as_int

GENERIC_COLLECTIONS = {
    "captures",
    "notes",
    "mindmaps",
    "boards",
    "projects",
    "research",
    "papers",
    "experiments",
    "errors",
    "traces",
    "interviews",
    "weekly-reviews",
    "jobs",
}


def _collection(path: dict[str, Any] | None) -> str:
    collection = (path or {}).get("collection", "")
    if collection not in GENERIC_COLLECTIONS:
        raise AppError("ROUTE_NOT_FOUND", "接口不存在", 404)
    return collection


@register("python.runs.list")
def python_runs_list(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.python_runner.list())


@register("python.runs.get")
def python_runs_get(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.python_runner.get((path or {}).get("run_id", "")))


@register("python.runs.stop")
def python_runs_stop(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.python_runner.stop((path or {}).get("run_id", "")))


@register("speech.engine")
def speech_engine(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    language_tag = (query or {}).get("language_tag", "zh-CN")
    kind = (query or {}).get("kind", "tts")
    return ok(ctx.speech.resolve_engine(language_tag, kind=kind))


@register("system.shutdown")
def system_shutdown(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    token = body.get("token") if isinstance(body, dict) else None
    if ctx.session_token and token != ctx.session_token:
        return error(401, "UNAUTHORIZED", "会话令牌无效")
    return ok({"accepted": True})


@register("quiz.history")
def quiz_history(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    with ctx.database.connect() as connection:
        rows = connection.execute(
            """SELECT * FROM quiz_attempts WHERE course_id = ?
            ORDER BY created_at DESC, id DESC LIMIT 100""",
            (ctx.repository.active_course_id(),),
        ).fetchall()
    return ok([dict(row) for row in rows])


@register("generic.list")
def generic_list(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.repository.list_generic(_collection(path)))


@register("generic.create")
def generic_create(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    from ..schemas import GenericCreate

    payload = GenericCreate(**(body or {}))
    collection = _collection(path)
    return ok(
        ctx.repository.create_generic(collection, payload.title, payload.payload)
    )


@register("generic.get")
def generic_get(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(
        ctx.repository.get_generic(
            _collection(path), as_int((path or {}).get("item_id"), "item_id")
        )
    )


@register("generic.update")
def generic_update(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    from ..schemas import GenericUpdate

    payload = GenericUpdate(**(body or {}))
    return ok(
        ctx.repository.update_generic(
            _collection(path),
            as_int((path or {}).get("item_id"), "item_id"),
            payload.model_dump(exclude_unset=True),
        )
    )


@register("generic.delete")
def generic_delete(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    ctx.repository.delete_generic(
        _collection(path), as_int((path or {}).get("item_id"), "item_id")
    )
    return ok({"deleted": True})


@register("backups.list")
def backups_list(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.backups.list())


@register("backups.create")
def backups_create(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    result = ctx.backups.create()
    return ok({"path": str(result["path"]), "manifest": result["manifest"]})


@register("python.environments")
def python_environments(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    force = (query or {}).get("force") == "true"
    return ok(ctx.python_runner.environments(force=force))


@register("python.runs.start")
def python_runs_start(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    from ..schemas import PythonRunCreate

    payload = PythonRunCreate(**(body or {}))
    return ok(
        ctx.python_runner.start(
            payload.code,
            payload.tests,
            payload.environment_id,
            payload.timeout_ms,
            payload.max_output_chars,
        )
    )


@register("quiz.grade")
def quiz_grade(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    from ..schemas import QuizGrade

    payload = QuizGrade(**(body or {}))
    return ok(
        ctx.learning.grade_quiz(
            payload.knowledge_id,
            payload.prompt,
            payload.answer,
            payload.expected_keywords,
        )
    )
