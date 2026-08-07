import sqlite3

from backend.app.db import CURRENT_SCHEMA_VERSION, Database


def test_language_journey_schema_is_idempotent(tmp_path) -> None:
    database = Database(tmp_path / "app.db")

    database.initialize()
    database.initialize()

    with sqlite3.connect(database.path) as connection:
        course_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(courses)")
        }
        progress_columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(language_lesson_progress)"
            )
        }
        provider_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(agent_providers)")
        }
        version = connection.execute("PRAGMA user_version").fetchone()[0]

    assert CURRENT_SCHEMA_VERSION == 22
    assert version == CURRENT_SCHEMA_VERSION
    assert "deleted_at" in provider_columns
    assert {"lesson_minutes", "speech_rate", "auto_play_audio"} <= course_columns
    assert {
        "course_id",
        "lesson_id",
        "pack_version",
        "status",
        "best_score",
        "attempts",
        "duration_seconds",
        "activity_results_json",
        "started_at",
        "completed_at",
        "updated_at",
    } <= progress_columns
