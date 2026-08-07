from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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
    course_type: Literal["knowledge", "language"] = "knowledge"
    target_language_tag: str = Field(default="", max_length=40)
    native_language_tag: str = Field(default="zh-CN", min_length=2, max_length=40)
    proficiency_level: Literal[
        "beginner", "elementary", "intermediate", "advanced"
    ] = "beginner"
    daily_word_goal: int = Field(default=10, ge=1, le=100)
    pronunciation_scheme: str = Field(default="", max_length=40)
    romanization_enabled: bool = False
    lesson_minutes: int = Field(default=15, ge=5, le=90)
    speech_rate: float = Field(default=1.0, ge=0.5, le=1.5)
    auto_play_audio: bool = False
    training_focus: list[
        Literal["reading", "listening", "speaking", "writing"]
    ] = Field(
        default_factory=lambda: ["reading", "listening", "speaking", "writing"],
        min_length=1,
        max_length=4,
    )

    @model_validator(mode="after")
    def require_language_for_language_course(self) -> "CourseCreate":
        if self.course_type == "language" and not self.target_language_tag.strip():
            raise ValueError("target_language_tag is required for a language course")
        if self.course_type == "knowledge":
            self.target_language_tag = ""
        return self



class CourseUpdate(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    cover_style: str | None = Field(default=None, min_length=1, max_length=80)
    proficiency_level: Literal[
        "beginner", "elementary", "intermediate", "advanced"
    ] | None = None
    daily_word_goal: int | None = Field(default=None, ge=1, le=100)
    lesson_minutes: int | None = Field(default=None, ge=5, le=90)
    speech_rate: float | None = Field(default=None, ge=0.5, le=1.5)
    auto_play_audio: bool | None = None
    pronunciation_scheme: str | None = Field(default=None, max_length=40)
    romanization_enabled: bool | None = None
    training_focus: list[
        Literal["reading", "listening", "speaking", "writing"]
    ] | None = Field(default=None, min_length=1, max_length=4)

    @field_validator("title")
    @classmethod
    def reject_blank_title(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("title must not be blank")
        return value


class RoadmapGenerate(StrictModel):
    provider_id: str = Field(min_length=1, max_length=40)
    start_date: str | None = Field(default=None, max_length=40)
    target_weeks: int = Field(ge=1, le=52)
    weekly_hours: float = Field(ge=0.5, le=168)
    planning_goal: str = Field(default="", max_length=4000)
    document_ids: list[int] = Field(default_factory=list, max_length=24)


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


AgentProviderProtocol = Literal[
    "openai_compatible", "anthropic", "gemini", "azure_openai"
]
AgentThreadMode = Literal["assistant", "learning"]
AgentLearningFeedback = Literal["simpler", "another_example", "understood", "confused"]


class AgentProviderUpdate(StrictModel):
    label: str = Field(min_length=1, max_length=120)
    icon: str = Field(default="custom", min_length=1, max_length=40)
    protocol: AgentProviderProtocol
    base_url: str = Field(min_length=1, max_length=1000)
    model: str = Field(min_length=1, max_length=240)
    api_key: str | None = Field(default=None, max_length=2000)
    max_output_tokens: int = Field(default=32000, ge=0, le=100000)
    connect_timeout_seconds: float = Field(default=10, ge=1, le=120)
    first_byte_timeout_seconds: float = Field(default=90, ge=5, le=600)
    idle_timeout_seconds: float = Field(default=45, ge=5, le=300)
    enabled: bool = True

    @field_validator("max_output_tokens")
    @classmethod
    def validate_max_output_tokens(cls, value: int) -> int:
        if value != 0 and value < 1024:
            raise ValueError("must be 0 (unlimited) or at least 1024")
        return value


class AgentThreadCreate(StrictModel):
    course_id: int = Field(gt=0)
    title: str = Field(default="新对话", min_length=1, max_length=120)
    provider_id: str = Field(default="openai", min_length=1, max_length=40)
    model: str = Field(default="", max_length=160)
    mode: AgentThreadMode = "assistant"


class AgentThreadUpdate(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    provider_id: str | None = Field(default=None, min_length=1, max_length=40)
    model: str | None = Field(default=None, max_length=160)
    mode: AgentThreadMode | None = None
    pinned: bool | None = None


class AgentContextRequest(StrictModel):
    page_view: str = Field(default="", max_length=80)
    page_title: str = Field(default="", max_length=300)
    document_id: int | None = Field(default=None, gt=0)
    document_ids: list[int] = Field(default_factory=list, max_length=200)
    selected_document_ids: list[int] = Field(default_factory=list, max_length=200)
    block_key: str = Field(default="", max_length=500)
    selected_text: str = Field(default="", max_length=20000)
    locator: dict[str, Any] = Field(default_factory=dict)
    notebook_id: int | None = Field(default=None, gt=0)
    include_current: bool = True
    include_notes: bool = False
    include_knowledge: bool = False
    include_library: bool = False
    learning_topic: str | None = Field(default=None, max_length=300)
    learning_goal: str | None = Field(default=None, max_length=4000)
    source_free: bool = False


class AgentAttachmentRequest(StrictModel):
    kind: Literal["document", "image"]
    name: str = Field(min_length=1, max_length=240)
    media_type: str = Field(default="application/octet-stream", max_length=160)
    document_id: int | None = Field(default=None, gt=0)
    image_asset_id: str | None = Field(default=None, min_length=1, max_length=64)


class AgentMessageCreate(StrictModel):
    message: str = Field(min_length=1, max_length=12000)
    provider_id: str | None = Field(default=None, min_length=1, max_length=40)
    model: str | None = Field(default=None, min_length=1, max_length=160)
    feedback_kind: AgentLearningFeedback | None = None
    explanation_length: Literal["short", "medium", "long", "unlimited"] = "medium"
    context: AgentContextRequest = Field(default_factory=AgentContextRequest)
    attachments: list[AgentAttachmentRequest] = Field(default_factory=list, max_length=8)


class VocabularyCreate(StrictModel):
    course_id: int = Field(gt=0)
    language_tag: str = Field(default="", max_length=40)
    term: str = Field(min_length=1, max_length=20000)
    pronunciation: str = Field(default="", max_length=240)
    meaning: str = Field(default="", max_length=1000)
    example: str = Field(default="", max_length=2000)
    source_kind: str = Field(default="", max_length=80)
    source_id: str = Field(default="", max_length=160)
    document_id: int | None = Field(default=None, gt=0)
    block_key: str = Field(default="", max_length=500)
    locator: dict[str, Any] = Field(default_factory=dict)


class VocabularyReview(StrictModel):
    rating: Literal["again", "hard", "good", "easy"]


class VocabularyCheckIn(StrictModel):
    course_id: int = Field(gt=0)
    local_date: str = Field(min_length=10, max_length=10)
    reviewed_count: int = Field(default=0, ge=0, le=10000)



class LanguagePracticeCreate(StrictModel):
    practice_type: Literal["reading", "listening", "speaking", "writing"]
    vocabulary_item_id: int | None = Field(default=None, gt=0)
    source_kind: str = Field(default="", max_length=80)
    source_id: str = Field(default="", max_length=160)
    document_id: int | None = Field(default=None, gt=0)
    block_key: str = Field(default="", max_length=500)
    locator: dict[str, Any] = Field(default_factory=dict)
    prompt: str = Field(default="", max_length=4000)
    answer: str = Field(default="", max_length=4000)
    result: Literal["pending", "correct", "incorrect", "self_reviewed"]
    feedback: str = Field(default="", max_length=4000)
    duration_seconds: int = Field(default=0, ge=0, le=86400)

class HighlightCreate(StrictModel):
    quote: str = Field(min_length=1, max_length=20000)
    note: str = Field(default="", max_length=20000)
    start_offset: int | None = Field(default=None, ge=0)

class LanguageLessonComplete(StrictModel):
    score: int = Field(ge=0, le=100)
    duration_seconds: int = Field(default=0, ge=0, le=86400)
    activity_results: list[dict[str, Any]] = Field(default_factory=list, max_length=20)

    end_offset: int | None = Field(default=None, ge=0)


class DocumentUpdate(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    favorite: bool | None = None
    pinned: bool | None = None

DocumentExportFormat = Literal["source", "pdf"]


class DocumentExportRequest(StrictModel):
    format: DocumentExportFormat


class DocumentRevisionCreate(StrictModel):
    block_key: str = Field(min_length=1, max_length=240)
    before: dict[str, Any] = Field(default_factory=dict)
    after: dict[str, Any]


DocumentAnnotationKind = Literal[
    "highlight", "note", "tag", "pen", "marker", "rectangle", "ellipse"
]


class DocumentAnnotationCreate(StrictModel):
    block_key: str = Field(min_length=1, max_length=240)
    kind: DocumentAnnotationKind
    locator: dict[str, Any] = Field(default_factory=dict)
    quote: str = Field(default="", max_length=200000)
    note: str = Field(default="", max_length=20000)
    color: str = Field(default="yellow", min_length=1, max_length=40)
    geometry: dict[str, Any] = Field(default_factory=dict)


class DocumentAnnotationUpdate(StrictModel):
    note: str | None = Field(default=None, max_length=20000)
    color: str | None = Field(default=None, min_length=1, max_length=40)
    geometry: dict[str, Any] | None = None


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
    source_block_key: str = Field(default="", max_length=500)
    source_locator: dict[str, Any] = Field(default_factory=dict)
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
    source_block_key: str | None = Field(default=None, max_length=500)
    source_locator: dict[str, Any] | None = None
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
        "source_block_key",
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
