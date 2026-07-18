from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator


CURRENT_SCHEMA_VERSION = 6

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
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(course_id, sha256)
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

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
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
            count = connection.execute("SELECT COUNT(*) FROM courses").fetchone()[0]
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
            ("半年算法转向默认路线", "源自优化精校版 24 周执行手册",),
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
            "active_course": course_id,
            "current_week": 1,
            "theme": "system",
            "onboarding_complete": False,
        }
        connection.executemany(
            "INSERT INTO settings(key, value_json) VALUES (?, ?)",
            [(key, json.dumps(value, ensure_ascii=False)) for key, value in defaults.items()],
        )
