from datetime import datetime, timezone

from backend.app.db import Database
from backend.app.services.vocabulary import VocabularyService


def test_vocabulary_review_records_explainable_schedule_and_daily_streak(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()
    service = VocabularyService(database)
    with database.connect() as connection:
        course_id = connection.execute("SELECT MIN(id) FROM courses").fetchone()[0]

    item = service.create_item(
        course_id,
        {
            "language_tag": "en-US",
            "term": "gradient",
            "pronunciation": "/gradient/",
            "meaning": "slope direction",
            "example": "The gradient points uphill.",
            "source_kind": "document",
            "source_id": "1",
            "document_id": 1,
            "block_key": "section:0",
            "locator": {"line_start": 3},
        },
    )
    now = datetime(2026, 7, 26, 8, tzinfo=timezone.utc)
    reviewed = service.review(item["id"], "good", now=now)
    repeated = service.check_in(course_id, "2026-07-26", reviewed_count=1)
    same_day = service.check_in(course_id, "2026-07-26", reviewed_count=2)

    assert reviewed["last_rating"] == "good"
    assert reviewed["interval_days"] >= 1
    assert reviewed["next_review_at"] > now.isoformat()
    assert repeated["streak_days"] == 1
    assert same_day["streak_days"] == 1
    assert same_day["reviewed_count"] == 2
