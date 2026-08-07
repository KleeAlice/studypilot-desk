import sqlite3

from backend.app.db import CURRENT_SCHEMA_VERSION, Database


def test_database_migrations_are_idempotent_and_seed_roadmap(tmp_path) -> None:
    database = Database(tmp_path / "app.db")

    database.initialize()
    database.initialize()

    with sqlite3.connect(database.path) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == CURRENT_SCHEMA_VERSION
        assert connection.execute("SELECT COUNT(*) FROM phases").fetchone()[0] == 6
        assert connection.execute("SELECT COUNT(*) FROM weeks").fetchone()[0] == 24
        assert connection.execute("SELECT COUNT(*) FROM courses").fetchone()[0] == 1
        columns = {
            row[1]: row for row in connection.execute("PRAGMA table_info(knowledge_nodes)")
        }
        python_columns = {
            row[1]: row for row in connection.execute("PRAGMA table_info(python_runs)")
        }
        media_columns = {
            row[1]: row for row in connection.execute("PRAGMA table_info(media_assets)")
        }
        course_columns = {
            row[1]: row for row in connection.execute("PRAGMA table_info(courses)")
        }
        document_columns = {
            row[1]: row for row in connection.execute("PRAGMA table_info(documents)")
        }
        notebook_table = connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge_notebooks'"
        ).fetchone()
        notebook_count = connection.execute(
            "SELECT COUNT(*) FROM knowledge_notebooks"
        ).fetchone()[0]

    assert {
        "kind",
        "content",
        "color",
        "position_x",
        "position_y",
        "source_document_id",
        "source_title",
        "source_block_key",
        "source_locator_json",
        "source_quote",
        "image_asset_id",
        "image_alt",
        "width",
        "height",
        "font_scale",
    } <= columns.keys()
    assert (columns["kind"][2], columns["kind"][3], columns["kind"][4]) == (
        "TEXT",
        1,
        "'concept'",
    )
    assert (columns["content"][3], columns["content"][4]) == (1, "''")
    assert (columns["color"][3], columns["color"][4]) == (1, "'blue'")
    assert (columns["position_x"][2], columns["position_x"][3]) == ("REAL", 0)
    assert (columns["position_y"][2], columns["position_y"][3]) == ("REAL", 0)
    assert (
        columns["source_document_id"][2],
        columns["source_document_id"][3],
    ) == ("INTEGER", 0)
    assert (columns["source_title"][3], columns["source_title"][4]) == (1, "''")
    assert (columns["source_quote"][3], columns["source_quote"][4]) == (1, "''")
    assert (columns["image_asset_id"][2], columns["image_asset_id"][3]) == (
        "TEXT",
        0,
    )
    assert (columns["image_alt"][3], columns["image_alt"][4]) == (1, "''")
    assert {
        "id",
        "course_id",
        "filename",
        "media_type",
        "storage_path",
        "size_bytes",
        "created_at",
    } <= media_columns.keys()
    assert {
        "cover_style",
        "icon",
        "goal",
        "start_date",
        "target_weeks",
        "weekly_hours",
        "progress",
        "last_opened_at",
        "deleted_at",
        "purge_after",
    } <= course_columns.keys()
    assert "source_created_at" in document_columns
    assert notebook_table is not None
    assert notebook_count == 1
    assert {
        "environment_id",
        "interpreter_path",
        "interpreter_version",
    } <= python_columns.keys()
    assert (python_columns["environment_id"][2], python_columns["environment_id"][3]) == (
        "TEXT",
        0,
    )
    assert (python_columns["interpreter_path"][3], python_columns["interpreter_path"][4]) == (
        1,
        "''",
    )
    assert (
        python_columns["interpreter_version"][3],
        python_columns["interpreter_version"][4],
    ) == (1, "''")


