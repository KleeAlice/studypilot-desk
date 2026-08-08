from __future__ import annotations

from backend.app.db import Database
from backend.app.services import learning_mode
from backend.app.services.agent import AgentService


AUTONOMOUS_ANSWER = """```studypilot-learning
{
  "thread_title": "线性代数零基础路线",
  "learning_path": {
    "subject": "线性代数",
    "goal": "从向量直觉走到矩阵变换与特征值",
    "stages": [
      {
        "title": "向量与空间",
        "objective": "建立方向、长度和线性组合的直觉",
        "concepts": ["向量", "线性组合", "张成空间"]
      },
      {
        "title": "矩阵与变换",
        "objective": "理解矩阵如何表示线性变换",
        "concepts": ["矩阵乘法", "线性变换", "逆矩阵"]
      }
    ]
  },
  "concept": "向量",
  "direct_answer": "向量同时表达方向和大小。",
  "explanation": "把向量想成一支带长度的箭头；箭头朝向表示方向，箭头长度表示大小。",
  "example": {
    "concept": "向量",
    "scenario": "从原点向右走三格、向上走两格。",
    "analysis": "这段位移可以由一个方向和一个大小共同描述，因此可以写成向量。"
  },
  "practice": {
    "concept": "向量",
    "type": "multiple_choice",
    "question": "下面哪一项同时描述了方向和大小？",
    "options": [
      {"id": "A", "text": "温度"},
      {"id": "B", "text": "向量"},
      {"id": "C", "text": "面积"},
      {"id": "D", "text": "时间"}
    ],
    "correct_option": "B",
    "reference_answer": "B。向量同时包含方向和大小。"
  }
}
```"""


def test_autonomous_card_keeps_model_title_path_and_multiple_choice() -> None:
    visible, card = learning_mode.parse_learning_response(AUTONOMOUS_ANSWER)

    assert visible == ""
    assert card is not None
    assert card["thread_title"] == "线性代数零基础路线"
    assert card["learning_path"]["subject"] == "线性代数"
    assert card["learning_path"]["stages"][1]["concepts"] == [
        "矩阵乘法",
        "线性变换",
        "逆矩阵",
    ]
    assert card["practice"]["type"] == "multiple_choice"
    assert [item["id"] for item in card["practice"]["options"]] == [
        "A",
        "B",
        "C",
        "D",
    ]
    assert card["practice"]["correct_option"] == "B"


def test_multiple_choice_card_rejects_missing_or_duplicate_options() -> None:
    invalid = AUTONOMOUS_ANSWER.replace(
        '{"id": "D", "text": "时间"}',
        '{"id": "B", "text": "另一个重复选项"}',
    )

    _, card = learning_mode.parse_learning_response(invalid)

    assert card is None


def test_question_scheduler_uses_four_choices_then_one_open_question() -> None:
    scheduler = getattr(
        learning_mode,
        "practice_type_for_lesson",
        lambda _lesson_number: "missing",
    )

    assert [scheduler(index) for index in range(1, 11)] == [
        "multiple_choice",
        "multiple_choice",
        "multiple_choice",
        "multiple_choice",
        "open",
        "multiple_choice",
        "multiple_choice",
        "multiple_choice",
        "multiple_choice",
        "open",
    ]


def test_learning_state_persists_path_and_completed_concepts() -> None:
    _, card = learning_mode.parse_learning_response(AUTONOMOUS_ANSWER)

    state = learning_mode.next_learning_state({}, card, None)

    assert state["learning_path"]["subject"] == "线性代数"
    assert state["completed_concepts"] == ["向量"]


class RecordingGateway:
    def __init__(self) -> None:
        self.calls: list[list[dict]] = []

    def complete(self, provider, messages):
        self.calls.append(messages)
        return AUTONOMOUS_ANSWER


def configured_service(tmp_path) -> tuple[AgentService, int, RecordingGateway]:
    database = Database(tmp_path / "app.db")
    database.initialize()
    with database.connect() as connection:
        course_id = int(
            connection.execute("SELECT MIN(id) FROM courses").fetchone()[0]
        )
    gateway = RecordingGateway()
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
    return service, course_id, gateway


