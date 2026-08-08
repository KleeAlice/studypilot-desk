from __future__ import annotations

import json

import pytest

from backend.app.db import Database
from backend.app.services import learning_mode
from backend.app.services.agent import AgentService


def learning_answer(subject: str, concept: str = "Vectors") -> str:
    payload = {
        "thread_title": f"{subject} foundations",
        "concept": concept,
        "direct_answer": f"{concept} are the first building block.",
        "explanation": f"A focused explanation of {concept}.",
        "example": {
            "concept": concept,
            "scenario": f"A concrete {concept} scenario.",
            "analysis": f"The scenario directly demonstrates {concept}.",
        },
        "practice": {
            "concept": concept,
            "type": "multiple_choice",
            "question": f"Which option best describes {concept}?",
            "options": [
                {"id": "A", "text": "Option one"},
                {"id": "B", "text": "Option two"},
                {"id": "C", "text": "Option three"},
                {"id": "D", "text": "Option four"},
            ],
            "correct_option": "B",
            "reference_answer": f"B demonstrates {concept}.",
        },
    }
    return (
        "```studypilot-learning\n"
        f"{json.dumps(payload, ensure_ascii=False)}\n"
        "```"
    )


def open_learning_answer(subject: str, concept: str = "Vectors") -> str:
    fenced = learning_answer(subject, concept)
    payload = json.loads(
        fenced.removeprefix("```studypilot-learning\n").removesuffix("\n```")
    )
    payload["practice"].update({
        "type": "open",
        "options": [],
        "correct_option": "",
    })
    return "```studypilot-learning\n" + json.dumps(payload, ensure_ascii=False) + "\n```"


class RepairingGateway:
    def __init__(self, initial_answer: str, repair_answer: str) -> None:
        self.initial_answer = initial_answer
        self.repair_answer = repair_answer
        self.complete_calls: list[list[dict]] = []
        self.stream_calls: list[list[dict]] = []

    def stream(self, provider, messages, *, cancelled=None):
        answer = self.initial_answer if not self.stream_calls else self.repair_answer
        self.stream_calls.append(messages)
        yield {"type": "start", "provider_id": provider.id, "model": provider.model}
        if answer:
            yield {"type": "delta", "text": answer}
        yield {"type": "done", "content": answer}

    def complete(self, provider, messages):
        self.complete_calls.append(messages)
        return self.repair_answer


class SequentialRepairGateway(RepairingGateway):
    def __init__(self, answers: list[str]) -> None:
        super().__init__(answers[0], answers[-1])
        self.answers = answers

    def stream(self, provider, messages, *, cancelled=None):
        index = min(len(self.stream_calls), len(self.answers) - 1)
        answer = self.answers[index]
        self.stream_calls.append(messages)
        yield {"type": "start", "provider_id": provider.id, "model": provider.model}
        if answer:
            yield {"type": "delta", "text": answer}
        yield {"type": "done", "content": answer}

    def complete(self, provider, messages):
        index = min(len(self.complete_calls) + 1, len(self.answers) - 1)
        self.complete_calls.append(messages)
        return self.answers[index]


def configured_service(tmp_path, gateway: RepairingGateway) -> tuple[AgentService, int]:
    database = Database(tmp_path / "app.db")
    database.initialize()


    with database.connect() as connection:
        course_id = int(
            connection.execute("SELECT MIN(id) FROM courses").fetchone()[0]
        )
    service = AgentService(database, gateway=gateway)
    service.configure_provider(
        "openai",
        {
            "label": "OpenAI",
            "protocol": "openai_compatible",
            "base_url": "https://provider.test/v1",
            "model": "test-model",
            "api_key": "test-only-key",
        },
    )
    return service, course_id


def test_invalid_stream_is_repaired_once_and_never_completes_blank(tmp_path) -> None:
    gateway = RepairingGateway(
        "```studypilot-learning\n{}\n```",
        learning_answer("Linear Algebra"),
    )
    service, course_id = configured_service(tmp_path, gateway)
    thread = service.create_thread(
        course_id,
        {"provider_id": "openai", "mode": "learning"},
    )

    events = list(
        service.reply_events(
            thread["id"],
            {
                "message": 'Plan a complete path for "Linear Algebra", then teach lesson one.',
                "context": {"source_free": True},
            },
        )
    )

    assert len(gateway.stream_calls) == 2
    assert any(
        event["type"] == "learning_progress" and event["phase"] == "repair"
        for event in events
    )
    final = events[-1]["data"]["message"]
    assert final["status"] == "complete"
    assert final["content"]
    assert "learning_path" not in final["metadata"]["learning_card"]
    assert final["metadata"]["generation_trace"]["outcome"] == "repaired"


