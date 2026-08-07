from __future__ import annotations

import json
import re
import sqlite3
from typing import Any

from ..db import Database
from ..errors import AppError
from ..repository import as_dict


PLAN_PATTERN = re.compile(
    r"```studypilot-plan\s*\n?(.*?)\n?```", re.IGNORECASE | re.DOTALL
)
MAX_OPERATIONS = 40
MAX_DOCUMENT_TEXT = 120_000
ACTION_TYPES = {
    "replace_document_block",
    "create_knowledge_node",
    "update_knowledge_node",
    "delete_knowledge_node",
    "create_knowledge_edge",
    "delete_knowledge_edge",
}
NODE_KINDS = {"concept", "sticky_note", "flashcard"}
RELATIONS = {"prerequisite", "mindmap", "association"}
NODE_UPDATE_FIELDS = {
    "title",
    "description",
    "module",
    "kind",
    "content",
    "color",
    "position_x",
    "position_y",
    "width",
    "height",
    "font_scale",
}
ACTION_ALIASES = {
    "replace_block": "replace_document_block",
    "replace_markdown_block": "replace_document_block",
    "edit_document": "replace_document_block",
    "create_node": "create_knowledge_node",
    "add_node": "create_knowledge_node",
    "update_node": "update_knowledge_node",
    "edit_node": "update_knowledge_node",
    "delete_node": "delete_knowledge_node",
    "remove_node": "delete_knowledge_node",
    "create_edge": "create_knowledge_edge",
    "add_edge": "create_knowledge_edge",
    "delete_edge": "delete_knowledge_edge",
    "remove_edge": "delete_knowledge_edge",
}
FIELD_ALIASES = {
    "action": "type",
    "operation": "type",
    "documentId": "document_id",
    "blockKey": "block_key",
    "expectedText": "expected_text",
    "oldText": "expected_text",
    "newText": "new_text",
    "replacementText": "new_text",
    "notebookId": "notebook_id",
    "nodeId": "node_id",
    "edgeId": "edge_id",
    "tempId": "temp_id",
    "source": "source_ref",
    "target": "target_ref",
    "sourceRef": "source_ref",
    "targetRef": "target_ref",
    "relationType": "relation",
    "positionX": "position_x",
    "positionY": "position_y",
    "fontScale": "font_scale",
}


def _invalid(message: str, details: Any | None = None) -> AppError:
    return AppError("AGENT_ACTION_PLAN_INVALID", message, 422, details)


def _positive_id(value: Any, field: str) -> int:
    if isinstance(value, str) and value.strip().isdigit():
        value = int(value.strip())
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise _invalid(f"{field} 必须是正整数")
    return value


def _text(value: Any, field: str, *, maximum: int, required: bool = False) -> str:
    if not isinstance(value, str):
        raise _invalid(f"{field} 必须是文本")
    result = value.strip() if required else value
    if required and not result:
        raise _invalid(f"{field} 不能为空")
    if len(result) > maximum:
        raise _invalid(f"{field} 超过长度限制")
    return result


def _node_ref(value: Any, field: str) -> int | str:
    if isinstance(value, int) and not isinstance(value, bool) and value > 0:
        return value
    if isinstance(value, str):
        value = value.strip()
        if value.isdigit() and int(value) > 0:
            return int(value)
        if re.fullmatch(r"[A-Za-z0-9_-]{1,80}", value):
            return value
    raise _invalid(f"{field} 必须是节点 ID 或有效的临时 ID")


def _canonical_operation(operation: Any, index: int) -> dict:
    if not isinstance(operation, dict):
        raise _invalid("每项操作必须是对象")
    normalized = {
        FIELD_ALIASES.get(key, key): value for key, value in operation.items()
    }
    action_type = str(normalized.get("type") or "").strip().lower()
    normalized["type"] = ACTION_ALIASES.get(action_type, action_type)
    if normalized["type"] == "create_knowledge_node" and not normalized.get("temp_id"):
        normalized["temp_id"] = f"node_{index + 1}"
    changes = normalized.get("changes")
    if isinstance(changes, dict):
        normalized["changes"] = {
            FIELD_ALIASES.get(key, key): value for key, value in changes.items()
        }
    return normalized


