from __future__ import annotations

import json
import sqlite3
from collections import defaultdict, deque

from ..db import Database
from ..errors import AppError
from ..repository import as_dict


class KnowledgeService:
    def __init__(self, database: Database) -> None:
        self.database = database

    def _course_id(self) -> int:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT value_json FROM settings WHERE key = 'active_course'"
            ).fetchone()
        return int(json.loads(row[0]))

    def active_course_id(self) -> int:
        return self._course_id()

    def create_node(
        self, values: dict, course_id: int | None = None, notebook_id: int | None = None
    ) -> dict:
        course_id, notebook_id = self._scope(course_id, notebook_id)
        with self.database.connect() as connection:
            self._require_source_document(
                connection, course_id, values.get("source_document_id")
            )
            self._require_media_asset(
                connection, course_id, values.get("image_asset_id")
            )
            cursor = connection.execute(
                """INSERT INTO knowledge_nodes(
                    course_id, notebook_id, title, description, module, kind, content, color,
                    position_x, position_y, width, height, font_scale,
                    source_document_id, source_title, source_quote,
                    source_block_key, source_locator_json,
                    image_asset_id, image_alt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    course_id,
                    notebook_id,
                    values["title"],
                    values.get("description", ""),
                    values.get("module", ""),
                    values.get("kind", "concept"),
                    values.get("content", ""),
                    values.get("color", "blue"),
                    values.get("position_x"),
                    values.get("position_y"),
                    values.get("width"),
                    values.get("height"),
                    values.get("font_scale"),
                    values.get("source_document_id"),
                    values.get("source_title", ""),
                    values.get("source_quote", ""),
                    values.get("source_block_key", ""),
                    json.dumps(values.get("source_locator") or {}, ensure_ascii=False),
                    values.get("image_asset_id"),
                    values.get("image_alt", ""),
                ),
            )
            row = connection.execute(
                "SELECT * FROM knowledge_nodes WHERE id = ? AND course_id = ?",
                (cursor.lastrowid, course_id),
            ).fetchone()
        return self._serialize_node(row)

    def get_node(
        self, node_id: int, course_id: int | None = None, notebook_id: int | None = None
    ) -> dict:
        course_id, notebook_id = self._scope(course_id, notebook_id)
        with self.database.connect() as connection:
            row = self._get_node_row(connection, node_id, course_id, notebook_id)
        return self._serialize_node(row)

    def update_node(
        self, node_id: int, values: dict, course_id: int | None = None,
        notebook_id: int | None = None
    ) -> dict:
        course_id, notebook_id = self._scope(course_id, notebook_id)
        with self.database.connect() as connection:
            current = self._get_node_row(connection, node_id, course_id, notebook_id)
            if not values:
                return self._serialize_node(current)
            if "source_document_id" in values:
                self._require_source_document(
                    connection, course_id, values["source_document_id"]
                )
            if "image_asset_id" in values:
                self._require_media_asset(
                    connection, course_id, values["image_asset_id"]
                )
            if "source_locator" in values:
                values["source_locator_json"] = json.dumps(
                    values.pop("source_locator") or {}, ensure_ascii=False
                )
            mastery = values.pop("mastery", None)
            if mastery is not None:
                confidence = max(
                    2.0,
                    float(current["mastery_alpha"]) + float(current["mastery_beta"]),
                )
                values["mastery_alpha"] = confidence * float(mastery)
                values["mastery_beta"] = confidence * (1.0 - float(mastery))
            assignments = ", ".join(f"{column} = ?" for column in values)
            connection.execute(
                f"""UPDATE knowledge_nodes SET {assignments}
                WHERE id = ? AND course_id = ? AND notebook_id = ?""",
                [*values.values(), node_id, course_id, notebook_id],
            )
            updated = self._get_node_row(connection, node_id, course_id, notebook_id)
        return self._serialize_node(updated)

    def delete_node(
        self, node_id: int, course_id: int | None = None, notebook_id: int | None = None
    ) -> None:
        course_id, notebook_id = self._scope(course_id, notebook_id)
        with self.database.connect() as connection:
            self._get_node_row(connection, node_id, course_id, notebook_id)
            connection.execute(
                "DELETE FROM knowledge_nodes WHERE id = ? AND course_id = ? AND notebook_id = ?",
                (node_id, course_id, notebook_id),
            )

    def list_nodes(
        self, course_id: int | None = None, notebook_id: int | None = None
    ) -> list[dict]:
        course_id, notebook_id = self._scope(course_id, notebook_id)
        with self.database.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM knowledge_nodes WHERE course_id = ? AND notebook_id = ? ORDER BY id",
                (course_id, notebook_id),
            ).fetchall()
        return [self._serialize_node(row) for row in rows]

    def list_edges(
        self, course_id: int | None = None, notebook_id: int | None = None
    ) -> list[dict]:
        course_id, notebook_id = self._scope(course_id, notebook_id)
        with self.database.connect() as connection:
            rows = connection.execute(
                "SELECT * FROM knowledge_edges WHERE course_id = ? AND notebook_id = ? ORDER BY id",
                (course_id, notebook_id),
            ).fetchall()
        return [as_dict(row) for row in rows]

    def create_edge(
        self, source_id: int, target_id: int, relation: str,
        course_id: int | None = None, notebook_id: int | None = None
    ) -> dict:
        if relation == "prerequisite" and source_id == target_id:
            raise AppError("DAG_CYCLE", "知识依赖不能指向自身", 409)
        course_id, notebook_id = self._scope(course_id, notebook_id)
        with self.database.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            node_ids = {
                row["id"]
                for row in connection.execute(
                    """SELECT id FROM knowledge_nodes
                    WHERE course_id = ? AND notebook_id = ? AND id IN (?, ?)""",
                    (course_id, notebook_id, source_id, target_id),
                ).fetchall()
            }
            if source_id not in node_ids or target_id not in node_ids:
                raise AppError("KNOWLEDGE_NOT_FOUND", "知识点不存在", 404)

            if relation == "prerequisite":
                edges = [
                    (row["source_id"], row["target_id"])
                    for row in connection.execute(
                        """SELECT source_id, target_id FROM knowledge_edges
                        WHERE course_id = ? AND notebook_id = ? AND relation = 'prerequisite'""",
                        (course_id, notebook_id),
                    ).fetchall()
                ]
                if self._reachable(target_id, source_id, edges):
                    raise AppError("DAG_CYCLE", "该依赖会形成环", 409)
            cursor = connection.execute(
                """INSERT INTO knowledge_edges(course_id, notebook_id, source_id, target_id, relation)
                VALUES (?, ?, ?, ?, ?)""",
                (course_id, notebook_id, source_id, target_id, relation),
            )
            row = connection.execute(
                "SELECT * FROM knowledge_edges WHERE id = ? AND course_id = ?",
                (cursor.lastrowid, course_id),
            ).fetchone()
        return as_dict(row)

    def delete_edge(
        self, edge_id: int, course_id: int | None = None, notebook_id: int | None = None
    ) -> None:
        course_id, notebook_id = self._scope(course_id, notebook_id)
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT id FROM knowledge_edges WHERE id = ? AND course_id = ? AND notebook_id = ?",
                (edge_id, course_id, notebook_id),
            ).fetchone()
            if not row:
                raise AppError("KNOWLEDGE_EDGE_NOT_FOUND", "知识连接不存在", 404)
            connection.execute(
                "DELETE FROM knowledge_edges WHERE id = ? AND course_id = ? AND notebook_id = ?",
                (edge_id, course_id, notebook_id),
            )

    def prerequisites(
        self, node_id: int, course_id: int | None = None, notebook_id: int | None = None
    ) -> list[dict]:
        course_id, notebook_id = self._scope(course_id, notebook_id)
        with self.database.connect() as connection:
            connection.execute("BEGIN")
            node_rows = connection.execute(
                "SELECT * FROM knowledge_nodes WHERE course_id = ? AND notebook_id = ? ORDER BY id",
                (course_id, notebook_id),
            ).fetchall()
            edge_rows = connection.execute(
                """SELECT source_id, target_id FROM knowledge_edges
                WHERE course_id = ? AND notebook_id = ? AND relation = 'prerequisite'""",
                (course_id, notebook_id),
            ).fetchall()
        nodes = {
            row["id"]: self._serialize_node(row) for row in node_rows
        }
        if node_id not in nodes:
            raise AppError("KNOWLEDGE_NOT_FOUND", "知识点不存在", 404)
        edges = [
            (row["source_id"], row["target_id"]) for row in edge_rows
        ]
        reverse: dict[int, list[int]] = defaultdict(list)
        forward: dict[int, list[int]] = defaultdict(list)
        indegree: dict[int, int] = {key: 0 for key in nodes}
        for source, target in edges:
            reverse[target].append(source)
            forward[source].append(target)
            indegree[target] += 1

        ancestors: set[int] = set()
        stack = list(reverse[node_id])
        while stack:
            current = stack.pop()
            if current in ancestors:
                continue
            ancestors.add(current)
            stack.extend(reverse[current])

        queue = deque(sorted(key for key, degree in indegree.items() if degree == 0))
        ordered: list[int] = []
        while queue:
            current = queue.popleft()
            ordered.append(current)
            for target in forward[current]:
                indegree[target] -= 1
                if indegree[target] == 0:
                    queue.append(target)
        return [nodes[key] for key in ordered if key in ancestors]

    @staticmethod
    def _get_node_row(
        connection: sqlite3.Connection, node_id: int, course_id: int, notebook_id: int
    ) -> sqlite3.Row:
        row = connection.execute(
            "SELECT * FROM knowledge_nodes WHERE id = ? AND course_id = ? AND notebook_id = ?",
            (node_id, course_id, notebook_id),
        ).fetchone()
        if not row:
            raise AppError("KNOWLEDGE_NOT_FOUND", "知识点不存在", 404)
        return row

    def _scope(
        self, course_id: int | None, notebook_id: int | None
    ) -> tuple[int, int]:
        resolved_course = course_id if course_id is not None else self._course_id()
        with self.database.connect() as connection:
            if notebook_id is None:
                row = connection.execute(
                    """SELECT id FROM knowledge_notebooks
                    WHERE course_id=? AND deleted_at IS NULL ORDER BY id LIMIT 1""",
                    (resolved_course,),
                ).fetchone()
            else:
                row = connection.execute(
                    """SELECT id FROM knowledge_notebooks
                    WHERE id=? AND course_id=? AND deleted_at IS NULL""",
                    (notebook_id, resolved_course),
                ).fetchone()
        if not row:
            raise AppError("NOTEBOOK_NOT_FOUND", "知识笔记不存在", 404)
        return int(resolved_course), int(row["id"])

    @staticmethod
    def _require_source_document(
        connection: sqlite3.Connection, course_id: int, document_id: int | None
    ) -> None:
        if document_id is None:
            return
        row = connection.execute(
            "SELECT id FROM documents WHERE id = ? AND course_id = ?",
            (document_id, course_id),
        ).fetchone()
        if not row:
            raise AppError("DOCUMENT_NOT_FOUND", "文档不存在", 404)

    @staticmethod
    def _reachable(start: int, goal: int, edges: list[tuple[int, int]]) -> bool:
        graph: dict[int, list[int]] = defaultdict(list)
        for source, target in edges:
            graph[source].append(target)
        stack = [start]
        seen: set[int] = set()
        while stack:
            current = stack.pop()
            if current == goal:
                return True
            if current in seen:
                continue
            seen.add(current)
            stack.extend(graph[current])
        return False

    @staticmethod
    def _require_media_asset(
        connection: sqlite3.Connection, course_id: int, asset_id: str | None
    ) -> None:
        if asset_id is None:
            return
        row = connection.execute(
            "SELECT id FROM media_assets WHERE id = ? AND course_id = ?",
            (asset_id, course_id),
        ).fetchone()
        if not row:
            raise AppError("MEDIA_NOT_FOUND", "图片资源不存在", 404)

    @staticmethod
    def _serialize_node(row) -> dict:
        item = as_dict(row)
        item["source_locator"] = json.loads(item.pop("source_locator_json", "{}"))
        item["image_url"] = (
            f"/api/courses/{item['course_id']}/media/images/{item['image_asset_id']}"
            if item.get("image_asset_id")
            else None
        )
        item["mastery"] = item["mastery_alpha"] / (
            item["mastery_alpha"] + item["mastery_beta"]
        )
        return item
