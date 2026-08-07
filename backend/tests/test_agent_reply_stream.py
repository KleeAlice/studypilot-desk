from backend.app.db import Database
from backend.app.services.agent import AgentService


class StreamingGateway:
    def stream(self, provider, messages, *, cancelled=None):
        yield {"type": "start", "provider_id": provider.id, "model": provider.model}
        yield {"type": "delta", "text": "Grounded "}
        yield {"type": "delta", "text": "answer [S1]"}
        yield {"type": "done", "content": "Grounded answer [S1]"}


LEARNING_STREAM_ANSWER = """```studypilot-learning
{
  "concept": "向量",
  "direct_answer": "向量同时表示方向和大小。",
  "explanation": "可以把向量理解成一支有方向且有长度的箭头。",
  "example": {
    "concept": "向量",
    "scenario": "向右走三格，再向上走两格。",
    "analysis": "这段位移同时包含方向和大小。"
  },
  "practice": {
    "concept": "向量",
    "type": "multiple_choice",
    "question": "哪一项同时描述方向和大小？",
    "options": [
      {"id": "A", "text": "时间"},
      {"id": "B", "text": "向量"},
      {"id": "C", "text": "温度"},
      {"id": "D", "text": "面积"}
    ],
    "correct_option": "B",
    "reference_answer": "向量。"
  }
}
```"""


class LearningStreamingGateway:
    def stream(self, provider, messages, *, cancelled=None):
        midpoint = LEARNING_STREAM_ANSWER.index("向量同时")
        yield {"type": "start", "provider_id": provider.id, "model": provider.model}
        yield {"type": "delta", "text": LEARNING_STREAM_ANSWER[:midpoint]}
        yield {"type": "delta", "text": LEARNING_STREAM_ANSWER[midpoint:]}
        yield {"type": "done", "content": LEARNING_STREAM_ANSWER}


def test_agent_reply_events_stream_and_persist_the_same_assistant_draft(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()
    with database.connect() as connection:
        course_id = int(connection.execute("SELECT MIN(id) FROM courses").fetchone()[0])
    service = AgentService(database, gateway=StreamingGateway())
    service.configure_provider(
        "openai",
        {
            "label": "OpenAI",
            "protocol": "openai_compatible",
            "base_url": "https://provider.test/v1",
            "model": "stream-model",
            "api_key": "write-only-secret",
        },
    )
    thread = service.create_thread(course_id, {"provider_id": "openai"})

    events = list(
        service.reply_events(
            thread["id"],
            {
                "message": "Explain the source",
                "context": {"include_library": True},
            },
        )
    )

    assert [event["type"] for event in events] == [
        "start",
        "delta",
        "delta",
        "done",
        "final",
    ]
    assert events[-1]["data"]["message"]["content"] == "Grounded answer [S1]"
    with database.connect() as connection:
        assistant = connection.execute(
            """SELECT content, status, stream_id, draft_updated_at
               FROM agent_messages WHERE thread_id = ? AND role = 'assistant'""",
            (thread["id"],),
        ).fetchone()
    assert assistant["content"] == "Grounded answer [S1]"
    assert assistant["status"] == "complete"
    assert assistant["stream_id"]
    assert assistant["draft_updated_at"]
    assert "write-only-secret" not in repr(events)


def test_learning_reply_forwards_provider_deltas_before_the_final_card(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()
    with database.connect() as connection:
        course_id = int(connection.execute("SELECT MIN(id) FROM courses").fetchone()[0])
    service = AgentService(database, gateway=LearningStreamingGateway())
    service.configure_provider(
        "openai",
        {
            "label": "OpenAI",
            "protocol": "openai_compatible",
            "base_url": "https://provider.test/v1",
            "model": "stream-model",
            "api_key": "write-only-secret",
        },
    )
    thread = service.create_thread(
        course_id,
        {"provider_id": "openai", "mode": "learning"},
    )

    events = list(
        service.reply_events(
            thread["id"],
            {"message": "请讲解向量", "context": {"source_free": True}},
        )
    )

    deltas = [event["text"] for event in events if event["type"] == "delta"]
    split = LEARNING_STREAM_ANSWER.index("向量同时")
    assert deltas == [
        LEARNING_STREAM_ANSWER[:split],
        LEARNING_STREAM_ANSWER[split:],
    ]
    first_delta = next(index for index, event in enumerate(events) if event["type"] == "delta")
    final = next(index for index, event in enumerate(events) if event["type"] == "final")
    assert first_delta < final
