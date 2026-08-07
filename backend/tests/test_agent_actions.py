import json

import pytest

from backend.app.db import Database
from backend.app.errors import AppError
from backend.app.services.agent_actions import (
    AgentActionService,
    parse_action_plan_response,
    validate_action_plan,
)


def fenced_plan(operations: list[dict]) -> str:
    payload = {
        "title": "整理资料并制作导图",
        "summary": "更新 Markdown 内容并建立知识关系",
        "operations": operations,
    }
    return (
        "我已经整理出一份待确认计划。\n\n"
        "```studypilot-plan\n"
        f"{json.dumps(payload, ensure_ascii=False)}\n"
        "```"
    )


def test_extracts_a_provider_neutral_plan_and_hides_raw_json() -> None:
    visible, plan = parse_action_plan_response(
        fenced_plan(
            [
                {
                    "type": "replace_document_block",
                    "document_id": 12,
                    "block_key": "section:0",
                    "expected_text": "旧内容",
                    "new_text": "新内容",
                    "description": "重写开头",
                },
                {
                    "type": "create_knowledge_node",
                    "notebook_id": 7,
                    "temp_id": "root",
                    "title": "核心概念",
                    "kind": "concept",
                },
                {
                    "type": "create_knowledge_edge",
                    "notebook_id": 7,
                    "source_ref": "root",
                    "target_ref": 55,
                    "relation": "mindmap",
                },
            ]
        )
    )

    assert visible == "我已经整理出一份待确认计划。"
    assert plan is not None
    assert plan["title"] == "整理资料并制作导图"
    assert [item["type"] for item in plan["operations"]] == [
        "replace_document_block",
        "create_knowledge_node",
        "create_knowledge_edge",
    ]
    assert plan["operations"][1]["temp_id"] == "root"


def test_rejects_unknown_operations_and_duplicate_temporary_nodes() -> None:
    with pytest.raises(AppError) as unknown:
        validate_action_plan(
            {
                "title": "Unsafe",
                "summary": "",
                "operations": [{"type": "run_shell", "command": "echo unsafe"}],
            }
        )
    assert unknown.value.code == "AGENT_ACTION_PLAN_INVALID"

    with pytest.raises(AppError) as duplicate:
        validate_action_plan(
            {
                "title": "Duplicate",
                "summary": "",
                "operations": [
                    {
                        "type": "create_knowledge_node",
                        "notebook_id": 3,
                        "temp_id": "same",
                        "title": "A",
                    },
                    {
                        "type": "create_knowledge_node",
                        "notebook_id": 3,
                        "temp_id": "same",
                        "title": "B",
                    },
                ],
            }
        )
    assert duplicate.value.code == "AGENT_ACTION_PLAN_INVALID"


def test_rejects_oversized_or_malformed_plans_without_exposing_json() -> None:
    too_many = [
        {
            "type": "create_knowledge_node",
            "notebook_id": 3,
            "temp_id": f"node-{index}",
            "title": f"Node {index}",
        }
        for index in range(41)
    ]
    with pytest.raises(AppError) as excessive:
        validate_action_plan(
            {"title": "Too many", "summary": "", "operations": too_many}
        )
    assert excessive.value.code == "AGENT_ACTION_PLAN_INVALID"

    visible, plan = parse_action_plan_response(
        "准备修改。\n```studypilot-plan\n{not-json}\n```"
    )
    assert plan is None
    assert "{not-json}" not in visible
    assert visible == "准备修改。"