def _validate_operation(operation: Any) -> dict:
    if not isinstance(operation, dict):
        raise _invalid("每项操作必须是对象")
    action_type = operation.get("type")
    if action_type not in ACTION_TYPES:
        raise _invalid("计划包含不支持的操作", {"type": action_type})
    description = _text(
        operation.get("description", ""), "description", maximum=500
    )

    if action_type == "replace_document_block":
        return {
            "type": action_type,
            "document_id": _positive_id(operation.get("document_id"), "document_id"),
            "block_key": _text(
                operation.get("block_key"), "block_key", maximum=240, required=True
            ),
            "expected_text": _text(
                operation.get("expected_text"),
                "expected_text",
                maximum=MAX_DOCUMENT_TEXT,
            ),
            "new_text": _text(
                operation.get("new_text"), "new_text", maximum=MAX_DOCUMENT_TEXT
            ),
            "description": description,
        }

    if action_type == "create_knowledge_node":
        temp_id = _text(
            operation.get("temp_id"), "temp_id", maximum=80, required=True
        )
        if not re.fullmatch(r"[A-Za-z0-9_-]+", temp_id):
            raise _invalid("temp_id 只能包含字母、数字、下划线和短横线")
        kind = operation.get("kind", "concept")
        if kind not in NODE_KINDS:
            raise _invalid("节点类型不受支持", {"kind": kind})
        normalized = {
            "type": action_type,
            "notebook_id": _positive_id(operation.get("notebook_id"), "notebook_id"),
            "temp_id": temp_id,
            "title": _text(operation.get("title"), "title", maximum=240, required=True),
            "description": _text(
                operation.get("description", ""), "description", maximum=20_000
            ),
            "module": _text(operation.get("module", ""), "module", maximum=240),
            "kind": kind,
            "content": _text(operation.get("content", ""), "content", maximum=50_000),
            "color": _text(operation.get("color", "blue"), "color", maximum=40, required=True),
        }
        for field in ("position_x", "position_y", "width", "height", "font_scale"):
            value = operation.get(field)
            if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float))):
                raise _invalid(f"{field} 必须是数字")
            if value is not None:
                normalized[field] = float(value)
        return normalized

    if action_type == "update_knowledge_node":
        changes = operation.get("changes")
        if not isinstance(changes, dict) or not changes:
            raise _invalid("changes 必须包含至少一个节点修改")
        changes = {key: value for key, value in changes.items() if key in NODE_UPDATE_FIELDS}
        if not changes:
            raise _invalid("changes 没有可执行的节点字段")
        normalized_changes: dict[str, Any] = {}
        for field, value in changes.items():
            if field in {"position_x", "position_y", "width", "height", "font_scale"}:
                if value is not None and (
                    isinstance(value, bool) or not isinstance(value, (int, float))
                ):
                    raise _invalid(f"{field} 必须是数字")
                normalized_changes[field] = None if value is None else float(value)
            elif field == "kind":
                if value not in NODE_KINDS:
                    raise _invalid("节点类型不受支持", {"kind": value})
                normalized_changes[field] = value
            else:
                normalized_changes[field] = _text(
                    value,
                    field,
                    maximum=50_000 if field == "content" else 20_000,
                    required=field in {"title", "color"},
                )
        return {
            "type": action_type,
            "notebook_id": _positive_id(operation.get("notebook_id"), "notebook_id"),
            "node_id": _positive_id(operation.get("node_id"), "node_id"),
            "changes": normalized_changes,
            "description": description,
        }

    if action_type == "delete_knowledge_node":
        return {
            "type": action_type,
            "notebook_id": _positive_id(operation.get("notebook_id"), "notebook_id"),
            "node_id": _positive_id(operation.get("node_id"), "node_id"),
            "description": description,
        }

    if action_type == "create_knowledge_edge":
        relation = operation.get("relation", "mindmap")
        if relation not in RELATIONS:
            raise _invalid("知识关系类型不受支持", {"relation": relation})
        return {
            "type": action_type,
            "notebook_id": _positive_id(operation.get("notebook_id"), "notebook_id"),
            "source_ref": _node_ref(operation.get("source_ref"), "source_ref"),
            "target_ref": _node_ref(operation.get("target_ref"), "target_ref"),
            "relation": relation,
            "description": description,
        }

    return {
        "type": action_type,
        "notebook_id": _positive_id(operation.get("notebook_id"), "notebook_id"),
        "edge_id": _positive_id(operation.get("edge_id"), "edge_id"),
        "description": description,
    }


