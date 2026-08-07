from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


CURRENT_SCHEMA_VERSION = 22

SCHEMA = """
CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    is_default INTEGER NOT NULL DEFAULT 0,
    cover_style TEXT NOT NULL DEFAULT 'indigo',
    icon TEXT NOT NULL DEFAULT 'book',
    goal TEXT NOT NULL DEFAULT '',
    start_date TEXT,
    target_weeks INTEGER,
    weekly_hours REAL,
    course_type TEXT NOT NULL DEFAULT 'knowledge' CHECK(course_type IN ('knowledge','language')),
    target_language_tag TEXT NOT NULL DEFAULT '',
    native_language_tag TEXT NOT NULL DEFAULT 'zh-CN',
    proficiency_level TEXT NOT NULL DEFAULT 'beginner',
    daily_word_goal INTEGER NOT NULL DEFAULT 10,
    pronunciation_scheme TEXT NOT NULL DEFAULT '',
    romanization_enabled INTEGER NOT NULL DEFAULT 0,
    training_focus_json TEXT NOT NULL DEFAULT '["reading","listening","speaking","writing"]',
    lesson_minutes INTEGER NOT NULL DEFAULT 15,
    speech_rate REAL NOT NULL DEFAULT 1.0,
    auto_play_audio INTEGER NOT NULL DEFAULT 0,
    progress REAL NOT NULL DEFAULT 0,
    last_opened_at TEXT,
    deleted_at TEXT,
    purge_after TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    media_type TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS phases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    phase INTEGER NOT NULL,
    title TEXT NOT NULL,
    gate TEXT NOT NULL,
    start_week INTEGER NOT NULL,
    end_week INTEGER NOT NULL,
    acceptance TEXT NOT NULL,
    remediation TEXT NOT NULL,
    exit_criteria TEXT NOT NULL DEFAULT '',
    UNIQUE(course_id, phase)
);

CREATE TABLE IF NOT EXISTS knowledge_notebooks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'canvas' CHECK(kind IN ('canvas','mindmap','mixed')),
    cover_style TEXT NOT NULL DEFAULT 'indigo',
    canvas_settings_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_opened_at TEXT,
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS weeks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    week INTEGER NOT NULL,
    phase INTEGER NOT NULL,
    gate TEXT NOT NULL,
    foundation TEXT NOT NULL,
    tasks_json TEXT NOT NULL,
    deliverables_json TEXT NOT NULL,
    UNIQUE(course_id, week)
);

CREATE TABLE IF NOT EXISTS roadmap_generations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK(status IN ('generating','completed','failed')),
    request_json TEXT NOT NULL DEFAULT '{}',
    roadmap_json TEXT NOT NULL DEFAULT '{}',
    error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_roadmap_generations_course
    ON roadmap_generations(course_id, id DESC);

CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
    description TEXT NOT NULL DEFAULT '',
    week INTEGER,
    kind TEXT NOT NULL DEFAULT 'learning',
    status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','blocked','done')),
    priority INTEGER NOT NULL DEFAULT 1 CHECK(priority BETWEEN 0 AND 3),
    due_date TEXT,
    knowledge_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS task_evidence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    source_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    notebook_id INTEGER REFERENCES knowledge_notebooks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    module TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'concept',
    content TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT 'blue',
    position_x REAL,
    position_y REAL,
    width REAL,
    height REAL,
    font_scale REAL,
    source_document_id INTEGER,
    source_title TEXT NOT NULL DEFAULT '',
    source_quote TEXT NOT NULL DEFAULT '',
    source_block_key TEXT NOT NULL DEFAULT '',
    source_locator_json TEXT NOT NULL DEFAULT '{}',
    image_asset_id TEXT REFERENCES media_assets(id) ON DELETE SET NULL,
    image_alt TEXT NOT NULL DEFAULT '',
    mastery_alpha REAL NOT NULL DEFAULT 1.0,
    mastery_beta REAL NOT NULL DEFAULT 1.0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS knowledge_edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    notebook_id INTEGER REFERENCES knowledge_notebooks(id) ON DELETE CASCADE,
    source_id INTEGER NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    relation TEXT NOT NULL DEFAULT 'prerequisite',
    UNIQUE(course_id, source_id, target_id)
);

CREATE TABLE IF NOT EXISTS captures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'inbox',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    knowledge_id INTEGER REFERENCES knowledge_nodes(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mindmaps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    graph_json TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    media_type TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    body TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    format TEXT NOT NULL DEFAULT 'text',
    status TEXT NOT NULL DEFAULT 'ready',
    structure_json TEXT NOT NULL DEFAULT '{}',
    error_message TEXT NOT NULL DEFAULT '',
    deleted_at TEXT,
    source_created_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, sha256)
);

CREATE TABLE IF NOT EXISTS document_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    block_key TEXT NOT NULL,
    block_type TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    locator_json TEXT NOT NULL DEFAULT '{}',
    text TEXT NOT NULL DEFAULT '',
    data_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, block_key)
);

CREATE TABLE IF NOT EXISTS document_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    block_key TEXT NOT NULL,
    before_json TEXT NOT NULL DEFAULT '{}',
    after_json TEXT NOT NULL DEFAULT '{}',
    revision INTEGER NOT NULL DEFAULT 1,
    is_applied INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    block_key TEXT NOT NULL,
    kind TEXT NOT NULL,
    locator_json TEXT NOT NULL DEFAULT '{}',
    quote TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT 'yellow',
    geometry_json TEXT NOT NULL DEFAULT '{}',
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE IF NOT EXISTS document_fts USING fts5(
    title, body, content='documents', content_rowid='id', tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
    INSERT INTO document_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;
CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
    INSERT INTO document_fts(document_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
END;
CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
    INSERT INTO document_fts(document_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
    INSERT INTO document_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;

CREATE TABLE IF NOT EXISTS document_highlights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    quote TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    start_offset INTEGER,
    end_offset INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS python_runs (
    id TEXT PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    status TEXT NOT NULL,
    stdout TEXT NOT NULL DEFAULT '',
    stderr TEXT NOT NULL DEFAULT '',
    exit_code INTEGER,
    duration_ms INTEGER,
    truncated INTEGER NOT NULL DEFAULT 0,
    environment_id TEXT,
    interpreter_path TEXT NOT NULL DEFAULT '',
    interpreter_version TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TEXT
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    knowledge_id INTEGER REFERENCES knowledge_nodes(id) ON DELETE SET NULL,
    score REAL NOT NULL,
    max_score REAL NOT NULL,
    error_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    knowledge_id INTEGER NOT NULL REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
    due_date TEXT NOT NULL,
    interval_days INTEGER NOT NULL,
    quality INTEGER,
    status TEXT NOT NULL DEFAULT 'due',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS generic_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    collection TEXT NOT NULL,
    title TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_course_status ON tasks(course_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_week ON tasks(course_id, week);
CREATE INDEX IF NOT EXISTS idx_generic_collection ON generic_items(course_id, collection);
CREATE INDEX IF NOT EXISTS idx_media_assets_course ON media_assets(course_id);
CREATE INDEX IF NOT EXISTS idx_document_blocks_document ON document_blocks(document_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_document_annotations_document ON document_annotations(document_id, block_key);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_providers (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'custom',
    protocol TEXT NOT NULL CHECK(protocol IN ('openai_compatible','anthropic','gemini','azure_openai')),
    base_url TEXT NOT NULL,
    model TEXT NOT NULL,
    api_key TEXT NOT NULL DEFAULT '',
    max_output_tokens INTEGER NOT NULL DEFAULT 32000,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS agent_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '新对话',
    provider_id TEXT NOT NULL DEFAULT 'openai',
    model TEXT NOT NULL DEFAULT '',
    mode TEXT NOT NULL DEFAULT 'assistant',
    learning_state_json TEXT NOT NULL DEFAULT '{}',
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user','assistant')),
    content TEXT NOT NULL,
    sources_json TEXT NOT NULL DEFAULT '[]',
    attachments_json TEXT NOT NULL DEFAULT '[]',
    metadata_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'complete',
    error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_action_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
    assistant_message_id INTEGER NOT NULL UNIQUE REFERENCES agent_messages(id) ON DELETE CASCADE,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','executing','completed','cancelled','undone','failed')),
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    operations_json TEXT NOT NULL DEFAULT '[]',
    before_json TEXT NOT NULL DEFAULT '{}',
    result_json TEXT NOT NULL DEFAULT '{}',
    error TEXT NOT NULL DEFAULT '',
    confirmed_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_threads_course ON agent_threads(course_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_thread ON agent_messages(thread_id, id);
CREATE INDEX IF NOT EXISTS idx_agent_action_plans_thread ON agent_action_plans(thread_id, id);
"""