def test_tolerates_provider_aliases_extra_fields_and_multiple_plan_blocks() -> None:
    first = {
        "title": "旧计划",
        "summary": "应被后一个计划替换",
        "operations": [
            {
                "type": "create_knowledge_node",
                "notebook_id": 7,
                "temp_id": "old",
                "title": "旧节点",
            }
        ],
    }
    latest = {
        "title": "生成知识图谱",
        "summary": "根据资料创建根节点与关系",
        "requiresConfirmation": True,
        "operations": [
            {
                "action": "add_node",
                "notebookId": "7",
                "tempId": "root",
                "title": "核心概念",
                "kind": "concept",
                "providerNote": "这个额外字段不应阻断计划",
            },
            {
                "action": "add_edge",
                "notebookId": "7",
                "source": "root",
                "target": "55",
                "relationType": "mindmap",
            },
        ],
    }
    content = (
        "我已更新计划，请在计划卡片中确认。\n"
        "```studypilot-plan\n"
        f"{json.dumps(first, ensure_ascii=False)}\n```\n"
        "```studypilot-plan\n"
        f"{json.dumps(latest, ensure_ascii=False)}\n```"
    )

    visible, plan = parse_action_plan_response(content)

    assert visible == "我已更新计划，请在计划卡片中确认。"
    assert plan is not None
    assert plan["title"] == "生成知识图谱"
    assert plan["operations"] == [
        {
            "type": "create_knowledge_node",
            "notebook_id": 7,
            "temp_id": "root",
            "title": "核心概念",
            "description": "",
            "module": "",
            "kind": "concept",
            "content": "",
            "color": "blue",
        },
        {
            "type": "create_knowledge_edge",
            "notebook_id": 7,
            "source_ref": "root",
            "target_ref": 55,
            "relation": "mindmap",
            "description": "",
        },
    ]
    assert "未通过本地安全校验" not in visible


def action_fixture(tmp_path):
    database = Database(tmp_path / "actions.db")
    database.initialize()
    with database.connect() as connection:
        course_id = int(connection.execute("SELECT MIN(id) FROM courses").fetchone()[0])
        notebook_id = int(
            connection.execute(
                "SELECT MIN(id) FROM knowledge_notebooks WHERE course_id = ?",
                (course_id,),
            ).fetchone()[0]
        )
        document_id = int(
            connection.execute(
                """INSERT INTO documents(
                    course_id, title, filename, stored_path, media_type, sha256, body,
                    format, status, structure_json, updated_at
                ) VALUES (?, 'Plan source', 'plan.md', 'documents/plan.md',
                    'text/markdown', 'plan-sha', '原始段落', 'markdown', 'ready', '{}',
                    CURRENT_TIMESTAMP)""",
                (course_id,),
            ).lastrowid
        )
        connection.execute(
            """INSERT INTO document_blocks(
                document_id, block_key, block_type, ordinal, locator_json, text, data_json
            ) VALUES (?, 'section:0', 'section', 0, '{}', '原始段落', '{}')""",
            (document_id,),
        )
        root_id = int(
            connection.execute(
                """INSERT INTO knowledge_nodes(
                    course_id, notebook_id, title, kind, content, color
                ) VALUES (?, ?, '原节点', 'concept', '原内容', 'blue')""",
                (course_id, notebook_id),
            ).lastrowid
        )
        thread_id = int(
            connection.execute(
                "INSERT INTO agent_threads(course_id, title) VALUES (?, 'Actions')",
                (course_id,),
            ).lastrowid
        )
        message_id = int(
            connection.execute(
                "INSERT INTO agent_messages(thread_id, role, content) VALUES (?, 'assistant', 'Plan')",
                (thread_id,),
            ).lastrowid
        )
    return (
        database,
        AgentActionService(database),
        course_id,
        notebook_id,
        document_id,
        root_id,
        thread_id,
        message_id,
    )