def normalize_action_plan(value: Any) -> dict:
    if not isinstance(value, dict):
        raise _invalid("操作计划必须是 JSON 对象")
    operations = value.get("operations") or value.get("actions") or value.get("steps")
    if not isinstance(operations, list) or not operations:
        raise _invalid("计划必须包含至少一项操作")
    if len(operations) > MAX_OPERATIONS:
        raise _invalid(f"单次计划最多包含 {MAX_OPERATIONS} 项操作")
    normalized_operations = [
        _validate_operation(_canonical_operation(item, index))
        for index, item in enumerate(operations)
    ]
    temp_ids = [
        item["temp_id"]
        for item in normalized_operations
        if item["type"] == "create_knowledge_node"
    ]
    if len(temp_ids) != len(set(temp_ids)):
        raise _invalid("计划中的临时节点 ID 不能重复")
    declared = set(temp_ids)
    for item in normalized_operations:
        if item["type"] != "create_knowledge_edge":
            continue
        for field in ("source_ref", "target_ref"):
            reference = item[field]
            if isinstance(reference, str) and reference not in declared:
                raise _invalid("连线引用了未声明的临时节点", {"reference": reference})
    return {
        "title": _text(
            str(value.get("title") or value.get("name") or "Agent 操作计划"),
            "title",
            maximum=160,
            required=True,
        ),
        "summary": _text(
            str(value.get("summary") or value.get("description") or value.get("impact") or ""),
            "summary",
            maximum=2_000,
        ),
        "operations": normalized_operations,
    }


def validate_action_plan(value: Any) -> dict:
    """Backward-compatible name for the tolerant plan normalizer."""
    return normalize_action_plan(value)


def parse_action_plan_response(content: str) -> tuple[str, dict | None]:
    matches = list(PLAN_PATTERN.finditer(content))
    if not matches:
        return content.strip(), None
    visible = PLAN_PATTERN.sub("", content).strip()
    for match in reversed(matches):
        raw = match.group(1).strip()
        candidates = (raw, re.sub(r",\s*([}\]])", r"\1", raw))
        for candidate in candidates:
            try:
                return visible, normalize_action_plan(json.loads(candidate))
            except (json.JSONDecodeError, AppError):
                continue
    return visible, None