def test_invalid_first_repair_gets_one_bounded_second_repair(tmp_path) -> None:
    gateway = SequentialRepairGateway([
        "```studypilot-learning\n{}\n```",
        "```studypilot-learning\n{\"concept\":\"still truncated\"}\n```",
        learning_answer("Linear Algebra", "Vectors"),
    ])
    service, course_id = configured_service(tmp_path, gateway)
    thread = service.create_thread(
        course_id,
        {"provider_id": "openai", "mode": "learning"},
    )

    events = list(
        service.reply_events(
            thread["id"],
            {
                "message": 'Teach me "Linear Algebra" from zero.',
                "context": {"source_free": True},
            },
        )
    )

    assert len(gateway.stream_calls) == 3
    repair_events = [
        event for event in events
        if event["type"] == "learning_progress" and event["phase"] == "repair"
    ]
    assert len(repair_events) == 2
    final = events[-1]["data"]["message"]
    assert final["status"] == "complete"
    assert final["metadata"]["learning_card"]["concept"] == "Vectors"
    assert final["metadata"]["generation_trace"]["outcome"] == "repaired"




def test_truncated_bare_learning_json_is_repaired_instead_of_shown_as_chat(
    tmp_path,
) -> None:
    fenced = learning_answer("Linear Algebra", "Vectors")
    bare = fenced.removeprefix("```studypilot-learning\n").removesuffix("\n```")
    gateway = RepairingGateway(bare[:-1], fenced)
    service, course_id = configured_service(tmp_path, gateway)
    thread = service.create_thread(
        course_id,
        {"provider_id": "openai", "mode": "learning"},
    )

    events = list(
        service.reply_events(
            thread["id"],
            {
                "message": 'Teach me "Linear Algebra" from zero.',
                "context": {"source_free": True},
            },
        )
    )

    assert len(gateway.stream_calls) == 2
    assert any(
        event["type"] == "learning_progress" and event["phase"] == "repair"
        for event in events
    )
    final = events[-1]["data"]["message"]
    assert final["status"] == "complete"
    assert final["content"] != bare[:-1]
    assert final["metadata"]["learning_card"]["concept"] == "Vectors"


def test_complete_bare_learning_json_is_accepted_without_repair(tmp_path) -> None:
    fenced = learning_answer("Linear Algebra", "Vectors")
    bare = fenced.removeprefix("```studypilot-learning\n").removesuffix("\n```")
    gateway = RepairingGateway(bare, "repair must not run")
    service, course_id = configured_service(tmp_path, gateway)
    thread = service.create_thread(
        course_id,
        {"provider_id": "openai", "mode": "learning"},
    )

    events = list(
        service.reply_events(
            thread["id"],
            {"message": "Teach me vectors.", "context": {"source_free": True}},
        )
    )

    final = events[-1]["data"]["message"]
    assert final["metadata"]["learning_card"]["concept"] == "Vectors"
    assert gateway.complete_calls == []

def test_wrong_topic_first_lesson_triggers_repair(tmp_path) -> None:
    gateway = RepairingGateway(
        learning_answer("English Grammar", "Nouns"),
        learning_answer("Linear Algebra"),
    )
    service, course_id = configured_service(tmp_path, gateway)
    thread = service.create_thread(
        course_id,
        {"provider_id": "openai", "mode": "learning"},
    )

    events = list(
        service.reply_events(
            thread["id"],
            {
                "message": 'I want to learn "Linear Algebra" from zero.',
                "context": {"source_free": True},
            },
        )
    )

    assert len(gateway.stream_calls) == 2
    final_card = events[-1]["data"]["message"]["metadata"]["learning_card"]
    assert final_card["thread_title"] == "Linear Algebra foundations"
    assert "learning_path" not in final_card
def test_topic_match_accepts_a_close_chinese_term_correction_but_rejects_a_different_subject() -> None:
    _, card = learning_mode.parse_learning_response(
        learning_answer(
            "二叉搜索树节点关系与性质解析",
            "二叉搜索树的节点关系与性质",
        )
    )
    matcher = getattr(learning_mode, "learning_card_matches_topic", None)

    assert matcher is not None
    assert matcher(card, "二进制搜索树基础") is True
    assert matcher(card, "图论基础") is False
    _, compound_card = learning_mode.parse_learning_response(
        learning_answer("命题逻辑基础", "命题")
    )
    assert matcher(compound_card, "命题逻辑与真值表") is True
    assert matcher(compound_card, "概率论与随机过程") is False


