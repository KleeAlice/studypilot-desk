from __future__ import annotations

import json
from datetime import date, timedelta

from ..db import Database
from ..errors import AppError
from ..repository import as_dict


INTERVALS = {0: 1, 1: 1, 2: 2, 3: 4, 4: 7, 5: 14}


class LearningService:
    def __init__(self, database: Database) -> None:
        self.database = database

    def _course_id(self) -> int:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT value_json FROM settings WHERE key = 'active_course'"
            ).fetchone()
        return int(json.loads(row[0]))

    def update_mastery(self, knowledge_id: int, success: bool, weight: float) -> dict:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT * FROM knowledge_nodes WHERE id = ? AND course_id = ?",
                (knowledge_id, self._course_id()),
            ).fetchone()
            if not row:
                raise AppError("KNOWLEDGE_NOT_FOUND", "知识点不存在", 404)
            alpha = float(row["mastery_alpha"]) + (weight if success else 0.0)
            beta = float(row["mastery_beta"]) + (0.0 if success else weight)
            connection.execute(
                """UPDATE knowledge_nodes SET mastery_alpha = ?, mastery_beta = ?
                WHERE id = ?""",
                (alpha, beta, knowledge_id),
            )
        return {
            "knowledge_id": knowledge_id,
            "alpha": alpha,
            "beta": beta,
            "mastery": round(alpha / (alpha + beta), 6),
        }

    def grade_quiz(
        self,
        knowledge_id: int,
        prompt: str,
        answer: str,
        expected_keywords: list[str],
    ) -> dict:
        normalized = answer.casefold()
        missing = [keyword for keyword in expected_keywords if keyword.casefold() not in normalized]
        correct = not missing
        error_reason = "" if correct else "缺少关键词：" + "、".join(missing)
        with self.database.connect() as connection:
            connection.execute(
                """INSERT INTO quiz_attempts(
                    course_id, knowledge_id, score, max_score, error_reason
                ) VALUES (?, ?, ?, 1.0, ?)""",
                (self._course_id(), knowledge_id, 1.0 if correct else 0.0, error_reason),
            )
        mastery = self.update_mastery(knowledge_id, correct, 1.0)
        review = self.schedule_review(knowledge_id, 4 if correct else 1)
        return {
            "knowledge_id": knowledge_id,
            "prompt": prompt,
            "answer": answer,
            "correct": correct,
            "missing_keywords": missing,
            "error_reason": error_reason,
            "mastery": mastery["mastery"],
            "review": review,
        }

    def schedule_review(self, knowledge_id: int, quality: int) -> dict:
        quality = min(5, max(0, quality))
        interval = INTERVALS[quality]
        due = date.today() + timedelta(days=interval)
        with self.database.connect() as connection:
            connection.execute(
                """UPDATE reviews SET status = 'superseded'
                WHERE course_id = ? AND knowledge_id = ? AND status = 'due'""",
                (self._course_id(), knowledge_id),
            )
            cursor = connection.execute(
                """INSERT INTO reviews(
                    course_id, knowledge_id, due_date, interval_days, quality, status
                ) VALUES (?, ?, ?, ?, ?, 'due')""",
                (self._course_id(), knowledge_id, due.isoformat(), interval, quality),
            )
            row = connection.execute(
                "SELECT * FROM reviews WHERE id = ?", (cursor.lastrowid,)
            ).fetchone()
        return as_dict(row)

    def list_reviews(self, include_superseded: bool = False) -> list[dict]:
        status_clause = "" if include_superseded else "AND r.status = 'due'"
        with self.database.connect() as connection:
            rows = connection.execute(
                f"""SELECT r.*, k.title AS knowledge_title
                FROM reviews r JOIN knowledge_nodes k ON k.id = r.knowledge_id
                WHERE r.course_id = ? {status_clause}
                ORDER BY r.due_date, r.id""",
                (self._course_id(),),
            ).fetchall()
        return [as_dict(row) for row in rows]