def test_existing_v1_database_migrates_to_current_idempotently(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    with sqlite3.connect(database.path) as connection:
        connection.executescript(
            """
            PRAGMA user_version = 1;
            CREATE TABLE courses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE knowledge_nodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                module TEXT NOT NULL DEFAULT '',
                mastery_alpha REAL NOT NULL DEFAULT 1.0,
                mastery_beta REAL NOT NULL DEFAULT 1.0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            INSERT INTO courses(id, title) VALUES (7, 'Existing course');
            INSERT INTO knowledge_nodes(course_id, title) VALUES (7, 'Existing concept');
            """
        )

    database.initialize()
    database.initialize()

    with sqlite3.connect(database.path) as connection:
        connection.row_factory = sqlite3.Row
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        columns = {
            row[1] for row in connection.execute("PRAGMA table_info(knowledge_nodes)")
        }
        node = connection.execute(
            "SELECT * FROM knowledge_nodes WHERE title = 'Existing concept'"
        ).fetchone()
        notebook = connection.execute(
            "SELECT * FROM knowledge_notebooks WHERE course_id = 7"
        ).fetchone()

    assert version == CURRENT_SCHEMA_VERSION
    assert {
        "kind",
        "content",
        "color",
        "position_x",
        "position_y",
        "source_document_id",
        "source_title",
        "source_quote",
        "image_asset_id",
        "image_alt",
        "width",
        "height",
        "font_scale",
    } <= columns
    assert notebook is not None
    assert node["notebook_id"] == notebook["id"]
    assert dict(node) == {
        "id": 1,
            "course_id": 7,
            "notebook_id": notebook["id"],
            "title": "Existing concept",
        "description": "",
        "module": "",
        "mastery_alpha": 1.0,
        "mastery_beta": 1.0,
        "created_at": node["created_at"],
        "kind": "concept",
        "content": "",
        "color": "blue",
        "position_x": None,
        "position_y": None,
        "source_document_id": None,
        "source_title": "",
        "source_quote": "",
        "source_block_key": "",
        "source_locator_json": "{}",
        "image_asset_id": None,
        "image_alt": "",
        "width": None,
        "height": None,
        "font_scale": None,
    }


def test_existing_v2_python_runs_migrate_to_v3_without_losing_history(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    with sqlite3.connect(database.path) as connection:
        connection.executescript(
            """
            PRAGMA user_version = 2;
            CREATE TABLE courses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE python_runs (
                id TEXT PRIMARY KEY,
                course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                code TEXT NOT NULL,
                status TEXT NOT NULL,
                stdout TEXT NOT NULL DEFAULT '',
                stderr TEXT NOT NULL DEFAULT '',
                exit_code INTEGER,
                duration_ms INTEGER,
                truncated INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                finished_at TEXT
            );
            INSERT INTO courses(id, title) VALUES (4, 'Existing course');
            INSERT INTO python_runs(id, course_id, code, status, stdout, exit_code)
            VALUES ('old-run', 4, 'print(42)', 'passed', '42', 0);
            """
        )

    database.initialize()
    database.initialize()

    with sqlite3.connect(database.path) as connection:
        connection.row_factory = sqlite3.Row
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        run = connection.execute(
            "SELECT * FROM python_runs WHERE id = 'old-run'"
        ).fetchone()

    assert version == CURRENT_SCHEMA_VERSION
    assert run["code"] == "print(42)"
    assert run["status"] == "passed"
    assert run["stdout"] == "42"
    assert run["environment_id"] is None
    assert run["interpreter_path"] == ""
    assert run["interpreter_version"] == ""


def test_existing_v3_database_migrates_media_schema_without_losing_nodes(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    with sqlite3.connect(database.path) as connection:
        connection.executescript(
            """
            PRAGMA user_version = 3;
            CREATE TABLE courses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE knowledge_nodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                module TEXT NOT NULL DEFAULT '',
                mastery_alpha REAL NOT NULL DEFAULT 1.0,
                mastery_beta REAL NOT NULL DEFAULT 1.0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                kind TEXT NOT NULL DEFAULT 'concept',
                content TEXT NOT NULL DEFAULT '',
                color TEXT NOT NULL DEFAULT 'blue',
                position_x REAL,
                position_y REAL,
                source_document_id INTEGER,
                source_title TEXT NOT NULL DEFAULT '',
                source_quote TEXT NOT NULL DEFAULT ''
            );
            INSERT INTO courses(id, title) VALUES (2, 'Existing course');
            INSERT INTO knowledge_nodes(course_id, title) VALUES (2, 'Existing node');
            """
        )

    database.initialize()

    with sqlite3.connect(database.path) as connection:
        connection.row_factory = sqlite3.Row
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        node = connection.execute(
            "SELECT * FROM knowledge_nodes WHERE title = 'Existing node'"
        ).fetchone()
        media_table = connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'media_assets'"
        ).fetchone()

    assert version == CURRENT_SCHEMA_VERSION
    assert node["image_asset_id"] is None
    assert node["image_alt"] == ""
    assert media_table is not None


def test_existing_v6_documents_migrate_before_new_document_indexes(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    with sqlite3.connect(database.path) as connection:
        connection.executescript(
            """
            PRAGMA user_version = 6;
            CREATE TABLE courses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE documents (
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
            INSERT INTO courses(id, title) VALUES (4, 'Existing course');
            INSERT INTO documents(
                course_id, title, filename, stored_path, media_type, sha256, body
            ) VALUES (
                4, 'Existing material', 'legacy.txt', 'documents/legacy.txt',
                'text/plain', 'legacy-sha', 'Preserved content'
            );
            """
        )

    database.initialize()

    with sqlite3.connect(database.path) as connection:
        connection.row_factory = sqlite3.Row
        connection.execute(
            """INSERT INTO documents(
                course_id, title, filename, stored_path, media_type, sha256, body,
                updated_at
            ) VALUES (4, 'New material', 'new.txt', 'documents/new.txt',
                'text/plain', 'new-sha', 'New content', CURRENT_TIMESTAMP)"""
        )
        version = connection.execute("PRAGMA user_version").fetchone()[0]
        columns = {
            row[1] for row in connection.execute("PRAGMA table_info(documents)")
        }
        indexes = {
            row[1] for row in connection.execute("PRAGMA index_list(documents)")
        }
        document = connection.execute(
            "SELECT * FROM documents WHERE sha256 = 'legacy-sha'"
        ).fetchone()
        new_document = connection.execute(
            "SELECT * FROM documents WHERE sha256 = 'new-sha'"
        ).fetchone()

    assert version == CURRENT_SCHEMA_VERSION
    assert {"format", "status", "structure_json", "error_message", "deleted_at", "updated_at"} <= columns
    assert "idx_documents_course_deleted" in indexes
    assert document["body"] == "Preserved content"
    assert document["deleted_at"] is None
    assert new_document["updated_at"] is not None


def test_database_enables_foreign_keys_for_each_connection(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()

    with database.connect() as connection:
        assert connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1


def test_agent_schema_persists_threads_and_cascades_messages(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()

    with database.connect() as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == CURRENT_SCHEMA_VERSION
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        assert {"agent_providers", "agent_threads", "agent_messages"} <= tables
        provider_columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(agent_providers)")
        }
        assert "max_output_tokens" in provider_columns
        message_columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(agent_messages)")
        }
        assert "attachments_json" in message_columns
        assert "metadata_json" in message_columns
        thread_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(agent_threads)")
        }
        assert {"mode", "learning_state_json", "pinned"} <= thread_columns
        connection.execute(
            """INSERT INTO agent_providers(id, label, protocol, base_url, model)
            VALUES ('default-check', 'Default check', 'openai_compatible',
                    'https://example.test/v1', 'example')"""
        )
        assert connection.execute(
            "SELECT max_output_tokens FROM agent_providers WHERE id = 'default-check'"
        ).fetchone()[0] == 32000
        course_id = connection.execute("SELECT MIN(id) FROM courses").fetchone()[0]
        thread_id = connection.execute(
            "INSERT INTO agent_threads(course_id, title) VALUES (?, ?)",
            (course_id, "Saved discussion"),
        ).lastrowid
        connection.execute(
            "INSERT INTO agent_messages(thread_id, role, content) VALUES (?, 'user', ?)",
            (thread_id, "Explain this source"),
        )
        connection.execute("DELETE FROM agent_threads WHERE id = ?", (thread_id,))
        assert connection.execute(
            "SELECT COUNT(*) FROM agent_messages WHERE thread_id = ?", (thread_id,)
        ).fetchone()[0] == 0


def test_agent_learning_columns_migrate_existing_threads_with_safe_defaults(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()

    with database.connect() as connection:
        course_id = connection.execute("SELECT MIN(id) FROM courses").fetchone()[0]
        thread_id = connection.execute(
            "INSERT INTO agent_threads(course_id, title) VALUES (?, 'Legacy thread')",
            (course_id,),
        ).lastrowid
        message_id = connection.execute(
            """INSERT INTO agent_messages(thread_id, role, content)
            VALUES (?, 'assistant', 'Legacy answer')""",
            (thread_id,),
        ).lastrowid
        row = connection.execute(
            "SELECT mode, learning_state_json FROM agent_threads WHERE id = ?",
            (thread_id,),
        ).fetchone()
        message = connection.execute(
            "SELECT metadata_json FROM agent_messages WHERE id = ?",
            (message_id,),
        ).fetchone()

    assert dict(row) == {"mode": "assistant", "learning_state_json": "{}"}
    assert message["metadata_json"] == "{}"


def test_agent_action_plan_schema_supports_approval_and_batch_undo(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()

    with database.connect() as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == CURRENT_SCHEMA_VERSION
        columns = {
            row[1]
            for row in connection.execute("PRAGMA table_info(agent_action_plans)")
        }
        assert {
            "id",
            "thread_id",
            "assistant_message_id",
            "course_id",
            "status",
            "title",
            "summary",
            "operations_json",
            "before_json",
            "result_json",
            "error",
            "confirmed_at",
            "completed_at",
            "created_at",
            "updated_at",
        } <= columns

        course_id = connection.execute("SELECT MIN(id) FROM courses").fetchone()[0]
        thread_id = connection.execute(
            "INSERT INTO agent_threads(course_id, title) VALUES (?, ?)",
            (course_id, "Action plan"),
        ).lastrowid
        message_id = connection.execute(
            "INSERT INTO agent_messages(thread_id, role, content) VALUES (?, 'assistant', ?)",
            (thread_id, "Proposed changes"),
        ).lastrowid
        connection.execute(
            """INSERT INTO agent_action_plans(
                thread_id, assistant_message_id, course_id, title, summary, operations_json
            ) VALUES (?, ?, ?, ?, ?, '[]')""",
            (thread_id, message_id, course_id, "Plan", "Summary"),
        )
        connection.execute("DELETE FROM agent_threads WHERE id = ?", (thread_id,))
        assert connection.execute(
            "SELECT COUNT(*) FROM agent_action_plans WHERE thread_id = ?", (thread_id,)
        ).fetchone()[0] == 0


def test_initialize_reseeds_after_all_courses_are_deleted_without_overwriting_preferences(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()

    with database.connect() as connection:
        connection.execute("DELETE FROM courses")
        connection.execute(
            "UPDATE settings SET value_json = ? WHERE key = 'theme'",
            ('"light"',),
        )
        connection.execute(
            "UPDATE settings SET value_json = '0' WHERE key = 'active_course'"
        )

    database.initialize()

    with database.connect() as connection:
        course_id = connection.execute("SELECT MIN(id) FROM courses").fetchone()[0]
        settings = dict(connection.execute("SELECT key, value_json FROM settings"))

    assert course_id is not None
    assert settings["active_course"] == str(course_id)
    assert settings["theme"] == '"light"'


def test_v16_database_adds_learning_retrieval_vocabulary_and_speech_without_losing_data(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()

    with database.connect() as connection:
        course_id = connection.execute("SELECT MIN(id) FROM courses").fetchone()[0]
        connection.execute(
            "INSERT INTO notes(course_id, title, content) VALUES (?, 'Preserved note', 'must remain')",
            (course_id,),
        )
        connection.execute("PRAGMA user_version = 16")

    database.initialize()

    with database.connect() as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type IN ('table', 'view')"
            )
        }
        provider_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(agent_providers)")
        }
        message_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(agent_messages)")
        }
        note = connection.execute(
            "SELECT title, content FROM notes WHERE title = 'Preserved note'"
        ).fetchone()
        version = connection.execute("PRAGMA user_version").fetchone()[0]

    assert version == CURRENT_SCHEMA_VERSION
    assert {
        "rag_entries",
        "rag_entries_fts",
        "vocabulary_items",
        "vocabulary_reviews",
        "daily_learning_checkins",
        "speech_modules",
        "speech_preferences",
    } <= tables
    assert {
        "connect_timeout_seconds",
        "first_byte_timeout_seconds",
        "idle_timeout_seconds",
    } <= provider_columns
    assert {"stream_id", "draft_updated_at"} <= message_columns
    assert tuple(note) == ("Preserved note", "must remain")

def test_v17_database_adds_language_course_domain_without_losing_existing_courses(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()

    with database.connect() as connection:
        course_id = connection.execute("SELECT MIN(id) FROM courses").fetchone()[0]
        connection.execute(
            "UPDATE courses SET title = 'Preserved knowledge course' WHERE id = ?",
            (course_id,),
        )
        connection.execute("PRAGMA user_version = 17")

    database.initialize()

    with database.connect() as connection:
        course = connection.execute(
            """SELECT title, course_type, target_language_tag, native_language_tag,
                      proficiency_level, daily_word_goal, pronunciation_scheme,
                      romanization_enabled, training_focus_json
               FROM courses WHERE id = ?""",
            (course_id,),
        ).fetchone()
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        version = connection.execute("PRAGMA user_version").fetchone()[0]

    assert version == CURRENT_SCHEMA_VERSION
    assert tuple(course) == (
        "Preserved knowledge course",
        "knowledge",
        "",
        "zh-CN",
        "beginner",
        10,
        "",
        0,
        '["reading","listening","speaking","writing"]',
    )
    assert "language_practice_sessions" in tables
