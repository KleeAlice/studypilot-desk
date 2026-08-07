import json

import pytest

from backend.app.db import Database
from backend.app.errors import AppError
from backend.app.services.agent import AgentService


class RecordingGateway:
    def __init__(self, answer: str = "Grounded answer [S1]") -> None:
        self.answer = answer
        self.calls = []

    def complete(self, provider, messages):
        self.calls.append((provider, messages))
        return self.answer


class FailingGateway:
    def complete(self, provider, messages):
        raise AppError("AGENT_RATE_LIMITED", "Too many requests", 429)


def seed_document(
    database: Database,
    course_id: int,
    title: str,
    blocks: list[tuple[str, str]],
) -> int:
    with database.connect() as connection:
        document_id = connection.execute(
            """INSERT INTO documents(
                course_id, title, filename, stored_path, media_type, sha256, body,
                format, status, structure_json, updated_at
            ) VALUES (?, ?, ?, ?, 'text/plain', ?, ?, 'text', 'ready', '{}', CURRENT_TIMESTAMP)""",
            (
                course_id,
                title,
                f"{title}.txt",
                f"documents/{title}.txt",
                f"sha-{course_id}-{title}",
                "\n\n".join(text for _, text in blocks),
            ),
        ).lastrowid
        connection.executemany(
            """INSERT INTO document_blocks(
                document_id, block_key, block_type, ordinal, locator_json, text, data_json
            ) VALUES (?, ?, 'text', ?, ?, ?, '{}')""",
            [
                (document_id, block_key, ordinal, json.dumps({"paragraph": ordinal}), text)
                for ordinal, (block_key, text) in enumerate(blocks)
            ],
        )
    return int(document_id)


def configured_service(tmp_path, gateway=None) -> tuple[Database, AgentService, int]:
    database = Database(tmp_path / "app.db")
    database.initialize()
    with database.connect() as connection:
        course_id = int(connection.execute("SELECT MIN(id) FROM courses").fetchone()[0])
    service = AgentService(database, gateway=gateway or RecordingGateway())
    service.configure_provider(
        "openai",
        {
            "label": "OpenAI",
            "protocol": "openai_compatible",
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-5.6-terra",
            "api_key": "top-secret",
        },
    )
    return database, service, course_id


def test_reply_reads_selected_course_sources_and_saves_a_titled_thread(tmp_path) -> None:
    gateway = RecordingGateway()
    database, service, course_id = configured_service(tmp_path, gateway)
    document_id = seed_document(
        database,
        course_id,
        "Optimization Notes",
        [
            ("text:1", "Gradient descent follows the negative gradient with a chosen step size."),
            ("text:2", "Newton's method uses curvature from the Hessian matrix."),
        ],
    )
    with database.connect() as connection:
        connection.execute(
            "INSERT INTO notes(course_id, title, content) VALUES (?, 'Step size note', 'A small learning rate improves stability.')",
            (course_id,),
        )
        notebook_id = connection.execute(
            "SELECT MIN(id) FROM knowledge_notebooks WHERE course_id = ?", (course_id,)
        ).fetchone()[0]
        connection.execute(
            """INSERT INTO knowledge_nodes(course_id, notebook_id, title, content)
            VALUES (?, ?, 'First-order methods', 'Gradient descent is a first-order optimizer.')""",
            (course_id, notebook_id),
        )

    thread = service.create_thread(course_id, {"provider_id": "openai"})
    reply = service.reply(
        thread["id"],
        {
            "message": "How does gradient descent compare with Newton's method?",
            "provider_id": "openai",
            "context": {
                "document_id": document_id,
                "block_key": "text:1",
                "include_current": True,
                "include_notes": True,
                "include_knowledge": True,
                "include_library": True,
            },
        },
    )

    kinds = {source["kind"] for source in reply["message"]["sources"]}
    saved = service.get_thread(thread["id"])
    system_prompt = gateway.calls[0][1][0]["content"]
    assert reply["message"]["content"] == "Grounded answer [S1]"
    assert {"document", "note", "knowledge"} <= kinds
    assert any(source.get("block_key") == "text:2" for source in reply["message"]["sources"])
    assert "[S1]" in system_prompt
    assert "Optimization Notes" in system_prompt
    assert saved["title"].startswith("How does gradient descent")
    assert [message["role"] for message in saved["messages"]] == ["user", "assistant"]

