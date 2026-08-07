from __future__ import annotations

import json
import sqlite3
import tempfile
import time
from pathlib import Path

from backend.app.db import Database
from backend.app.services.agent import AgentService
from backend.app.services.learning_mode import learning_card_matches_topic


project_root = Path(__file__).resolve().parents[1]
source_database = project_root / "data" / "app.db"
topic = "线性代数"

with tempfile.TemporaryDirectory(
    prefix="studypilot-learning-verify-",
    ignore_cleanup_errors=True,
) as directory:
    temporary_database = Path(directory) / "app.db"
    with sqlite3.connect(source_database) as source:
        with sqlite3.connect(temporary_database) as target:
            source.backup(target)

    database = Database(temporary_database)
    database.initialize()
    service = AgentService(database)
    with database.connect() as connection:
        course_id = int(
            connection.execute("SELECT MIN(id) FROM courses").fetchone()[0]
        )
        provider = connection.execute(
            """SELECT id, model, enabled, api_key
               FROM agent_providers WHERE id = 'deepseek'"""
        ).fetchone()
    if provider is None or not provider["enabled"] or not provider["api_key"]:
        raise SystemExit("saved DeepSeek provider is not configured")

    thread = service.create_thread(
        course_id,
        {
            "provider_id": "deepseek",
            "model": provider["model"],
            "mode": "learning",
        },
    )
    started = time.perf_counter()
    result = service.reply(
        thread["id"],
        {
            "message": (
                f"我想从零系统学习“{topic}”。"
                "请先规划完整学习路径，然后只讲第一个知识点。"
            ),
            "context": {"source_free": True},
            "explanation_length": "short",
        },
    )
    elapsed = time.perf_counter() - started
    message = result["message"]
    card = message["metadata"].get("learning_card")
    trace = message["metadata"].get("generation_trace")

    assert message["status"] == "complete"
    assert message["content"]
    assert learning_card_matches_topic(card, topic, require_path=True)
    assert trace and trace["outcome"] in {"valid", "repaired"}
    assert card["practice"]["type"] == "multiple_choice"
    print(
        json.dumps(
            {
                "provider": provider["id"],
                "model": provider["model"],
                "topic": topic,
                "generated_subject": card["learning_path"]["subject"],
                "concept": card["concept"],
                "practice_type": card["practice"]["type"],
                "generation_outcome": trace["outcome"],
                "content_characters": len(message["content"]),
                "elapsed_seconds": round(elapsed, 2),
            },
            ensure_ascii=False,
        )
    )