def test_compound_course_topic_accepts_one_aligned_subtopic_only() -> None:
    assert learning_mode._topic_keys_match("命题逻辑与真值表", "命题逻辑基础：命题定义") is True
    assert learning_mode._topic_keys_match("命题逻辑与真值表", "线性代数中的矩阵乘法") is False
    matcher = learning_mode.learning_card_matches_topic
    assert matcher(
        learning_mode.parse_learning_response(learning_answer("票据双管线", "文档流与资金流"))[1],
        "图论基础",
    ) is False



def test_unrecoverable_empty_learning_output_is_an_error_not_blank_success(
    tmp_path,
) -> None:
    gateway = RepairingGateway("", "")
    service, course_id = configured_service(tmp_path, gateway)
    thread = service.create_thread(
        course_id,
        {"provider_id": "openai", "mode": "learning"},
    )

    events = list(
        service.reply_events(
            thread["id"],
            {
                "message": 'Teach me "Linear Algebra" from zero.',
                "context": {"source_free": True},
            },
        )
    )

    assert events[-1]["type"] == "error"
    assert events[-1]["error"]["code"] == "AGENT_LEARNING_FORMAT_INVALID"
    saved = service.get_thread(thread["id"])
    assistant = next(
        message for message in saved["messages"] if message["role"] == "assistant"
    )
    assert assistant["status"] == "error"
    assert assistant["content"] == ""
    assert assistant["error"]


@pytest.mark.parametrize(
    ("question", "expected"),
    [
        ('Teach me "Linear Algebra" from zero.', "Linear Algebra"),
        ("我想从零系统学习“线性代数”。", "线性代数"),
        ("继续刚才的课程", None),
    ],
)
def test_requested_learning_topic_reads_quoted_course_subject(
    question: str,
    expected: str | None,
) -> None:
    extractor = getattr(learning_mode, "requested_learning_topic", None)

    assert extractor is not None
    assert extractor(question) == expected


def test_explicit_learning_feedback_cannot_be_accepted_as_plain_conversation(tmp_path) -> None:
    conversation = json.dumps({
        "response_mode": "conversation",
        "thread_title": "线性代数学习",
        "direct_answer": "很好，我们继续。",
    }, ensure_ascii=False)
    gateway = RepairingGateway(conversation, learning_answer("Linear Algebra", "Matrices"))
    service, course_id = configured_service(tmp_path, gateway)
    thread = service.create_thread(
        course_id,
        {"provider_id": "openai", "mode": "learning"},
    )

    events = list(service.reply_events(
        thread["id"],
        {
            "message": "我懂了",
            "feedback_kind": "understood",
            "context": {
                "source_free": True,
                "learning_topic": "Linear Algebra",
            },
        },
    ))

    assert len(gateway.stream_calls) == 2
    final = events[-1]["data"]["message"]
    assert final["metadata"]["learning_card"]["concept"] == "Matrices"
    assert events[-1]["data"]["thread"]["learning_state"]["lesson_index"] == 1


def test_fifth_lesson_repairs_a_model_mcq_into_the_scheduled_open_question(tmp_path) -> None:
    gateway = RepairingGateway(
        learning_answer("Binary Search Trees", "Tree deletion"),
        open_learning_answer("Binary Search Trees", "Tree deletion"),
    )
    service, course_id = configured_service(tmp_path, gateway)
    thread = service.create_thread(
        course_id,
        {"provider_id": "openai", "mode": "learning"},
    )
    with service.database.connect() as connection:
        connection.execute(
            "UPDATE agent_threads SET learning_state_json = ? WHERE id = ?",
            (json.dumps({
                "lesson_index": 4,
                "autonomous_topic": "Binary Search Trees",
                "completed_concepts": ["Nodes", "Search", "Insert", "Traversal"],
            }), thread["id"]),
        )

    events = list(service.reply_events(
        thread["id"],
        {
            "message": "我懂了",
            "feedback_kind": "understood",
            "context": {"source_free": True},
        },
    ))

    assert len(gateway.stream_calls) == 2
    assert "practice.type 必须是 open" in gateway.stream_calls[1][-1]["content"]
    final = events[-1]["data"]
    assert final["message"]["metadata"]["learning_card"]["practice"]["type"] == "open"
    assert final["thread"]["learning_state"]["lesson_index"] == 5


def test_service_recovers_preexisting_blank_completed_learning_message(
    tmp_path,
) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()
    with database.connect() as connection:
        course_id = int(
            connection.execute("SELECT MIN(id) FROM courses").fetchone()[0]
        )
        thread_id = int(
            connection.execute(
                """INSERT INTO agent_threads(
                    course_id, title, provider_id, model, mode, learning_state_json
                ) VALUES (?, 'stuck lesson', 'openai', 'test-model', 'learning', '{}')""",
                (course_id,),
            ).lastrowid
        )
        connection.execute(
            """INSERT INTO agent_messages(
                thread_id, role, content, metadata_json, status
            ) VALUES (?, 'assistant', '', '{}', 'complete')""",
            (thread_id,),
        )

    service = AgentService(database, gateway=RepairingGateway("", ""))
    recovered = service.get_thread(thread_id)
    assistant = next(
        message
        for message in recovered["messages"]
        if message["role"] == "assistant"
    )

    assert assistant["status"] == "error"
    assert assistant["error"] == "上次学习内容未能完整生成，请重新发送问题。"