class Database:
    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=15, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            version = int(connection.execute("PRAGMA user_version").fetchone()[0])
            if version > CURRENT_SCHEMA_VERSION:
                raise RuntimeError(
                    f"Database schema {version} is newer than supported schema "
                    f"{CURRENT_SCHEMA_VERSION}"
                )
            connection.executescript(SCHEMA)
            self._migrate_to_v2(connection)
            self._migrate_to_v3(connection)
            self._migrate_to_v4(connection)
            self._migrate_to_v5(connection)
            self._migrate_to_v6(connection)
            self._migrate_to_v7(connection)
            self._migrate_to_v8(connection)
            self._migrate_to_v9(connection)
            self._migrate_to_v10(connection)
            self._migrate_to_v11(connection)
            self._migrate_to_v12(connection)
            if version < 13:
                self._migrate_to_v13(connection)
            if version < 14:
                self._migrate_to_v14(connection)
            if version < 15:
                self._migrate_to_v15(connection)
            if version < 16:
                self._migrate_to_v16(connection)
            self._migrate_to_v17(connection)
            count = connection.execute("SELECT COUNT(*) FROM courses").fetchone()[0]
            self._migrate_to_v18(connection)
            self._migrate_to_v19(connection)
            self._migrate_to_v20(connection)
            self._migrate_to_v22(connection)
            self._repair_agent_thread_models(connection)
            if count == 0:
                self._seed_default_course(connection)
            self._ensure_default_notebooks(connection)
            connection.execute(f"PRAGMA user_version = {CURRENT_SCHEMA_VERSION}")

    @classmethod
    def _migrate_to_v2(cls, connection: sqlite3.Connection) -> None:
        columns = (
            ("kind", "TEXT NOT NULL DEFAULT 'concept'"),
            ("content", "TEXT NOT NULL DEFAULT ''"),
            ("color", "TEXT NOT NULL DEFAULT 'blue'"),
            ("position_x", "REAL"),
            ("position_y", "REAL"),
            ("source_document_id", "INTEGER"),
            ("source_title", "TEXT NOT NULL DEFAULT ''"),
            ("source_quote", "TEXT NOT NULL DEFAULT ''"),
        )
        for name, declaration in columns:
            cls._ensure_column(
                connection, "knowledge_nodes", name, declaration
            )

    @classmethod
    def _migrate_to_v3(cls, connection: sqlite3.Connection) -> None:
        columns = (
            ("environment_id", "TEXT"),
            ("interpreter_path", "TEXT NOT NULL DEFAULT ''"),
            ("interpreter_version", "TEXT NOT NULL DEFAULT ''"),
        )
        for name, declaration in columns:
            cls._ensure_column(connection, "python_runs", name, declaration)

    @classmethod
    def _migrate_to_v4(cls, connection: sqlite3.Connection) -> None:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS media_assets (
                id TEXT PRIMARY KEY,
                course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                filename TEXT NOT NULL,
                media_type TEXT NOT NULL,
                storage_path TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        columns = (
            (
                "image_asset_id",
                "TEXT REFERENCES media_assets(id) ON DELETE SET NULL",
            ),
            ("image_alt", "TEXT NOT NULL DEFAULT ''"),
        )
        for name, declaration in columns:
            cls._ensure_column(connection, "knowledge_nodes", name, declaration)
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_media_assets_course ON media_assets(course_id)"
        )

    @classmethod
    def _migrate_to_v5(cls, connection: sqlite3.Connection) -> None:
        columns = (
            ("cover_style", "TEXT NOT NULL DEFAULT 'indigo'"),
            ("icon", "TEXT NOT NULL DEFAULT 'book'"),
            ("goal", "TEXT NOT NULL DEFAULT ''"),
            ("start_date", "TEXT"),
            ("target_weeks", "INTEGER"),
            ("weekly_hours", "REAL"),
            ("progress", "REAL NOT NULL DEFAULT 0"),
            ("last_opened_at", "TEXT"),
            ("deleted_at", "TEXT"),
            ("purge_after", "TEXT"),
        )
        for name, declaration in columns:
            cls._ensure_column(connection, "courses", name, declaration)
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_courses_deleted ON courses(deleted_at, updated_at)"
        )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS knowledge_notebooks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                kind TEXT NOT NULL DEFAULT 'canvas' CHECK(kind IN ('canvas','mindmap','mixed')),
                cover_style TEXT NOT NULL DEFAULT 'indigo',
                canvas_settings_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_opened_at TEXT,
                deleted_at TEXT
            )"""
        )
        cls._ensure_column(
            connection,
            "knowledge_nodes",
            "notebook_id",
            "INTEGER REFERENCES knowledge_notebooks(id) ON DELETE CASCADE",
        )
        cls._ensure_column(
            connection,
            "knowledge_edges",
            "notebook_id",
            "INTEGER REFERENCES knowledge_notebooks(id) ON DELETE CASCADE",
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_notebooks_course ON knowledge_notebooks(course_id, deleted_at, updated_at)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_notebook ON knowledge_nodes(course_id, notebook_id)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_knowledge_edges_notebook ON knowledge_edges(course_id, notebook_id)"
        )

    @classmethod
    def _migrate_to_v6(cls, connection: sqlite3.Connection) -> None:
        for name, declaration in (
            ("width", "REAL"),
            ("height", "REAL"),
            ("font_scale", "REAL"),
        ):
            cls._ensure_column(connection, "knowledge_nodes", name, declaration)

    @classmethod
    def _migrate_to_v7(cls, connection: sqlite3.Connection) -> None:
        for name, declaration in (
            ("format", "TEXT NOT NULL DEFAULT 'text'"),
            ("status", "TEXT NOT NULL DEFAULT 'ready'"),
            ("structure_json", "TEXT NOT NULL DEFAULT '{}'"),
            ("error_message", "TEXT NOT NULL DEFAULT ''"),
            ("deleted_at", "TEXT"),
            ("updated_at", "TEXT"),
        ):
            cls._ensure_column(connection, "documents", name, declaration)
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS document_blocks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                block_key TEXT NOT NULL,
                block_type TEXT NOT NULL,
                ordinal INTEGER NOT NULL,
                locator_json TEXT NOT NULL DEFAULT '{}',
                text TEXT NOT NULL DEFAULT '',
                data_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(document_id, block_key)
            );
            CREATE TABLE IF NOT EXISTS document_revisions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                block_key TEXT NOT NULL,
                before_json TEXT NOT NULL DEFAULT '{}',
                after_json TEXT NOT NULL DEFAULT '{}',
                revision INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS document_annotations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                block_key TEXT NOT NULL,
                kind TEXT NOT NULL,
                locator_json TEXT NOT NULL DEFAULT '{}',
                quote TEXT NOT NULL DEFAULT '',
                note TEXT NOT NULL DEFAULT '',
                color TEXT NOT NULL DEFAULT 'yellow',
                geometry_json TEXT NOT NULL DEFAULT '{}',
                revision INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_document_blocks_document ON document_blocks(document_id, ordinal);
            CREATE INDEX IF NOT EXISTS idx_document_annotations_document ON document_annotations(document_id, block_key);
            CREATE INDEX IF NOT EXISTS idx_documents_course_deleted ON documents(course_id, deleted_at, updated_at);
            """
        )

    @classmethod
    def _migrate_to_v8(cls, connection: sqlite3.Connection) -> None:
        for name, declaration in (
            ("source_block_key", "TEXT NOT NULL DEFAULT ''"),
            ("source_locator_json", "TEXT NOT NULL DEFAULT '{}'"),
        ):
            cls._ensure_column(connection, "knowledge_nodes", name, declaration)

    @classmethod
    def _migrate_to_v9(cls, connection: sqlite3.Connection) -> None:
        cls._ensure_column(
            connection,
            "document_revisions",
            "is_applied",
            "INTEGER NOT NULL DEFAULT 1",
        )

    @staticmethod
    def _migrate_to_v10(connection: sqlite3.Connection) -> None:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS agent_providers (
                id TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                protocol TEXT NOT NULL CHECK(protocol IN ('openai_compatible','anthropic','gemini','azure_openai')),
                base_url TEXT NOT NULL,
                model TEXT NOT NULL,
                api_key TEXT NOT NULL DEFAULT '',
                max_output_tokens INTEGER NOT NULL DEFAULT 32000,
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS agent_threads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                title TEXT NOT NULL DEFAULT '新对话',
                provider_id TEXT NOT NULL DEFAULT 'openai',
                model TEXT NOT NULL DEFAULT '',
                mode TEXT NOT NULL DEFAULT 'assistant',
                learning_state_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS agent_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                thread_id INTEGER NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
                role TEXT NOT NULL CHECK(role IN ('user','assistant')),
                content TEXT NOT NULL,
                sources_json TEXT NOT NULL DEFAULT '[]',
                metadata_json TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'complete',
                error TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_agent_threads_course ON agent_threads(course_id, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_agent_messages_thread ON agent_messages(thread_id, id);
            """
        )

    @staticmethod
    def _migrate_to_v11(connection: sqlite3.Connection) -> None:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS agent_action_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                thread_id INTEGER NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
                assistant_message_id INTEGER NOT NULL UNIQUE REFERENCES agent_messages(id) ON DELETE CASCADE,
                course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                status TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','executing','completed','cancelled','undone','failed')),
                title TEXT NOT NULL,
                summary TEXT NOT NULL DEFAULT '',
                operations_json TEXT NOT NULL DEFAULT '[]',
                before_json TEXT NOT NULL DEFAULT '{}',
                result_json TEXT NOT NULL DEFAULT '{}',
                error TEXT NOT NULL DEFAULT '',
                confirmed_at TEXT,
                completed_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_agent_action_plans_thread
                ON agent_action_plans(thread_id, id);
            """
        )

    @classmethod
    def _migrate_to_v12(cls, connection: sqlite3.Connection) -> None:
        cls._ensure_column(
            connection,
            "agent_providers",
            "max_output_tokens",
            "INTEGER NOT NULL DEFAULT 32000",
        )

    @staticmethod
    def _migrate_to_v13(connection: sqlite3.Connection) -> None:
        # v12 temporarily used 100K as the default for every request. Keep it as
        # an explicit option, but move untouched v12 profiles to a responsive
        # daily default. This migration runs only once, so later user choices
        # of 100K are preserved.
        connection.execute(
            "UPDATE agent_providers SET max_output_tokens = 32000 WHERE max_output_tokens = 100000"
        )

    @classmethod
    def _migrate_to_v14(cls, connection: sqlite3.Connection) -> None:
        cls._ensure_column(connection, "documents", "source_created_at", "TEXT")

    @classmethod
    def _migrate_to_v15(cls, connection: sqlite3.Connection) -> None:
        cls._ensure_column(
            connection,
            "agent_messages",
            "attachments_json",
            "TEXT NOT NULL DEFAULT '[]'",
        )

    @classmethod
    def _migrate_to_v16(cls, connection: sqlite3.Connection) -> None:
        cls._ensure_column(
            connection,
            "agent_threads",
            "mode",
            "TEXT NOT NULL DEFAULT 'assistant'",
        )
        cls._ensure_column(
            connection,
            "agent_threads",
            "learning_state_json",
            "TEXT NOT NULL DEFAULT '{}'",
        )
        cls._ensure_column(
            connection,
            "agent_messages",
            "metadata_json",
            "TEXT NOT NULL DEFAULT '{}'",
        )

    @classmethod
    def _migrate_to_v17(cls, connection: sqlite3.Connection) -> None:
        for name, declaration in (
            ("connect_timeout_seconds", "REAL NOT NULL DEFAULT 10"),
            ("first_byte_timeout_seconds", "REAL NOT NULL DEFAULT 90"),
            ("idle_timeout_seconds", "REAL NOT NULL DEFAULT 45"),
        ):
            cls._ensure_column(connection, "agent_providers", name, declaration)
        cls._ensure_column(
            connection, "agent_messages", "stream_id", "TEXT NOT NULL DEFAULT ''"
        )
        cls._ensure_column(connection, "agent_messages", "draft_updated_at", "TEXT")
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS rag_entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                source_kind TEXT NOT NULL,
                source_id TEXT NOT NULL,
                document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
                block_key TEXT NOT NULL DEFAULT '',
                ordinal INTEGER NOT NULL DEFAULT 0,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                locator_json TEXT NOT NULL DEFAULT '{}',
                content_hash TEXT NOT NULL,
                embedding_model TEXT NOT NULL DEFAULT '',
                embedding_version TEXT NOT NULL DEFAULT '',
                embedding_json TEXT NOT NULL DEFAULT '[]',
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(course_id, source_kind, source_id, block_key)
            );
            CREATE VIRTUAL TABLE IF NOT EXISTS rag_entries_fts USING fts5(
                title, content, content='rag_entries', content_rowid='id', tokenize='unicode61'
            );
            CREATE TRIGGER IF NOT EXISTS rag_entries_ai AFTER INSERT ON rag_entries BEGIN
                INSERT INTO rag_entries_fts(rowid, title, content)
                VALUES (new.id, new.title, new.content);
            END;
            CREATE TRIGGER IF NOT EXISTS rag_entries_ad AFTER DELETE ON rag_entries BEGIN
                INSERT INTO rag_entries_fts(rag_entries_fts, rowid, title, content)
                VALUES ('delete', old.id, old.title, old.content);
            END;
            CREATE TRIGGER IF NOT EXISTS rag_entries_au AFTER UPDATE ON rag_entries BEGIN
                INSERT INTO rag_entries_fts(rag_entries_fts, rowid, title, content)
                VALUES ('delete', old.id, old.title, old.content);
                INSERT INTO rag_entries_fts(rowid, title, content)
                VALUES (new.id, new.title, new.content);
            END;
            CREATE INDEX IF NOT EXISTS idx_rag_entries_scope
                ON rag_entries(course_id, is_active, document_id, source_kind);

            CREATE TABLE IF NOT EXISTS vocabulary_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                language_tag TEXT NOT NULL DEFAULT '',
                term TEXT NOT NULL,
                pronunciation TEXT NOT NULL DEFAULT '',
                meaning TEXT NOT NULL DEFAULT '',
                example TEXT NOT NULL DEFAULT '',
                source_kind TEXT NOT NULL DEFAULT '',
                source_id TEXT NOT NULL DEFAULT '',
                document_id INTEGER,
                block_key TEXT NOT NULL DEFAULT '',
                locator_json TEXT NOT NULL DEFAULT '{}',
                ease_factor REAL NOT NULL DEFAULT 2.5,
                interval_days INTEGER NOT NULL DEFAULT 0,
                repetitions INTEGER NOT NULL DEFAULT 0,
                next_review_at TEXT,
                last_rating TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS vocabulary_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_id INTEGER NOT NULL REFERENCES vocabulary_items(id) ON DELETE CASCADE,
                rating TEXT NOT NULL,
                previous_interval_days INTEGER NOT NULL DEFAULT 0,
                interval_days INTEGER NOT NULL,
                ease_factor REAL NOT NULL,
                reviewed_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS daily_learning_checkins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                local_date TEXT NOT NULL,
                reviewed_count INTEGER NOT NULL DEFAULT 0,
                streak_days INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(course_id, local_date)
            );
            CREATE INDEX IF NOT EXISTS idx_vocabulary_due
                ON vocabulary_items(course_id, next_review_at);

            CREATE TABLE IF NOT EXISTS speech_modules (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL CHECK(kind IN ('tts','stt')),
                language_tag TEXT NOT NULL,
                voice TEXT NOT NULL DEFAULT '',
                version TEXT NOT NULL,
                size_bytes INTEGER NOT NULL DEFAULT 0,
                sha256 TEXT NOT NULL,
                install_path TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'installed',
                installed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS speech_preferences (
                language_tag TEXT PRIMARY KEY,
                tts_module_id TEXT REFERENCES speech_modules(id) ON DELETE SET NULL,
                stt_module_id TEXT REFERENCES speech_modules(id) ON DELETE SET NULL,
                rate REAL NOT NULL DEFAULT 1.0,
                pitch REAL NOT NULL DEFAULT 1.0,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            """
        )


    @classmethod
    def _migrate_to_v18(cls, connection: sqlite3.Connection) -> None:
        for name, declaration in (
            (
                "course_type",
                "TEXT NOT NULL DEFAULT 'knowledge' CHECK(course_type IN ('knowledge','language'))",
            ),
            ("target_language_tag", "TEXT NOT NULL DEFAULT ''"),
            ("native_language_tag", "TEXT NOT NULL DEFAULT 'zh-CN'"),
            ("proficiency_level", "TEXT NOT NULL DEFAULT 'beginner'"),
            ("daily_word_goal", "INTEGER NOT NULL DEFAULT 10"),
            ("pronunciation_scheme", "TEXT NOT NULL DEFAULT ''"),
            ("romanization_enabled", "INTEGER NOT NULL DEFAULT 0"),
            (
                "training_focus_json",
                """TEXT NOT NULL DEFAULT '["reading","listening","speaking","writing"]'""",
            ),
        ):
            cls._ensure_column(connection, "courses", name, declaration)
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS language_practice_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                practice_type TEXT NOT NULL
                    CHECK(practice_type IN ('reading','listening','speaking','writing')),
                vocabulary_item_id INTEGER
                    REFERENCES vocabulary_items(id) ON DELETE SET NULL,
                source_kind TEXT NOT NULL DEFAULT '',
                source_id TEXT NOT NULL DEFAULT '',
                document_id INTEGER REFERENCES documents(id) ON DELETE SET NULL,
                block_key TEXT NOT NULL DEFAULT '',
                locator_json TEXT NOT NULL DEFAULT '{}',
                prompt TEXT NOT NULL DEFAULT '',
                answer TEXT NOT NULL DEFAULT '',
                result TEXT NOT NULL
                    CHECK(result IN ('pending','correct','incorrect','self_reviewed')),
                feedback TEXT NOT NULL DEFAULT '',
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                completed_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_language_practice_course
                ON language_practice_sessions(course_id, completed_at DESC, id DESC);
            CREATE INDEX IF NOT EXISTS idx_language_practice_vocabulary
                ON language_practice_sessions(vocabulary_item_id, id DESC);
            """
        )


    @classmethod
    def _migrate_to_v19(cls, connection: sqlite3.Connection) -> None:
        for name, declaration in (
            ("lesson_minutes", "INTEGER NOT NULL DEFAULT 15"),
            ("speech_rate", "REAL NOT NULL DEFAULT 1.0"),
            ("auto_play_audio", "INTEGER NOT NULL DEFAULT 0"),
        ):
            cls._ensure_column(connection, "courses", name, declaration)
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS language_lesson_progress (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                lesson_id TEXT NOT NULL,
                pack_version INTEGER NOT NULL DEFAULT 1,
                status TEXT NOT NULL DEFAULT 'started'
                    CHECK(status IN ('started','completed')),
                best_score INTEGER NOT NULL DEFAULT 0,
                attempts INTEGER NOT NULL DEFAULT 0,
                duration_seconds INTEGER NOT NULL DEFAULT 0,
                activity_results_json TEXT NOT NULL DEFAULT '[]',
                started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                completed_at TEXT,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(course_id, lesson_id, pack_version)
            );
            CREATE INDEX IF NOT EXISTS idx_language_lesson_progress_course
                ON language_lesson_progress(course_id, pack_version, status, id);
            """
        )

    @classmethod
    def _migrate_to_v20(cls, connection: sqlite3.Connection) -> None:
        cls._ensure_column(connection, "agent_providers", "deleted_at", "TEXT")
        cls._ensure_column(
            connection, "agent_providers", "icon", "TEXT NOT NULL DEFAULT 'custom'"
        )
        connection.execute(
            """UPDATE agent_providers SET icon = id
               WHERE icon = 'custom' AND id IN
               ('openai','anthropic','gemini','azure','deepseek','qwen','kimi',
                'glm','openrouter','siliconflow','ollama','lmstudio')"""
        )


    @classmethod
    def _migrate_to_v22(cls, connection: sqlite3.Connection) -> None:
        cls._ensure_column(
            connection,
            "agent_threads",
            "pinned",
            "INTEGER NOT NULL DEFAULT 0",
        )

    @staticmethod
    def _repair_agent_thread_models(connection: sqlite3.Connection) -> None:
        connection.execute(
            """UPDATE agent_threads
               SET model = (
                   SELECT agent_providers.model
                   FROM agent_providers
                   WHERE agent_providers.id = agent_threads.provider_id
               ),
               updated_at = CURRENT_TIMESTAMP
               WHERE EXISTS (
                   SELECT 1
                   FROM agent_providers
                   WHERE agent_providers.id = agent_threads.provider_id
                     AND agent_providers.deleted_at IS NULL
                     AND trim(agent_providers.model) <> ''
                     AND agent_threads.model <> agent_providers.model
               )"""
        )


    @staticmethod
    def _ensure_default_notebooks(connection: sqlite3.Connection) -> None:

        connection.execute(
            """INSERT INTO knowledge_notebooks(course_id, title, description, kind, cover_style)
            SELECT courses.id, '默认知识画布', '从原有知识网络迁移', 'mixed', 'indigo'
            FROM courses
            WHERE NOT EXISTS (
                SELECT 1 FROM knowledge_notebooks
                WHERE knowledge_notebooks.course_id = courses.id
            )"""
        )
        connection.execute(
            """UPDATE knowledge_nodes
            SET notebook_id = (
                SELECT MIN(id) FROM knowledge_notebooks
                WHERE knowledge_notebooks.course_id = knowledge_nodes.course_id
            ) WHERE notebook_id IS NULL"""
        )
        connection.execute(
            """UPDATE knowledge_edges
            SET notebook_id = (
                SELECT MIN(id) FROM knowledge_notebooks
                WHERE knowledge_notebooks.course_id = knowledge_edges.course_id
            ) WHERE notebook_id IS NULL"""
        )

    @staticmethod
    def _ensure_column(
        connection: sqlite3.Connection,
        table: str,
        column: str,
        declaration: str,
    ) -> None:
        existing = {
            row[1] for row in connection.execute(f"PRAGMA table_info({table})")
        }
        if column not in existing:
            connection.execute(
                f"ALTER TABLE {table} ADD COLUMN {column} {declaration}"
            )

    def _seed_default_course(self, connection: sqlite3.Connection) -> None:
        seed_path = Path(__file__).resolve().parents[2] / "data" / "seeds" / "roadmap.json"
        seed = json.loads(seed_path.read_text(encoding="utf-8"))
        cursor = connection.execute(
            "INSERT INTO courses(title, description, is_default) VALUES (?, ?, 1)",
            ("通用学习示例路线", "公开演示用 24 周学习路线",),
        )
        course_id = int(cursor.lastrowid)
        for phase in seed["phases"]:
            connection.execute(
                """INSERT INTO phases(
                    course_id, phase, title, gate, start_week, end_week,
                    acceptance, remediation, exit_criteria
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    course_id,
                    phase["phase"],
                    phase["title"],
                    phase["gate"],
                    phase["start_week"],
                    phase["end_week"],
                    phase["acceptance"],
                    phase["remediation"],
                    phase.get("exit_criteria", ""),
                ),
            )
        for week in seed["weeks"]:
            connection.execute(
                """INSERT INTO weeks(
                    course_id, week, phase, gate, foundation, tasks_json, deliverables_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    course_id,
                    week["week"],
                    week["phase"],
                    week["gate"],
                    week["foundation"],
                    json.dumps(week["tasks"], ensure_ascii=False),
                    json.dumps(week["deliverables"], ensure_ascii=False),
                ),
            )
        defaults = {
            "current_week": 1,
            "theme": "system",
            "ui_language": "zh-CN",
            "onboarding_complete": False,
        }
        connection.executemany(
            "INSERT OR IGNORE INTO settings(key, value_json) VALUES (?, ?)",
            [(key, json.dumps(value, ensure_ascii=False)) for key, value in defaults.items()],
        )
        connection.execute(
            """INSERT INTO settings(key, value_json) VALUES ('active_course', ?)
            ON CONFLICT(key) DO UPDATE SET
                value_json = excluded.value_json,
                updated_at = CURRENT_TIMESTAMP""",
            (json.dumps(course_id),),
        )
