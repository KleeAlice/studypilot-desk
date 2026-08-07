from __future__ import annotations

import logging
import json
import os
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import quote

from fastapi import Body, FastAPI, File, Form, Query, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

from .db import Database
from .errors import AppError, error_body
from .repository import Repository
from .schemas import (
    AgentMessageCreate,
    AgentProviderUpdate,
    AgentThreadCreate,
    AgentThreadUpdate,
    CourseCreate,
    CourseUpdate,
    DocumentAnnotationCreate,
    DocumentAnnotationUpdate,
    DocumentExportRequest,
    DocumentRevisionCreate,
    DocumentUpdate,
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
    RoadmapGenerate,
    PythonRunCreate,
    QuizGrade,
    SettingUpdate,
    TaskCreate,
    TaskUpdate,
    VocabularyCheckIn,
    VocabularyCreate,
    VocabularyReview,
    LanguagePracticeCreate,
    LanguageLessonComplete,
)
from .python_runner.manager import PythonRunner
from .services.documents import MAX_DOCUMENT_BYTES, DocumentService
from .services.agent import AgentService
from .services.appearance import MAX_WALLPAPER_BYTES, AppearanceService
from .services.exports import NotebookExportService
from .services.backups import BackupService
from .services.knowledge import KnowledgeService
from .services.learning import LearningService
from .services.language_learning import LanguageLearningService
from .services.media import MAX_IMAGE_BYTES, MediaService
from .services.notebooks import NotebookService
from .services.speech import SpeechService
from .services.vocabulary import VocabularyService


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
        app.state.appearance = AppearanceService(app.state.repository, root)
        app.state.documents = DocumentService(database, root)
        app.state.exports = NotebookExportService(database, root)
        app.state.backups = BackupService(database, root)
        app.state.knowledge = KnowledgeService(database)
        app.state.notebooks = NotebookService(database)
        app.state.media = MediaService(database, root)
        app.state.learning = LearningService(database)
        app.state.language_learning = LanguageLearningService(database)
        app.state.agent = AgentService(database)
        app.state.vocabulary = VocabularyService(database)
        app.state.speech = SpeechService(database, root / "speech")
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

    def appearance(request: Request) -> AppearanceService:
        return request.app.state.appearance

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
    def language_learning(request: Request) -> LanguageLearningService:
        return request.app.state.language_learning


    def runner(request: Request) -> PythonRunner:
        return request.app.state.python_runner

    def agent(request: Request) -> AgentService:
        return request.app.state.agent


    def vocabulary(request: Request) -> VocabularyService:
        return request.app.state.vocabulary

    def speech(request: Request) -> SpeechService:
        return request.app.state.speech
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

    @app.post("/api/settings/wallpaper", status_code=201)
    async def upload_wallpaper(file: UploadFile, request: Request) -> dict:
        content = await file.read(MAX_WALLPAPER_BYTES + 1)
        return envelope(appearance(request).save_wallpaper(file.filename or "wallpaper", content))

    @app.get("/api/settings/wallpaper/image")
    def wallpaper_image(request: Request) -> FileResponse:
        path, media_type = appearance(request).wallpaper()
        return FileResponse(path, media_type=media_type, filename=path.name)

    @app.delete("/api/settings/wallpaper")
    def clear_wallpaper(request: Request) -> dict:
        return envelope(appearance(request).clear_wallpaper())

    @app.put("/api/settings/{key}")
    def update_setting(key: str, payload: SettingUpdate, request: Request) -> dict:
        if len(key) > 80:
            raise AppError("INVALID_SETTING", "设置项名称过长", 422)
        return envelope({"key": key, "value": repo(request).set_setting(key, payload.value)})

    @app.get("/api/roadmaps")
    def roadmap(request: Request) -> dict:
        return envelope(repo(request).roadmap())

    @app.get("/api/courses/{course_id}/roadmap")
    def course_roadmap(course_id: int, request: Request) -> dict:
        return envelope(repo(request).roadmap(course_id))

    @app.post("/api/courses/{course_id}/roadmap/generate")
    async def generate_course_roadmap(
        course_id: int,
        payload: RoadmapGenerate,
        request: Request,
    ) -> dict:
        result = await run_in_threadpool(
            agent(request).generate_course_roadmap,
            course_id,
            payload.model_dump(),
        )
        return envelope(result)

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

    @app.get("/api/courses/{course_id}/documents")
    def list_course_documents(course_id: int, request: Request, include_deleted: bool = False) -> dict:
        return envelope(documents(request).list_documents(include_deleted, course_id=course_id))

    @app.get("/api/documents")
    def list_documents(request: Request, include_deleted: bool = False) -> dict:
        return envelope(documents(request).list_documents(include_deleted))

    @app.post("/api/documents/import")
    async def import_document(
        request: Request,
        file: UploadFile = File(...),
        source_created_at: str | None = Form(default=None),
    ) -> JSONResponse:
        content = await file.read()
        item, deduplicated = await run_in_threadpool(
            documents(request).import_bytes,
            file.filename or "document",
            file.content_type or "application/octet-stream",
            content,
            source_created_at,
        )
        return JSONResponse(
            envelope(item, {"deduplicated": deduplicated}),
            status_code=200 if deduplicated else 201,
        )

    @app.get("/api/documents/{document_id}")
    def get_document(document_id: int, request: Request) -> dict:
        return envelope(documents(request).get_document(document_id))

    @app.get("/api/documents/{document_id}/file")
    def get_document_file(document_id: int, request: Request) -> FileResponse:
        path, media_type, filename = documents(request).original_file(document_id)
        return FileResponse(
            path=path,
            media_type=media_type,
            filename=filename,
            content_disposition_type="inline",
        )

    @app.post("/api/documents/{document_id}/export")
    def export_document(
        document_id: int, payload: DocumentExportRequest, request: Request
    ) -> Response:
        content, filename, media_type = documents(request).export_document(document_id, payload.format)
        disposition = f"attachment; filename=\"document-export\"; filename*=UTF-8''{quote(filename)}"
        return Response(
            content=content,
            media_type=media_type,
            headers={"Content-Disposition": disposition, "Cache-Control": "no-store"},
        )

    @app.patch("/api/documents/{document_id}")
    def update_document(
        document_id: int, payload: DocumentUpdate, request: Request
    ) -> dict:
        return envelope(documents(request).update_document(document_id, payload.model_dump(exclude_unset=True)))

    @app.delete("/api/documents/{document_id}", status_code=204)
    def delete_document(document_id: int, request: Request) -> Response:
        documents(request).trash_document(document_id)
        return Response(status_code=204)

    @app.post("/api/documents/{document_id}/restore")
    def restore_document(document_id: int, request: Request) -> dict:
        return envelope(documents(request).restore_document(document_id))

    @app.get("/api/documents/{document_id}/content")
    def get_document_content(document_id: int, request: Request) -> dict:
        return envelope(documents(request).get_content(document_id))

    @app.post("/api/documents/{document_id}/revisions", status_code=201)
    def create_document_revision(
        document_id: int, payload: DocumentRevisionCreate, request: Request
    ) -> dict:
        return envelope(documents(request).add_revision(document_id, payload.model_dump()))

    @app.get("/api/documents/{document_id}/revisions")
    def get_document_revision_state(document_id: int, request: Request) -> dict:
        return envelope(documents(request).revision_state(document_id))

    @app.post("/api/documents/{document_id}/revisions/undo")
    def undo_document_revision(document_id: int, request: Request) -> dict:
        return envelope(documents(request).undo_revision(document_id))

    @app.post("/api/documents/{document_id}/revisions/redo")
    def redo_document_revision(document_id: int, request: Request) -> dict:
        return envelope(documents(request).redo_revision(document_id))

    @app.get("/api/documents/{document_id}/annotations")
    def list_document_annotations(document_id: int, request: Request) -> dict:
        return envelope(documents(request).list_annotations(document_id))

    @app.post("/api/documents/{document_id}/annotations", status_code=201)
    def create_document_annotation(
        document_id: int, payload: DocumentAnnotationCreate, request: Request
    ) -> dict:
        return envelope(documents(request).add_annotation(document_id, payload.model_dump()))

    @app.patch("/api/documents/{document_id}/annotations/{annotation_id}")
    def update_document_annotation(
        document_id: int,
        annotation_id: int,
        payload: DocumentAnnotationUpdate,
        request: Request,
    ) -> dict:
        return envelope(
            documents(request).update_annotation(
                document_id, annotation_id, payload.model_dump(exclude_unset=True)
            )
        )

    @app.delete(
        "/api/documents/{document_id}/annotations/{annotation_id}", status_code=204
    )
    def delete_document_annotation(
        document_id: int, annotation_id: int, request: Request
    ) -> Response:
        documents(request).delete_annotation(document_id, annotation_id)
        return Response(status_code=204)

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

    @app.get("/api/language/packs")
    def language_packs() -> dict:
        return envelope(LanguageLearningService.packs())

    @app.get("/api/courses/{course_id}/language/materials")
    def language_materials(
        course_id: int, request: Request, q: str = ""
    ) -> dict:
        return envelope(
            language_learning(request).materials(course_id, query=q)
        )

    @app.get("/api/courses/{course_id}/language/journey")
    def language_journey(course_id: int, request: Request) -> dict:
        return envelope(language_learning(request).journey(course_id))

    @app.post("/api/courses/{course_id}/language/start")
    def start_language_journey(course_id: int, request: Request) -> dict:
        return envelope(language_learning(request).start(course_id))

    @app.get(
        "/api/courses/{course_id}/language/lessons/{lesson_id}"
    )
    def language_lesson(
        course_id: int, lesson_id: str, request: Request
    ) -> dict:
        return envelope(
            language_learning(request).lesson(course_id, lesson_id)
        )

    @app.post(
        "/api/courses/{course_id}/language/lessons/{lesson_id}/complete"
    )
    def complete_language_lesson(
        course_id: int,
        lesson_id: str,
        payload: LanguageLessonComplete,
        request: Request,
    ) -> dict:
        return envelope(
            language_learning(request).complete_lesson(
                course_id, lesson_id, payload.model_dump()
            )
        )

    @app.get("/api/courses/{course_id}/language/overview")
    def language_overview(course_id: int, request: Request) -> dict:
        return envelope(language_learning(request).overview(course_id))

    @app.post("/api/courses/{course_id}/language/practice", status_code=201)
    def create_language_practice(
        course_id: int, payload: LanguagePracticeCreate, request: Request
    ) -> dict:
        return envelope(
            language_learning(request).record_session(
                course_id, payload.model_dump(exclude_none=True)
            )
        )

    @app.get("/api/courses/{course_id}/language/sessions")
    def list_language_sessions(
        course_id: int,
        request: Request,
        limit: int = Query(default=100, ge=1, le=200),
    ) -> dict:
        return envelope(
            language_learning(request).list_sessions(course_id, limit=limit)
        )

    @app.get("/api/vocabulary")
    def list_vocabulary(
        course_id: int,
        request: Request,
        due_only: bool = False,
        limit: int = Query(default=40, ge=1, le=200),
    ) -> dict:
        return envelope(
            vocabulary(request).list_items(
                course_id, due_only=due_only, limit=limit
            )
        )

    @app.post("/api/vocabulary", status_code=201)
    def create_vocabulary(payload: VocabularyCreate, request: Request) -> dict:
        values = payload.model_dump()
        course_id = values.pop("course_id")
        return envelope(vocabulary(request).create_item(course_id, values))

    @app.post("/api/vocabulary/{item_id}/review")
    def review_vocabulary(
        item_id: int, payload: VocabularyReview, request: Request
    ) -> dict:
        return envelope(vocabulary(request).review(item_id, payload.rating))

    @app.post("/api/vocabulary/check-in")
    def check_in_vocabulary(
        payload: VocabularyCheckIn, request: Request
    ) -> dict:
        return envelope(
            vocabulary(request).check_in(
                payload.course_id,
                payload.local_date,
                reviewed_count=payload.reviewed_count,
            )
        )

    @app.get("/api/speech/engine")
    def resolve_speech_engine(
        request: Request,
        language_tag: str = "zh-CN",
        kind: Literal["tts", "stt"] = "tts",
    ) -> dict:
        return envelope(speech(request).resolve_engine(language_tag, kind=kind))

    @app.get("/api/agent/providers")
    def list_agent_providers(request: Request) -> dict:
        return envelope(agent(request).list_providers())

    @app.put("/api/agent/providers/{provider_id}")
    def configure_agent_provider(
        provider_id: str, payload: AgentProviderUpdate, request: Request
    ) -> dict:
        return envelope(
            agent(request).configure_provider(
                provider_id, payload.model_dump(exclude_none=True)
            )
        )

    @app.delete("/api/agent/providers/{provider_id}", status_code=204)
    def delete_agent_provider(provider_id: str, request: Request) -> Response:
        agent(request).delete_provider(provider_id)
        return Response(status_code=204)

    @app.post("/api/agent/providers/{provider_id}/test")
    async def test_agent_provider(provider_id: str, request: Request) -> dict:
        return envelope(
            await run_in_threadpool(agent(request).test_provider, provider_id)
        )

    @app.post("/api/agent/providers/{provider_id}/diagnostics")
    async def diagnose_agent_provider(provider_id: str, request: Request) -> dict:
        return envelope(
            await run_in_threadpool(agent(request).diagnose_provider, provider_id)
        )

    @app.get("/api/agent/threads")
    def list_agent_threads(course_id: int, request: Request) -> dict:
        return envelope(agent(request).list_threads(course_id))

    @app.post("/api/agent/threads", status_code=201)
    def create_agent_thread(payload: AgentThreadCreate, request: Request) -> dict:
        values = payload.model_dump()
        return envelope(
            agent(request).create_thread(values.pop("course_id"), values)
        )

    @app.get("/api/agent/threads/{thread_id}")
    def get_agent_thread(thread_id: int, request: Request) -> dict:
        return envelope(agent(request).get_thread(thread_id))

    @app.patch("/api/agent/threads/{thread_id}")
    def update_agent_thread(
        thread_id: int, payload: AgentThreadUpdate, request: Request
    ) -> dict:
        return envelope(
            agent(request).update_thread(
                thread_id, payload.model_dump(exclude_unset=True, exclude_none=True)
            )
        )

    @app.post("/api/agent/threads/{thread_id}/generate-title")
    async def generate_agent_thread_title(thread_id: int, request: Request) -> dict:
        return envelope(
            await run_in_threadpool(
                agent(request).generate_thread_title, thread_id
            )
        )

    @app.delete("/api/agent/threads/{thread_id}", status_code=204)
    def delete_agent_thread(thread_id: int, request: Request) -> Response:
        agent(request).delete_thread(thread_id)
        return Response(status_code=204)

    @app.post("/api/agent/threads/{thread_id}/messages", status_code=201)
    async def create_agent_message(
        thread_id: int, payload: AgentMessageCreate, request: Request
    ) -> dict:
        return envelope(
            await run_in_threadpool(
                agent(request).reply,
                thread_id,
                payload.model_dump(exclude_none=True),
            )

        )
    @app.post("/api/agent/threads/{thread_id}/messages/stream")
    def stream_agent_message(
        thread_id: int, payload: AgentMessageCreate, request: Request
    ) -> StreamingResponse:
        values = payload.model_dump(exclude_none=True)

        def events():
            for event in agent(request).reply_events(thread_id, values):
                yield json.dumps(event, ensure_ascii=False, separators=(",", ":")) + "\n"

        return StreamingResponse(
            events(),
            media_type="application/x-ndjson",
            headers={
                "Cache-Control": "no-cache, no-transform",
                "X-Content-Type-Options": "nosniff",
            },
        )

    @app.post("/api/agent/action-plans/{plan_id}/confirm")
    async def confirm_agent_action_plan(plan_id: int, request: Request) -> dict:
        return envelope(
            await run_in_threadpool(agent(request).actions.confirm, plan_id)
        )

    @app.post("/api/agent/action-plans/{plan_id}/cancel")
    async def cancel_agent_action_plan(plan_id: int, request: Request) -> dict:
        return envelope(
            await run_in_threadpool(agent(request).actions.cancel, plan_id)
        )

    @app.post("/api/agent/action-plans/{plan_id}/undo")
    async def undo_agent_action_plan(plan_id: int, request: Request) -> dict:
        return envelope(
            await run_in_threadpool(agent(request).actions.undo, plan_id)
        )

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

    @app.delete("/api/{collection}/{item_id}")
    def delete_generic(collection: str, item_id: int, request: Request) -> dict:
        if collection not in GENERIC_COLLECTIONS:
            raise AppError("ROUTE_NOT_FOUND", "接口不存在", 404)
        return envelope(repo(request).delete_generic(collection, item_id))

    @app.post("/api/system/shutdown")
    def shutdown(request: Request, token: Annotated[str | None, Body(embed=True)] = None) -> dict:
        expected = os.getenv("STUDYPILOT_SESSION_TOKEN")
        if expected and token != expected:
            raise AppError("UNAUTHORIZED", "会话令牌无效", 401)
        request.app.state.shutdown_requested = True
        return envelope({"accepted": True})

    return app


app = create_app()