def test_confirmation_atomically_edits_markdown_and_builds_a_mindmap_then_undoes(tmp_path) -> None:
    (
        database,
        service,
        course_id,
        notebook_id,
        document_id,
        root_id,
        thread_id,
        message_id,
    ) = action_fixture(tmp_path)
    plan = service.create_plan(
        thread_id,
        message_id,
        course_id,
        {
            "title": "Apply both workspaces",
            "summary": "One confirmed batch",
            "operations": [
                {
                    "type": "replace_document_block",
                    "document_id": document_id,
                    "block_key": "section:0",
                    "expected_text": "原始段落",
                    "new_text": "完整的新段落",
                },
                {
                    "type": "create_knowledge_node",
                    "notebook_id": notebook_id,
                    "temp_id": "child",
                    "title": "新分支",
                    "kind": "concept",
                    "content": "由 Agent 创建",
                    "position_x": 420,
                    "position_y": 180,
                },
                {
                    "type": "create_knowledge_edge",
                    "notebook_id": notebook_id,
                    "source_ref": root_id,
                    "target_ref": "child",
                    "relation": "mindmap",
                },
            ],
        },
    )

    with database.connect() as connection:
        assert connection.execute(
            "SELECT text FROM document_blocks WHERE document_id = ?", (document_id,)
        ).fetchone()[0] == "原始段落"
        assert connection.execute(
            "SELECT COUNT(*) FROM knowledge_nodes WHERE title = '新分支'"
        ).fetchone()[0] == 0

    completed = service.confirm(plan["id"])
    assert completed["status"] == "completed"
    assert completed["result"]["affected_document_ids"] == [document_id]
    assert completed["result"]["affected_notebook_ids"] == [notebook_id]
    with database.connect() as connection:
        assert connection.execute(
            "SELECT text FROM document_blocks WHERE document_id = ?", (document_id,)
        ).fetchone()[0] == "完整的新段落"
        child = connection.execute(
            "SELECT * FROM knowledge_nodes WHERE notebook_id = ? AND title = '新分支'",
            (notebook_id,),
        ).fetchone()
        assert child is not None
        assert connection.execute(
            """SELECT COUNT(*) FROM knowledge_edges
            WHERE source_id = ? AND target_id = ? AND relation = 'mindmap'""",
            (root_id, child["id"]),
        ).fetchone()[0] == 1

    undone = service.undo(plan["id"])
    assert undone["status"] == "undone"
    with database.connect() as connection:
        assert connection.execute(
            "SELECT text FROM document_blocks WHERE document_id = ?", (document_id,)
        ).fetchone()[0] == "原始段落"
        assert connection.execute(
            "SELECT COUNT(*) FROM knowledge_nodes WHERE notebook_id = ? AND title = '新分支'",
            (notebook_id,),
        ).fetchone()[0] == 0
        assert connection.execute(
            "SELECT is_applied FROM document_revisions WHERE document_id = ?",
            (document_id,),
        ).fetchone()[0] == 0


