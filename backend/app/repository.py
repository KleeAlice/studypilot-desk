from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any

from .db import Database
from .errors import AppError



def as_course(row: Any) -> dict:
    result = dict(row)
    try:
        result["training_focus"] = json.loads(
            result.pop("training_focus_json", "[]") or "[]"
        )
    except (TypeError, json.JSONDecodeError):
        result["training_focus"] = []
    result["romanization_enabled"] = bool(result.get("romanization_enabled", 0))
    result["auto_play_audio"] = bool(result.get("auto_play_audio", 0))
    return result

def as_dict(row: Any) -> dict:
    return dict(row)


class Repository:
    def __init__(self, database: Database) -> None:
        self.database = database

    def setting(self, key: str, default: Any = None) -> Any:
        with self.database.connect() as connection:
            row = connection.execute("SELECT value_json FROM settings WHERE key = ?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def set_setting(self, key: str, value: Any) -> Any:
        payload = json.dumps(value, ensure_ascii=False)
        with self.database.connect() as connection:
            connection.execute(
                """INSERT INTO settings(key, value_json) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=CURRENT_TIMESTAMP""",
                (key, payload),
            )
        return value

    def list_settings(self) -> dict[str, Any]:
        with self.database.connect() as connection:
            rows = connection.execute("SELECT key, value_json FROM settings ORDER BY key").fetchall()
        return {row["key"]: json.loads(row["value_json"]) for row in rows}

    def active_course_id(self) -> int:
        return int(self.setting("active_course", 1))

    def list_courses(self) -> list[dict]:
        with self.database.connect() as connection:
            rows = connection.execute(
                """SELECT courses.*,
                    (SELECT COUNT(*) FROM knowledge_nodes
                     WHERE knowledge_nodes.course_id = courses.id) AS node_count,
                    (SELECT COUNT(*) FROM knowledge_edges
                     WHERE knowledge_edges.course_id = courses.id) AS edge_count
                FROM courses
                WHERE courses.deleted_at IS NULL
                ORDER BY is_default DESC, updated_at DESC, id DESC"""
            ).fetchall()
        return [as_course(row) for row in rows]

    def create_course(self, values: dict) -> dict:
        values = dict(values)
        training_focus = values.pop("training_focus", None)
        if training_focus is not None:
            values["training_focus_json"] = json.dumps(training_focus, ensure_ascii=False)
        values["romanization_enabled"] = int(bool(values.get("romanization_enabled")))
        values["auto_play_audio"] = int(bool(values.get("auto_play_audio")))
        columns = list(values)
        placeholders = ",".join("?" for _ in columns)
        with self.database.connect() as connection:
            cursor = connection.execute(
                f"INSERT INTO courses({','.join(columns)}) VALUES ({placeholders})",
                [values[column] for column in columns],
            )
            connection.execute(
                """INSERT INTO knowledge_notebooks(
                    course_id, title, description, kind, cover_style
                ) VALUES (?, '默认知识画布', '课程的第一个知识空间', 'mixed', 'indigo')""",
                (cursor.lastrowid,),
            )
            row = connection.execute("SELECT * FROM courses WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return as_course(row)

    def update_course(self, course_id: int, values: dict) -> dict:
        allowed = {
            "title", "cover_style", "proficiency_level", "daily_word_goal",
            "lesson_minutes", "speech_rate", "auto_play_audio",
            "pronunciation_scheme", "romanization_enabled", "training_focus",
        }
        changes = {
            key: value for key, value in values.items() if key in allowed
        }
        training_focus = changes.pop("training_focus", None)
        if training_focus is not None:
            changes["training_focus_json"] = json.dumps(
                training_focus, ensure_ascii=False
            )
        for key in ("auto_play_audio", "romanization_enabled"):
            if key in changes:
                changes[key] = int(bool(changes[key]))
        if not changes:
            raise AppError(
                "INVALID_COURSE_UPDATE", "没有可更新的课程信息", 422
            )
        assignments = ", ".join(f"{key} = ?" for key in changes)
        with self.database.connect() as connection:
            cursor = connection.execute(
                f"UPDATE courses SET {assignments}, updated_at=CURRENT_TIMESTAMP "
                "WHERE id = ? AND deleted_at IS NULL",
                [*changes.values(), course_id],
            )
            if cursor.rowcount == 0:
                raise AppError("COURSE_NOT_FOUND", "课程不存在", 404)
            row = connection.execute("SELECT * FROM courses WHERE id = ?", (course_id,)).fetchone()
        return as_course(row)

    def activate_course(self, course_id: int) -> dict:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT * FROM courses WHERE id = ? AND deleted_at IS NULL",
                (course_id,),
            ).fetchone()
        if not row:
            raise AppError("COURSE_NOT_FOUND", "课程不存在", 404)
        self.set_setting("active_course", course_id)
        with self.database.connect() as connection:
            connection.execute(
                "UPDATE courses SET last_opened_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (course_id,),
            )
        return as_course(row)

    def delete_course(self, course_id: int) -> dict:
        with self.database.connect() as connection:
            course = connection.execute(
                "SELECT * FROM courses WHERE id = ? AND deleted_at IS NULL", (course_id,)
            ).fetchone()
            if not course:
                raise AppError("COURSE_NOT_FOUND", "课程不存在", 404)
            active_row = connection.execute(
                "SELECT value_json FROM settings WHERE key = 'active_course'"
            ).fetchone()
            active_id = int(json.loads(active_row[0])) if active_row else course_id
            connection.execute(
                """UPDATE courses SET deleted_at=CURRENT_TIMESTAMP,
                purge_after=datetime('now', '+30 days'), updated_at=CURRENT_TIMESTAMP
                WHERE id = ?""",
                (course_id,),
            )
            if active_id == course_id:
                fallback = connection.execute(
                    """SELECT * FROM courses WHERE deleted_at IS NULL
                    ORDER BY updated_at DESC, is_default DESC, id DESC LIMIT 1"""
                ).fetchone()
                active_id = int(fallback["id"]) if fallback else 0
                connection.execute(
                    """INSERT INTO settings(key, value_json) VALUES ('active_course', ?)
                    ON CONFLICT(key) DO UPDATE SET
                        value_json=excluded.value_json,
                        updated_at=CURRENT_TIMESTAMP""",
                    (json.dumps(active_id),),
                )
            else:
                fallback = connection.execute(
                    "SELECT * FROM courses WHERE id = ? AND deleted_at IS NULL", (active_id,)
                ).fetchone()
        return {
            "deleted_id": course_id,
            "active_course": as_course(fallback) if fallback else None,
        }

    def list_trashed_courses(self) -> list[dict]:
        with self.database.connect() as connection:
            rows = connection.execute(
                """SELECT courses.*,
                    (SELECT COUNT(*) FROM knowledge_nodes WHERE knowledge_nodes.course_id=courses.id) AS node_count,
                    (SELECT COUNT(*) FROM knowledge_edges WHERE knowledge_edges.course_id=courses.id) AS edge_count
                FROM courses WHERE deleted_at IS NOT NULL
                ORDER BY deleted_at DESC, id DESC"""
            ).fetchall()
        return [as_course(row) for row in rows]

    def restore_course(self, course_id: int) -> dict:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT id FROM courses WHERE id=? AND deleted_at IS NOT NULL",
                (course_id,),
            ).fetchone()
            if not row:
                raise AppError("COURSE_NOT_FOUND", "课程不存在或未在回收站", 404)
            connection.execute(
                """UPDATE courses SET deleted_at=NULL, purge_after=NULL,
                updated_at=CURRENT_TIMESTAMP WHERE id=?""",
                (course_id,),
            )
            restored = connection.execute(
                "SELECT * FROM courses WHERE id=?", (course_id,)
            ).fetchone()
        return as_course(restored)

    def purge_course(self, course_id: int) -> dict:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT id FROM courses WHERE id=? AND deleted_at IS NOT NULL",
                (course_id,),
            ).fetchone()
            if not row:
                raise AppError("COURSE_NOT_FOUND", "回收站中没有该课程", 404)
            connection.execute("DELETE FROM courses WHERE id=?", (course_id,))
        return {"deleted_id": course_id}

    def course_home(self, course_id: int) -> dict:
        with self.database.connect() as connection:
            course = connection.execute(
                "SELECT * FROM courses WHERE id=? AND deleted_at IS NULL",
                (course_id,),
            ).fetchone()
            if not course:
                raise AppError("COURSE_NOT_FOUND", "课程不存在", 404)
            task_rows = connection.execute(
                """SELECT status, COUNT(*) AS count FROM tasks
                WHERE course_id=? GROUP BY status""",
                (course_id,),
            ).fetchall()
            notebook_count = connection.execute(
                """SELECT COUNT(*) FROM knowledge_notebooks
                WHERE course_id=? AND deleted_at IS NULL""",
                (course_id,),
            ).fetchone()[0]
            document_count = connection.execute(
                "SELECT COUNT(*) FROM documents WHERE course_id=?", (course_id,)
            ).fetchone()[0]
            run_count = connection.execute(
                "SELECT COUNT(*) FROM python_runs WHERE course_id=?", (course_id,)
            ).fetchone()[0]
        task_counts = {status: 0 for status in ("todo", "doing", "blocked", "done")}
        task_counts.update({row["status"]: int(row["count"]) for row in task_rows})
        return {
            "course": as_course(course),
            "task_counts": task_counts,
            "notebook_count": int(notebook_count),
            "document_count": int(document_count),
            "run_count": int(run_count),
            "recent_items": [],
            "continue_route": f"/courses/{course_id}/dashboard",
        }

    def course_stats(self, course_id: int) -> dict:
        with self.database.connect() as connection:
            course = connection.execute(
                "SELECT id FROM courses WHERE id=? AND deleted_at IS NULL",
                (course_id,),
            ).fetchone()
            if not course:
                raise AppError("COURSE_NOT_FOUND", "课程不存在", 404)

            totals = connection.execute(
                """SELECT
                    (SELECT COUNT(*) FROM tasks WHERE course_id=?) AS total_tasks,
                    (SELECT COUNT(*) FROM tasks WHERE course_id=? AND status='done') AS completed_tasks,
                    (SELECT COUNT(*) FROM knowledge_nodes WHERE course_id=?) AS knowledge_nodes,
                    (SELECT COUNT(*) FROM knowledge_edges WHERE course_id=?) AS knowledge_edges,
                    (SELECT COUNT(*) FROM knowledge_notebooks WHERE course_id=? AND deleted_at IS NULL) AS notebooks,
                    (SELECT COUNT(*) FROM documents WHERE course_id=?) AS documents,
                    (SELECT COUNT(*) FROM python_runs WHERE course_id=?) AS python_runs""",
                (course_id,) * 7,
            ).fetchone()

            activity_rows = connection.execute(
                """WITH RECURSIVE days(day) AS (
                    SELECT date('now', 'localtime', '-13 days')
                    UNION ALL
                    SELECT date(day, '+1 day') FROM days
                    WHERE day < date('now', 'localtime')
                ), events(day) AS (
                    SELECT date(updated_at, 'localtime') FROM tasks WHERE course_id=?
                    UNION ALL SELECT date(created_at, 'localtime') FROM knowledge_nodes WHERE course_id=?
                    UNION ALL SELECT date(updated_at, 'localtime') FROM knowledge_notebooks WHERE course_id=? AND deleted_at IS NULL
                    UNION ALL SELECT date(created_at, 'localtime') FROM documents WHERE course_id=?
                    UNION ALL SELECT date(created_at, 'localtime') FROM python_runs WHERE course_id=?
                    UNION ALL SELECT date(e.created_at, 'localtime') FROM task_evidence e
                        JOIN tasks t ON t.id=e.task_id WHERE t.course_id=?
                    UNION ALL SELECT date(created_at, 'localtime') FROM reviews WHERE course_id=?
                )
                SELECT days.day AS date, COUNT(events.day) AS count
                FROM days LEFT JOIN events ON events.day=days.day
                GROUP BY days.day ORDER BY days.day""",
                (course_id,) * 7,
            ).fetchall()

        daily_activity = [{"date": row["date"], "count": int(row["count"])} for row in activity_rows]
        active_dates = {item["date"] for item in daily_activity if item["count"] > 0}
        current_streak = 0
        if daily_activity:
            today = date.fromisoformat(daily_activity[-1]["date"])
            cursor = today if today.isoformat() in active_dates else today - timedelta(days=1)
            while cursor.isoformat() in active_dates:
                current_streak += 1
                cursor -= timedelta(days=1)

        total_tasks = int(totals["total_tasks"])
        completed_tasks = int(totals["completed_tasks"])
        return {
            "course_id": course_id,
            "current_streak": current_streak,
            "active_days_14": sum(1 for item in daily_activity if item["count"] > 0),
            "activity_total_14": sum(item["count"] for item in daily_activity),
            "weekly_active_days": sum(1 for item in daily_activity[-7:] if item["count"] > 0),
            "completed_tasks": completed_tasks,
            "total_tasks": total_tasks,
            "completion_rate": round(completed_tasks / total_tasks * 100) if total_tasks else 0,
            "knowledge_nodes": int(totals["knowledge_nodes"]),
            "knowledge_edges": int(totals["knowledge_edges"]),
            "notebooks": int(totals["notebooks"]),
            "documents": int(totals["documents"]),
            "python_runs": int(totals["python_runs"]),
            "daily_activity": daily_activity,
        }

    def roadmap(self, course_id: int | None = None) -> dict:
        resolved_course_id = course_id or self.active_course_id()
        with self.database.connect() as connection:
            phases = [as_dict(row) for row in connection.execute(
                "SELECT * FROM phases WHERE course_id = ? ORDER BY phase",
                (resolved_course_id,),
            ).fetchall()]
            week_rows = connection.execute(
                "SELECT * FROM weeks WHERE course_id = ? ORDER BY week",
                (resolved_course_id,),
            ).fetchall()
            generation_row = connection.execute(
                """SELECT id, provider_id, model, status, request_json, error,
                          created_at, completed_at
                   FROM roadmap_generations
                   WHERE course_id = ?
                   ORDER BY id DESC LIMIT 1""",
                (resolved_course_id,),
            ).fetchone()
        weeks = []
        for row in week_rows:
            item = as_dict(row)
            item["tasks"] = json.loads(item.pop("tasks_json"))
            item["deliverables"] = json.loads(item.pop("deliverables_json"))
            weeks.append(item)
        generation = as_dict(generation_row) if generation_row else None
        if generation is not None:
            try:
                generation["request"] = json.loads(generation.pop("request_json") or "{}")
            except (TypeError, json.JSONDecodeError):
                generation["request"] = {}
        return {
            "course_id": resolved_course_id,
            "phases": phases,
            "weeks": weeks,
            "generation": generation,
        }

    def create_task(self, values: dict) -> dict:
        course_id = self.active_course_id()
        columns = ["course_id", *values.keys()]
        placeholders = ",".join("?" for _ in columns)
        with self.database.connect() as connection:
            cursor = connection.execute(
                f"INSERT INTO tasks({','.join(columns)}) VALUES ({placeholders})",
                [course_id, *values.values()],
            )
            task_id = int(cursor.lastrowid)
        return self.get_task(task_id)

    def get_task(self, task_id: int) -> dict:
        course_id = self.active_course_id()
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT * FROM tasks WHERE id = ? AND course_id = ?", (task_id, course_id)
            ).fetchone()
            evidence = connection.execute(
                "SELECT * FROM task_evidence WHERE task_id = ? ORDER BY id", (task_id,)
            ).fetchall()
        if not row:
            raise AppError("TASK_NOT_FOUND", "任务不存在", 404)
        item = as_dict(row)
        item["evidence"] = [as_dict(value) for value in evidence]
        return item

    def update_task(self, task_id: int, values: dict) -> dict:
        if not values:
            return self.get_task(task_id)
        self.get_task(task_id)
        assignments = ",".join(f"{column} = ?" for column in values)
        with self.database.connect() as connection:
            connection.execute(
                f"UPDATE tasks SET {assignments}, updated_at=CURRENT_TIMESTAMP WHERE id = ?",
                [*values.values(), task_id],
            )
        return self.get_task(task_id)

    def delete_task(self, task_id: int) -> None:
        self.get_task(task_id)
        with self.database.connect() as connection:
            connection.execute("DELETE FROM tasks WHERE id = ?", (task_id,))

    def list_tasks(
        self, q: str | None, status: str | None, page: int, page_size: int, week: int | None = None
    ) -> tuple[list[dict], int]:
        conditions = ["course_id = ?"]
        values: list[Any] = [self.active_course_id()]
        if q:
            conditions.append("(title LIKE ? OR description LIKE ?)")
            values.extend([f"%{q}%", f"%{q}%"])
        if status:
            conditions.append("status = ?")
            values.append(status)
        if week is not None:
            conditions.append("week = ?")
            values.append(week)
        where = " AND ".join(conditions)
        with self.database.connect() as connection:
            total = connection.execute(f"SELECT COUNT(*) FROM tasks WHERE {where}", values).fetchone()[0]
            rows = connection.execute(
                f"""SELECT * FROM tasks WHERE {where}
                ORDER BY CASE status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 WHEN 'blocked' THEN 2 ELSE 3 END,
                         priority DESC, id DESC LIMIT ? OFFSET ?""",
                [*values, page_size, (page - 1) * page_size],
            ).fetchall()
        return [as_dict(row) for row in rows], int(total)

    def add_evidence(self, task_id: int, values: dict) -> dict:
        self.get_task(task_id)
        with self.database.connect() as connection:
            cursor = connection.execute(
                """INSERT INTO task_evidence(task_id, kind, title, content, source_id)
                VALUES (?, ?, ?, ?, ?)""",
                (
                    task_id,
                    values["kind"],
                    values["title"],
                    values.get("content", ""),
                    values.get("source_id"),
                ),
            )
            row = connection.execute(
                "SELECT * FROM task_evidence WHERE id = ?", (cursor.lastrowid,)
            ).fetchone()
        return as_dict(row)

    def list_generic(self, collection: str) -> list[dict]:
        with self.database.connect() as connection:
            rows = connection.execute(
                """SELECT * FROM generic_items WHERE course_id = ? AND collection = ?
                ORDER BY updated_at DESC, id DESC""",
                (self.active_course_id(), collection),
            ).fetchall()
        result = []
        for row in rows:
            item = as_dict(row)
            item["payload"] = json.loads(item.pop("payload_json"))
            result.append(item)
        return result

    def create_generic(self, collection: str, title: str, payload: dict) -> dict:
        with self.database.connect() as connection:
            cursor = connection.execute(
                """INSERT INTO generic_items(course_id, collection, title, payload_json)
                VALUES (?, ?, ?, ?)""",
                (self.active_course_id(), collection, title, json.dumps(payload, ensure_ascii=False)),
            )
        return self.get_generic(collection, int(cursor.lastrowid))

    def get_generic(self, collection: str, item_id: int) -> dict:
        with self.database.connect() as connection:
            row = connection.execute(
                """SELECT * FROM generic_items
                WHERE id = ? AND course_id = ? AND collection = ?""",
                (item_id, self.active_course_id(), collection),
            ).fetchone()
        if not row:
            raise AppError("ITEM_NOT_FOUND", "记录不存在", 404)
        item = as_dict(row)
        item["payload"] = json.loads(item.pop("payload_json"))
        return item

    def update_generic(self, collection: str, item_id: int, values: dict) -> dict:
        current = self.get_generic(collection, item_id)
        title = values.get("title", current["title"])
        payload = values.get("payload", current["payload"])
        with self.database.connect() as connection:
            connection.execute(
                """UPDATE generic_items SET title = ?, payload_json = ?, updated_at=CURRENT_TIMESTAMP
                WHERE id = ?""",
                (title, json.dumps(payload, ensure_ascii=False), item_id),
            )
        return self.get_generic(collection, item_id)

    def delete_generic(self, collection: str, item_id: int) -> dict:
        current = self.get_generic(collection, item_id)
        with self.database.connect() as connection:
            connection.execute(
                """DELETE FROM generic_items
                WHERE id = ? AND course_id = ? AND collection = ?""",
                (item_id, self.active_course_id(), collection),
            )
        return current
