from __future__ import annotations

import json

from ..db import Database
from ..errors import AppError
from ..repository import as_dict


class NotebookService:
    def __init__(self, database: Database) -> None:
        self.database = database

    def list(self, course_id: int, include_deleted: bool = False) -> list[dict]:
        deleted_clause = "" if include_deleted else " AND notebooks.deleted_at IS NULL"
        with self.database.connect() as connection:
            self._require_course(connection, course_id)
            rows = connection.execute(
                f"""SELECT notebooks.*,
                    (SELECT COUNT(*) FROM knowledge_nodes
                     WHERE knowledge_nodes.notebook_id=notebooks.id) AS node_count,
                    (SELECT COUNT(*) FROM knowledge_edges
                     WHERE knowledge_edges.notebook_id=notebooks.id) AS edge_count
                FROM knowledge_notebooks AS notebooks
                WHERE notebooks.course_id=?{deleted_clause}
                ORDER BY notebooks.updated_at DESC, notebooks.id DESC""",
                (course_id,),
            ).fetchall()
        return [self._serialize(row) for row in rows]

    def require(
        self, course_id: int, notebook_id: int, include_deleted: bool = False
    ) -> dict:
        deleted_clause = "" if include_deleted else " AND deleted_at IS NULL"
        with self.database.connect() as connection:
            row = connection.execute(
                f"""SELECT * FROM knowledge_notebooks
                WHERE id=? AND course_id=?{deleted_clause}""",
                (notebook_id, course_id),
            ).fetchone()
        if not row:
            raise AppError("NOTEBOOK_NOT_FOUND", "知识笔记不存在", 404)
        return self._serialize(row)

    def default_id(self, course_id: int) -> int:
        with self.database.connect() as connection:
            row = connection.execute(
                """SELECT id FROM knowledge_notebooks
                WHERE course_id=? AND deleted_at IS NULL ORDER BY id LIMIT 1""",
                (course_id,),
            ).fetchone()
        if not row:
            raise AppError("NOTEBOOK_NOT_FOUND", "课程还没有知识笔记", 404)
        return int(row["id"])

    def create(self, course_id: int, values: dict) -> dict:
        settings = values.pop("canvas_settings", {})
        with self.database.connect() as connection:
            self._require_course(connection, course_id)
            cursor = connection.execute(
                """INSERT INTO knowledge_notebooks(
                    course_id, title, description, kind, cover_style, canvas_settings_json
                ) VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    course_id,
                    values["title"],
                    values.get("description", ""),
                    values.get("kind", "canvas"),
                    values.get("cover_style", "indigo"),
                    json.dumps(settings, ensure_ascii=False),
                ),
            )
            row = connection.execute(
                "SELECT * FROM knowledge_notebooks WHERE id=?", (cursor.lastrowid,)
            ).fetchone()
        return self._serialize(row)

    def update(self, course_id: int, notebook_id: int, values: dict) -> dict:
        self.require(course_id, notebook_id)
        if "canvas_settings" in values:
            values["canvas_settings_json"] = json.dumps(
                values.pop("canvas_settings"), ensure_ascii=False
            )
        if values:
            assignments = ", ".join(f"{key}=?" for key in values)
            with self.database.connect() as connection:
                connection.execute(
                    f"""UPDATE knowledge_notebooks SET {assignments}, updated_at=CURRENT_TIMESTAMP
                    WHERE id=? AND course_id=? AND deleted_at IS NULL""",
                    [*values.values(), notebook_id, course_id],
                )
        return self.require(course_id, notebook_id)

    def trash(self, course_id: int, notebook_id: int) -> dict:
        self.require(course_id, notebook_id)
        with self.database.connect() as connection:
            connection.execute(
                """UPDATE knowledge_notebooks SET deleted_at=CURRENT_TIMESTAMP,
                updated_at=CURRENT_TIMESTAMP WHERE id=? AND course_id=?""",
                (notebook_id, course_id),
            )
        return {"deleted_id": notebook_id}

    @staticmethod
    def _require_course(connection, course_id: int) -> None:
        row = connection.execute(
            "SELECT id FROM courses WHERE id=? AND deleted_at IS NULL", (course_id,)
        ).fetchone()
        if not row:
            raise AppError("COURSE_NOT_FOUND", "课程不存在", 404)

    @staticmethod
    def _serialize(row) -> dict:
        item = as_dict(row)
        item["canvas_settings"] = json.loads(item.pop("canvas_settings_json", "{}"))
        return item