def test_existing_nodes_and_edges_can_be_updated_deleted_and_restored_as_one_batch(tmp_path) -> None:
    (
        database,
        service,
        course_id,
        notebook_id,
        _,
        root_id,
        thread_id,
        message_id,
    ) = action_fixture(tmp_path)
    with database.connect() as connection:
        edge_child_id = int(connection.execute(
            """INSERT INTO knowledge_nodes(course_id, notebook_id, title, kind)
            VALUES (?, ?, '关系子节点', 'concept')""",
            (course_id, notebook_id),
        ).lastrowid)
        node_child_id = int(connection.execute(
            """INSERT INTO knowledge_nodes(course_id, notebook_id, title, kind)
            VALUES (?, ?, '待删除节点', 'concept')""",
            (course_id, notebook_id),
        ).lastrowid)
        edge_id = int(connection.execute(
            """INSERT INTO knowledge_edges(course_id, notebook_id, source_id, target_id, relation)
            VALUES (?, ?, ?, ?, 'mindmap')""",
            (course_id, notebook_id, root_id, edge_child_id),
        ).lastrowid)
        cascaded_edge_id = int(connection.execute(
            """INSERT INTO knowledge_edges(course_id, notebook_id, source_id, target_id, relation)
            VALUES (?, ?, ?, ?, 'reference')""",
            (course_id, notebook_id, root_id, node_child_id),
        ).lastrowid)

    plan = service.create_plan(
        thread_id,
        message_id,
        course_id,
        {
            "title": "Edit existing mindmap",
            "summary": "Update and delete existing graph content",
            "operations": [
                {
                    "type": "update_knowledge_node",
                    "notebook_id": notebook_id,
                    "node_id": root_id,
                    "changes": {"title": "更新后的节点", "content": "更新后的内容"},
                },
                {
                    "type": "delete_knowledge_edge",
                    "notebook_id": notebook_id,
                    "edge_id": edge_id,
                },
                {
                    "type": "delete_knowledge_node",
                    "notebook_id": notebook_id,
                    "node_id": node_child_id,
                },
            ],
        },
    )

    assert plan["destructive"] is True
    service.confirm(plan["id"])
    with database.connect() as connection:
        root = connection.execute(
            "SELECT title, content FROM knowledge_nodes WHERE id = ?", (root_id,)
        ).fetchone()
        assert tuple(root) == ("更新后的节点", "更新后的内容")
        assert connection.execute(
            "SELECT COUNT(*) FROM knowledge_edges WHERE id IN (?, ?)",
            (edge_id, cascaded_edge_id),
        ).fetchone()[0] == 0
        assert connection.execute(
            "SELECT COUNT(*) FROM knowledge_nodes WHERE id = ?", (node_child_id,)
        ).fetchone()[0] == 0

    service.undo(plan["id"])
    with database.connect() as connection:
        root = connection.execute(
            "SELECT title, content FROM knowledge_nodes WHERE id = ?", (root_id,)
        ).fetchone()
        assert tuple(root) == ("原节点", "原内容")
        assert connection.execute(
            "SELECT COUNT(*) FROM knowledge_nodes WHERE id = ?", (node_child_id,)
        ).fetchone()[0] == 1
        assert connection.execute(
            "SELECT COUNT(*) FROM knowledge_edges WHERE id IN (?, ?)",
            (edge_id, cascaded_edge_id),
        ).fetchone()[0] == 2


def test_failed_confirmation_rolls_back_earlier_operations(tmp_path) -> None:
    (
        database,
        service,
        course_id,
        notebook_id,
        _,
        _,
        thread_id,
        message_id,
    ) = action_fixture(tmp_path)
    plan = service.create_plan(
        thread_id,
        message_id,
        course_id,
        {
            "title": "Rollback",
            "summary": "The second operation is stale",
            "operations": [
                {
                    "type": "create_knowledge_node",
                    "notebook_id": notebook_id,
                    "temp_id": "must-rollback",
                    "title": "不应保留",
                },
                {
                    "type": "update_knowledge_node",
                    "notebook_id": notebook_id,
                    "node_id": 999999,
                    "changes": {"title": "missing"},
                },
            ],
        },
    )

    with pytest.raises(AppError) as captured:
        service.confirm(plan["id"])
    assert captured.value.code == "KNOWLEDGE_NOT_FOUND"
    assert service.get_plan(plan["id"])["status"] == "failed"
    with database.connect() as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM knowledge_nodes WHERE title = '不应保留'"
        ).fetchone()[0] == 0


def test_cancelled_plan_cannot_execute(tmp_path) -> None:
    (
        _,
        service,
        course_id,
        notebook_id,
        _,
        _,
        thread_id,
        message_id,
    ) = action_fixture(tmp_path)
    plan = service.create_plan(
        thread_id,
        message_id,
        course_id,
        {
            "title": "Cancel",
            "summary": "No writes",
            "operations": [
                {
                    "type": "create_knowledge_node",
                    "notebook_id": notebook_id,
                    "temp_id": "cancelled",
                    "title": "Cancelled",
                }
            ],
        },
    )

    assert service.cancel(plan["id"])["status"] == "cancelled"
    with pytest.raises(AppError) as captured:
        service.confirm(plan["id"])
    assert captured.value.code == "AGENT_ACTION_PLAN_STATE"
