import json

from backend.app.db import Database
from backend.app.services.agent import AgentService
from backend.app.services.learning_mode import (
    LEARNING_SYSTEM_PROMPT,
    next_learning_state,
    parse_learning_response,
)


class RecordingGateway:
    def __init__(self, answer: str) -> None:
        self.answer = answer
        self.calls = []

    def complete(self, provider, messages):
        self.calls.append((provider, messages))
        return self.answer


def configured_service(tmp_path, answer: str) -> tuple[Database, AgentService, int, RecordingGateway]:
    database = Database(tmp_path / "app.db")
    database.initialize()
    with database.connect() as connection:
        course_id = int(connection.execute("SELECT MIN(id) FROM courses").fetchone()[0])
    gateway = RecordingGateway(answer)
    service = AgentService(database, gateway=gateway)
    service.configure_provider(
        "openai",
        {
            "label": "OpenAI",
            "protocol": "openai_compatible",
            "base_url": "https://api.openai.com/v1",
            "model": "test-model",
            "api_key": "test-only-key",
        },
    )
    return database, service, course_id, gateway


def learning_answer() -> str:
    return """先看资料里的核心意思。[S1]
```studypilot-learning
{"concept":"梯度","direct_answer":"梯度表示当前位置变化最快的方向和程度。",
"explanation":"把它想成站在山坡上判断哪一个方向最陡；方向告诉你往哪里走，大小告诉你坡有多陡。",
"example":{"concept":"梯度","scenario":"下山时每走一步，都重新观察哪边下降最快。","analysis":"每次重新判断最陡方向，就像根据当前位置重新计算梯度。"},
"practice":{"concept":"梯度","type":"multiple_choice","question":"如果沿梯度方向每一步迈得太大，可能发生什么？",
"options":[{"id":"A","text":"一定立刻收敛"},{"id":"B","text":"可能越过合适位置并震荡"},{"id":"C","text":"梯度自动归零"},{"id":"D","text":"方向不再变化"}],
"correct_option":"B","reference_answer":"B。可能越过合适位置，来回震荡甚至无法收敛。"}}
```
"""


def test_learning_response_extracts_one_bounded_card() -> None:
    text, card = parse_learning_response(learning_answer())

    assert text == "先看资料里的核心意思。[S1]"
    assert card is not None
    assert card["concept"] == "梯度"
    assert card["direct_answer"].startswith("梯度表示")
    assert "terms" not in card
    assert card["practice"]["question"].endswith("？")


def test_learning_response_removes_malformed_protocol_without_crashing() -> None:
    text, card = parse_learning_response(
        "先继续解释。\n```studypilot-learning\n{not valid json}\n```"
    )

    assert text == "先继续解释。"
    assert card is None



def test_learning_response_accepts_one_standard_json_fence_from_compatible_models() -> None:
    answer = learning_answer().replace(
        "```studypilot-learning",
        "```json",
        1,
    )
    text, card = parse_learning_response(answer)

    assert text == "先看资料里的核心意思。[S1]"
    assert card is not None
    assert card["concept"] == "梯度"

def test_learning_state_tracks_card_and_feedback() -> None:
    _, card = parse_learning_response(learning_answer())

    first = next_learning_state({}, card, None)
    second = next_learning_state(first, None, "confused")

    assert first == {
        "lesson_index": 1,
        "current_concept": "梯度",
        "completed_concepts": ["梯度"],
        "last_feedback": "",
    }
    assert second["lesson_index"] == 1
    assert second["last_feedback"] == "confused"