def test_generate_thread_title_uses_selected_model_and_sanitizes_output(tmp_path) -> None:
    gateway = RecordingGateway("Initial assistant answer")
    _database, service, course_id = configured_service(tmp_path, gateway)
    thread = service.create_thread(course_id, {"provider_id": "openai"})
    service.reply(
        thread["id"],
        {
            "message": "请比较梯度下降与牛顿法的核心差异，并说明各自适用场景。",
            "provider_id": "openai",
            "context": {},
        },
    )

    gateway.answer = "标题：《梯度下降与牛顿法比较》\n不要输出这一行"
    titled = service.generate_thread_title(thread["id"])

    assert titled["title"] == "梯度下降与牛顿法比较"
    provider, messages = gateway.calls[-1]
    assert provider.id == "openai"
    assert provider.max_output_tokens == 1024
    assert "请比较梯度下降与牛顿法" in messages[-1]["content"]
    assert "Initial assistant answer" in messages[-1]["content"]


def test_generate_thread_title_keeps_existing_title_when_model_returns_blank(tmp_path) -> None:
    gateway = RecordingGateway("Initial assistant answer")
    _database, service, course_id = configured_service(tmp_path, gateway)
    thread = service.create_thread(course_id, {"provider_id": "openai"})
    service.reply(thread["id"], {"message": "保留这个回退标题", "provider_id": "openai", "context": {}})
    before = service.get_thread(thread["id"], include_messages=False)["title"]
    gateway.answer = "   "

    assert service.generate_thread_title(thread["id"])["title"] == before


def test_generate_thread_title_prefers_the_provider_streaming_path(tmp_path) -> None:
    class StreamingOnlyGateway:
        def complete(self, _provider, _messages):
            raise AssertionError("title generation must not require non-streaming support")

        def stream(self, provider, messages):
            assert provider.max_output_tokens == 1024
            assert "批处理与流处理" in messages[-1]["content"]
            yield {"type": "delta", "text": "《批处理与"}
            yield {"type": "delta", "text": "流处理选型》"}
            yield {"type": "done", "content": "《批处理与流处理选型》"}

    database, service, course_id = configured_service(tmp_path, StreamingOnlyGateway())
    thread = service.create_thread(course_id, {"provider_id": "openai"})
    with database.connect() as connection:
        connection.executemany(
            "INSERT INTO agent_messages(thread_id, role, content) VALUES (?, ?, ?)",
            [
                (thread["id"], "user", "比较批处理与流处理的延迟和吞吐"),
                (thread["id"], "assistant", "批处理吞吐更高；流处理延迟更低。"),
            ],
        )

    titled = service.generate_thread_title(thread["id"])

    assert titled["title"] == "批处理与流处理选型"

def test_context_rejects_a_document_from_another_course(tmp_path) -> None:
    database, service, course_id = configured_service(tmp_path)
    with database.connect() as connection:
        other_course = connection.execute(
            "INSERT INTO courses(title) VALUES ('Private course')"
        ).lastrowid
    other_document = seed_document(
        database, int(other_course), "Private source", [("text:private", "Do not leak")]
    )
    thread = service.create_thread(course_id, {"provider_id": "openai"})

    with pytest.raises(AppError) as captured:
        service.reply(
            thread["id"],
            {
                "message": "Read the other course",
                "context": {"document_id": other_document, "include_current": True},
            },
        )

    assert captured.value.code == "AGENT_CONTEXT_FORBIDDEN"
    assert service.get_thread(thread["id"])["messages"] == []


def test_split_and_explicit_documents_are_all_added_to_agent_context(tmp_path) -> None:
    gateway = RecordingGateway()
    database, service, course_id = configured_service(tmp_path, gateway)
    first_id = seed_document(database, course_id, "Visible first", [("text:1", "alpha evidence")])
    second_id = seed_document(database, course_id, "Visible second", [("text:2", "beta evidence")])
    selected_id = seed_document(database, course_id, "Chosen source", [("text:3", "gamma evidence")])
    thread = service.create_thread(course_id, {"provider_id": "openai"})

    reply = service.reply(thread["id"], {
        "message": "Compare the evidence",
        "context": {
            "document_id": first_id,
            "document_ids": [first_id, second_id],
            "selected_document_ids": [selected_id],
            "include_current": True,
        },
    })

    titles = {source["title"] for source in reply["message"]["sources"]}
    assert {"Visible first", "Visible second", "Chosen source"} <= titles
    assert "普通问答默认充分展开" in gateway.calls[0][1][0]["content"]


