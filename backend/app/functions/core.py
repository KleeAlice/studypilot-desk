"""Core domain callables: health, system, settings, courses, tasks, documents.

These are plain functions owned by Rust actix-web route handlers.  They receive
``path``/``query``/``body`` parsed by Rust and return JSON envelopes.
"""

from __future__ import annotations

from typing import Any

from .. import __version__
from ..domain import DomainContext, DomainResult, register, ok
from ..errors import AppError
from ..schemas import (
    CourseCreate,
    CourseUpdate,
    EvidenceCreate,
    SettingUpdate,
    TaskCreate,
    TaskUpdate,
)


def _int(value: Any, name: str) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        raise AppError("VALIDATION_ERROR", f"{name} 必须是整数", 422)


@register("health")
def health(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok({"status": "ok", "version": __version__})


@register("system.status")
def system_status(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(
        {
            "status": "ready",
            "database": str(ctx.database.path),
            "active_course": ctx.repository.active_course_id(),
            "ai_required": False,
        }
    )


@register("settings.list")
def settings_list(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.repository.list_settings())


@register("settings.active_course")
def settings_active_course(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok({"course_id": ctx.repository.active_course_id()})


@register("settings.update")
def settings_update(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    key = (path or {}).get("key")
    if not key or len(str(key)) > 80:
        raise AppError("INVALID_SETTING", "设置项名称过长", 422)
    payload = SettingUpdate(**(body or {}))
    return ok({"key": key, "value": ctx.repository.set_setting(str(key), payload.value)})


@register("courses.list")
def courses_list(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.repository.list_courses())


@register("courses.create")
def courses_create(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = CourseCreate(**(body or {}))
    return ok(ctx.repository.create_course(payload.model_dump()))


@register("courses.update")
def courses_update(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = CourseUpdate(**(body or {}))
    return ok(
        ctx.repository.update_course(
            _int((path or {}).get("course_id"), "course_id"),
            payload.model_dump(exclude_none=True),
        )
    )


@register("courses.trash")
def courses_trash(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.repository.list_trashed_courses())


@register("courses.activate")
def courses_activate(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.repository.activate_course(_int((path or {}).get("course_id"), "course_id")))


@register("courses.home")
def courses_home(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.repository.course_home(_int((path or {}).get("course_id"), "course_id")))


@register("courses.stats")
def courses_stats(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.repository.course_stats(_int((path or {}).get("course_id"), "course_id")))


@register("courses.delete")
def courses_delete(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.repository.delete_course(_int((path or {}).get("course_id"), "course_id")))


@register("courses.restore")
def courses_restore(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.repository.restore_course(_int((path or {}).get("course_id"), "course_id")))


@register("courses.purge")
def courses_purge(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    course_id = _int((path or {}).get("course_id"), "course_id")
    paths = ctx.media.paths_for_course(course_id)
    result = ctx.repository.purge_course(course_id)
    ctx.media.remove_files(paths)
    return ok(result)


@register("courses.roadmap")
def courses_roadmap(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.repository.roadmap(_int((path or {}).get("course_id"), "course_id")))


@register("courses.roadmap.generate")
def courses_roadmap_generate(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    from ..schemas import RoadmapGenerate

    payload = RoadmapGenerate(**(body or {}))
    return ok(
        ctx.agent.generate_course_roadmap(
            _int((path or {}).get("course_id"), "course_id"),
            payload.model_dump(),
        )
    )


@register("roadmap")
def roadmap(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.repository.roadmap())


@register("today")
def today(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    repository = ctx.repository
    week = int(repository.setting("current_week", 1))
    roadmap_data = repository.roadmap()
    week_data = next(
        (item for item in roadmap_data["weeks"] if item["week"] == week), None
    )
    if week_data is None:
        course_id = repository.active_course_id()
        course = next(
            item for item in repository.list_courses() if item["id"] == course_id
        )
        week_data = {
            "week": 1,
            "phase": 0,
            "gate": "CUSTOM",
            "foundation": "开始搭建你的课程知识空间",
            "tasks": [],
            "deliverables": [],
        }
        phase = {
            "phase": 0,
            "title": course["title"],
            "gate": "CUSTOM",
            "acceptance": "用知识卡片、引用和练习建立证据",
            "remediation": "",
            "start_week": 1,
            "end_week": 1,
        }
        task_week = 1
    else:
        phase = next(
            item for item in roadmap_data["phases"] if item["phase"] == week_data["phase"]
        )
        task_week = week
    tasks, total = repository.list_tasks(None, None, 1, 100, task_week)
    return ok({"week": week_data, "phase": phase, "tasks": tasks}, {"total": total})


@register("tasks.list")
def tasks_list(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    q = (query or {}).get("q") or None
    status = (query or {}).get("status") or None
    week_raw = (query or {}).get("week")
    week = _int(week_raw, "week") if week_raw not in (None, "") else None
    page = _int((query or {}).get("page", 1), "page")
    page_size = _int((query or {}).get("page_size", 20), "page_size")
    tasks, total = ctx.repository.list_tasks(q, status, page, page_size, week)
    return ok(tasks, {"page": page, "page_size": page_size, "total": total})


@register("tasks.create")
def tasks_create(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = TaskCreate(**(body or {}))
    return ok(ctx.repository.create_task(payload.model_dump()))


@register("tasks.get")
def tasks_get(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.repository.get_task(_int((path or {}).get("task_id"), "task_id")))


@register("tasks.update")
def tasks_update(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = TaskUpdate(**(body or {}))
    return ok(
        ctx.repository.update_task(
            _int((path or {}).get("task_id"), "task_id"),
            payload.model_dump(exclude_unset=True),
        )
    )


@register("tasks.delete")
def tasks_delete(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    ctx.repository.delete_task(_int((path or {}).get("task_id"), "task_id"))
    return DomainResult(status=204)


@register("tasks.evidence.add")
def tasks_evidence_add(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    payload = EvidenceCreate(**(body or {}))
    return ok(
        ctx.repository.add_evidence(
            _int((path or {}).get("task_id"), "task_id"),
            payload.model_dump(),
        )
    )


@register("documents.list")
def documents_list(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    include_deleted = (query or {}).get("include_deleted") == "true"
    course_id = (
        _int((path or {}).get("course_id"), "course_id")
        if path and "course_id" in path
        else None
    )
    return ok(ctx.documents.list_documents(include_deleted, course_id=course_id))


@register("documents.get")
def documents_get(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.documents.get_document(_int((path or {}).get("document_id"), "document_id")))


@register("documents.content")
def documents_content(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.documents.get_content(_int((path or {}).get("document_id"), "document_id")))


@register("search")
def search(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    q = (query or {}).get("q", "")
    if not q:
        raise AppError("VALIDATION_ERROR", "缺少搜索关键词", 422)
    limit = _int((query or {}).get("limit", 20), "limit")
    return ok(ctx.documents.search(q, limit), {"query": q})


@register("library")
def library(
    ctx: DomainContext, path: dict[str, Any] | None = None,
    query: dict[str, Any] | None = None, body: Any = None,
) -> DomainResult:
    return ok(ctx.documents.list_documents())