def test_learning_thread_uses_learning_prompt_and_persists_card(tmp_path) -> None:
    database, service, course_id, gateway = configured_service(tmp_path, learning_answer())
    thread = service.create_thread(course_id, {"provider_id": "openai", "mode": "learning"})

    reply = service.reply(
        thread["id"],
        {
            "message": "从最基础开始",
            "provider_id": "openai",
            "feedback_kind": "confused",
            "context": {},
        },
    )

    saved = service.get_thread(thread["id"])
    assert LEARNING_SYSTEM_PROMPT in gateway.calls[0][1][0]["content"]
    assert reply["message"]["content"] == "先看资料里的核心意思。[S1]"
    assert reply["message"]["metadata"]["learning_card"]["concept"] == "梯度"
    assert reply["message"]["metadata"]["lesson_index"] == 1
    assert saved["mode"] == "learning"
    expected_progress = {
        "lesson_index": 1,
        "current_concept": "梯度",
        "completed_concepts": ["梯度"],
        "last_feedback": "confused",
    }
    assert {
        key: saved["learning_state"][key]
        for key in expected_progress
    } == expected_progress
    assert saved["learning_state"]["learning_path_source"] == "course_roadmap"
    assert saved["learning_state"]["learning_path"]["stages"]
    assert saved["messages"][0]["metadata"]["feedback_kind"] == "confused"

    with database.connect() as connection:
        raw = connection.execute(
            "SELECT metadata_json FROM agent_messages WHERE id = ?",
            (reply["message"]["id"],),
        ).fetchone()[0]
    assert json.loads(raw)["learning_card"]["practice"]["question"].endswith("？")


def test_learning_reply_keeps_workspace_plan_pending_until_confirmation(tmp_path) -> None:
    database, service, course_id, gateway = configured_service(tmp_path, "")
    with database.connect() as connection:
        notebook_id = int(
            connection.execute(
                "SELECT MIN(id) FROM knowledge_notebooks WHERE course_id = ?",
                (course_id,),
            ).fetchone()[0]
        )
    plan = {
        "title": "制作梯度思维导图",
        "summary": "先创建一个概念节点，等待用户确认后再执行。",
        "operations": [
            {
                "type": "create_knowledge_node",
                "notebook_id": notebook_id,
                "temp_id": "gradient",
                "title": "梯度",
                "kind": "concept",
            }
        ],
    }
    gateway.answer = (
        "我先解释这个知识点，并给出待确认的画布计划。\n"
        "```studypilot-plan\n"
        + json.dumps(plan, ensure_ascii=False)
        + "\n```\n"
        + learning_answer()
    )
    thread = service.create_thread(
        course_id, {"provider_id": "openai", "mode": "learning"}
    )

    reply = service.reply(
        thread["id"],
        {"message": "讲解梯度并制作思维导图", "context": {}},
    )

    assert reply["message"]["metadata"]["learning_card"]["concept"] == "梯度"
    assert reply["message"]["action_plan"]["status"] == "pending"
    with database.connect() as connection:
        assert connection.execute(
            "SELECT COUNT(*) FROM knowledge_nodes WHERE notebook_id = ? AND title = '梯度'",
            (notebook_id,),
        ).fetchone()[0] == 0

def test_assistant_thread_keeps_original_response_path(tmp_path) -> None:
    _, service, course_id, gateway = configured_service(tmp_path, "Normal answer")
    thread = service.create_thread(course_id, {"provider_id": "openai"})

    reply = service.reply(thread["id"], {"message": "Explain this", "context": {}})

    assert LEARNING_SYSTEM_PROMPT not in gateway.calls[0][1][0]["content"]
    assert reply["message"]["content"] == "Normal answer"
    assert reply["message"]["metadata"] == {}
    assert reply["thread"]["mode"] == "assistant"


def test_source_location_labels_cover_supported_reader_formats() -> None:
    labels = [
        AgentService._source_location_label({"line_start": 12, "line_end": 18}),
        AgentService._source_location_label({"page": 3}),
        AgentService._source_location_label({"paragraph": 6}),
        AgentService._source_location_label({"sheet": "Sheet1", "range": "A1:F20"}),
        AgentService._source_location_label({"slide": 4}),
        AgentService._source_location_label({"cell": 6, "cell_type": "code"}),
    ]

    assert labels == [
        "第 12–18 行",
        "第 3 页",
        "第 7 段",
        "工作表 Sheet1 · A1:F20",
        "第 4 张幻灯片",
        "第 6 个代码单元",
    ]