def test_source_free_learning_prioritizes_explicit_topic_over_course_path_and_sanitizes_scope(tmp_path) -> None:
    service, course_id, gateway = configured_service(tmp_path)
    captured_context: dict = {}

    def record_context(_course_id: int, _question: str, context: dict):
        captured_context.update(context)
        return []

    service._build_context = record_context  # type: ignore[method-assign]
    thread = service.create_thread(
        course_id,
        {"provider_id": "openai", "mode": "learning"},
    )

    reply = service.reply(
        thread["id"],
        {
            "message": "线性代数",
            "context": {
                "source_free": True,
                "learning_topic": "线性代数",
                "learning_goal": "理解向量与矩阵",
                "include_library": True,
                "include_notes": True,
                "include_knowledge": True,
                "selected_document_ids": [99],
            },
        },
    )

    assert captured_context["source_free"] is True
    assert captured_context["include_library"] is False
    assert captured_context["include_notes"] is False
    assert captured_context["include_knowledge"] is False
    assert captured_context["selected_document_ids"] == []
    assert "无参考资料自主学习" in gateway.calls[0][0]["content"]
    assert "本轮题型=multiple_choice" in gateway.calls[0][0]["content"]
    assert "自主学习主题=线性代数" in gateway.calls[0][0]["content"]
    assert "理解向量与矩阵" in gateway.calls[0][0]["content"]
    assert reply["thread"]["title"] == "线性代数零基础路线"
    assert "learning_path" not in reply["thread"]["learning_state"]
    assert reply["thread"]["learning_state"]["autonomous_topic"] == "线性代数"
    assert reply["thread"]["learning_state"]["autonomous_goal"] == "理解向量与矩阵"
    assert "learning_path" not in reply["message"]["metadata"]["learning_card"]


def test_source_free_learning_does_not_invent_a_route_when_course_has_none(tmp_path) -> None:
    service, course_id, gateway = configured_service(tmp_path)
    with service.database.connect() as connection:
        connection.execute("DELETE FROM weeks WHERE course_id = ?", (course_id,))
        connection.execute("DELETE FROM phases WHERE course_id = ?", (course_id,))
    thread = service.create_thread(
        course_id,
        {"provider_id": "openai", "mode": "learning"},
    )

    reply = service.reply(
        thread["id"],
        {"message": "线性代数", "context": {"source_free": True}},
    )

    system_prompt = gateway.calls[0][0]["content"]
    assert "自主学习主题=线性代数" in system_prompt
    assert "不沿用当前课程的既有路线" in system_prompt
    assert "完整课程路线仍只能由用户点击“生成学习计划”建立" in system_prompt
    assert "learning_path" not in reply["message"]["metadata"]["learning_card"]
    assert "learning_path" not in reply["thread"]["learning_state"]


def test_structured_learning_card_is_replayed_to_model_on_next_turn(tmp_path) -> None:
    service, course_id, gateway = configured_service(tmp_path)
    thread = service.create_thread(
        course_id,
        {"provider_id": "openai", "mode": "learning"},
    )
    service.reply(
        thread["id"],
        {"message": "线性代数", "context": {"source_free": True}},
    )

    second_reply = service.reply(
        thread["id"],
        {"message": "我的答案是 B", "context": {"source_free": True}},
    )

    assistant_history = [
        item["content"]
        for item in gateway.calls[1]
        if item["role"] == "assistant"
    ]
    assert any("线性代数零基础路线" in content for content in assistant_history)
    assert any('"concept": "向量"' in content for content in assistant_history)
    saved = service.get_thread(thread["id"])
    cards = [
        message["metadata"]["learning_card"]
        for message in saved["messages"]
        if message["role"] == "assistant" and message["metadata"].get("learning_card")
    ]
    assert cards
    assert all("learning_path" not in card for card in cards)
    assert "learning_path_source" not in second_reply["thread"]["learning_state"]
    assert second_reply["thread"]["learning_state"]["autonomous_topic"] == "线性代数"