def test_document_and_image_attachments_are_validated_persisted_and_sent(tmp_path) -> None:
    gateway = RecordingGateway()
    database, service, course_id = configured_service(tmp_path, gateway)
    document_id = seed_document(
        database, course_id, "Attached notes", [("text:1", "attachment evidence")]
    )
    media_root = tmp_path / "media"
    media_root.mkdir()
    image_bytes = b"\x89PNG\r\n\x1a\n" + b"agent-image"
    (media_root / "agent-image.png").write_bytes(image_bytes)
    with database.connect() as connection:
        connection.execute(
            """INSERT INTO media_assets(
                id, course_id, filename, media_type, storage_path, size_bytes
            ) VALUES ('agent-image', ?, 'diagram.png', 'image/png', 'agent-image.png', ?)""",
            (course_id, len(image_bytes)),
        )
    thread = service.create_thread(course_id, {"provider_id": "openai"})

    service.reply(
        thread["id"],
        {
            "message": "解释附件",
            "attachments": [
                {"kind": "document", "document_id": document_id, "name": "notes.txt", "media_type": "text/plain"},
                {"kind": "image", "image_asset_id": "agent-image", "name": "diagram.png", "media_type": "image/png"},
            ],
            "context": {},
        },
    )

    saved = service.get_thread(thread["id"])
    assert saved["messages"][0]["attachments"] == [
        {
            "kind": "document",
            "name": "notes.txt",
            "media_type": "text/plain",
            "document_id": document_id,
        },
        {
            "kind": "image",
            "name": "diagram.png",
            "media_type": "image/png",
            "image_asset_id": "agent-image",
            "url": f"/api/courses/{course_id}/media/images/agent-image",
        },
    ]
    assert any(source["title"] == "Attached notes" for source in saved["messages"][1]["sources"])
    latest_user_content = gateway.calls[0][1][-1]["content"]
    assert isinstance(latest_user_content, list)
    assert latest_user_content[0] == {"type": "text", "text": "解释附件"}
    assert latest_user_content[1]["image_url"]["url"].startswith("data:image/png;base64,")


def test_full_library_context_falls_back_to_one_representative_block_per_file(tmp_path) -> None:
    gateway = RecordingGateway()
    database, service, course_id = configured_service(tmp_path, gateway)
    seed_document(database, course_id, "First handbook", [("text:1", "alpha material")])
    seed_document(database, course_id, "Second handbook", [("text:2", "beta material")])
    thread = service.create_thread(course_id, {"provider_id": "openai"})

    reply = service.reply(thread["id"], {
        "message": "请总结资料库",
        "context": {"include_library": True},
    })

    titles = {source["title"] for source in reply["message"]["sources"]}
    assert {"First handbook", "Second handbook"} <= titles


def test_failed_provider_call_keeps_question_and_error_in_history(tmp_path) -> None:
    _, service, course_id = configured_service(tmp_path, FailingGateway())
    thread = service.create_thread(course_id, {"provider_id": "openai"})

    with pytest.raises(AppError) as captured:
        service.reply(thread["id"], {"message": "Please explain this", "context": {}})

    saved = service.get_thread(thread["id"])
    assert captured.value.code == "AGENT_RATE_LIMITED"
    assert [message["role"] for message in saved["messages"]] == ["user", "assistant"]
    assert saved["messages"][0]["content"] == "Please explain this"
    assert saved["messages"][1]["status"] == "error"
    assert saved["messages"][1]["error"] == "Too many requests"


def test_provider_secrets_are_write_only_and_threads_support_crud(tmp_path) -> None:
    _, service, course_id = configured_service(tmp_path)
    openai = next(item for item in service.list_providers() if item["id"] == "openai")
    thread = service.create_thread(course_id, {"title": "Draft", "provider_id": "openai"})
    renamed = service.update_thread(thread["id"], {"title": "Final title"})

    assert openai["has_api_key"] is True
    assert "api_key" not in openai
    assert renamed["title"] == "Final title"
    assert service.list_threads(course_id)[0]["id"] == thread["id"]
    service.delete_thread(thread["id"])
    assert service.list_threads(course_id) == []


