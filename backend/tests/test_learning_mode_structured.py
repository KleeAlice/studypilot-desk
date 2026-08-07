from backend.app.db import Database
import json

from backend.app.services.agent import AgentService
from backend.app.services.learning_mode import LEARNING_SYSTEM_PROMPT, parse_learning_response


STRUCTURED_ANSWER = """```studypilot-learning
{
  "concept": "人工卡片",
  "direct_answer": "人工卡片把无法自动处理的问题和证据交给人做最终裁决。",
  "explanation": "它的核心不是继续自动化，而是把机器已经排查出的原因、证据和候选答案整理成可判断的上下文。",
  "example": {
    "concept": "人工卡片",
    "scenario": "账务系统发现余额差异但无法判断责任归属。",
    "analysis": "系统生成一张人工卡片，列出差异、已排除原因和相关凭证，由审核员作出裁决。"
  },
  "practice": {
    "concept": "人工卡片",
    "type": "multiple_choice",
    "question": "人工卡片的最终裁决由谁完成？",
    "options": [
      {"id": "A", "text": "模型"},
      {"id": "B", "text": "人工审核员"},
      {"id": "C", "text": "数据库"},
      {"id": "D", "text": "定时任务"}
    ],
    "correct_option": "B",
    "reference_answer": "因为它把最终判断明确交给人，系统只负责整理问题、证据和候选答案。"
  }
}
```"""


def test_structured_learning_card_contains_answer_and_aligned_practice() -> None:
    visible, card = parse_learning_response(STRUCTURED_ANSWER)

    assert visible == ""
    assert card == {
        "concept": "人工卡片",
        "direct_answer": "人工卡片把无法自动处理的问题和证据交给人做最终裁决。",
        "explanation": "它的核心不是继续自动化，而是把机器已经排查出的原因、证据和候选答案整理成可判断的上下文。",
        "example": {
            "concept": "人工卡片",
            "scenario": "账务系统发现余额差异但无法判断责任归属。",
            "analysis": "系统生成一张人工卡片，列出差异、已排除原因和相关凭证，由审核员作出裁决。",
        },
        "practice": {
            "concept": "人工卡片",
            "type": "multiple_choice",
            "question": "人工卡片的最终裁决由谁完成？",
            "options": [
                {"id": "A", "text": "模型"},
                {"id": "B", "text": "人工审核员"},
                {"id": "C", "text": "数据库"},
                {"id": "D", "text": "定时任务"},
            ],
            "correct_option": "B",
            "reference_answer": "因为它把最终判断明确交给人，系统只负责整理问题、证据和候选答案。",
        },
    }
    assert "terms" not in card


def test_structured_learning_card_rejects_mismatched_example_or_practice() -> None:
    mismatched = STRUCTURED_ANSWER.replace(
        '"practice": {\n    "concept": "人工卡片",',
        '"practice": {\n    "concept": "推荐不代签",',
    )

    _, card = parse_learning_response(mismatched)

    assert card is None


def test_structured_learning_card_accepts_only_surplus_root_closers() -> None:
    provider_answer = STRUCTURED_ANSWER.replace("\n```", "}\n```")

    visible, card = parse_learning_response(provider_answer)

    assert visible == ""
    assert card is not None
    assert card["concept"] == "人工卡片"
    assert card["practice"]["correct_option"] == "B"


def test_structured_learning_card_still_rejects_trailing_non_protocol_text() -> None:
    provider_answer = STRUCTURED_ANSWER.replace("\n```", "} explanation\n```")

    visible, card = parse_learning_response(provider_answer)

    assert visible == ""
    assert card is None
def test_structured_learning_card_recovers_practice_nested_under_example() -> None:
    payload_text = STRUCTURED_ANSWER.split("\n", 1)[1].rsplit("\n```", 1)[0]
    payload = json.loads(payload_text)
    payload["example"]["practice"] = payload.pop("practice")
    provider_answer = (
        "_mode=lesson. I will now return the protocol.\n"
        "```studypilot-learning\n"
        + json.dumps(payload, ensure_ascii=False)
        + "\n```"
    )

    visible, card = parse_learning_response(provider_answer)

    assert visible == "_mode=lesson. I will now return the protocol."
    assert card is not None
    assert card["practice"]["correct_option"] == "B"
    assert "practice" not in card["example"]



def test_learning_prompt_requires_model_answer_fields_and_forbids_vocabulary() -> None:
    assert '"direct_answer"' in LEARNING_SYSTEM_PROMPT
    assert '"reference_answer"' in LEARNING_SYSTEM_PROMPT
    assert "不得提取、推荐或展示生词" in LEARNING_SYSTEM_PROMPT
    assert '"terms"' not in LEARNING_SYSTEM_PROMPT


class RecordingGateway:
    def __init__(self) -> None:
        self.prompts: list[str] = []

    def complete(self, provider, messages):
        self.prompts.append(messages[0]["content"])
        return STRUCTURED_ANSWER


def _configured_service(tmp_path) -> tuple[AgentService, int, RecordingGateway]:
    database = Database(tmp_path / "app.db")
    database.initialize()
    with database.connect() as connection:
        course_id = int(connection.execute("SELECT MIN(id) FROM courses").fetchone()[0])
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


def test_learning_request_adds_selected_explanation_length_to_model_prompt(tmp_path) -> None:
    service, course_id, gateway = _configured_service(tmp_path)
    thread = service.create_thread(course_id, {"provider_id": "openai", "mode": "learning"})

    for length in ("short", "medium", "long", "unlimited"):
        service.reply(
            thread["id"],
            {
                "message": f"请用 {length} 档讲解",
                "explanation_length": length,
                "context": {},
            },
        )

    assert "一个紧凑段落" in gateway.prompts[0]
    assert "400–500 个中文字符" in gateway.prompts[1]
    assert "1,500–2,200 个中文字符" in gateway.prompts[2]

    assert "不设预设篇幅上限" in gateway.prompts[3]

def test_learning_protocol_accepts_model_routed_conversation_without_a_quiz() -> None:
    answer = """```studypilot-learning
{
  "response_mode": "conversation",
  "thread_title": "资料阅读顺序",
  "direct_answer": "建议先按基础、流程、应用、决策的顺序阅读这 20 份资料。"
}
```"""

    visible, payload = parse_learning_response(answer)

    assert visible == ""
    assert payload == {
        "response_mode": "conversation",
        "thread_title": "资料阅读顺序",
        "direct_answer": "建议先按基础、流程、应用、决策的顺序阅读这 20 份资料。",
    }
    assert '"response_mode":"conversation"' in LEARNING_SYSTEM_PROMPT
