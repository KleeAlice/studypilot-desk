"""Plain function registry for the Rust-owned HTTP gateway.

Rust actix-web owns HTTP routing, authentication and request parsing.  It calls
domain functions here by name over the worker bridge; these modules deliberately
do NOT use FastAPI / Starlette / pydantic request models.  Domain modules keep
the existing services and expose thin, JSON-oriented callables.

A function receives the shared DomainContext plus a structured ``args`` dict:
``{"path": {...}, "query": {...}, "body": {...}}``.  It returns a ``DomainResult``
(a JSON envelope via :func:`ok`) or raises :class:`AppError`.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from .db import Database
from .errors import AppError, error_body
from .repository import Repository
from .services.appearance import AppearanceService
from .services.documents import DocumentService
from .services.agent import AgentService
from .services.exports import NotebookExportService
from .services.backups import BackupService
from .services.knowledge import KnowledgeService
from .services.learning import LearningService
from .services.language_learning import LanguageLearningService
from .services.media import MediaService
from .services.notebooks import NotebookService
from .services.speech import SpeechService
from .services.vocabulary import VocabularyService
from .python_runner.manager import PythonRunner


LOGGER = logging.getLogger("studypilot")

DOMAIN_FUNCTIONS: dict[str, Callable[..., Any]] = {}


def register(name: str) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
    """Register a plain domain callable under ``name`` (e.g. ``"courses.update"``)."""

    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        if name in DOMAIN_FUNCTIONS:
            raise RuntimeError(f"domain function already registered: {name}")
        DOMAIN_FUNCTIONS[name] = fn
        return fn

    return decorator


@dataclass
class DomainResult:
    status: int = 200
    headers: list[tuple[str, str]] = field(default_factory=list)
    body: bytes = b""


def ok(data: Any, meta: dict[str, Any] | None = None) -> DomainResult:
    """Wrap ``data`` in the standard ``{"data": ...}`` envelope and serialize."""
    payload: dict[str, Any] = {"data": data}
    if meta is not None:
        payload["meta"] = meta
    encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return DomainResult(
        status=200,
        headers=[
            ("content-type", "application/json; charset=utf-8"),
            ("content-length", str(len(encoded))),
        ],
        body=encoded,
    )


def error(status: int, code: str, message: str, details: Any = None) -> DomainResult:
    encoded = json.dumps(
        error_body(code, message, details), ensure_ascii=False
    ).encode("utf-8")
    return DomainResult(
        status=status,
        headers=[
            ("content-type", "application/json; charset=utf-8"),
            ("content-length", str(len(encoded))),
        ],
        body=encoded,
    )


@dataclass
class DomainContext:
    """Shared services used by every domain callable."""

    data_dir: str
    database: Database
    repository: Repository
    appearance: AppearanceService
    documents: DocumentService
    exports: NotebookExportService
    backups: BackupService
    knowledge: KnowledgeService
    notebooks: NotebookService
    media: MediaService
    learning: LearningService
    language_learning: LanguageLearningService
    agent: AgentService
    vocabulary: VocabularyService
    speech: SpeechService
    python_runner: PythonRunner
    session_token: str

    def service_for(self, name: str) -> Any:
        return getattr(self, name)


def build_context(data_dir: str | Path, session_token: str) -> DomainContext:
    root = Path(data_dir)
    database = Database(root / "app.db")
    database.initialize()
    repository = Repository(database)
    return DomainContext(
        data_dir=str(root),
        database=database,
        repository=repository,
        appearance=AppearanceService(repository, root),
        documents=DocumentService(database, root),
        exports=NotebookExportService(database, root),
        backups=BackupService(database, root),
        knowledge=KnowledgeService(database),
        notebooks=NotebookService(database),
        media=MediaService(database, root),
        learning=LearningService(database),
        language_learning=LanguageLearningService(database),
        agent=AgentService(database),
        vocabulary=VocabularyService(database),
        speech=SpeechService(database, root / "speech"),
        python_runner=PythonRunner(database, root / "python_workspaces"),
        session_token=session_token,
    )


def call(ctx: DomainContext, name: str, args: dict[str, Any]) -> DomainResult:
    """Dispatch ``name`` with ``args``; convert exceptions to error responses."""
    fn = DOMAIN_FUNCTIONS.get(name)
    if fn is None:
        return error(404, "ROUTE_NOT_FOUND", f"领域函数不存在：{name}")
    try:
        result = fn(ctx, **args)
    except AppError as exc:
        return error(exc.status_code, exc.code, exc.message, exc.details)
    except (TypeError, ValueError, KeyError, IndexError) as exc:
        LOGGER.exception("Domain function %s rejected its arguments", name)
        return error(422, "VALIDATION_ERROR", "请求参数不正确", repr(exc))
    except Exception:  # pragma: no cover - protocol integrity
        LOGGER.exception("Unhandled domain error in %s", name)
        return error(500, "INTERNAL_ERROR", "服务暂时不可用", None)
    if isinstance(result, DomainResult):
        return result
    return ok(result)


# Import registration side effects after the registry/context are defined.
from . import functions  # noqa: E402,F401  (registers domain callables)