def test_threads_can_be_pinned_and_are_listed_before_newer_unpinned_threads(tmp_path) -> None:
    _, service, course_id = configured_service(tmp_path)
    older = service.create_thread(
        course_id,
        {"title": "Pinned learning session", "provider_id": "openai", "mode": "learning"},
    )
    newer = service.create_thread(
        course_id,
        {"title": "Newer session", "provider_id": "openai", "mode": "learning"},
    )

    assert newer["pinned"] is False
    pinned = service.update_thread(older["id"], {"pinned": True})

    assert pinned["pinned"] is True
    listed = service.list_threads(course_id)
    assert [item["id"] for item in listed[:2]] == [older["id"], newer["id"]]
    assert listed[0]["pinned"] is True
    assert service.update_thread(older["id"], {"pinned": False})["pinned"] is False


def test_blank_provider_key_update_preserves_the_existing_secret(tmp_path) -> None:
    database, service, _ = configured_service(tmp_path)

    saved = service.configure_provider(
        "openai",
        {
            "label": "OpenAI renamed",
            "protocol": "openai_compatible",
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-5.6-terra",
            "api_key": "   ",
        },
    )

    with database.connect() as connection:
        stored = connection.execute(
            "SELECT api_key FROM agent_providers WHERE id = 'openai'"
        ).fetchone()["api_key"]
    assert saved["has_api_key"] is True
    assert stored == "top-secret"


