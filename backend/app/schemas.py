from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CourseCreate(StrictModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=2000)
    cover_style: str = Field(default="indigo", min_length=1, max_length=80)
    icon: str = Field(default="book", min_length=1, max_length=40)
    goal: str = Field(default="", max_length=2000)
    start_date: str | None = Field(default=None, max_length=40)
    target_weeks: int | None = Field(default=None, ge=1, le=260)
    weekly_hours: float | None = Field(default=None, ge=0.5, le=168)


class CourseUpdate(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    cover_style: str | None = Field(default=None, min_length=1, max_length=80)

    @field_validator("title")
    @classmethod
    def reject_blank_title(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("title must not be blank")
        return value


class CourseUpdate(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    cover_style: str | None = Field(default=None, min_length=1, max_length=80)

    @field_validator("title")
    @classmethod
    def reject_blank_title(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("title must not be blank")
        return value


NotebookKind = Literal["canvas", "mindmap", "mixed"]
NotebookExportFormat = Literal["png", "pdf", "docx", "md"]


class NotebookCreate(StrictModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=2000)
    kind: NotebookKind = "canvas"
    cover_style: str = Field(default="indigo", min_length=1, max_length=80)
    canvas_settings: dict[str, Any] = Field(default_factory=dict)


class NotebookUpdate(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    kind: NotebookKind | None = None
    cover_style: str | None = Field(default=None, min_length=1, max_length=80)
    canvas_settings: dict[str, Any] | None = None


class NotebookExportRequest(StrictModel):
    format: NotebookExportFormat
    canvas_width: int = Field(default=1800, ge=1200, le=4200)
    canvas_height: int = Field(default=1100, ge=800, le=2800)


TaskStatus = Literal["todo", "doing", "blocked", "done"]


class TaskCreate(StrictModel):
    title: str = Field(min_length=1, max_length=240)
    description: str = Field(default="", max_length=10000)
    week: int | None = Field(default=None, ge=1, le=24)
    kind: str = Field(default="learning", min_length=1, max_length=40)
    status: TaskStatus = "todo"
    priority: int = Field(default=1, ge=0, le=3)
    due_date: str | None = None
    knowledge_id: int | None = None


class TaskUpdate(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    description: str | None = Field(default=None, max_length=10000)
    week: int | None = Field(default=None, ge=1, le=24)
    kind: str | None = Field(default=None, min_length=1, max_length=40)
    status: TaskStatus | None = None
    priority: int | None = Field(default=None, ge=0, le=3)
    due_date: str | None = None
    knowledge_id: int | None = None

    @field_validator("title")
    @classmethod
    def reject_blank_title(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("title must not be blank")
        return value


class EvidenceCreate(StrictModel):
    kind: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(default="", max_length=200000)
    source_id: str | None = Field(default=None, max_length=200)


class GenericCreate(StrictModel):
    title: str = Field(min_length=1, max_length=240)
    payload: dict[str, Any] = Field(default_factory=dict)


class GenericUpdate(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    payload: dict[str, Any] | None = None


class SettingUpdate(StrictModel):
    value: Any


class HighlightCreate(StrictModel):
    quote: str = Field(min_length=1, max_length=20000)
    note: str = Field(default="", max_length=20000)
    start_offset: int | None = Field(default=None, ge=0)
    end_offset: int | None = Field(default=None, ge=0)


KnowledgeNodeKind = Literal["concept", "sticky_note", "flashcard", "citation", "image"]
KnowledgeRelation = Literal["prerequisite", "mindmap", "association"]


class KnowledgeNodeCreate(StrictModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    module: str = Field(default="", max_length=100)
    kind: KnowledgeNodeKind = "concept"
    content: str = Field(default="", max_length=200000)
    color: str = Field(default="blue", min_length=1, max_length=40)
    position_x: float | None = Field(default=None, ge=-100000, le=100000)
    position_y: float | None = Field(default=None, ge=-100000, le=100000)
    width: float | None = Field(default=None, ge=160, le=900)
    height: float | None = Field(default=None, ge=100, le=800)
    font_scale: float | None = Field(default=None, ge=0.7, le=2.0)
    source_document_id: int | None = Field(default=None, gt=0)
    source_title: str = Field(default="", max_length=500)
    source_quote: str = Field(default="", max_length=200000)
    image_asset_id: str | None = Field(default=None, min_length=1, max_length=64)
    image_alt: str = Field(default="", max_length=1000)


class KnowledgeNodeUpdate(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    module: str | None = Field(default=None, max_length=100)
    kind: KnowledgeNodeKind | None = None
    content: str | None = Field(default=None, max_length=200000)
    color: str | None = Field(default=None, min_length=1, max_length=40)
    position_x: float | None = Field(default=None, ge=-100000, le=100000)
    position_y: float | None = Field(default=None, ge=-100000, le=100000)
    width: float | None = Field(default=None, ge=160, le=900)
    height: float | None = Field(default=None, ge=100, le=800)
    font_scale: float | None = Field(default=None, ge=0.7, le=2.0)
    mastery: float | None = Field(default=None, ge=0, le=1)
    source_document_id: int | None = Field(default=None, gt=0)
    source_title: str | None = Field(default=None, max_length=500)
    source_quote: str | None = Field(default=None, max_length=200000)
    image_asset_id: str | None = Field(default=None, min_length=1, max_length=64)
    image_alt: str | None = Field(default=None, max_length=1000)

    @field_validator(
        "title",
        "description",
        "module",
        "kind",
        "content",
        "color",
        "source_title",
        "source_quote",
        "image_alt",
    )
    @classmethod
    def reject_null_required_fields(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("field must not be null")
        return value


class KnowledgeEdgeCreate(StrictModel):
    source_id: int = Field(gt=0)
    target_id: int = Field(gt=0)
    relation: KnowledgeRelation = "prerequisite"


class PythonRunCreate(StrictModel):
    code: str = Field(min_length=1, max_length=200000)
    tests: str = Field(default="", max_length=100000)
    environment_id: str | None = Field(default=None, min_length=1, max_length=80)
    timeout_ms: int = Field(default=5000, ge=100, le=30000)
    max_output_chars: int = Field(default=20000, ge=200, le=200000)


class MasteryEvidence(StrictModel):
    success: bool
    weight: float = Field(default=1.0, gt=0, le=10)
    source: str = Field(default="manual", min_length=1, max_length=80)


class QuizGrade(StrictModel):
    knowledge_id: int = Field(gt=0)
    prompt: str = Field(min_length=1, max_length=5000)
    answer: str = Field(max_length=20000)
    expected_keywords: list[str] = Field(min_length=1, max_length=20)

    @field_validator("expected_keywords")
    @classmethod
    def validate_keywords(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values if value.strip()]
        if not cleaned:
            raise ValueError("expected_keywords must not be empty")
        return cleaned
