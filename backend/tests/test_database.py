import sqlite3

from backend.app.db import Database


def test_database_migrations_are_idempotent_and_seed_roadmap(tmp_path) -> None:
    database = Database(tmp_path / "app.db")

    database.initialize()
    database.initialize()

    with sqlite3.connect(database.path) as connection:
        assert connection.execute("PRAGMA user_version").fetchone()[0] == 6
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

    assert version == 6
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

    assert version == 6
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

    assert version == 6
    assert node["image_asset_id"] is None
    assert node["image_alt"] == ""
    assert media_table is not None


def test_database_enables_foreign_keys_for_each_connection(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()

    with database.connect() as connection:
        assert connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1