class AgentActionService:
    def __init__(self, database: Database) -> None:
        self.database = database

    def create_plan(
        self,
        thread_id: int,
        assistant_message_id: int,
        course_id: int,
        plan: dict,
    ) -> dict:
        normalized = normalize_action_plan(plan)
        with self.database.connect() as connection:
            plan_id = connection.execute(
                """INSERT INTO agent_action_plans(
                    thread_id, assistant_message_id, course_id,
                    title, summary, operations_json
                ) VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    thread_id,
                    assistant_message_id,
                    course_id,
                    normalized["title"],
                    normalized["summary"],
                    json.dumps(normalized["operations"], ensure_ascii=False),
                ),
            ).lastrowid
            row = connection.execute(
                "SELECT * FROM agent_action_plans WHERE id = ?", (plan_id,)
            ).fetchone()
        return self._serialize(row)

    def get_plan(self, plan_id: int) -> dict:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT * FROM agent_action_plans WHERE id = ?", (plan_id,)
            ).fetchone()
        if not row:
            raise AppError("AGENT_ACTION_PLAN_NOT_FOUND", "操作计划不存在", 404)
        return self._serialize(row)

    def for_message(self, assistant_message_id: int) -> dict | None:
        with self.database.connect() as connection:
            row = connection.execute(
                """SELECT * FROM agent_action_plans
                WHERE assistant_message_id = ?""",
                (assistant_message_id,),
            ).fetchone()
        return self._serialize(row) if row else None

    def confirm(self, plan_id: int) -> dict:
        current = self.get_plan(plan_id)
        if current["status"] != "pending":
            raise AppError(
                "AGENT_ACTION_PLAN_STATE", "只有待确认计划可以执行", 409
            )
        try:
            with self.database.connect() as connection:
                connection.execute("BEGIN IMMEDIATE")
                row = self._plan_row(connection, plan_id)
                if row["status"] != "pending":
                    raise AppError(
                        "AGENT_ACTION_PLAN_STATE", "计划状态已经变化，请刷新后重试", 409
                    )
                connection.execute(
                    """UPDATE agent_action_plans
                    SET status = 'executing', confirmed_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP, error = ''
                    WHERE id = ?""",
                    (plan_id,),
                )
                operations = json.loads(row["operations_json"] or "[]")
                snapshots: list[dict] = []
                temp_nodes: dict[str, int] = {}
                affected_documents: set[int] = set()
                affected_notebooks: set[int] = set()
                created_edges: list[int] = []
                for operation in operations:
                    snapshot, result = self._apply_operation(
                        connection,
                        int(row["course_id"]),
                        operation,
                        temp_nodes,
                    )
                    snapshots.append(snapshot)
                    if result.get("document_id"):
                        affected_documents.add(int(result["document_id"]))
                    if result.get("notebook_id"):
                        affected_notebooks.add(int(result["notebook_id"]))
                    if result.get("created_node_id"):
                        temp_nodes[operation["temp_id"]] = int(
                            result["created_node_id"]
                        )
                    if result.get("created_edge_id"):
                        created_edges.append(int(result["created_edge_id"]))
                result_payload = {
                    "operation_count": len(operations),
                    "affected_document_ids": sorted(affected_documents),
                    "affected_notebook_ids": sorted(affected_notebooks),
                    "created_node_ids": temp_nodes,
                    "created_edge_ids": created_edges,
                }
                connection.execute(
                    """UPDATE agent_action_plans
                    SET status = 'completed', before_json = ?, result_json = ?,
                        completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?""",
                    (
                        json.dumps({"snapshots": snapshots}, ensure_ascii=False),
                        json.dumps(result_payload, ensure_ascii=False),
                        plan_id,
                    ),
                )
        except AppError as error:
            if error.code != "AGENT_ACTION_PLAN_STATE":
                self._mark_failed(plan_id, error.message)
            raise
        except sqlite3.IntegrityError as error:
            app_error = AppError(
                "AGENT_ACTION_EXECUTION_FAILED",
                "操作计划与当前资料状态冲突，整批修改已回滚",
                409,
                str(error),
            )
            self._mark_failed(plan_id, app_error.message)
            raise app_error from error
        return self.get_plan(plan_id)

    def cancel(self, plan_id: int) -> dict:
        with self.database.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = self._plan_row(connection, plan_id)
            if row["status"] != "pending":
                raise AppError(
                    "AGENT_ACTION_PLAN_STATE", "只有待确认计划可以取消", 409
                )
            connection.execute(
                """UPDATE agent_action_plans
                SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?""",
                (plan_id,),
            )
        return self.get_plan(plan_id)

    def undo(self, plan_id: int) -> dict:
        current = self.get_plan(plan_id)
        if current["status"] != "completed":
            raise AppError(
                "AGENT_ACTION_PLAN_STATE", "只有已执行计划可以整体撤销", 409
            )
        with self.database.connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = self._plan_row(connection, plan_id)
            if row["status"] != "completed":
                raise AppError(
                    "AGENT_ACTION_PLAN_STATE", "计划状态已经变化，请刷新后重试", 409
                )
            before = json.loads(row["before_json"] or "{}")
            for snapshot in reversed(before.get("snapshots") or []):
                self._undo_snapshot(connection, snapshot)
            connection.execute(
                """UPDATE agent_action_plans
                SET status = 'undone', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?""",
                (plan_id,),
            )
        return self.get_plan(plan_id)

    def _apply_operation(
        self,
        connection,
        course_id: int,
        operation: dict,
        temp_nodes: dict[str, int],
    ) -> tuple[dict, dict]:
        action_type = operation["type"]
        if action_type == "replace_document_block":
            document = connection.execute(
                """SELECT * FROM documents
                WHERE id = ? AND course_id = ? AND deleted_at IS NULL""",
                (operation["document_id"], course_id),
            ).fetchone()
            if not document or document["format"] != "markdown":
                raise AppError(
                    "DOCUMENT_NOT_FOUND", "只能修改当前课程中的 Markdown 资料", 404
                )
            block = connection.execute(
                """SELECT * FROM document_blocks
                WHERE document_id = ? AND block_key = ?""",
                (operation["document_id"], operation["block_key"]),
            ).fetchone()
            if not block:
                raise AppError("DOCUMENT_BLOCK_NOT_FOUND", "资料段落不存在", 404)
            if block["text"] != operation["expected_text"]:
                raise AppError(
                    "DOCUMENT_REVISION_CONFLICT",
                    "资料内容已变化，整批修改未执行，请重新生成计划",
                    409,
                )
            connection.execute(
                "DELETE FROM document_revisions WHERE document_id = ? AND is_applied = 0",
                (operation["document_id"],),
            )
            revision = int(
                connection.execute(
                    """SELECT COALESCE(MAX(revision), 0) + 1
                    FROM document_revisions WHERE document_id = ? AND block_key = ?""",
                    (operation["document_id"], operation["block_key"]),
                ).fetchone()[0]
            )
            before_state = {
                "text": block["text"],
                "data": json.loads(block["data_json"] or "{}"),
            }
            after_state = {**before_state, "text": operation["new_text"]}
            revision_id = int(
                connection.execute(
                    """INSERT INTO document_revisions(
                        document_id, block_key, before_json, after_json, revision
                    ) VALUES (?, ?, ?, ?, ?)""",
                    (
                        operation["document_id"],
                        operation["block_key"],
                        json.dumps(before_state, ensure_ascii=False),
                        json.dumps(after_state, ensure_ascii=False),
                        revision,
                    ),
                ).lastrowid
            )
            connection.execute(
                """UPDATE document_blocks SET text = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?""",
                (operation["new_text"], block["id"]),
            )
            self._refresh_document_body(connection, int(document["id"]))
            return (
                {
                    "type": action_type,
                    "document_id": int(document["id"]),
                    "block_id": int(block["id"]),
                    "before_text": block["text"],
                    "before_data_json": block["data_json"],
                    "revision_id": revision_id,
                },
                {"document_id": int(document["id"])},
            )

        notebook_id = int(operation["notebook_id"])
        self._require_notebook(connection, course_id, notebook_id)
        if action_type == "create_knowledge_node":
            cursor = connection.execute(
                """INSERT INTO knowledge_nodes(
                    course_id, notebook_id, title, description, module, kind, content,
                    color, position_x, position_y, width, height, font_scale
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    course_id,
                    notebook_id,
                    operation["title"],
                    operation.get("description", ""),
                    operation.get("module", ""),
                    operation.get("kind", "concept"),
                    operation.get("content", ""),
                    operation.get("color", "blue"),
                    operation.get("position_x"),
                    operation.get("position_y"),
                    operation.get("width"),
                    operation.get("height"),
                    operation.get("font_scale"),
                ),
            )
            node_id = int(cursor.lastrowid)
            return (
                {"type": action_type, "node_id": node_id},
                {"notebook_id": notebook_id, "created_node_id": node_id},
            )

        if action_type == "update_knowledge_node":
            node = self._node_row(
                connection, course_id, notebook_id, int(operation["node_id"])
            )
            changes = operation["changes"]
            before = {field: node[field] for field in changes}
            assignments = ", ".join(f"{field} = ?" for field in changes)
            connection.execute(
                f"UPDATE knowledge_nodes SET {assignments} WHERE id = ?",
                [*changes.values(), node["id"]],
            )
            return (
                {
                    "type": action_type,
                    "node_id": int(node["id"]),
                    "before": before,
                },
                {"notebook_id": notebook_id},
            )

        if action_type == "delete_knowledge_node":
            node = self._node_row(
                connection, course_id, notebook_id, int(operation["node_id"])
            )
            edges = connection.execute(
                """SELECT * FROM knowledge_edges
                WHERE course_id = ? AND notebook_id = ?
                    AND (source_id = ? OR target_id = ?)""",
                (course_id, notebook_id, node["id"], node["id"]),
            ).fetchall()
            connection.execute("DELETE FROM knowledge_nodes WHERE id = ?", (node["id"],))
            return (
                {
                    "type": action_type,
                    "node": dict(node),
                    "edges": [dict(edge) for edge in edges],
                },
                {"notebook_id": notebook_id},
            )

        if action_type == "create_knowledge_edge":
            source_id = self._resolve_node_ref(operation["source_ref"], temp_nodes)
            target_id = self._resolve_node_ref(operation["target_ref"], temp_nodes)
            self._node_row(connection, course_id, notebook_id, source_id)
            self._node_row(connection, course_id, notebook_id, target_id)
            if operation["relation"] == "prerequisite":
                if source_id == target_id or self._would_cycle(
                    connection, course_id, notebook_id, source_id, target_id
                ):
                    raise AppError("DAG_CYCLE", "该依赖会形成环", 409)
            edge_id = int(
                connection.execute(
                    """INSERT INTO knowledge_edges(
                        course_id, notebook_id, source_id, target_id, relation
                    ) VALUES (?, ?, ?, ?, ?)""",
                    (
                        course_id,
                        notebook_id,
                        source_id,
                        target_id,
                        operation["relation"],
                    ),
                ).lastrowid
            )
            return (
                {"type": action_type, "edge_id": edge_id},
                {"notebook_id": notebook_id, "created_edge_id": edge_id},
            )

        edge = self._edge_row(
            connection, course_id, notebook_id, int(operation["edge_id"])
        )
        connection.execute("DELETE FROM knowledge_edges WHERE id = ?", (edge["id"],))
        return (
            {"type": action_type, "edge": dict(edge)},
            {"notebook_id": notebook_id},
        )

    def _undo_snapshot(self, connection, snapshot: dict) -> None:
        action_type = snapshot["type"]
        if action_type == "replace_document_block":
            connection.execute(
                """UPDATE document_blocks
                SET text = ?, data_json = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND document_id = ?""",
                (
                    snapshot["before_text"],
                    snapshot["before_data_json"],
                    snapshot["block_id"],
                    snapshot["document_id"],
                ),
            )
            connection.execute(
                "UPDATE document_revisions SET is_applied = 0 WHERE id = ?",
                (snapshot["revision_id"],),
            )
            self._refresh_document_body(connection, int(snapshot["document_id"]))
            return
        if action_type == "create_knowledge_node":
            connection.execute(
                "DELETE FROM knowledge_nodes WHERE id = ?", (snapshot["node_id"],)
            )
            return
        if action_type == "update_knowledge_node":
            before = snapshot["before"]
            assignments = ", ".join(f"{field} = ?" for field in before)
            connection.execute(
                f"UPDATE knowledge_nodes SET {assignments} WHERE id = ?",
                [*before.values(), snapshot["node_id"]],
            )
            return
        if action_type == "delete_knowledge_node":
            self._insert_snapshot_row(connection, "knowledge_nodes", snapshot["node"])
            for edge in snapshot["edges"]:
                self._insert_snapshot_row(connection, "knowledge_edges", edge, ignore=True)
            return
        if action_type == "create_knowledge_edge":
            connection.execute(
                "DELETE FROM knowledge_edges WHERE id = ?", (snapshot["edge_id"],)
            )
            return
        self._insert_snapshot_row(connection, "knowledge_edges", snapshot["edge"])

    @staticmethod
    def _insert_snapshot_row(connection, table: str, row: dict, ignore: bool = False) -> None:
        if table not in {"knowledge_nodes", "knowledge_edges"}:
            raise AppError("AGENT_ACTION_EXECUTION_FAILED", "无法恢复操作快照", 500)
        columns = list(row)
        command = "INSERT OR IGNORE" if ignore else "INSERT"
        placeholders = ", ".join("?" for _ in columns)
        connection.execute(
            f"{command} INTO {table} ({', '.join(columns)}) VALUES ({placeholders})",
            [row[column] for column in columns],
        )

    @staticmethod
    def _refresh_document_body(connection, document_id: int) -> None:
        body = "\n\n".join(
            row["text"].strip()
            for row in connection.execute(
                """SELECT text FROM document_blocks
                WHERE document_id = ? ORDER BY ordinal, id""",
                (document_id,),
            ).fetchall()
            if row["text"].strip()
        )
        connection.execute(
            """UPDATE documents SET body = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?""",
            (body, document_id),
        )

    @staticmethod
    def _resolve_node_ref(reference: int | str, temp_nodes: dict[str, int]) -> int:
        if isinstance(reference, int):
            return reference
        if reference not in temp_nodes:
            raise AppError(
                "AGENT_ACTION_PLAN_INVALID", "计划引用的新节点尚未创建", 409
            )
        return temp_nodes[reference]

    @staticmethod
    def _require_notebook(connection, course_id: int, notebook_id: int) -> None:
        row = connection.execute(
            """SELECT id FROM knowledge_notebooks
            WHERE id = ? AND course_id = ? AND deleted_at IS NULL""",
            (notebook_id, course_id),
        ).fetchone()
        if not row:
            raise AppError("KNOWLEDGE_NOTEBOOK_NOT_FOUND", "知识笔记不存在", 404)

    @staticmethod
    def _node_row(connection, course_id: int, notebook_id: int, node_id: int):
        row = connection.execute(
            """SELECT * FROM knowledge_nodes
            WHERE id = ? AND course_id = ? AND notebook_id = ?""",
            (node_id, course_id, notebook_id),
        ).fetchone()
        if not row:
            raise AppError("KNOWLEDGE_NOT_FOUND", "知识节点不存在", 404)
        return row

    @staticmethod
    def _edge_row(connection, course_id: int, notebook_id: int, edge_id: int):
        row = connection.execute(
            """SELECT * FROM knowledge_edges
            WHERE id = ? AND course_id = ? AND notebook_id = ?""",
            (edge_id, course_id, notebook_id),
        ).fetchone()
        if not row:
            raise AppError("KNOWLEDGE_EDGE_NOT_FOUND", "知识连线不存在", 404)
        return row

    @staticmethod
    def _would_cycle(
        connection, course_id: int, notebook_id: int, source_id: int, target_id: int
    ) -> bool:
        adjacency: dict[int, list[int]] = {}
        for row in connection.execute(
            """SELECT source_id, target_id FROM knowledge_edges
            WHERE course_id = ? AND notebook_id = ? AND relation = 'prerequisite'""",
            (course_id, notebook_id),
        ).fetchall():
            adjacency.setdefault(int(row["source_id"]), []).append(int(row["target_id"]))
        stack = [target_id]
        seen: set[int] = set()
        while stack:
            current = stack.pop()
            if current == source_id:
                return True
            if current in seen:
                continue
            seen.add(current)
            stack.extend(adjacency.get(current, []))
        return False

    def _mark_failed(self, plan_id: int, message: str) -> None:
        with self.database.connect() as connection:
            connection.execute(
                """UPDATE agent_action_plans
                SET status = 'failed', error = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND status = 'pending'""",
                (message[:2_000], plan_id),
            )

    @staticmethod
    def _plan_row(connection, plan_id: int):
        row = connection.execute(
            "SELECT * FROM agent_action_plans WHERE id = ?", (plan_id,)
        ).fetchone()
        if not row:
            raise AppError("AGENT_ACTION_PLAN_NOT_FOUND", "操作计划不存在", 404)
        return row

    @staticmethod
    def _serialize(row) -> dict:
        item = as_dict(row)
        item["operations"] = json.loads(item.pop("operations_json") or "[]")
        item["before"] = json.loads(item.pop("before_json") or "{}")
        item["result"] = json.loads(item.pop("result_json") or "{}")
        item["destructive"] = any(
            operation["type"]
            in {"delete_knowledge_node", "delete_knowledge_edge"}
            for operation in item["operations"]
        )
        return item
