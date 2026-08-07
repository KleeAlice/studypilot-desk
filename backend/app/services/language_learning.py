from __future__ import annotations

import json
from datetime import date, datetime, timezone
from typing import Any

from ..builtin_language_packs import (
    PACK_VERSION,
    get_language_lesson,
    get_language_pack,
    list_language_packs,
)
from ..db import Database
from ..errors import AppError


class LanguageLearningService:
    PRACTICE_TYPES = ("reading", "listening", "speaking", "writing")

    def __init__(self, database: Database) -> None:
        self.database = database

    def require_course(self, course_id: int) -> dict[str, Any]:
        with self.database.connect() as connection:
            row = connection.execute(
                """SELECT id, title, course_type, target_language_tag,
                          native_language_tag, proficiency_level, daily_word_goal,
                          pronunciation_scheme, romanization_enabled,
                          training_focus_json, lesson_minutes, speech_rate,
                          auto_play_audio
                   FROM courses
                   WHERE id = ? AND deleted_at IS NULL""",
                (course_id,),
            ).fetchone()
        if row is None:
            raise AppError("COURSE_NOT_FOUND", "课程不存在", 404)
        course = dict(row)
        if course["course_type"] != "language":
            raise AppError(
                "LANGUAGE_COURSE_REQUIRED",
                "此功能仅适用于语言学习课程",
                409,
            )
        try:
            course["training_focus"] = json.loads(
                course.pop("training_focus_json") or "[]"
            )
        except (TypeError, json.JSONDecodeError):
            course["training_focus"] = []
        course["romanization_enabled"] = bool(course["romanization_enabled"])
        course["auto_play_audio"] = bool(course["auto_play_audio"])
        return course

    def overview(
        self,
        course_id: int,
        *,
        local_date: str | None = None,
        now: datetime | None = None,
    ) -> dict[str, Any]:
        course = self.require_course(course_id)
        local_date = local_date or date.today().isoformat()
        current = (now or datetime.now(timezone.utc)).isoformat()
        with self.database.connect() as connection:
            total_vocabulary = int(
                connection.execute(
                    "SELECT COUNT(*) FROM vocabulary_items WHERE course_id = ?",
                    (course_id,),
                ).fetchone()[0]
            )
            due_vocabulary = int(
                connection.execute(
                    """SELECT COUNT(*) FROM vocabulary_items
                       WHERE course_id = ?
                         AND (next_review_at IS NULL OR next_review_at <= ?)""",
                    (course_id, current),
                ).fetchone()[0]
            )
            due_row = connection.execute(
                """SELECT * FROM vocabulary_items
                   WHERE course_id = ?
                     AND (next_review_at IS NULL OR next_review_at <= ?)
                   ORDER BY CASE WHEN next_review_at IS NULL THEN 0 ELSE 1 END,
                            next_review_at, updated_at DESC
                   LIMIT 1""",
                (course_id, current),
            ).fetchone()
            check_in = connection.execute(
                """SELECT reviewed_count, streak_days
                   FROM daily_learning_checkins
                   WHERE course_id = ? AND local_date = ?""",
                (course_id, local_date),
            ).fetchone()
            practice_rows = connection.execute(
                """SELECT practice_type, COUNT(*) AS count
                   FROM language_practice_sessions
                   WHERE course_id = ? AND completed_at IS NOT NULL
                   GROUP BY practice_type""",
                (course_id,),
            ).fetchall()
        counts = {kind: 0 for kind in self.PRACTICE_TYPES}
        counts.update({str(row["practice_type"]): int(row["count"]) for row in practice_rows})
        return {
            "course_id": course_id,
            "target_language_tag": course["target_language_tag"],
            "native_language_tag": course["native_language_tag"],
            "proficiency_level": course["proficiency_level"],
            "daily_word_goal": int(course["daily_word_goal"]),
            "pronunciation_scheme": course["pronunciation_scheme"],
            "romanization_enabled": course["romanization_enabled"],
            "training_focus": course["training_focus"],
            "lesson_minutes": int(course["lesson_minutes"]),
            "speech_rate": float(course["speech_rate"]),
            "auto_play_audio": course["auto_play_audio"],
            "total_vocabulary": total_vocabulary,
            "due_vocabulary": due_vocabulary,
            "reviewed_today": int(check_in["reviewed_count"]) if check_in else 0,
            "streak_days": int(check_in["streak_days"]) if check_in else 0,
            "due_word": self._vocabulary_item(due_row),
            "practice_counts": counts,
        }

    @staticmethod
    def packs() -> list[dict[str, Any]]:
        return [
            {
                "id": pack["id"],
                "version": pack["version"],
                "language_tag": pack["language_tag"],
                "name": pack["name"],
                "script": pack["script"],
                "pronunciation_scheme": pack["pronunciation_scheme"],
                "stage_count": len(pack["stages"]),
                "lesson_count": sum(
                    len(stage["lessons"]) for stage in pack["stages"]
                ),
            }
            for pack in list_language_packs()
        ]

    def materials(self, course_id: int, *, query: str = "") -> dict[str, Any]:
        course = self.require_course(course_id)
        pack = self._pack_for_course(course)
        lessons = self._flatten_lessons(pack)
        normalized_query = query.strip().casefold()

        def searchable_text(lesson: dict[str, Any]) -> str:
            values = [
                lesson["title"],
                lesson["scenario"],
                lesson["can_do"],
                lesson["passage"]["title"],
                lesson["passage"]["text"],
                lesson["passage"]["translation"],
                lesson["shadowing"]["text"],
                lesson["shadowing"]["translation"],
                lesson["culture_note"],
            ]
            for phrase in lesson["phrases"]:
                values.extend(
                    [
                        phrase["term"],
                        phrase["pronunciation"],
                        phrase["meaning"],
                        phrase["example"],
                    ]
                )
            for line in lesson["dialogue"]:
                values.extend([line["text"], line["translation"]])
            return " ".join(str(value) for value in values).casefold()

        items = [
            lesson
            for lesson in lessons
            if not normalized_query or normalized_query in searchable_text(lesson)
        ]
        return {
            "course_id": course_id,
            "language_tag": pack["language_tag"],
            "language_name": pack["name"],
            "total_lessons": len(lessons),
            "query": query.strip(),
            "items": items,
        }

    def _pack_for_course(self, course: dict[str, Any]) -> dict[str, Any]:
        pack = get_language_pack(str(course["target_language_tag"]))
        if pack is None:
            raise AppError(
                "LANGUAGE_PACK_NOT_FOUND",
                "该语言暂时没有内置学习路径",
                409,
            )
        return pack

    @staticmethod
    def _flatten_lessons(pack: dict[str, Any]) -> list[dict[str, Any]]:
        return [
            lesson
            for stage in pack["stages"]
            for lesson in stage["lessons"]
        ]

    @staticmethod
    def _carry_forward_progress(
        connection,
        *,
        course_id: int,
        pack_version: int,
        valid_lesson_ids: set[str],
    ) -> None:
        legacy_rows = connection.execute(
            """SELECT * FROM language_lesson_progress
               WHERE course_id = ? AND pack_version < ?
               ORDER BY pack_version DESC, id ASC""",
            (course_id, pack_version),
        ).fetchall()
        copied: set[str] = set()
        for row in legacy_rows:
            lesson_id = str(row["lesson_id"])
            if lesson_id not in valid_lesson_ids or lesson_id in copied:
                continue
            connection.execute(
                """INSERT OR IGNORE INTO language_lesson_progress(
                    course_id, lesson_id, pack_version, status, best_score,
                    attempts, duration_seconds, activity_results_json,
                    started_at, completed_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    course_id,
                    lesson_id,
                    pack_version,
                    row["status"],
                    row["best_score"],
                    row["attempts"],
                    row["duration_seconds"],
                    row["activity_results_json"],
                    row["started_at"],
                    row["completed_at"],
                    row["updated_at"],
                ),
            )
            copied.add(lesson_id)

    @staticmethod
    def _activity_passed(activity_results: list[dict[str, Any]], name: str) -> bool:
        return any(
            str(item.get("activity")) == name
            and str(item.get("result")) in {"correct", "self_reviewed"}
            for item in activity_results
        )

    def journey(self, course_id: int) -> dict[str, Any]:
        course = self.require_course(course_id)
        pack = self._pack_for_course(course)
        lessons = self._flatten_lessons(pack)
        with self.database.connect() as connection:
            self._carry_forward_progress(
                connection,
                course_id=course_id,
                pack_version=int(pack["version"]),
                valid_lesson_ids={str(lesson["id"]) for lesson in lessons},
            )
            rows = connection.execute(
                """SELECT * FROM language_lesson_progress
                   WHERE course_id = ? AND pack_version = ?""",
                (course_id, int(pack["version"])),
            ).fetchall()
        progress = {str(row["lesson_id"]): dict(row) for row in rows}
        completed_ids = {
            lesson_id
            for lesson_id, row in progress.items()
            if row["status"] == "completed"
        }
        current_index = next(
            (
                index
                for index, lesson in enumerate(lessons)
                if lesson["id"] not in completed_ids
            ),
            len(lessons) - 1,
        )

        def status_for(index: int, lesson_id: str) -> str:
            if lesson_id in completed_ids:
                return "completed"
            if index == current_index:
                return "current"
            return "locked"

        stages: list[dict[str, Any]] = []
        lesson_index = 0
        for stage in pack["stages"]:
            stage_lessons = []
            for lesson in stage["lessons"]:
                row = progress.get(str(lesson["id"]))
                stage_lessons.append(
                    {
                        "id": lesson["id"],
                        "order": lesson["order"],
                        "title": lesson["title"],
                        "unit_id": lesson["unit_id"],
                        "lesson_type": lesson["lesson_type"],
                        "support_level": lesson["support_level"],
                        "mastery_threshold": lesson["mastery_threshold"],
                        "scenario": lesson["scenario"],
                        "can_do": lesson["can_do"],
                        "estimated_minutes": lesson["estimated_minutes"],
                        "status": status_for(lesson_index, lesson["id"]),
                        "best_score": int(row["best_score"]) if row else 0,
                        "attempts": int(row["attempts"]) if row else 0,
                    }
                )
                lesson_index += 1
            stage_completed = sum(
                item["status"] == "completed" for item in stage_lessons
            )
            stage_status = (
                "completed"
                if stage_completed == len(stage_lessons)
                else "current"
                if any(item["status"] == "current" for item in stage_lessons)
                else "locked"
            )
            stages.append(
                {
                    "id": stage["id"],
                    "level": stage["level"],
                    "title": stage["title"],
                    "status": stage_status,
                    "completed_lessons": stage_completed,
                    "total_lessons": len(stage_lessons),
                    "checkpoint": stage_lessons[-1],
                    "can_do": stage["can_do"],
                    "lessons": stage_lessons,
                }
            )

        current = dict(lessons[current_index])
        current["status"] = (
            "completed" if len(completed_ids) == len(lessons) else "current"
        )
        completed_lessons = len(completed_ids)
        return {
            "course_id": course_id,
            "pack_id": pack["id"],
            "pack_version": pack["version"],
            "language_tag": pack["language_tag"],
            "language_name": pack["name"],
            "initialized": bool(rows),
            "stages": stages,
            "total_lessons": len(lessons),
            "completed_lessons": completed_lessons,
            "progress_percent": round(
                completed_lessons / max(1, len(lessons)) * 100
            ),
            "current_lesson": current,
            "all_complete": completed_lessons == len(lessons),
            "course_settings": {
                "lesson_minutes": int(course["lesson_minutes"]),
                "speech_rate": float(course["speech_rate"]),
                "auto_play_audio": course["auto_play_audio"],
                "romanization_enabled": course["romanization_enabled"],
            },
        }

    def _seed_lesson_vocabulary(
        self,
        connection,
        *,
        course_id: int,
        language_tag: str,
        lesson: dict[str, Any],
    ) -> None:
        for phrase in lesson["phrases"]:
            source_id = str(lesson.get("unit_id") or lesson["id"])
            exists = connection.execute(
                """SELECT 1 FROM vocabulary_items
                   WHERE course_id = ? AND source_kind = ?
                     AND term = ?""",
                (
                    course_id,
                    "builtin_language_pack",
                    phrase["term"],
                ),
            ).fetchone()
            if exists:
                continue
            connection.execute(
                """INSERT INTO vocabulary_items(
                    course_id, language_tag, term, pronunciation, meaning,
                    example, source_kind, source_id, locator_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    course_id,
                    language_tag,
                    phrase["term"],
                    phrase["pronunciation"],
                    phrase["meaning"],
                    phrase["example"],
                    "builtin_language_pack",
                    source_id,
                    json.dumps(
                        {
                            "pack_version": PACK_VERSION,
                            "lesson_id": lesson["id"],
                            "lesson_order": lesson["order"],
                        },
                        ensure_ascii=False,
                    ),
                ),
            )

    def start(self, course_id: int) -> dict[str, Any]:
        journey = self.journey(course_id)
        lesson = journey["current_lesson"]
        if journey["completed_lessons"] == journey["total_lessons"]:
            return journey
        with self.database.connect() as connection:
            connection.execute(
                """INSERT INTO language_lesson_progress(
                    course_id, lesson_id, pack_version, status
                ) VALUES (?, ?, ?, 'started')
                ON CONFLICT(course_id, lesson_id, pack_version)
                DO UPDATE SET updated_at = CURRENT_TIMESTAMP""",
                (course_id, lesson["id"], journey["pack_version"]),
            )
            self._seed_lesson_vocabulary(
                connection,
                course_id=course_id,
                language_tag=journey["language_tag"],
                lesson=lesson,
            )
        return self.journey(course_id)

    def lesson(self, course_id: int, lesson_id: str) -> dict[str, Any]:
        course = self.require_course(course_id)
        self._pack_for_course(course)
        lesson = get_language_lesson(
            str(course["target_language_tag"]), lesson_id
        )
        if lesson is None:
            raise AppError(
                "LANGUAGE_LESSON_NOT_FOUND",
                "该课节不属于当前语言课程",
                404,
            )
        return lesson

    def complete_lesson(
        self,
        course_id: int,
        lesson_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        course = self.require_course(course_id)
        pack = self._pack_for_course(course)
        lesson = self.lesson(course_id, lesson_id)
        before = self.journey(course_id)
        summary = next(
            (
                item
                for stage in before["stages"]
                for item in stage["lessons"]
                if item["id"] == lesson_id
            ),
            None,
        )
        already_completed = bool(summary and summary["status"] == "completed")
        if not already_completed and before["current_lesson"]["id"] != lesson_id:
            raise AppError(
                "LANGUAGE_LESSON_LOCKED",
                "请先掌握当前课，再进入后续课节",
                409,
                {"current_lesson_id": before["current_lesson"]["id"]},
            )

        score = int(payload["score"])
        duration = int(payload.get("duration_seconds") or 0)
        activity_results = payload.get("activity_results") or []
        required_score = int(lesson.get("mastery_threshold") or 80)
        attempt_mastered = (
            score >= required_score
            and self._activity_passed(activity_results, "listening")
            and self._activity_passed(activity_results, "speaking")
            and self._activity_passed(activity_results, "writing")
        )
        next_status = "completed" if attempt_mastered or already_completed else "started"
        with self.database.connect() as connection:
            connection.execute(
                """INSERT INTO language_lesson_progress(
                    course_id, lesson_id, pack_version, status, best_score,
                    attempts, duration_seconds, activity_results_json,
                    completed_at
                ) VALUES (?, ?, ?, ?, ?, 1, ?, ?,
                          CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END)
                ON CONFLICT(course_id, lesson_id, pack_version)
                DO UPDATE SET
                    status = CASE
                        WHEN language_lesson_progress.status = 'completed'
                          OR excluded.status = 'completed'
                        THEN 'completed'
                        ELSE 'started'
                    END,
                    best_score = MAX(best_score, excluded.best_score),
                    attempts = attempts + 1,
                    duration_seconds = duration_seconds + excluded.duration_seconds,
                    activity_results_json = excluded.activity_results_json,
                    completed_at = CASE
                        WHEN language_lesson_progress.status = 'completed'
                          OR excluded.status = 'completed'
                        THEN COALESCE(
                            language_lesson_progress.completed_at,
                            CURRENT_TIMESTAMP
                        )
                        ELSE NULL
                    END,
                    updated_at = CURRENT_TIMESTAMP""",
                (
                    course_id,
                    lesson_id,
                    int(pack["version"]),
                    next_status,
                    score,
                    duration,
                    json.dumps(activity_results, ensure_ascii=False),
                    next_status,
                ),
            )
            self._seed_lesson_vocabulary(
                connection,
                course_id=course_id,
                language_tag=str(course["target_language_tag"]),
                lesson=lesson,
            )
            row = connection.execute(
                """SELECT * FROM language_lesson_progress
                   WHERE course_id = ? AND lesson_id = ? AND pack_version = ?""",
                (course_id, lesson_id, int(pack["version"])),
            ).fetchone()
        completed = dict(row)
        try:
            completed["activity_results"] = json.loads(
                completed.pop("activity_results_json") or "[]"
            )
        except (TypeError, json.JSONDecodeError):
            completed["activity_results"] = []
        return {
            "mastered": attempt_mastered,
            "required_score": required_score,
            "completed": completed,
            "journey": self.journey(course_id),
        }

    def record_session(
        self, course_id: int, payload: dict[str, Any]
    ) -> dict[str, Any]:
        self.require_course(course_id)
        vocabulary_item_id = payload.get("vocabulary_item_id")
        with self.database.connect() as connection:
            if vocabulary_item_id is not None:
                word = connection.execute(
                    """SELECT id FROM vocabulary_items
                       WHERE id = ? AND course_id = ?""",
                    (vocabulary_item_id, course_id),
                ).fetchone()
                if word is None:
                    raise AppError(
                        "VOCABULARY_NOT_FOUND",
                        "该词汇不属于当前语言课程",
                        404,
                    )
            result = str(payload.get("result") or "pending")
            cursor = connection.execute(
                """INSERT INTO language_practice_sessions(
                    course_id, practice_type, vocabulary_item_id, source_kind,
                    source_id, document_id, block_key, locator_json, prompt,
                    answer, result, feedback, duration_seconds, completed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                          CASE WHEN ? = 'pending' THEN NULL ELSE CURRENT_TIMESTAMP END)""",
                (
                    course_id,
                    str(payload.get("practice_type") or ""),
                    vocabulary_item_id,
                    str(payload.get("source_kind") or ""),
                    str(payload.get("source_id") or ""),
                    payload.get("document_id"),
                    str(payload.get("block_key") or ""),
                    json.dumps(payload.get("locator") or {}, ensure_ascii=False),
                    str(payload.get("prompt") or ""),
                    str(payload.get("answer") or ""),
                    result,
                    str(payload.get("feedback") or ""),
                    int(payload.get("duration_seconds") or 0),
                    result,
                ),
            )
            row = connection.execute(
                "SELECT * FROM language_practice_sessions WHERE id = ?",
                (cursor.lastrowid,),
            ).fetchone()
        return self._session(row)

    def list_sessions(self, course_id: int, *, limit: int = 100) -> list[dict[str, Any]]:
        self.require_course(course_id)
        with self.database.connect() as connection:
            rows = connection.execute(
                """SELECT sessions.*, vocabulary_items.term
                   FROM language_practice_sessions AS sessions
                   LEFT JOIN vocabulary_items
                     ON vocabulary_items.id = sessions.vocabulary_item_id
                   WHERE sessions.course_id = ?
                   ORDER BY sessions.id DESC LIMIT ?""",
                (course_id, max(1, min(200, limit))),
            ).fetchall()
        return [self._session(row) for row in rows]

    @staticmethod
    def _vocabulary_item(row) -> dict[str, Any] | None:
        if row is None:
            return None
        item = dict(row)
        try:
            item["locator"] = json.loads(item.pop("locator_json") or "{}")
        except (TypeError, json.JSONDecodeError):
            item["locator"] = {}
        return item

    @staticmethod
    def _session(row) -> dict[str, Any]:
        result = dict(row)
        try:
            result["locator"] = json.loads(result.pop("locator_json") or "{}")
        except (TypeError, json.JSONDecodeError):
            result["locator"] = {}
        return result
