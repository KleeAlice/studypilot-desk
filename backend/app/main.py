from __future__ import annotations

import logging
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import quote

from fastapi import Body, FastAPI, File, Query, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from .db import Database
from .errors import AppError, error_body
from .repository import Repository
from .schemas import (
    CourseCreate,
    CourseUpdate,
    EvidenceCreate,
    GenericCreate,
    GenericUpdate,
    HighlightCreate,
    KnowledgeEdgeCreate,
    KnowledgeNodeCreate,
    KnowledgeNodeUpdate,
    NotebookCreate,
    NotebookExportRequest,
    NotebookUpdate,
    MasteryEvidence,
    PythonRunCreate,
    QuizGrade,
    SettingUpdate,
    TaskCreate,
    TaskUpdate,
)
from .python_runner.manager import PythonRunner
from .services.documents import MAX_DOCUMENT_BYTES, DocumentService
from .services.exports import NotebookExportService
from .services.backups import BackupService
from .services.knowledge import KnowledgeService
from .services.learning import LearningService
from .services.media import MAX_IMAGE_BYTES, MediaService
from .services.notebooks import NotebookService


LOGGER = logging.getLogger("studypilot")
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


def envelope(data, meta: dict | None = None) -> dict:
    body = {"data": data}
    if meta is not None:
        body["meta"] = meta
    return body


