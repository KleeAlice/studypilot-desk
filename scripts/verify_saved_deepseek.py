from __future__ import annotations

import json
import os
import sqlite3
import time
from pathlib import Path

from backend.app.services.agent_providers import ProviderConfig, ProviderGateway


database_path = Path(__file__).resolve().parents[1] / "data" / "app.db"
with sqlite3.connect(database_path) as connection:
    connection.row_factory = sqlite3.Row
    row = connection.execute(
        "SELECT id, protocol, base_url, model, api_key, max_output_tokens, enabled FROM agent_providers WHERE id = 'deepseek'"
    ).fetchone()

if row is None or not row["enabled"] or not row["api_key"]:
    raise SystemExit("saved DeepSeek provider is not configured")

provider = ProviderConfig(
    row["id"],
    row["protocol"],
    row["base_url"],
    row["model"],
    row["api_key"],
    min(row["max_output_tokens"], int(os.environ.get("STUDYPILOT_VERIFY_MAX_TOKENS", row["max_output_tokens"]))),
)
messages = [
    {
        "role": "system",
        "content": "请用中文给出充分展开、结构清楚的回答，先给结论，再给依据和行动建议。",
    },
    {
        "role": "user",
        "content": "请用约300到500字解释：为什么学习资料的双栏对照阅读有助于形成知识图谱？",
    },
]
started = time.perf_counter()
answer = ProviderGateway().complete(provider, messages)
elapsed = time.perf_counter() - started
print(json.dumps({
    "provider": row["id"],
    "model": row["model"],
    "requested_max_tokens": provider.max_output_tokens,
    "elapsed_seconds": round(elapsed, 2),
    "answer_characters": len(answer),
    "answer_lines": len(answer.splitlines()),
    "substantive": len(answer) >= 260,
}, ensure_ascii=False))
