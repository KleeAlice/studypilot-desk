from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from ..db import Database
from ..errors import AppError


class VocabularyService:
    RATINGS = {
        "again": (0, -0.20),
        "hard": (1, -0.15),
        "good": (3, 0.00),
        "easy": (5, 0.15),
    }

    def __init__(self, database: Database) -> None:
        self.database = database

    def create_item(self, course_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        term = str(payload.get("term") or "").strip()
        if not term:
            raise AppError("VOCABULARY_TERM_REQUIRED", "Term is required", 422)
        with self.database.connect() as connection:
            item_id = connection.execute(
                """INSERT INTO vocabulary_items(
                    course_id, language_tag, term, pronunciation, meaning, example,
                    source_kind, source_id, document_id, block_key, locator_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    course_id,
                    str(payload.get("language_tag") or ""),
                    term,
                    str(payload.get("pronunciation") or ""),
                    str(payload.get("meaning") or ""),
                    str(payload.get("example") or ""),
                    str(payload.get("source_kind") or ""),
                    str(payload.get("source_id") or ""),
                    payload.get("document_id"),
                    str(payload.get("block_key") or ""),
                    json.dumps(payload.get("locator") or {}, ensure_ascii=False),
                ),
            ).lastrowid
        return self.get(int(item_id))

    def get(self, item_id: int) -> dict[str, Any]:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT * FROM vocabulary_items WHERE id = ?", (item_id,)
            ).fetchone()
        if row is None:
            raise AppError("VOCABULARY_NOT_FOUND", "Vocabulary item not found", 404)
        return self._serialize(row)


    def list_items(
        self,
        course_id: int,
        *,
        due_only: bool = False,
        limit: int = 40,
        now: datetime | None = None,
    ) -> list[dict[str, Any]]:
        clauses = ["course_id = ?"]
        parameters: list[Any] = [course_id]
        if due_only:
            current = (now or datetime.now(timezone.utc)).isoformat()
            clauses.append("(next_review_at IS NULL OR next_review_at <= ?)")
            parameters.append(current)
        parameters.append(max(1, min(200, limit)))
        query = (
            "SELECT * FROM vocabulary_items WHERE "
            + " AND ".join(clauses)
            + " ORDER BY CASE WHEN next_review_at IS NULL THEN 0 ELSE 1 END, "
            + "next_review_at, updated_at DESC LIMIT ?"
        )
        with self.database.connect() as connection:
            rows = connection.execute(query, parameters).fetchall()
        return [self._serialize(row) for row in rows]

    @staticmethod
    def _serialize(row) -> dict[str, Any]:
        result = dict(row)
        try:
            result["locator"] = json.loads(result.pop("locator_json") or "{}")
        except (TypeError, json.JSONDecodeError):
            result["locator"] = {}
        return result
    def review(
        self,
        item_id: int,
        rating: str,
        *,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        if rating not in self.RATINGS:
            raise AppError("VOCABULARY_RATING_INVALID", "Invalid review rating", 422)
        now = now or datetime.now(timezone.utc)
        item = self.get(item_id)
        previous = int(item["interval_days"])
        repetitions = int(item["repetitions"])
        ease = float(item["ease_factor"])
        base_days, ease_delta = self.RATINGS[rating]
        if rating == "again":
            interval = 1
            repetitions = 0
        elif repetitions == 0:
            interval = max(1, base_days)
            repetitions = 1
        elif repetitions == 1:
            interval = max(3, base_days)
            repetitions = 2
        else:
            interval = max(base_days, round(max(1, previous) * ease))
            repetitions += 1
        ease = min(3.0, max(1.3, ease + ease_delta))
        next_review = now + timedelta(days=interval)
        with self.database.connect() as connection:
            connection.execute(
                """UPDATE vocabulary_items
                   SET interval_days = ?, repetitions = ?, ease_factor = ?,
                       next_review_at = ?, last_rating = ?,
                       updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (
                    interval,
                    repetitions,
                    ease,
                    next_review.isoformat(),
                    rating,
                    item_id,
                ),
            )
            connection.execute(
                """INSERT INTO vocabulary_reviews(
                    item_id, rating, previous_interval_days, interval_days,
                    ease_factor, reviewed_at
                ) VALUES (?, ?, ?, ?, ?, ?)""",
                (item_id, rating, previous, interval, ease, now.isoformat()),
            )
        return self.get(item_id)

    def check_in(
        self, course_id: int, local_date: str, *, reviewed_count: int
    ) -> dict[str, Any]:
        with self.database.connect() as connection:
            previous = connection.execute(
                """SELECT local_date, streak_days FROM daily_learning_checkins
                   WHERE course_id = ? AND local_date < ?
                   ORDER BY local_date DESC LIMIT 1""",
                (course_id, local_date),
            ).fetchone()
            current = connection.execute(
                """SELECT streak_days FROM daily_learning_checkins
                   WHERE course_id = ? AND local_date = ?""",
                (course_id, local_date),
            ).fetchone()
            if current:
                streak = int(current["streak_days"])
            elif previous:
                previous_date = datetime.fromisoformat(str(previous["local_date"])).date()
                current_date = datetime.fromisoformat(local_date).date()
                streak = (
                    int(previous["streak_days"]) + 1
                    if (current_date - previous_date).days == 1
                    else 1
                )
            else:
                streak = 1
            connection.execute(
                """INSERT INTO daily_learning_checkins(
                    course_id, local_date, reviewed_count, streak_days, updated_at
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(course_id, local_date) DO UPDATE SET
                    reviewed_count = excluded.reviewed_count,
                    streak_days = excluded.streak_days,
                    updated_at = CURRENT_TIMESTAMP""",
                (course_id, local_date, reviewed_count, streak),
            )
            row = connection.execute(
                """SELECT course_id, local_date, reviewed_count, streak_days
                   FROM daily_learning_checkins
                   WHERE course_id = ? AND local_date = ?""",
                (course_id, local_date),
            ).fetchone()
        return dict(row)