def create_app(data_dir: Path | str | None = None) -> FastAPI:
    root = Path(data_dir or os.getenv("STUDYPILOT_DATA_DIR") or Path(__file__).resolve().parents[2] / "data")
    database = Database(root / "app.db")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        database.initialize()
        app.state.database = database
        app.state.repository = Repository(database)
        app.state.documents = DocumentService(database, root)
        app.state.exports = NotebookExportService(database, root)
        app.state.backups = BackupService(database, root)
        app.state.knowledge = KnowledgeService(database)
        app.state.notebooks = NotebookService(database)
        app.state.media = MediaService(database, root)
        app.state.learning = LearningService(database)
        app.state.python_runner = PythonRunner(database, root / "python_workspaces")
        try:
            yield
        finally:
            app.state.python_runner.stop_all()

    app = FastAPI(
        title="StudyPilot Desk API",
        version="0.1.0",
        docs_url="/api/docs" if os.getenv("STUDYPILOT_DEV") == "1" else None,
        redoc_url=None,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1", "http://localhost"],
        allow_origin_regex=r"https?://(127\.0\.0\.1|localhost)(:\d+)?",
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def repo(request: Request) -> Repository:
        return request.app.state.repository

    def documents(request: Request) -> DocumentService:
        return request.app.state.documents

    def backups(request: Request) -> BackupService:
        return request.app.state.backups

    def knowledge(request: Request) -> KnowledgeService:
        return request.app.state.knowledge

    def notebooks(request: Request) -> NotebookService:
        return request.app.state.notebooks

    def exports(request: Request) -> NotebookExportService:
        return request.app.state.exports

    def media(request: Request) -> MediaService:
        return request.app.state.media

    def learning(request: Request) -> LearningService:
        return request.app.state.learning

    def runner(request: Request) -> PythonRunner:
        return request.app.state.python_runner

    @app.exception_handler(AppError)
    async def handle_app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(error_body(exc.code, exc.message, exc.details), status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def handle_validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {"field": ".".join(str(part) for part in error["loc"]), "message": error["msg"]}
            for error in exc.errors()
        ]
        return JSONResponse(
            error_body("VALIDATION_ERROR", "请求参数不正确", details), status_code=422
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(_: Request, exc: Exception) -> JSONResponse:
        LOGGER.exception("Unhandled API error", exc_info=exc)
        details = repr(exc) if os.getenv("STUDYPILOT_DEV") == "1" else None
        return JSONResponse(error_body("INTERNAL_ERROR", "服务暂时不可用", details), status_code=500)

    @app.get("/api/health")
    def health() -> dict:
        return envelope({"status": "ok", "version": app.version})

    @app.get("/api/system/status")
    def system_status(request: Request) -> dict:
        repository = repo(request)
        return envelope(
            {
                "status": "ready",
                "database": str(request.app.state.database.path),
                "active_course": repository.active_course_id(),
                "ai_required": False,
            }
        )

    @app.get("/api/courses")
    def list_courses(request: Request) -> dict:
        return envelope(repo(request).list_courses())

    @app.post("/api/courses", status_code=201)
    def create_course(payload: CourseCreate, request: Request) -> dict:
        return envelope(repo(request).create_course(payload.model_dump()))

    @app.patch("/api/courses/{course_id}")
    def update_course(course_id: int, payload: CourseUpdate, request: Request) -> dict:
        return envelope(repo(request).update_course(course_id, payload.model_dump(exclude_none=True)))

    @app.get("/api/courses/trash")
    def course_trash(request: Request) -> dict:
        return envelope(repo(request).list_trashed_courses())

    @app.post("/api/courses/{course_id}/activate")
    def activate_course(course_id: int, request: Request) -> dict:
        return envelope(repo(request).activate_course(course_id))

    @app.get("/api/courses/{course_id}/home")
    def course_home(course_id: int, request: Request) -> dict:
        return envelope(repo(request).course_home(course_id))

    @app.get("/api/courses/{course_id}/stats")
    def course_stats(course_id: int, request: Request) -> dict:
        return envelope(repo(request).course_stats(course_id))

    @app.delete("/api/courses/{course_id}")
    def delete_course(course_id: int, request: Request) -> dict:
        return envelope(repo(request).delete_course(course_id))

    @app.post("/api/courses/{course_id}/restore")
    def restore_course(course_id: int, request: Request) -> dict:
        return envelope(repo(request).restore_course(course_id))

    @app.delete("/api/courses/{course_id}/permanent")
    def purge_course(course_id: int, request: Request) -> dict:
        service = media(request)
        paths = service.paths_for_course(course_id)
        result = repo(request).purge_course(course_id)
        service.remove_files(paths)
        return envelope(result)

    @app.get("/api/settings/active-course")
    def active_course(request: Request) -> dict:
        return envelope({"course_id": repo(request).active_course_id()})

    @app.get("/api/settings")
    def list_settings(request: Request) -> dict:
        return envelope(repo(request).list_settings())

    @app.put("/api/settings/{key}")
    def update_setting(key: str, payload: SettingUpdate, request: Request) -> dict:
        if len(key) > 80:
            raise AppError("INVALID_SETTING", "设置项名称过长", 422)
        return envelope({"key": key, "value": repo(request).set_setting(key, payload.value)})

    @app.get("/api/roadmaps")
    def roadmap(request: Request) -> dict:
        return envelope(repo(request).roadmap())

    @app.get("/api/today")
    def today(request: Request) -> dict:
        repository = repo(request)
        week = int(repository.setting("current_week", 1))
        roadmap_data = repository.roadmap()
        week_data = next(
            (item for item in roadmap_data["weeks"] if item["week"] == week),
            None,
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
                item
                for item in roadmap_data["phases"]
                if item["phase"] == week_data["phase"]
            )
            task_week = week
        tasks, total = repository.list_tasks(None, None, 1, 100, task_week)
        return envelope({"week": week_data, "phase": phase, "tasks": tasks}, {"total": total})

    @app.get("/api/tasks")
    def list_tasks(
        request: Request,
        q: str | None = Query(default=None, max_length=200),
        status: Literal["todo", "doing", "blocked", "done"] | None = None,
        week: int | None = Query(default=None, ge=1, le=24),
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=20, ge=1, le=100),
    ) -> dict:
        tasks, total = repo(request).list_tasks(q, status, page, page_size, week)
        return envelope(tasks, {"page": page, "page_size": page_size, "total": total})

    @app.post("/api/tasks", status_code=201)
    def create_task(payload: TaskCreate, request: Request) -> dict:
        return envelope(repo(request).create_task(payload.model_dump()))

    @app.get("/api/tasks/{task_id}")
    def get_task(task_id: int, request: Request) -> dict:
        return envelope(repo(request).get_task(task_id))

    @app.patch("/api/tasks/{task_id}")
    def update_task(task_id: int, payload: TaskUpdate, request: Request) -> dict:
        return envelope(
            repo(request).update_task(task_id, payload.model_dump(exclude_unset=True))
        )

    @app.delete("/api/tasks/{task_id}", status_code=204)
    def delete_task(task_id: int, request: Request) -> Response:
        repo(request).delete_task(task_id)
        return Response(status_code=204)

    @app.post("/api/tasks/{task_id}/evidence", status_code=201)
    def add_task_evidence(task_id: int, payload: EvidenceCreate, request: Request) -> dict:
        return envelope(repo(request).add_evidence(task_id, payload.model_dump()))

    @app.get("/api/documents")
    def list_documents(request: Request) -> dict:
        return envelope(documents(request).list_documents())

    @app.post("/api/documents/import")
    async def import_document(request: Request, file: UploadFile = File(...)) -> JSONResponse:
        content = await file.read(MAX_DOCUMENT_BYTES + 1)
        item, deduplicated = documents(request).import_bytes(
            file.filename or "document", file.content_type or "application/octet-stream", content
        )
        return JSONResponse(
            envelope(item, {"deduplicated": deduplicated}),
            status_code=200 if deduplicated else 201,
        )

    @app.get("/api/documents/{document_id}")
    def get_document(document_id: int, request: Request) -> dict:
        return envelope(documents(request).get_document(document_id))

    @app.post("/api/documents/{document_id}/highlights", status_code=201)
    def create_highlight(
        document_id: int, payload: HighlightCreate, request: Request
    ) -> dict:
        return envelope(
            documents(request).add_highlight(document_id, payload.model_dump())
        )

    @app.get("/api/search")
    def search(
        request: Request,
        q: str = Query(min_length=1, max_length=300),
        limit: int = Query(default=20, ge=1, le=100),
    ) -> dict:
        return envelope(documents(request).search(q, limit), {"query": q})

    @app.get("/api/library")
    def library(request: Request) -> dict:
        return envelope(documents(request).list_documents())

    @app.get("/api/backups")
    def list_backups(request: Request) -> dict:
        return envelope(backups(request).list())

    @app.post("/api/backups", status_code=201)
    def create_backup(request: Request) -> dict:
        result = backups(request).create()
        return envelope({"path": str(result["path"]), "manifest": result["manifest"]})

    @app.post("/api/backups/restore")
    async def restore_backup(
        request: Request, file: UploadFile = File(...), overwrite: bool = False
    ) -> dict:
        service = backups(request)
        service.backup_dir.mkdir(parents=True, exist_ok=True)
        temporary = service.backup_dir / f".restore-upload-{uuid.uuid4().hex}.zip"
        try:
            temporary.write_bytes(await file.read(1024 * 1024 * 1024))
            return envelope(service.restore(temporary, overwrite=overwrite))
        finally:
            temporary.unlink(missing_ok=True)

    @app.get("/api/courses/{course_id}/notebooks")
    def list_notebooks(course_id: int, request: Request) -> dict:
        return envelope(notebooks(request).list(course_id))

    @app.post("/api/courses/{course_id}/notebooks", status_code=201)
    def create_notebook(
        course_id: int, payload: NotebookCreate, request: Request
    ) -> dict:
        return envelope(notebooks(request).create(course_id, payload.model_dump()))

    @app.patch("/api/courses/{course_id}/notebooks/{notebook_id}")
    def update_notebook(
        course_id: int, notebook_id: int, payload: NotebookUpdate, request: Request
    ) -> dict:
        return envelope(
            notebooks(request).update(
                course_id, notebook_id, payload.model_dump(exclude_none=True)
            )
        )

    @app.delete("/api/courses/{course_id}/notebooks/{notebook_id}")
    def trash_notebook(course_id: int, notebook_id: int, request: Request) -> dict:
        return envelope(notebooks(request).trash(course_id, notebook_id))

    @app.get("/api/courses/{course_id}/notebooks/{notebook_id}/graph")
    def notebook_graph(course_id: int, notebook_id: int, request: Request) -> dict:
        notebooks(request).require(course_id, notebook_id)
        service = knowledge(request)
        return envelope(
            {
                "nodes": service.list_nodes(course_id, notebook_id),
                "edges": service.list_edges(course_id, notebook_id),
            }
        )

    @app.post("/api/courses/{course_id}/notebooks/{notebook_id}/export")
    def export_notebook(
        course_id: int,
        notebook_id: int,
        payload: NotebookExportRequest,
        request: Request,
    ) -> Response:
        artifact = exports(request).export(
            course_id,
            notebook_id,
            payload.format,
            payload.canvas_width,
            payload.canvas_height,
        )
        fallback = f"knowledge-notebook.{payload.format}"
        disposition = f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(artifact.filename)}"
        return Response(
            content=artifact.content,
            media_type=artifact.media_type,
            headers={"Content-Disposition": disposition, "Cache-Control": "no-store"},
        )

    @app.post("/api/knowledge/export")
    def export_active_knowledge(
        payload: NotebookExportRequest,
        request: Request,
    ) -> Response:
        course_id = knowledge(request).active_course_id()
        notebook_id = notebooks(request).default_id(course_id)
        artifact = exports(request).export(
            course_id,
            notebook_id,
            payload.format,
            payload.canvas_width,
            payload.canvas_height,
        )
        fallback = f"knowledge-notebook.{payload.format}"
        disposition = f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(artifact.filename)}"
        return Response(
            content=artifact.content,
            media_type=artifact.media_type,
            headers={"Content-Disposition": disposition, "Cache-Control": "no-store"},
        )

    @app.post(
        "/api/courses/{course_id}/notebooks/{notebook_id}/nodes", status_code=201
    )
    def create_notebook_node(
        course_id: int,
        notebook_id: int,
        payload: KnowledgeNodeCreate,
        request: Request,
    ) -> dict:
        return envelope(
            knowledge(request).create_node(payload.model_dump(), course_id, notebook_id)
        )

    @app.patch("/api/courses/{course_id}/notebooks/{notebook_id}/nodes/{node_id}")
    def update_notebook_node(
        course_id: int,
        notebook_id: int,
        node_id: int,
        payload: KnowledgeNodeUpdate,
        request: Request,
    ) -> dict:
        return envelope(
            knowledge(request).update_node(
                node_id,
                payload.model_dump(exclude_unset=True),
                course_id,
                notebook_id,
            )
        )

    @app.delete(
        "/api/courses/{course_id}/notebooks/{notebook_id}/nodes/{node_id}",
        status_code=204,
    )
    def delete_notebook_node(
        course_id: int, notebook_id: int, node_id: int, request: Request
    ) -> Response:
        knowledge(request).delete_node(node_id, course_id, notebook_id)
        return Response(status_code=204)

    @app.post(
        "/api/courses/{course_id}/notebooks/{notebook_id}/edges", status_code=201
    )
    def create_notebook_edge(
        course_id: int,
        notebook_id: int,
        payload: KnowledgeEdgeCreate,
        request: Request,
    ) -> dict:
        return envelope(
            knowledge(request).create_edge(
                payload.source_id,
                payload.target_id,
                payload.relation,
                course_id,
                notebook_id,
            )
        )

    @app.delete(
        "/api/courses/{course_id}/notebooks/{notebook_id}/edges/{edge_id}",
        status_code=204,
    )
    def delete_notebook_edge(
        course_id: int, notebook_id: int, edge_id: int, request: Request
    ) -> Response:
        knowledge(request).delete_edge(edge_id, course_id, notebook_id)
        return Response(status_code=204)

    @app.get("/api/knowledge")
    def knowledge_graph(request: Request) -> dict:
        service = knowledge(request)
        return envelope({"nodes": service.list_nodes(), "edges": service.list_edges()})

    @app.post("/api/media/images", status_code=201)
    async def upload_image(file: UploadFile, request: Request) -> dict:
        content = await file.read(MAX_IMAGE_BYTES + 1)
        asset = media(request).save_image(file.filename or "image", content)
        return envelope(media(request).public(asset))

    @app.get("/api/media/images/{asset_id}")
    def get_image(asset_id: str, request: Request) -> FileResponse:
        asset = media(request).get(asset_id)
        return FileResponse(
            path=asset["path"],
            media_type=asset["media_type"],
            filename=asset["filename"],
            content_disposition_type="inline",
        )

    @app.get("/api/courses/{course_id}/media/images/{asset_id}")
    def get_course_image(
        course_id: int, asset_id: str, request: Request
    ) -> FileResponse:
        asset = media(request).get_for_course(asset_id, course_id)
        return FileResponse(
            path=asset["path"],
            media_type=asset["media_type"],
            filename=asset["filename"],
            content_disposition_type="inline",
        )

    @app.get("/api/knowledge/nodes")
    def list_knowledge_nodes(request: Request) -> dict:
        return envelope(knowledge(request).list_nodes())

    @app.post("/api/knowledge/nodes", status_code=201)
    def create_knowledge_node(
        payload: KnowledgeNodeCreate, request: Request
    ) -> dict:
        return envelope(knowledge(request).create_node(payload.model_dump()))

    @app.patch("/api/knowledge/nodes/{node_id}")
    def update_knowledge_node(
        node_id: int, payload: KnowledgeNodeUpdate, request: Request
    ) -> dict:
        return envelope(
            knowledge(request).update_node(
                node_id, payload.model_dump(exclude_unset=True)
            )
        )

    @app.delete("/api/knowledge/nodes/{node_id}", status_code=204)
    def delete_knowledge_node(node_id: int, request: Request) -> Response:
        knowledge(request).delete_node(node_id)
        return Response(status_code=204)

    @app.post("/api/knowledge/edges", status_code=201)
    def create_knowledge_edge(
        payload: KnowledgeEdgeCreate, request: Request
    ) -> dict:
        return envelope(
            knowledge(request).create_edge(
                payload.source_id, payload.target_id, payload.relation
            )
        )

    @app.delete("/api/knowledge/edges/{edge_id}", status_code=204)
    def delete_knowledge_edge(edge_id: int, request: Request) -> Response:
        knowledge(request).delete_edge(edge_id)
        return Response(status_code=204)

    @app.get("/api/knowledge/nodes/{node_id}/prerequisites")
    def knowledge_prerequisites(node_id: int, request: Request) -> dict:
        return envelope(knowledge(request).prerequisites(node_id))

    @app.get("/api/python")
    @app.get("/api/python/runs")
    def list_python_runs(request: Request) -> dict:
        return envelope(runner(request).list())

    @app.get("/api/python/environments")
    def list_python_environments(
        request: Request, force: bool = Query(default=False)
    ) -> dict:
        return envelope(runner(request).environments(force=force))

    @app.post("/api/python/runs", status_code=201)
    def start_python_run(payload: PythonRunCreate, request: Request) -> dict:
        return envelope(
            runner(request).start(
                payload.code,
                payload.tests,
                payload.environment_id,
                payload.timeout_ms,
                payload.max_output_chars,
            )
        )

    @app.get("/api/python/runs/{run_id}")
    def get_python_run(run_id: str, request: Request) -> dict:
        return envelope(runner(request).get(run_id))

    @app.post("/api/python/runs/{run_id}/stop")
    def stop_python_run(run_id: str, request: Request) -> dict:
        return envelope(runner(request).stop(run_id))

    @app.get("/api/mastery")
    def mastery_overview(request: Request) -> dict:
        return envelope(knowledge(request).list_nodes())

    @app.post("/api/mastery/{knowledge_id}/evidence")
    def add_mastery_evidence(
        knowledge_id: int, payload: MasteryEvidence, request: Request
    ) -> dict:
        return envelope(
            learning(request).update_mastery(
                knowledge_id, payload.success, payload.weight
            )
        )

    @app.get("/api/quizzes")
    def quiz_history(request: Request) -> dict:
        with request.app.state.database.connect() as connection:
            rows = connection.execute(
                """SELECT * FROM quiz_attempts WHERE course_id = ?
                ORDER BY created_at DESC, id DESC LIMIT 100""",
                (repo(request).active_course_id(),),
            ).fetchall()
        return envelope([dict(row) for row in rows])

    @app.post("/api/quizzes/grade")
    def grade_quiz(payload: QuizGrade, request: Request) -> dict:
        return envelope(
            learning(request).grade_quiz(
                payload.knowledge_id,
                payload.prompt,
                payload.answer,
                payload.expected_keywords,
            )
        )

    @app.get("/api/reviews")
    def reviews(request: Request, include_superseded: bool = False) -> dict:
        return envelope(learning(request).list_reviews(include_superseded))

    @app.get("/api/{collection}")
    def list_generic(collection: str, request: Request) -> dict:
        if collection not in GENERIC_COLLECTIONS:
            raise AppError("ROUTE_NOT_FOUND", "接口不存在", 404)
        return envelope(repo(request).list_generic(collection))

    @app.post("/api/{collection}", status_code=201)
    def create_generic(collection: str, payload: GenericCreate, request: Request) -> dict:
        if collection not in GENERIC_COLLECTIONS:
            raise AppError("ROUTE_NOT_FOUND", "接口不存在", 404)
        return envelope(repo(request).create_generic(collection, payload.title, payload.payload))

    @app.get("/api/{collection}/{item_id}")
    def get_generic(collection: str, item_id: int, request: Request) -> dict:
        if collection not in GENERIC_COLLECTIONS:
            raise AppError("ROUTE_NOT_FOUND", "接口不存在", 404)
        return envelope(repo(request).get_generic(collection, item_id))

    @app.patch("/api/{collection}/{item_id}")
    def update_generic(
        collection: str, item_id: int, payload: GenericUpdate, request: Request
    ) -> dict:
        if collection not in GENERIC_COLLECTIONS:
            raise AppError("ROUTE_NOT_FOUND", "接口不存在", 404)
        return envelope(
            repo(request).update_generic(collection, item_id, payload.model_dump(exclude_unset=True))
        )

    @app.post("/api/system/shutdown")
    def shutdown(request: Request, token: Annotated[str | None, Body(embed=True)] = None) -> dict:
        expected = os.getenv("STUDYPILOT_SESSION_TOKEN")
        if expected and token != expected:
            raise AppError("UNAUTHORIZED", "会话令牌无效", 401)
        request.app.state.shutdown_requested = True
        return envelope({"accepted": True})

    return app


app = create_app()