def test_plain_temporary_question_is_accepted_without_forcing_a_learning_card(
    tmp_path,
) -> None:
    answer = "这 20 份资料建议按基础规则、核心流程、业务应用、决策案例的顺序阅读。"
    gateway = RepairingGateway(answer, "repair must not run")
    service, course_id = configured_service(tmp_path, gateway)
    thread = service.create_thread(
        course_id,
        {"provider_id": "openai", "mode": "learning"},
    )

    events = list(
        service.reply_events(
            thread["id"],
            {
                "message": "这 20 份资料能不能给我一个阅读顺序？",
                "context": {"selected_document_ids": []},
            },
        )
    )

    final = events[-1]["data"]["message"]
    assert final["status"] == "complete"
    assert final["content"] == answer
    assert "learning_card" not in final["metadata"]
    assert gateway.complete_calls == []


def test_lesson_reasoning_without_final_card_is_repaired_not_saved_as_chat(
    tmp_path,
) -> None:
    reasoning_only = (
        "_mode=lesson，我需要生成符合要求的 JSON。"
        "concept、example 和 practice 必须对齐。准备最终 JSON。"
    )
    gateway = RepairingGateway(
        reasoning_only,
        learning_answer("Linear Algebra", "Vectors"),
    )
    service, course_id = configured_service(tmp_path, gateway)
    thread = service.create_thread(
        course_id,
        {"provider_id": "openai", "mode": "learning"},
    )

    events = list(
        service.reply_events(
            thread["id"],
            {
                "message": 'Teach me "Linear Algebra" from zero.',
                "context": {"source_free": True},
            },
        )
    )

    assert len(gateway.stream_calls) == 2
    final = events[-1]["data"]["message"]
    assert final["content"] != reasoning_only
    assert final["metadata"]["learning_card"]["concept"] == "Vectors"


def test_learning_repair_does_not_resend_twenty_full_document_excerpts(
    tmp_path,
) -> None:
    gateway = RepairingGateway(
        "_mode=lesson，正在整理 20 份资料，但最终结构未完成。",
        learning_answer("资料课程", "业务模块的职责边界"),
    )
    service, course_id = configured_service(tmp_path, gateway)
    sources = [
        {
            "kind": "document",
            "title": f"资料 {index:02d}",
            "document_id": index,
            "block_key": "",
            "locator": {"coverage": "selected_document_summary", "selected": True},
            "excerpt": f"DOC-{index:02d}-" + ("资料内容" * 1000),
        }
        for index in range(1, 21)
    ]
    service._build_context = lambda _course_id, _question, _context: sources  # type: ignore[method-assign]
    thread = service.create_thread(
        course_id,
        {"provider_id": "openai", "mode": "learning"},
    )

    events = list(
        service.reply_events(
            thread["id"],
            {"message": "请从选定的 20 份资料开始第一个知识点。"},
        )
    )

    assert events[-1]["type"] == "final"
    assert len(gateway.stream_calls) == 2
    initial_prompt = json.dumps(gateway.stream_calls[0], ensure_ascii=False)
    repair_prompt = json.dumps(gateway.stream_calls[1], ensure_ascii=False)
    assert "DOC-01-" in initial_prompt
    assert "DOC-20-" in initial_prompt
    assert len(repair_prompt) < 30_000
    assert "DOC-01-" not in repair_prompt
    assert "DOC-20-" not in repair_prompt
    assert "[S1] 资料 01" in repair_prompt
    assert "[S20] 资料 20" in repair_prompt


def test_reasoning_prefix_with_trailing_bare_learning_json_is_a_lesson_card() -> None:
    fenced = learning_answer("Graph Theory", "Vertices and edges")
    bare = fenced.removeprefix("```studypilot-learning\n").removesuffix("\n```")
    answer = (
        "_mode 选 lesson，因为用户是在请求讲解一个基础主题。\n"
        "我需要写一个符合要求的 JSON 字符串。开始生成。"
        + bare
    )

    visible, card = learning_mode.parse_learning_response(answer)

    assert visible == ""
    assert card is not None
    assert card["concept"] == "Vertices and edges"
    assert card["practice"]["type"] == "multiple_choice"