def test_openai_compatible_root_address_is_preserved_for_private_gateways(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()
    service = AgentService(database, gateway=RecordingGateway())

    saved = service.configure_provider(
        "deepseek",
        {
            "label": "DeepSeek gateway",
            "protocol": "openai_compatible",
            "base_url": "http://gateway.example:32880/",
            "model": "DeepSeek-V4-Flash",
            "api_key": "secret",
        },
    )

    assert saved["base_url"] == "http://gateway.example:32880"


def test_editing_reply_saves_a_pending_plan_without_mutating_workspace(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()
    with database.connect() as connection:
        course_id = int(connection.execute("SELECT MIN(id) FROM courses").fetchone()[0])
        notebook_id = int(
            connection.execute(
                "SELECT MIN(id) FROM knowledge_notebooks WHERE course_id = ?",
                (course_id,),
            ).fetchone()[0]
        )
    document_id = seed_document(
        database, course_id, "Agent Markdown", [("section:0", "原始段落")]
    )
    with database.connect() as connection:
        connection.execute(
            "UPDATE documents SET format = 'markdown' WHERE id = ?", (document_id,)
        )

    plan = {
        "title": "更新资料并制作导图",
        "summary": "先改写资料，再建立两个知识节点",
        "operations": [
            {
                "type": "replace_document_block",
                "document_id": document_id,
                "block_key": "section:0",
                "expected_text": "原始段落",
                "new_text": "改写后的段落",
                "description": "补全说明",
            },
            {
                "type": "create_knowledge_node",
                "notebook_id": notebook_id,
                "temp_id": "root",
                "title": "核心概念",
                "kind": "concept",
            },
        ],
    }
    gateway = RecordingGateway(
        "我先给出待确认计划。\n\n```studypilot-plan\n"
        + json.dumps(plan, ensure_ascii=False)
        + "\n```"
    )
    service = AgentService(database, gateway=gateway)
    service.configure_provider(
        "deepseek",
        {
            "label": "DeepSeek",
            "protocol": "openai_compatible",
            "base_url": "https://api.deepseek.com/v1",
            "model": "deepseek-chat",
            "api_key": "secret",
        },
    )
    thread = service.create_thread(course_id, {"provider_id": "deepseek"})

    reply = service.reply(
        thread["id"],
        {
            "message": "修改这份 Markdown，并制作思维导图",
            "provider_id": "deepseek",
            "context": {
                "document_id": document_id,
                "notebook_id": notebook_id,
                "include_current": True,
                "include_knowledge": True,
            },
        },
    )

    assert reply["message"]["content"] == "我先给出待确认计划。"
    assert reply["message"]["action_plan"]["status"] == "pending"
    assert reply["message"]["action_plan"]["title"] == "更新资料并制作导图"
    saved = service.get_thread(thread["id"])
    assert saved["messages"][-1]["action_plan"]["id"] == reply["message"]["action_plan"]["id"]
    with database.connect() as connection:
        assert connection.execute(
            "SELECT text FROM document_blocks WHERE document_id = ? AND block_key = 'section:0'",
            (document_id,),
        ).fetchone()[0] == "原始段落"
        assert connection.execute(
            "SELECT COUNT(*) FROM knowledge_nodes WHERE notebook_id = ? AND title = '核心概念'",
            (notebook_id,),
        ).fetchone()[0] == 0
    assert "必须先生成操作计划" in gateway.calls[0][1][0]["content"]
    assert "用户确认前绝不能声称已经修改" in gateway.calls[0][1][0]["content"]


def test_action_prompt_exposes_exact_markdown_and_graph_identifiers(tmp_path) -> None:
    gateway = RecordingGateway("已读取可操作上下文")
    database, service, course_id = configured_service(tmp_path, gateway)
    document_id = seed_document(
        database,
        course_id,
        "Executable Markdown",
        [("section:0", "第一行\n第二行保持原始换行")],
    )
    with database.connect() as connection:
        connection.execute(
            "UPDATE documents SET format = 'markdown' WHERE id = ?", (document_id,)
        )
        notebook_id = int(connection.execute(
            "SELECT MIN(id) FROM knowledge_notebooks WHERE course_id = ?", (course_id,)
        ).fetchone()[0])
        root_id = int(connection.execute(
            """INSERT INTO knowledge_nodes(course_id, notebook_id, title, kind)
            VALUES (?, ?, '只有标题的根节点', 'concept')""",
            (course_id, notebook_id),
        ).lastrowid)
        child_id = int(connection.execute(
            """INSERT INTO knowledge_nodes(course_id, notebook_id, title, kind, content)
            VALUES (?, ?, '子节点', 'concept', '子节点内容')""",
            (course_id, notebook_id),
        ).lastrowid)
        edge_id = int(connection.execute(
            """INSERT INTO knowledge_edges(course_id, notebook_id, source_id, target_id, relation)
            VALUES (?, ?, ?, ?, 'mindmap')""",
            (course_id, notebook_id, root_id, child_id),
        ).lastrowid)

    thread = service.create_thread(course_id, {"provider_id": "openai"})
    service.reply(thread["id"], {
        "message": "修改当前 Markdown，并调整已有思维导图",
        "context": {
            "document_id": document_id,
            "block_key": "section:0",
            "notebook_id": notebook_id,
            "include_current": True,
            "include_knowledge": True,
        },
    })

    prompt = gateway.calls[0][1][0]["content"]
    assert f'"document_id": {document_id}' in prompt
    assert '"block_key": "section:0"' in prompt
    assert "第一行\n第二行保持原始换行" in prompt
    assert f'"notebook_id": {notebook_id}' in prompt
    assert f'"node_id": {root_id}' in prompt
    assert f'"edge_id": {edge_id}' in prompt
    assert f'"source_id": {root_id}' in prompt
    assert f'"target_id": {child_id}' in prompt

def test_new_and_updated_threads_follow_the_selected_provider_model(tmp_path) -> None:
    _, service, course_id = configured_service(tmp_path)
    service.configure_provider(
        "flash",
        {
            "label": "DeepSeek V4 Flash",
            "protocol": "anthropic",
            "base_url": "https://api.deepseek.com/anthropic",
            "model": "DeepSeek-V4-Flash",
            "api_key": "secret",
        },
    )

    thread = service.create_thread(
        course_id,
        {"provider_id": "openai", "model": "stale-client-model"},
    )
    switched = service.update_thread(
        thread["id"],
        {"provider_id": "flash", "model": "stale-client-model"},
    )

    assert thread["model"] == "gpt-5.6-terra"
    assert switched["provider_id"] == "flash"
    assert switched["model"] == "DeepSeek-V4-Flash"


def test_reply_never_combines_a_selected_provider_with_a_stale_thread_model(tmp_path) -> None:
    gateway = RecordingGateway()
    database, service, course_id = configured_service(tmp_path, gateway)
    service.configure_provider(
        "flash",
        {
            "label": "DeepSeek V4 Flash",
            "protocol": "anthropic",
            "base_url": "https://api.deepseek.com/anthropic",
            "model": "DeepSeek-V4-Flash",
            "api_key": "secret",
        },
    )
    thread = service.create_thread(course_id, {"provider_id": "openai"})
    with database.connect() as connection:
        connection.execute(
            "UPDATE agent_threads SET model = 'deepseek-v3' WHERE id = ?",
            (thread["id"],),
        )

    service.reply(
        thread["id"],
        {
            "message": "Explain this",
            "provider_id": "flash",
            "model": "deepseek-v3",
            "context": {},
        },
    )

    requested_provider = gateway.calls[0][0]
    saved_thread = service.get_thread(thread["id"], include_messages=False)
    assert requested_provider.id == "flash"
    assert requested_provider.model == "DeepSeek-V4-Flash"
    assert saved_thread["model"] == "DeepSeek-V4-Flash"
    assert saved_thread["provider_id"] == "flash"

def test_provider_connection_test_uses_the_same_stream_path_as_real_questions(tmp_path) -> None:
    class StreamFailingGateway:
        def __init__(self) -> None:
            self.complete_calls = 0
            self.stream_calls = 0

        def complete(self, provider, messages):
            self.complete_calls += 1
            return "OK"

        def stream(self, provider, messages, *, cancelled=None):
            self.stream_calls += 1
            raise AppError(
                "AGENT_PROVIDER_ERROR",
                "The provider returned HTTP 400",
                502,
            )
            yield

    gateway = StreamFailingGateway()
    _, service, _ = configured_service(tmp_path, gateway)

    with pytest.raises(AppError, match="HTTP 400"):
        service.test_provider("openai")
    assert gateway.stream_calls == 1
    assert gateway.complete_calls == 0
def test_selected_document_context_represents_every_selected_book(tmp_path) -> None:
    database, service, course_id = configured_service(tmp_path)
    document_ids = [
        seed_document(
            database,
            course_id,
            f"资料 {index:02d}",
            [
                (
                    "text:1",
                    f"这是第 {index:02d} 份资料的独有摘要与阅读线索。",
                )
            ],
        )
        for index in range(1, 21)
    ]

    sources = service._build_context(
        course_id,
        "请给这 20 份资料安排阅读顺序",
        {
            "selected_document_ids": document_ids,
            "include_current": False,
            "include_library": False,
        },
    )

    represented = {int(source["document_id"]) for source in sources if source.get("document_id")}
    assert represented == set(document_ids)
    assert len([source for source in sources if source.get("kind") == "document"]) == 20


def test_selected_text_is_grounded_even_without_a_document_id(tmp_path) -> None:
    _, service, course_id = configured_service(tmp_path)

    sources = service._build_context(
        course_id,
        "解释我刚刚选中的内容",
        {
            "selected_text": "矩阵的秩等于其最大线性无关列数。",
            "locator": {"view": "learning", "section": "answer"},
            "include_current": False,
            "include_library": False,
        },
    )

    selections = [source for source in sources if source.get("kind") == "selection"]
    assert len(selections) == 1
    assert selections[0]["title"] == "当前选区"
    assert selections[0]["excerpt"] == "矩阵的秩等于其最大线性无关列数。"
    assert selections[0]["locator"] == {"view": "learning", "section": "answer"}
    source_prompt = service._source_prompt(sources)
    assert "本轮必须直接处理“当前选区”" in source_prompt
    assert "不得声称无法看到用户选中的文字" in source_prompt
    assert "矩阵的秩等于其最大线性无关列数。" in source_prompt

def test_current_course_page_becomes_a_grounded_source_without_a_document(tmp_path) -> None:
    _, service, course_id = configured_service(tmp_path)

    sources = service._build_context(
        course_id,
        "我现在在哪个页面？",
        {
            "page_view": "home",
            "page_title": "算法",
            "include_current": True,
        },
    )

    pages = [source for source in sources if source.get("kind") == "page"]
    assert len(pages) == 1
    assert pages[0]["id"] == "home"
    assert pages[0]["title"] == "课程主页 · 算法"
    assert "算法" in pages[0]["excerpt"]
    prompt = service._source_prompt(sources)
    assert "[S1] 课程主页 · 算法 | page" in prompt
    assert pages[0]["citation"] == "S1"
