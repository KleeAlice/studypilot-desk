from __future__ import annotations

import base64
import json
from dataclasses import replace
import queue
import re
import threading
import uuid
from typing import Any, Callable, Iterator

from ..db import Database
from ..errors import AppError
from ..repository import Repository, as_dict
from .agent_actions import AgentActionService, parse_action_plan_response
from .agent_providers import ProviderConfig, ProviderGateway
from .learning_mode import (
    learning_card_matches_topic,
    learning_repair_prompt,
    learning_response_is_lesson_draft,
    learning_system_prompt,
    next_learning_state,
    normalize_explanation_length,
    parse_learning_response,
    practice_type_for_lesson,
    requested_learning_topic,
)
from .rag import RetrievalScope, RetrievalService

from .roadmap_mode import (
    parse_roadmap_response,
    roadmap_repair_prompt,
    roadmap_system_prompt,
)

PROVIDER_PRESETS: dict[str, dict[str, str]] = {
    "openai": {
        "label": "OpenAI",
        "protocol": "openai_compatible",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-5.6-terra",
    },
    "anthropic": {
        "label": "Anthropic Claude",
        "protocol": "anthropic",
        "base_url": "https://api.anthropic.com",
        "model": "claude-sonnet-4-5",
    },
    "gemini": {
        "label": "Google Gemini",
        "protocol": "gemini",
        "base_url": "https://generativelanguage.googleapis.com/v1beta",
        "model": "gemini-2.5-flash",
    },
    "azure": {
        "label": "Azure OpenAI",
        "protocol": "azure_openai",
        "base_url": "https://YOUR-RESOURCE.openai.azure.com/openai/v1",
        "model": "gpt-5.6-terra",
    },
    "deepseek": {
        "label": "DeepSeek",
        "protocol": "openai_compatible",
        "base_url": "https://api.deepseek.com/v1",
        "model": "deepseek-chat",
    },
    "qwen": {
        "label": "通义千问 / DashScope",
        "protocol": "openai_compatible",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "model": "qwen-plus",
    },
    "kimi": {
        "label": "Kimi / Moonshot",
        "protocol": "openai_compatible",
        "base_url": "https://api.moonshot.cn/v1",
        "model": "moonshot-v1-8k",
    },
    "glm": {
        "label": "智谱 GLM",
        "protocol": "openai_compatible",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "model": "glm-4.5",
    },
    "openrouter": {
        "label": "OpenRouter",
        "protocol": "openai_compatible",
        "base_url": "https://openrouter.ai/api/v1",
        "model": "openai/gpt-5.6-terra",
    },
    "siliconflow": {
        "label": "SiliconFlow",
        "protocol": "openai_compatible",
        "base_url": "https://api.siliconflow.cn/v1",
        "model": "deepseek-ai/DeepSeek-V3.2",
    },
    "ollama": {
        "label": "Ollama（本地）",
        "protocol": "openai_compatible",
        "base_url": "http://127.0.0.1:11434/v1",
        "model": "qwen3:8b",
    },
    "lmstudio": {
        "label": "LM Studio（本地）",
        "protocol": "openai_compatible",
        "base_url": "http://127.0.0.1:1234/v1",
        "model": "local-model",
    },
    "custom": {
        "label": "自定义 OpenAI-compatible",
        "protocol": "openai_compatible",
        "base_url": "http://127.0.0.1:8000/v1",
        "model": "custom-model",
    },
}


def normalize_provider_base_url(protocol: str, base_url: str) -> str:
    base = base_url.strip().rstrip("/")
    return base


SYSTEM_PROMPT = """你是 StudyPilot 学习助手。请用中文直接回答用户问题。
当提供 StudyPilot 来源时，优先依据来源回答，并使用 [S1]、[S2] 标注事实依据。
不要声称读取了未提供的资料；如果来源不足，请明确说明哪些部分是一般知识。
除非用户明确要求简短，否则给出充分展开、结构清楚的回答：先给结论，再解释依据、关键细节、资料间的异同与可执行的下一步。复杂问题通常使用小标题和要点，不要只回复一两句话。
你只能提供解释、比较、总结和学习建议，不能声称已经删除或修改用户资料。"""


ACTION_PLAN_PROMPT = """普通问答默认充分展开：先给结论，再说明依据、关键细节、资料间的关系和可执行的下一步；除非用户明确要求简短，不要只回答一两句话，也不要用重复内容凑长度。

当用户要求修改 Markdown、制作或调整知识画布/思维导图时，必须先生成操作计划，用户确认前绝不能声称已经修改。回复正文后只能附带一个 ```studypilot-plan JSON 代码块，格式为：
{"title":"计划标题","summary":"影响范围","operations":[...]}
允许的 type 只有 replace_document_block、create_knowledge_node、update_knowledge_node、delete_knowledge_node、create_knowledge_edge、delete_knowledge_edge。只能使用当前来源中真实存在的 document_id、block_key、notebook_id、node_id、edge_id；新节点用 temp_id，并可在连线的 source_ref/target_ref 中引用。Markdown 修改必须给 expected_text 和 new_text。不要输出 SQL、路径、URL、shell 命令或其他操作类型。"""


LEARNING_GENERATION_FIELDS = (
    "thread_title",
    "concept",
    "direct_answer",
    "explanation",
    "example",
    "practice",
)


def _learning_progress_event(
    phase: str,
    label: str,
    completed_fields: int = 0,
) -> dict[str, Any]:
    fields = []
    for index, key in enumerate(LEARNING_GENERATION_FIELDS):
        if index < completed_fields:
            status = "ready"
        elif index == completed_fields and completed_fields < len(LEARNING_GENERATION_FIELDS):
            status = "generating"
        else:
            status = "pending"
        fields.append({"key": key, "status": status})
    return {
        "type": "learning_progress",
        "phase": phase,
        "label": label,
        "schema": "studypilot-learning/v1",
        "fields": fields,
    }


class AgentService:
    def __init__(
        self, database: Database, gateway: ProviderGateway | Any | None = None
    ) -> None:
        self.database = database
        self.gateway = gateway or ProviderGateway()
        self.actions = AgentActionService(database)
        self.retrieval = RetrievalService(database)
        self._ensure_provider_presets()
        self._recover_blank_learning_messages()

    def _ensure_provider_presets(self) -> None:
        with self.database.connect() as connection:
            connection.executemany(
                """INSERT INTO agent_providers(id, label, icon, protocol, base_url, model)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO NOTHING""",
                [
                    (
                        provider_id,
                        values["label"],
                        provider_id,
                        values["protocol"],
                        values["base_url"],
                        values["model"],
                    )
                    for provider_id, values in PROVIDER_PRESETS.items()
                ],
            )

    def _recover_blank_learning_messages(self) -> None:
        """Turn legacy blank successes into an actionable visible failure."""
        with self.database.connect() as connection:
            connection.execute(
                """UPDATE agent_messages
                   SET status = 'error',
                       error = '上次学习内容未能完整生成，请重新发送问题。',
                       draft_updated_at = CURRENT_TIMESTAMP
                   WHERE role = 'assistant'
                     AND status = 'complete'
                     AND TRIM(COALESCE(content, '')) = ''
                     AND COALESCE(metadata_json, '{}') NOT LIKE '%"learning_card"%'
                     AND EXISTS (
                         SELECT 1 FROM agent_threads
                         WHERE agent_threads.id = agent_messages.thread_id
                           AND agent_threads.mode = 'learning'
                     )"""
            )

    def list_providers(self) -> list[dict]:
        with self.database.connect() as connection:
            rows = connection.execute(
                """SELECT * FROM agent_providers
                WHERE deleted_at IS NULL
                ORDER BY CASE id
                    WHEN 'openai' THEN 0 WHEN 'deepseek' THEN 1
                    WHEN 'anthropic' THEN 2 WHEN 'gemini' THEN 3
                    WHEN 'qwen' THEN 4 WHEN 'kimi' THEN 5
                    WHEN 'glm' THEN 6 WHEN 'openrouter' THEN 7
                    WHEN 'siliconflow' THEN 8 WHEN 'azure' THEN 9
                    WHEN 'ollama' THEN 10 WHEN 'lmstudio' THEN 11 ELSE 12 END, id"""
            ).fetchall()
        return [
            self._serialize_provider(row)
            for row in rows
            if not self._is_untouched_provider_preset(row)
        ]

    @staticmethod
    def _is_untouched_provider_preset(row) -> bool:
        preset = PROVIDER_PRESETS.get(str(row["id"]))
        if preset is None or str(row["api_key"] or "").strip():
            return False
        if str(row["created_at"] or "") != str(row["updated_at"] or ""):
            return False
        return all(
            str(row[key] or "") == str(preset[key])
            for key in ("label", "protocol", "base_url", "model")
        )

    def configure_provider(self, provider_id: str, values: dict) -> dict:
        provider_id = provider_id.strip().lower()
        if not re.fullmatch(r"[a-z0-9_-]{1,40}", provider_id):
            raise AppError("AGENT_PROVIDER_INVALID", "模型提供商标识不正确", 422)
        protocol = values.get("protocol", "openai_compatible")
        if protocol not in {
            "openai_compatible",
            "anthropic",
            "gemini",
            "azure_openai",
        }:
            raise AppError("AGENT_PROVIDER_INVALID", "模型协议不受支持", 422)
        current = self._provider_row(
            provider_id, required=False, include_deleted=True
        )
        api_key = values.get("api_key")
        if (api_key is None or not str(api_key).strip()) and current is not None:
            api_key = current["api_key"]
        base_url = normalize_provider_base_url(
            protocol,
            str(values.get("base_url") or (current["base_url"] if current else "")),
        )
        previous_model = str(current["model"] or "") if current is not None else ""
        model = str(
            values.get("model") or (current["model"] if current else "")
        )
        icon = str(
            values.get("icon")
            or (current["icon"] if current is not None else "")
            or (provider_id if provider_id in PROVIDER_PRESETS else "custom")
        ).strip()[:40] or "custom"
        max_output_tokens = int(
            values.get(
                "max_output_tokens",
                current["max_output_tokens"] if current is not None else 32000,
            )
        )
        connect_timeout_seconds = float(
            values.get(
                "connect_timeout_seconds",
                current["connect_timeout_seconds"] if current is not None else 10,
            )
        )
        first_byte_timeout_seconds = float(
            values.get(
                "first_byte_timeout_seconds",
                current["first_byte_timeout_seconds"] if current is not None else 90,
            )
        )
        idle_timeout_seconds = float(
            values.get(
                "idle_timeout_seconds",
                current["idle_timeout_seconds"] if current is not None else 45,
            )
        )
        with self.database.connect() as connection:
            connection.execute(
                """INSERT INTO agent_providers(
                    id, label, icon, protocol, base_url, model, api_key, max_output_tokens,
                    connect_timeout_seconds, first_byte_timeout_seconds,
                    idle_timeout_seconds, enabled
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    label=excluded.label, icon=excluded.icon,
                    protocol=excluded.protocol,
                    base_url=excluded.base_url, model=excluded.model,
                    api_key=excluded.api_key,
                    max_output_tokens=excluded.max_output_tokens,
                    connect_timeout_seconds=excluded.connect_timeout_seconds,
                    first_byte_timeout_seconds=excluded.first_byte_timeout_seconds,
                    idle_timeout_seconds=excluded.idle_timeout_seconds,
                    enabled=excluded.enabled,
                    deleted_at=NULL,
                    updated_at=CURRENT_TIMESTAMP""",
                (
                    provider_id,
                    str(values.get("label") or (current["label"] if current else provider_id)),
                    icon,
                    protocol,
                    base_url,
                    model,
                    str(api_key or ""),
                    max_output_tokens,
                    connect_timeout_seconds,
                    first_byte_timeout_seconds,
                    idle_timeout_seconds,
                    1 if values.get("enabled", True) else 0,
                ),
            )
            if previous_model and previous_model != model:
                connection.execute(
                    """UPDATE agent_threads
                    SET model = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE provider_id = ? AND model = ?""",
                    (model, provider_id, previous_model),
                )
        return self._serialize_provider(self._provider_row(provider_id))

    def delete_provider(self, provider_id: str) -> None:
        provider_id = provider_id.strip().lower()
        with self.database.connect() as connection:
            result = connection.execute(
                """UPDATE agent_providers
                SET deleted_at = CURRENT_TIMESTAMP, enabled = 0,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND deleted_at IS NULL""",
                (provider_id,),
            )
        if result.rowcount == 0:
            raise AppError(
                "AGENT_PROVIDER_NOT_FOUND",
                "模型提供商不存在或已删除",
                404,
            )

    def test_provider(self, provider_id: str) -> dict:
        provider = self._provider(provider_id)
        messages = [
            {"role": "system", "content": "You are a connection test."},
            {"role": "user", "content": "Reply with OK."},
        ]
        stream = getattr(self.gateway, "stream", None)
        if callable(stream):
            deltas: list[str] = []
            answer = ""
            for event in stream(provider, messages):
                if event.get("type") == "delta":
                    deltas.append(str(event.get("text") or ""))
                elif event.get("type") == "done":
                    answer = str(event.get("content") or "")
            answer = answer or "".join(deltas)
        else:
            answer = self.gateway.complete(provider, messages)
        return {"ok": True, "reply": answer[:200], "provider_id": provider_id}

    def diagnose_provider(self, provider_id: str) -> dict[str, Any]:
        provider = self._provider(provider_id)
        diagnose = getattr(self.gateway, "diagnose", None)
        if not callable(diagnose):
            return self.test_provider(provider_id)
        return diagnose(provider)

    def create_thread(self, course_id: int, values: dict) -> dict:
        self._require_course(course_id)
        provider_id = str(values.get("provider_id") or "openai")
        provider = self._provider_row(provider_id)
        mode = str(values.get("mode") or "assistant")
        if mode not in {"assistant", "learning"}:
            raise AppError("AGENT_THREAD_MODE_INVALID", "不支持的对话模式", 422)
        requested_title = str(values.get("title") or "").strip()
        if mode == "learning" and requested_title in {"", "新对话", "New conversation"}:
            requested_title = "新学习对话"
        title = (requested_title or "新对话")[:120]
        model = str(provider["model"] or "")
        with self.database.connect() as connection:
            thread_id = connection.execute(
                """INSERT INTO agent_threads(
                    course_id, title, provider_id, model, mode, learning_state_json
                ) VALUES (?, ?, ?, ?, ?, '{}')""",
                (course_id, title, provider_id, model, mode),
            ).lastrowid
        return self.get_thread(int(thread_id), include_messages=False)
    def list_threads(self, course_id: int) -> list[dict]:
        self._require_course(course_id)
        with self.database.connect() as connection:
            rows = connection.execute(
                """SELECT agent_threads.*,
                    (SELECT COUNT(*) FROM agent_messages
                     WHERE agent_messages.thread_id = agent_threads.id) AS message_count
                FROM agent_threads WHERE course_id = ?
                ORDER BY pinned DESC, updated_at DESC, id DESC""",
                (course_id,),
            ).fetchall()
        return [self._serialize_thread(row) for row in rows]

    def get_thread(self, thread_id: int, include_messages: bool = True) -> dict:
        row = self._thread_row(thread_id)
        thread = self._serialize_thread(row)
        if include_messages:
            with self.database.connect() as connection:
                messages = connection.execute(
                    "SELECT * FROM agent_messages WHERE thread_id = ? ORDER BY id",
                    (thread_id,),
                ).fetchall()
            thread["messages"] = [self._serialize_message(item) for item in messages]
        return thread

    def update_thread(self, thread_id: int, values: dict) -> dict:
        current = self._thread_row(thread_id)
        title = str(values.get("title", current["title"])).strip()[:120]
        if not title:
            raise AppError("AGENT_THREAD_INVALID", "对话标题不能为空", 422)
        provider_id = str(values.get("provider_id", current["provider_id"]))
        provider = self._provider_row(provider_id)
        pinned = bool(values.get("pinned", current["pinned"]))
        model = str(provider["model"] or "")
        mode = str(values.get("mode", current["mode"] or "assistant"))
        if mode not in {"assistant", "learning"}:
            raise AppError("AGENT_THREAD_MODE_INVALID", "不支持的对话模式", 422)
        with self.database.connect() as connection:
            connection.execute(
                """UPDATE agent_threads SET title = ?, provider_id = ?, model = ?, mode = ?, pinned = ?,
                updated_at = CURRENT_TIMESTAMP WHERE id = ?""",
                (title, provider_id, model, mode, int(pinned), thread_id),
            )
        return self.get_thread(thread_id, include_messages=False)

    def generate_thread_title(self, thread_id: int) -> dict:
        """Use the thread's selected model to replace the first-question fallback title."""
        thread = self.get_thread(thread_id)
        user_messages = [
            str(message.get("content") or "").strip()
            for message in thread.get("messages", [])
            if message.get("role") == "user" and str(message.get("content") or "").strip()
        ]
        assistant_messages = [
            str(message.get("content") or "").strip()
            for message in thread.get("messages", [])
            if message.get("role") == "assistant" and str(message.get("content") or "").strip()
        ]
        if not user_messages:
            return self.get_thread(thread_id, include_messages=False)

        provider = replace(
            self._provider(str(thread.get("provider_id") or "openai")),
            max_output_tokens=1024,
        )
        prompt = [
            {
                "role": "system",
                "content": (
                    "你负责给学习助手的历史对话命名。根据用户首问和助手首答生成一个准确、自然、便于检索的中文短标题。"
                    "只输出标题本身，不要引号、书名号、Markdown、前缀或解释；建议 6 到 18 个汉字，最多 30 个字符。"
                ),
            },
            {
                "role": "user",
                "content": (
                    f"用户首问：\n{user_messages[0][:2000]}\n\n"
                    f"助手首答：\n{(assistant_messages[0] if assistant_messages else '')[:3000]}"
                ),
            },
        ]
        stream = getattr(self.gateway, "stream", None)
        if callable(stream):
            deltas: list[str] = []
            completed = ""
            for event in stream(provider, prompt):
                if event.get("type") == "delta":
                    deltas.append(str(event.get("text") or ""))
                elif event.get("type") == "done":
                    completed = str(event.get("content") or "")
            raw_title = (completed or "".join(deltas)).strip()
        else:
            raw_title = str(self.gateway.complete(provider, prompt) or "").strip()
        first_line = next((line.strip() for line in raw_title.splitlines() if line.strip()), "")
        cleaned = re.sub(r"^(?:对话)?标题\s*[:：\-]\s*", "", first_line, flags=re.IGNORECASE)
        cleaned = cleaned.strip("`#*_ \t\r\n\"'“”‘’《》【】[]")
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        if not cleaned:
            return self.get_thread(thread_id, include_messages=False)
        title = cleaned[:30] + ("…" if len(cleaned) > 30 else "")
        with self.database.connect() as connection:
            connection.execute(
                """UPDATE agent_threads SET title = ?, updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (title, thread_id),
            )
        return self.get_thread(thread_id, include_messages=False)
    def delete_thread(self, thread_id: int) -> None:
        self._thread_row(thread_id)
        with self.database.connect() as connection:
            connection.execute("DELETE FROM agent_threads WHERE id = ?", (thread_id,))

    def reply(
        self,
        thread_id: int,
        values: dict,
        *,
        _event_sink: Callable[[dict[str, Any]], None] | None = None,
        _cancelled: Callable[[], bool] | None = None,
    ) -> dict:
        thread = self._thread_row(thread_id)
        thread_mode = str(thread["mode"] or "assistant")
        question = " ".join(str(values.get("message", "")).split()).strip()
        if not question:
            raise AppError("AGENT_MESSAGE_INVALID", "请输入要询问的内容", 422)
        feedback_kind = str(values.get("feedback_kind") or "")
        if feedback_kind not in {"", "simpler", "another_example", "understood", "confused"}:
            raise AppError("AGENT_FEEDBACK_INVALID", "不支持的学习反馈", 422)
        explanation_length = normalize_explanation_length(
            values.get("explanation_length")
        )
        context = {**(values.get("context") or {})}
        source_free = thread_mode == "learning" and bool(context.get("source_free"))
        try:
            previous_state = json.loads(thread["learning_state_json"] or "{}")
        except (TypeError, ValueError, json.JSONDecodeError):
            previous_state = {}
        if thread_mode == "learning" and source_free:
            # Starting from a topic is an explicit independent learning scope.
            # It must not be silently redirected to the course's saved roadmap.
            previous_state.pop("learning_path", None)
            previous_state.pop("learning_path_source", None)
            autonomous_topic = str(
                context.get("learning_topic")
                or previous_state.get("autonomous_topic")
                or requested_learning_topic(question)
                or ""
            ).strip()[:300]
            autonomous_goal = str(
                context.get("learning_goal")
                or previous_state.get("autonomous_goal")
                or ""
            ).strip()[:4000]
            if autonomous_topic:
                previous_state["autonomous_topic"] = autonomous_topic
            if autonomous_goal:
                previous_state["autonomous_goal"] = autonomous_goal
        elif thread_mode == "learning":
            previous_state.pop("autonomous_topic", None)
            previous_state.pop("autonomous_goal", None)
            course_path = self._course_learning_path(int(thread["course_id"]))
            if course_path is None:
                previous_state.pop("learning_path", None)
                previous_state.pop("learning_path_source", None)
            else:
                previous_state["learning_path"] = course_path
                previous_state["learning_path_source"] = "course_roadmap"
        next_lesson_number = max(0, int(previous_state.get("lesson_index") or 0)) + 1
        practice_type = practice_type_for_lesson(next_lesson_number)
        attachments, image_parts, attached_document_ids = self._resolve_attachments(
            int(thread["course_id"]), values.get("attachments") or []
        )
        selected_document_ids = list(context.get("selected_document_ids") or [])
        for attached_document_id in attached_document_ids:
            if attached_document_id not in selected_document_ids:
                selected_document_ids.append(attached_document_id)
        context["selected_document_ids"] = selected_document_ids[:200]
        if source_free:
            context.update(
                {
                    "document_id": None,
                    "document_ids": [],
                    "selected_document_ids": [],
                    "notebook_id": None,
                    "include_current": False,
                    "include_notes": False,
                    "include_knowledge": False,
                    "include_library": False,
                    "source_free": True,
                }
            )
        sources = self._build_context(int(thread["course_id"]), question, context)
        provider_id = str(values.get("provider_id") or thread["provider_id"])
        provider = self._provider(provider_id)

        user_metadata = {"feedback_kind": feedback_kind} if feedback_kind else {}
        if thread_mode == "learning":
            user_metadata["explanation_length"] = explanation_length
            user_metadata["source_free"] = source_free
        with self.database.connect() as connection:
            user_id = connection.execute(
                """INSERT INTO agent_messages(
                    thread_id, role, content, attachments_json, metadata_json
                ) VALUES (?, 'user', ?, ?, ?)""",
                (
                    thread_id,
                    question,
                    json.dumps(attachments, ensure_ascii=False),
                    json.dumps(user_metadata, ensure_ascii=False),
                ),
            ).lastrowid
            title = thread["title"]
            if thread_mode != "learning" and title in {"新对话", "New conversation"}:
                title = question[:36] + ("…" if len(question) > 36 else "")
            connection.execute(
                """UPDATE agent_threads SET title = ?, provider_id = ?, model = ?,
                updated_at = CURRENT_TIMESTAMP WHERE id = ?""",
                (title, provider_id, provider.model, thread_id),
            )

        conversation = self._provider_messages(
            thread_id,
            sources,
            image_parts,
            mode=thread_mode,
            explanation_length=explanation_length,
            practice_type=practice_type,
            source_free=source_free,
            learning_state=previous_state,
        )
        # Roadmaps are generated only by the explicit course-level planner.
        require_learning_path = False
        requested_topic = (
            str(previous_state.get("autonomous_topic") or requested_learning_topic(question) or "").strip() or None
            if thread_mode == "learning"
            and source_free
            and max(0, int(previous_state.get("lesson_index") or 0)) == 0
            else None
        )
        force_learning_card = thread_mode == "learning" and bool(
            feedback_kind
            or re.match(
                r"^(?:我的答案|我的回答)[：:]",
                question,
            )
        )

        assistant_id: int | None = None
        stream_id = ""
        stream_cancelled = False
        if thread_mode == "learning" and _event_sink is not None:
            _event_sink(
                _learning_progress_event("understanding", "正在理解学习目标", 0)
            )
        if _event_sink is not None:
            stream_id = uuid.uuid4().hex
            with self.database.connect() as connection:
                assistant_id = int(
                    connection.execute(
                        """INSERT INTO agent_messages(
                            thread_id, role, content, sources_json, status,
                            stream_id, draft_updated_at
                        ) VALUES (?, 'assistant', '', ?, 'streaming', ?, CURRENT_TIMESTAMP)""",
                        (
                            thread_id,
                            json.dumps(sources, ensure_ascii=False),
                            stream_id,
                        ),
                    ).lastrowid
                )
        try:
            if _event_sink is not None and callable(getattr(self.gateway, "stream", None)):
                chunks: list[str] = []
                answer = ""
                learning_delta_started = False
                for event in self.gateway.stream(
                    provider, conversation, cancelled=_cancelled
                ):
                    event_type = str(event.get("type") or "")
                    if thread_mode != "learning" or event_type in {
                        "start", "delta", "cancelled"
                    }:
                        _event_sink(event)
                    if thread_mode == "learning" and event_type == "start":
                        _event_sink(
                            _learning_progress_event(
                                "path", "正在对齐课程路线与本轮目标", 0
                            )
                        )
                    if event_type == "delta":
                        if thread_mode == "learning" and not learning_delta_started:
                            learning_delta_started = True
                            _event_sink(
                                _learning_progress_event(
                                    "lesson", "正在生成知识点、讲解与例子", 2
                                )
                            )
                        chunks.append(str(event.get("text") or ""))
                        answer = "".join(chunks)
                        with self.database.connect() as connection:
                            connection.execute(
                                """UPDATE agent_messages
                                   SET content = ?, draft_updated_at = CURRENT_TIMESTAMP
                                   WHERE id = ?""",
                                ("" if thread_mode == "learning" else answer, assistant_id),
                            )
                    elif event_type == "done":
                        answer = str(event.get("content") or "".join(chunks))
                        if thread_mode == "learning":
                            _event_sink(
                                _learning_progress_event(
                                    "validate",
                                    "正在校验结构化字段",
                                    len(LEARNING_GENERATION_FIELDS),
                                )
                            )
                    elif event_type == "cancelled":
                        stream_cancelled = True
                        answer = str(event.get("content") or "".join(chunks))
            else:
                answer = self.gateway.complete(provider, conversation)
        except AppError as error:
            with self.database.connect() as connection:
                if assistant_id is not None:
                    connection.execute(
                        """UPDATE agent_messages
                           SET status = 'error', error = ?,
                               draft_updated_at = CURRENT_TIMESTAMP
                           WHERE id = ?""",
                        (error.message, assistant_id),
                    )
                else:
                    connection.execute(
                        """INSERT INTO agent_messages(
                            thread_id, role, content, sources_json, status, error
                        ) VALUES (?, 'assistant', '', ?, 'error', ?)""",
                        (
                            thread_id,
                            json.dumps(sources, ensure_ascii=False),
                            error.message,
                        ),
                    )
                connection.execute(
                    "UPDATE agent_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (thread_id,),
                )
            raise

        visible_answer, proposed_plan = parse_action_plan_response(answer)
        learning_card = None
        repair_attempted = False
        if thread_mode == "learning":
            visible_answer, learning_card = parse_learning_response(visible_answer)
            response_mode = (
                str(learning_card.get("response_mode") or "")
                if isinstance(learning_card, dict)
                else ""
            )
            if response_mode == "conversation":
                visible_answer = str(learning_card.get("direct_answer") or "").strip()
            elif (
                learning_card is None
                and visible_answer.strip()
                and not learning_response_is_lesson_draft(answer)
            ):
                response_mode = "conversation"
            valid_learning_card = (
                bool(visible_answer.strip()) and not force_learning_card
                if response_mode == "conversation"
                else (
                    learning_card_matches_topic(
                        learning_card,
                        requested_topic,
                        require_path=require_learning_path,
                    )
                    and str((learning_card or {}).get("practice", {}).get("type") or "") == practice_type
                )
            )
            if not stream_cancelled and not valid_learning_card:
                repair_attempted = True
                if _event_sink is not None:
                    _event_sink(
                        _learning_progress_event(
                            "repair", "字段不完整，正在自动修复", 0
                        )
                    )
                # A structural repair must not resend the full retrieval context.
                # With many selected documents that duplicated tens of thousands
                # of characters and regularly exhausted compatible providers before
                # they could emit the repaired JSON. Keep every source/citation in a
                # compact manifest while repairing only the model's bounded draft.
                source_manifest = "\n".join(
                    f"[{str(source.get('citation') or f'S{index}').strip()}] "
                    f"{str(source.get('title') or '未命名资料').strip()[:160]}"
                    for index, source in enumerate(sources, start=1)
                ) or "（本轮没有资料来源）"
                repair_messages = [
                    {
                        "role": "system",
                        "content": (
                            learning_system_prompt(
                                explanation_length,
                                practice_type,
                                source_free=source_free,
                                learning_state=previous_state,
                            )
                            + "\n\n当前任务仅修复上一份输出的结构，不重新阅读或复述完整资料。"
                            + "保留已有事实；引用只能使用下列真实来源编号：\n"
                            + source_manifest
                        ),
                    },
                    {
                        "role": "user",
                        "content": learning_repair_prompt(
                            question,
                            answer,
                            topic=requested_topic,
                            practice_type=practice_type,
                            require_path=require_learning_path,
                        ),
                    },
                ]
                try:
                    if _event_sink is not None and callable(
                        getattr(self.gateway, "stream", None)
                    ):
                        repair_chunks: list[str] = []
                        repaired_answer = ""
                        for repair_event in self.gateway.stream(
                            provider,
                            repair_messages,
                            cancelled=_cancelled,
                        ):
                            repair_type = str(repair_event.get("type") or "")
                            if repair_type == "delta":
                                repair_text = str(repair_event.get("text") or "")
                                repair_chunks.append(repair_text)
                                _event_sink(repair_event)
                            elif repair_type == "done":
                                repaired_answer = str(
                                    repair_event.get("content")
                                    or "".join(repair_chunks)
                                )
                            elif repair_type == "cancelled":
                                stream_cancelled = True
                                repaired_answer = str(
                                    repair_event.get("content")
                                    or "".join(repair_chunks)
                                )
                                _event_sink(repair_event)
                        answer = repaired_answer or "".join(repair_chunks)
                    else:
                        answer = self.gateway.complete(provider, repair_messages)
                except AppError as error:
                    self._record_reply_error(
                        thread_id, assistant_id, sources, error
                    )
                    raise
                visible_answer, learning_card = parse_learning_response(answer)
                response_mode = (
                    str(learning_card.get("response_mode") or "")
                    if isinstance(learning_card, dict)
                    else ""
                )
                if response_mode == "conversation":
                    visible_answer = str(
                        learning_card.get("direct_answer") or ""
                    ).strip()
                elif (
                    learning_card is None
                    and visible_answer.strip()
                    and not learning_response_is_lesson_draft(answer)
                ):
                    response_mode = "conversation"
                valid_learning_card = (
                    bool(visible_answer.strip()) and not force_learning_card
                    if response_mode == "conversation"
                    else (
                        learning_card_matches_topic(
                            learning_card,
                            requested_topic,
                            require_path=require_learning_path,
                        )
                        and str((learning_card or {}).get("practice", {}).get("type") or "") == practice_type
                    )
                )
            if not stream_cancelled and not valid_learning_card:
                if _event_sink is not None:
                    _event_sink(
                        _learning_progress_event(
                            "repair", "结构仍不完整，正在完成最后修复", 0
                        )
                    )
                final_repair_messages = [
                    {
                        "role": "system",
                        "content": (
                            str(repair_messages[0]["content"])
                            + "\n\n这是第二次也是最后一次结构修复。"
                            + "只返回一个完整、可解析并满足全部字段约束的协议对象。"
                        ),
                    },
                    {
                        "role": "user",
                        "content": learning_repair_prompt(
                            question,
                            answer,
                            topic=requested_topic,
                            practice_type=practice_type,
                            require_path=require_learning_path,
                        ),
                    },
                ]
                try:
                    if _event_sink is not None and callable(
                        getattr(self.gateway, "stream", None)
                    ):
                        final_repair_chunks: list[str] = []
                        final_repaired_answer = ""
                        for final_repair_event in self.gateway.stream(
                            provider,
                            final_repair_messages,
                            cancelled=_cancelled,
                        ):
                            final_repair_type = str(
                                final_repair_event.get("type") or ""
                            )
                            if final_repair_type == "delta":
                                final_repair_text = str(
                                    final_repair_event.get("text") or ""
                                )
                                final_repair_chunks.append(final_repair_text)
                                _event_sink(final_repair_event)
                            elif final_repair_type == "done":
                                final_repaired_answer = str(
                                    final_repair_event.get("content")
                                    or "".join(final_repair_chunks)
                                )
                            elif final_repair_type == "cancelled":
                                stream_cancelled = True
                                final_repaired_answer = str(
                                    final_repair_event.get("content")
                                    or "".join(final_repair_chunks)
                                )
                                _event_sink(final_repair_event)
                        answer = final_repaired_answer or "".join(
                            final_repair_chunks
                        )
                    else:
                        answer = self.gateway.complete(
                            provider, final_repair_messages
                        )
                except AppError as error:
                    self._record_reply_error(
                        thread_id, assistant_id, sources, error
                    )
                    raise
                visible_answer, learning_card = parse_learning_response(answer)
                response_mode = (
                    str(learning_card.get("response_mode") or "")
                    if isinstance(learning_card, dict)
                    else ""
                )
                if response_mode == "conversation":
                    visible_answer = str(
                        learning_card.get("direct_answer") or ""
                    ).strip()
                elif (
                    learning_card is None
                    and visible_answer.strip()
                    and not learning_response_is_lesson_draft(answer)
                ):
                    response_mode = "conversation"
                valid_learning_card = (
                    bool(visible_answer.strip()) and not force_learning_card
                    if response_mode == "conversation"
                    else (
                        learning_card_matches_topic(
                            learning_card,
                            requested_topic,
                            require_path=require_learning_path,
                        )
                        and str(
                            (learning_card or {}).get("practice", {}).get("type")
                            or ""
                        ) == practice_type
                    )
                )
            if not stream_cancelled and not valid_learning_card:
                error = AppError(
                    "AGENT_LEARNING_FORMAT_INVALID",
                    "学习内容生成未通过结构校验，请重试。模型没有返回可用的知识点卡片。",
                    502,
                )
                self._record_reply_error(thread_id, assistant_id, sources, error)
                raise error
            conversation_title = ""
            if response_mode == "conversation":
                conversation_title = str(
                    (learning_card or {}).get("thread_title") or ""
                ).strip()[:120]
                learning_card = None
            if learning_card and not visible_answer:
                visible_answer = str(learning_card.get("direct_answer") or "").strip()
            if learning_card and _event_sink is not None:
                _event_sink(
                    _learning_progress_event(
                        "complete",
                        "学习内容已生成",
                        len(LEARNING_GENERATION_FIELDS),
                    )
                )

        # Ignore model-invented legacy paths. The canonical course roadmap is
        # preserved in previous_state and can only be replaced by the planner.
        if learning_card:
            learning_card.pop("learning_path", None)
        learning_state = next_learning_state(
            previous_state, learning_card, feedback_kind or None
        ) if thread_mode == "learning" else previous_state
        assistant_metadata = {}
        if learning_card:
            assistant_metadata = {
                "learning_card": learning_card,
                "lesson_index": learning_state["lesson_index"],
                "generation_trace": {
                    "schema": "studypilot-learning/v1",
                    "outcome": "repaired" if repair_attempted else "valid",
                    "raw_length": len(answer or ""),
                    "fields": [
                        {"key": key, "status": "ready"}
                        for key in LEARNING_GENERATION_FIELDS
                    ],
                },
            }

        resolved_title = str(title or thread["title"] or "新学习对话")
        if (
            thread_mode == "learning"
            and (learning_card or conversation_title)
            and max(0, int(previous_state.get("lesson_index") or 0)) == 0
        ):
            generated_title = (
                conversation_title
                or str((learning_card or {}).get("thread_title") or "").strip()[:120]
            )
            if generated_title:
                resolved_title = generated_title
        final_status = "cancelled" if stream_cancelled else "complete"
        with self.database.connect() as connection:
            if assistant_id is None:
                assistant_id = int(
                    connection.execute(
                        """INSERT INTO agent_messages(
                            thread_id, role, content, sources_json, metadata_json, status
                        ) VALUES (?, 'assistant', ?, ?, ?, ?)""",
                        (
                            thread_id,
                            visible_answer,
                            json.dumps(sources, ensure_ascii=False),
                            json.dumps(assistant_metadata, ensure_ascii=False),
                            final_status,
                        ),
                    ).lastrowid
                )
            else:
                connection.execute(
                    """UPDATE agent_messages
                       SET content = ?, sources_json = ?, metadata_json = ?,
                           status = ?, draft_updated_at = CURRENT_TIMESTAMP
                       WHERE id = ?""",
                    (
                        visible_answer,
                        json.dumps(sources, ensure_ascii=False),
                        json.dumps(assistant_metadata, ensure_ascii=False),
                        final_status,
                        assistant_id,
                    ),
                )
            connection.execute(
                """UPDATE agent_threads SET title = ?, learning_state_json = ?,
                updated_at = CURRENT_TIMESTAMP WHERE id = ?""",
                (
                    resolved_title,
                    json.dumps(learning_state, ensure_ascii=False),
                    thread_id,
                ),
            )
            message = connection.execute(
                "SELECT * FROM agent_messages WHERE id = ?", (assistant_id,)
            ).fetchone()
        if proposed_plan and not stream_cancelled:
            self.actions.create_plan(
                thread_id,
                int(assistant_id),
                int(thread["course_id"]),
                proposed_plan,
            )
        return {
            "thread": self.get_thread(thread_id, include_messages=False),
            "message": self._serialize_message(message),
            "user_message_id": int(user_id),
        }
    def generate_course_roadmap(self, course_id: int, values: dict) -> dict:
        """Generate and atomically replace the canonical roadmap for one course."""
        self._require_course(course_id)
        with self.database.connect() as connection:
            course = connection.execute(
                """SELECT id, title, description, course_type
                   FROM courses
                   WHERE id = ? AND deleted_at IS NULL""",
                (course_id,),
            ).fetchone()
        if course is None:
            raise AppError("COURSE_NOT_FOUND", "课程不存在", 404)
        if str(course["course_type"] or "knowledge") != "knowledge":
            raise AppError(
                "ROADMAP_LANGUAGE_COURSE_UNSUPPORTED",
                "语言课程使用独立语言路径，不生成普通课程学习路线",
                422,
            )

        provider_id = str(values.get("provider_id") or "").strip()
        provider = self._provider(provider_id)
        target_weeks = int(values.get("target_weeks") or 0)
        weekly_hours = float(values.get("weekly_hours") or 0)
        start_date = str(values.get("start_date") or "").strip() or None
        planning_goal = str(values.get("planning_goal") or "").strip()[:4000]
        if target_weeks < 1 or target_weeks > 52:
            raise AppError("ROADMAP_DURATION_INVALID", "学习周数必须在 1 到 52 周之间", 422)
        if weekly_hours < 0.5 or weekly_hours > 168:
            raise AppError("ROADMAP_HOURS_INVALID", "每周投入时间不正确", 422)

        requested_document_ids = list(
            dict.fromkeys(int(item) for item in values.get("document_ids", []) if int(item) > 0)
        )[:24]
        documents = self._roadmap_documents(course_id, requested_document_ids)
        history, history_count = self._roadmap_history(course_id)
        request_snapshot = {
            "provider_id": provider_id,
            "model": provider.model,
            "start_date": start_date,
            "target_weeks": target_weeks,
            "weekly_hours": weekly_hours,
            "planning_goal": planning_goal,
            "document_ids": requested_document_ids,
            "history_message_count": history_count,
        }
        with self.database.connect() as connection:
            generation_id = int(
                connection.execute(
                    """INSERT INTO roadmap_generations(
                        course_id, provider_id, model, status, request_json
                    ) VALUES (?, ?, ?, 'generating', ?)""",
                    (
                        course_id,
                        provider_id,
                        provider.model,
                        json.dumps(request_snapshot, ensure_ascii=False),
                    ),
                ).lastrowid
            )

        context = {
            "course": {
                "title": str(course["title"]),
                "description": str(course["description"] or ""),
            },
            "user_priority_goal": planning_goal or "（用户未填写，模型根据课程上下文自行规划）",
            "history": history or "（本课程还没有历史对话）",
            "selected_materials": documents or "（用户未选择资料）",
        }
        messages = [
            {
                "role": "system",
                "content": roadmap_system_prompt(
                    target_weeks=target_weeks,
                    weekly_hours=weekly_hours,
                    planning_goal=planning_goal,
                ),
            },
            {
                "role": "user",
                "content": "请根据以下课程上下文生成学习路线：\n"
                + json.dumps(context, ensure_ascii=False, indent=2),
            },
        ]
        repaired = False
        try:
            answer = self.gateway.complete(provider, messages)
            _, roadmap = parse_roadmap_response(
                answer,
                target_weeks=target_weeks,
            )
            if roadmap is None:
                repaired = True
                answer = self.gateway.complete(
                    provider,
                    [
                        *messages,
                        {"role": "assistant", "content": answer[-16000:]},
                        {
                            "role": "user",
                            "content": roadmap_repair_prompt(
                                answer,
                                target_weeks=target_weeks,
                            ),
                        },
                    ],
                )
                _, roadmap = parse_roadmap_response(
                    answer,
                    target_weeks=target_weeks,
                )
            if roadmap is None:
                raise AppError(
                    "ROADMAP_FORMAT_INVALID",
                    "学习路线生成未通过结构校验，请重试或更换模型。",
                    502,
                )
            self._save_course_roadmap(
                course_id=course_id,
                generation_id=generation_id,
                roadmap=roadmap,
                start_date=start_date,
                target_weeks=target_weeks,
                weekly_hours=weekly_hours,
            )
        except Exception as error:
            message = error.message if isinstance(error, AppError) else str(error)
            with self.database.connect() as connection:
                connection.execute(
                    """UPDATE roadmap_generations
                       SET status = 'failed', error = ?,
                           completed_at = CURRENT_TIMESTAMP
                       WHERE id = ?""",
                    (message[:2000], generation_id),
                )
            raise

        return {
            "roadmap": Repository(self.database).roadmap(course_id),
            "trace": {
                "schema": str(roadmap.get("schema") or "studypilot-roadmap/v1"),
                "outcome": "repaired" if repaired else "valid",
                "provider_id": provider_id,
                "model": provider.model,
                "history_message_count": history_count,
                "document_ids": requested_document_ids,
                "fields": [
                    {"key": key, "status": "ready"}
                    for key in ("title", "summary", "goal", "phases", "weeks")
                ],
            },
        }

    def _roadmap_documents(self, course_id: int, document_ids: list[int]) -> str:
        if not document_ids:
            return ""
        placeholders = ",".join("?" for _ in document_ids)
        with self.database.connect() as connection:
            rows = connection.execute(
                f"""SELECT id, title, body FROM documents
                    WHERE course_id = ? AND deleted_at IS NULL
                      AND id IN ({placeholders})
                    ORDER BY id""",
                (course_id, *document_ids),
            ).fetchall()
        if {int(row["id"]) for row in rows} != set(document_ids):
            raise AppError(
                "ROADMAP_DOCUMENT_FORBIDDEN",
                "所选资料不存在或不属于当前课程",
                403,
            )
        remaining = 24000
        sections: list[str] = []
        for row in rows:
            excerpt = str(row["body"] or "").strip()[:6000]
            section = f"[资料 {row['id']}] {row['title']}\n{excerpt}"
            section = section[:remaining]
            if not section:
                break
            sections.append(section)
            remaining -= len(section)
        return "\n\n".join(sections)

    def _roadmap_history(self, course_id: int) -> tuple[str, int]:
        with self.database.connect() as connection:
            rows = connection.execute(
                """SELECT agent_threads.title, agent_messages.role,
                          agent_messages.content, agent_messages.metadata_json
                   FROM agent_messages
                   JOIN agent_threads ON agent_threads.id = agent_messages.thread_id
                   WHERE agent_threads.course_id = ?
                     AND agent_messages.status = 'complete'
                   ORDER BY agent_messages.id DESC LIMIT 80""",
                (course_id,),
            ).fetchall()
        sections: list[str] = []
        remaining = 24000
        for row in reversed(rows):
            content = str(row["content"] or "").strip()
            if row["role"] == "assistant":
                try:
                    metadata = json.loads(row["metadata_json"] or "{}")
                except (TypeError, ValueError, json.JSONDecodeError):
                    metadata = {}
                card = metadata.get("learning_card")
                if isinstance(card, dict):
                    concept = str(card.get("concept") or "").strip()
                    direct = str(card.get("direct_answer") or "").strip()
                    structured = "；".join(item for item in (concept, direct) if item)
                    if structured:
                        content = structured
            if not content:
                continue
            role = "用户" if row["role"] == "user" else "PILOT"
            section = f"[{row['title']} / {role}] {content[:1600]}"[:remaining]
            if not section:
                break
            sections.append(section)
            remaining -= len(section)
        return "\n".join(sections), len(rows)

    def _save_course_roadmap(
        self,
        *,
        course_id: int,
        generation_id: int,
        roadmap: dict[str, Any],
        start_date: str | None,
        target_weeks: int,
        weekly_hours: float,
    ) -> None:
        with self.database.connect() as connection:
            connection.execute("DELETE FROM weeks WHERE course_id = ?", (course_id,))
            connection.execute("DELETE FROM phases WHERE course_id = ?", (course_id,))
            for phase in roadmap["phases"]:
                gate = f"G{phase['phase']}"
                connection.execute(
                    """INSERT INTO phases(
                        course_id, phase, title, gate, start_week, end_week,
                        acceptance, remediation, exit_criteria
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        course_id,
                        phase["phase"],
                        phase["title"],
                        gate,
                        phase["start_week"],
                        phase["end_week"],
                        phase["acceptance"],
                        phase["remediation"],
                        phase["objective"],
                    ),
                )
                for week in phase["weeks"]:
                    connection.execute(
                        """INSERT INTO weeks(
                            course_id, week, phase, gate, foundation,
                            tasks_json, deliverables_json
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)""",
                        (
                            course_id,
                            week["week"],
                            phase["phase"],
                            gate,
                            week["foundation"],
                            json.dumps(week["tasks"], ensure_ascii=False),
                            json.dumps(week["deliverables"], ensure_ascii=False),
                        ),
                    )
            connection.execute(
                """UPDATE courses
                   SET goal = ?, start_date = ?, target_weeks = ?,
                       weekly_hours = ?, updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (roadmap["goal"], start_date, target_weeks, weekly_hours, course_id),
            )
            connection.execute(
                """UPDATE roadmap_generations
                   SET status = 'completed', roadmap_json = ?,
                       completed_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (json.dumps(roadmap, ensure_ascii=False), generation_id),
            )


    def _record_reply_error(
        self,
        thread_id: int,
        assistant_id: int | None,
        sources: list[dict],
        error: AppError,
    ) -> None:
        with self.database.connect() as connection:
            if assistant_id is not None:
                connection.execute(
                    """UPDATE agent_messages
                       SET content = '', metadata_json = '{}', status = 'error',
                           error = ?, draft_updated_at = CURRENT_TIMESTAMP
                       WHERE id = ?""",
                    (error.message, assistant_id),
                )
            else:
                connection.execute(
                    """INSERT INTO agent_messages(
                        thread_id, role, content, sources_json, metadata_json,
                        status, error
                    ) VALUES (?, 'assistant', '', ?, '{}', 'error', ?)""",
                    (
                        thread_id,
                        json.dumps(sources, ensure_ascii=False),
                        error.message,
                    ),
                )
            connection.execute(
                "UPDATE agent_threads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (thread_id,),
            )

    def reply_events(
        self, thread_id: int, values: dict
    ) -> Iterator[dict[str, Any]]:
        channel: queue.Queue[dict[str, Any] | None] = queue.Queue()
        cancelled = threading.Event()

        def worker() -> None:
            try:
                result = self.reply(
                    thread_id,
                    values,
                    _event_sink=channel.put,
                    _cancelled=cancelled.is_set,
                )
                channel.put({"type": "final", "data": result})
            except AppError as error:
                channel.put(
                    {
                        "type": "error",
                        "error": {
                            "code": error.code,
                            "message": error.message,
                            "status_code": error.status_code,
                        },
                    }
                )
            except Exception:
                channel.put(
                    {
                        "type": "error",
                        "error": {
                            "code": "AGENT_STREAM_INTERNAL",
                            "message": "The response stream failed",
                            "status_code": 500,
                        },
                    }
                )
            finally:
                channel.put(None)

        thread = threading.Thread(
            target=worker,
            name=f"agent-stream-{thread_id}",
            daemon=True,
        )
        thread.start()
        try:
            while True:
                event = channel.get()
                if event is None:
                    break
                yield event
        finally:
            cancelled.set()
    def _provider_messages(
        self,
        thread_id: int,
        sources: list[dict],
        image_parts: list[dict[str, Any]] | None = None,
        mode: str = "assistant",
        explanation_length: str = "medium",
        practice_type: str = "multiple_choice",
        source_free: bool = False,
        learning_state: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        source_prompt = self._source_prompt(sources)
        with self.database.connect() as connection:
            rows = connection.execute(
                """SELECT role, content, metadata_json FROM agent_messages
                WHERE thread_id = ? AND status = 'complete'
                ORDER BY id DESC LIMIT 12""",
                (thread_id,),
            ).fetchall()
            course = connection.execute(
                """SELECT courses.course_type, courses.target_language_tag,
                          courses.native_language_tag,
                          courses.proficiency_level
                   FROM agent_threads
                   JOIN courses ON courses.id = agent_threads.course_id
                   WHERE agent_threads.id = ?""",
                (thread_id,),
            ).fetchone()
        history: list[dict[str, Any]] = []
        for row in reversed(rows):
            item = dict(row)
            content = str(item.get("content") or "").strip()
            if item.get("role") == "assistant":
                try:
                    metadata = json.loads(item.get("metadata_json") or "{}")
                except (TypeError, ValueError, json.JSONDecodeError):
                    metadata = {}
                learning_card = metadata.get("learning_card")
                if isinstance(learning_card, dict):
                    protocol = json.dumps(
                        learning_card,
                        ensure_ascii=False,
                        indent=2,
                    )
                    content = (
                        f"{content}\n" if content else ""
                    ) + f"```studypilot-learning\n{protocol}\n```"
            if content:
                history.append({"role": item["role"], "content": content})
        if image_parts:
            for item in reversed(history):
                if item["role"] == "user":
                    item["content"] = [
                        {"type": "text", "text": item["content"]},
                        *image_parts,
                    ]
                    break
        system_prompt = (
            learning_system_prompt(
                explanation_length,
                practice_type,
                source_free=source_free,
                learning_state=learning_state,
            )
            if mode == "learning"
            else SYSTEM_PROMPT
        )
        language_prompt = ""
        if course is not None and course["course_type"] == "language":
            language_prompt = (
                "\n\n当前是语言学习课程："
                f"目标语言={course['target_language_tag']}，"
                f"学习者母语={course['native_language_tag']}，"
                f"当前水平={course['proficiency_level']}。"
                "教学时优先使用目标语言给出可理解输入和示范，"
                "再用学习者母语做必要解释；每轮都要推动真实交流，"
                "并纠正影响理解的用词、语法、语音节奏或语用问题。"
            )
        return [
            {
                "role": "system",
                "content": f"{system_prompt}{language_prompt}\n\n{ACTION_PLAN_PROMPT}\n\n{source_prompt}",
            },
            *history,
        ]
    def _resolve_attachments(
        self, course_id: int, requests: list[dict]
    ) -> tuple[list[dict], list[dict[str, Any]], list[int]]:
        attachments: list[dict] = []
        image_parts: list[dict[str, Any]] = []
        document_ids: list[int] = []
        media_root = (self.database.path.parent / "media").resolve()
        for request in requests[:8]:
            kind = str(request.get("kind") or "")
            name = str(request.get("name") or "附件")[:240]
            if kind == "document":
                document_id = int(request.get("document_id") or 0)
                document = self._context_document(course_id, document_id)
                attachments.append(
                    {
                        "kind": "document",
                        "name": name or document["filename"],
                        "media_type": str(request.get("media_type") or document["media_type"]),
                        "document_id": document_id,
                    }
                )
                if document_id not in document_ids:
                    document_ids.append(document_id)
                continue
            if kind != "image":
                raise AppError("AGENT_ATTACHMENT_INVALID", "附件类型不受支持", 422)
            asset_id = str(request.get("image_asset_id") or "")
            with self.database.connect() as connection:
                asset = connection.execute(
                    "SELECT * FROM media_assets WHERE id = ? AND course_id = ?",
                    (asset_id, course_id),
                ).fetchone()
            if not asset:
                raise AppError(
                    "AGENT_ATTACHMENT_FORBIDDEN", "当前对话不能读取该图片", 403
                )
            image_path = (media_root / asset["storage_path"]).resolve()
            if image_path.parent != media_root or not image_path.is_file():
                raise AppError("AGENT_ATTACHMENT_MISSING", "附件图片文件不存在", 404)
            media_type = str(asset["media_type"])
            encoded = base64.b64encode(image_path.read_bytes()).decode("ascii")
            image_parts.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{media_type};base64,{encoded}"},
                }
            )
            attachments.append(
                {
                    "kind": "image",
                    "name": name or asset["filename"],
                    "media_type": media_type,
                    "image_asset_id": asset_id,
                    "url": f"/api/courses/{course_id}/media/images/{asset_id}",
                }
            )
        return attachments, image_parts, document_ids

    def _source_prompt(self, sources: list[dict]) -> str:
        if not sources:
            return "本次没有提供本地资料来源。"
        sections = ["本次可用的 StudyPilot 来源：", "若来源中存在“当前选区”（kind=selection），本轮必须直接处理“当前选区”；它就是用户刚刚选择的原文。不得声称无法看到用户选中的文字，也不得改用其他来源替代选区。"]
        for index, source in enumerate(sources, start=1):
            source["citation"] = f"S{index}"
            metadata = {
                key: source[key]
                for key in (
                    "id",
                    "document_id",
                    "block_key",
                    "notebook_id",
                    "node_id",
                    "edge_id",
                    "source_id",
                    "target_id",
                )
                if source.get(key) not in (None, "")
            }
            metadata["locator"] = source.get("locator") or {}
            sections.append(
                f"[S{index}] {source['title']} | {source['kind']} | "
                f"metadata={json.dumps(metadata, ensure_ascii=False)}\n{source['excerpt']}"
            )
        return "\n\n".join(sections)

    def _build_context(self, course_id: int, question: str, context: dict) -> list[dict]:
        sources: list[dict] = []
        seen: set[tuple] = set()
        used_chars = 0
        total_char_budget = 180000
        max_sources = 240

        def add(source: dict) -> None:
            nonlocal used_chars
            excerpt = str(source.get("excerpt", ""))
            if not excerpt.strip() or len(sources) >= max_sources or used_chars >= total_char_budget:
                return
            key = (
                source.get("kind"),
                source.get("id"),
                source.get("document_id"),
                source.get("block_key"),
                source.get("title"),
            )
            if key in seen:
                return
            remaining = total_char_budget - used_chars
            per_source_limit = 12000 if source.get("kind") == "document" else 2400
            locator = source.get("locator") if isinstance(source.get("locator"), dict) else {}
            location_label = str(source.get("location_label") or self._source_location_label(locator))
            source = {
                **source,
                "excerpt": excerpt[: min(per_source_limit, remaining)],
                "location_label": location_label,
            }
            seen.add(key)
            used_chars += len(source["excerpt"])
            sources.append(source)

        document_id = context.get("document_id")
        document = None
        block_key = str(context.get("block_key") or "")
        selection = str(context.get("selected_text") or "").strip()
        page_view = str(context.get("page_view") or "").strip()
        page_title = str(context.get("page_title") or "").strip()
        notebook_id = context.get("notebook_id")
        if context.get("include_current", True) and not document_id and not notebook_id and page_view:
            view_labels = {
                "home": "课程主页",
                "dashboard": "课程主页",
                "learning": "学习中心",
                "roadmap": "学习路线",
                "knowledge": "知识网络",
                "library": "资料书架",
                "lab": "Python 实验室",
                "studio": "项目与研究",
                "stats": "学习统计",
                "settings": "设置",
            }
            view_label = view_labels.get(page_view, page_view)
            source_title = f"{view_label} · {page_title}" if page_title else view_label
            excerpt = (
                f"当前页面是课程“{page_title}”的“{view_label}”。"
                if page_title
                else f"当前页面是“{view_label}”。"
            )
            add({
                "kind": "page",
                "id": page_view,
                "title": source_title,
                "locator": {"view": page_view},
                "excerpt": excerpt,
            })
        if selection:
            add(
                {
                    "kind": "selection",
                    "title": "当前选区",
                    **({"document_id": int(document_id)} if document_id else {}),
                    "block_key": block_key,
                    "locator": context.get("locator") or {},
                    "excerpt": selection,
                }
            )
        if context.get("include_current", True) and document_id:
            document = self._context_document(course_id, int(document_id))
            with self.database.connect() as connection:
                if block_key:
                    blocks = connection.execute(
                        """SELECT * FROM document_blocks
                        WHERE document_id = ? AND block_key = ? ORDER BY ordinal""",
                        (document_id, block_key),
                    ).fetchall()
                else:
                    blocks = connection.execute(
                        """SELECT * FROM document_blocks
                        WHERE document_id = ? ORDER BY ordinal LIMIT 6""",
                        (document_id,),
                    ).fetchall()
                annotations = connection.execute(
                    """SELECT * FROM document_annotations
                    WHERE document_id = ? ORDER BY updated_at DESC, id DESC LIMIT 6""",
                    (document_id,),
                ).fetchall()
            if blocks:
                for block in blocks:
                    add(self._document_source(document, block))
            else:
                add(
                    {
                        "kind": "document",
                        "title": document["title"],
                        "document_id": int(document_id),
                        "block_key": "",
                        "locator": {},
                        "excerpt": document["body"],
                    }
                )
            for annotation in annotations:
                add(
                    {
                        "kind": "annotation",
                        "id": annotation["id"],
                        "title": f"批注 · {document['title']}",
                        "document_id": int(document_id),
                        "block_key": annotation["block_key"],
                        "locator": json.loads(annotation["locator_json"]),
                        "excerpt": "\n".join(
                            part for part in (annotation["quote"], annotation["note"]) if part
                        ),
                    }
                )

        requested_document_ids: list[int] = []
        for value in [*(context.get("document_ids") or []), *(context.get("selected_document_ids") or [])]:
            try:
                candidate = int(value)
            except (TypeError, ValueError):
                continue
            if candidate not in requested_document_ids:
                requested_document_ids.append(candidate)
        primary_document_id = int(document_id) if document_id else None
        selected_excerpt_limit = max(
            400,
            min(4000, 80000 // max(1, len(requested_document_ids))),
        )
        for requested_id in requested_document_ids[:200]:
            if requested_id == primary_document_id:
                continue
            requested_document = self._context_document(course_id, requested_id)
            with self.database.connect() as connection:
                requested_blocks = connection.execute(
                    """SELECT * FROM document_blocks
                    WHERE document_id = ? ORDER BY ordinal LIMIT 12""",
                    (requested_id,),
                ).fetchall()
            excerpt = "\n\n".join(
                str(block["text"] or "").strip()
                for block in requested_blocks
                if str(block["text"] or "").strip()
            ) or str(requested_document["body"] or "").strip()
            add(
                {
                    "kind": "document",
                    "title": requested_document["title"],
                    "document_id": requested_id,
                    "block_key": "",
                    "locator": {
                        "coverage": "selected_document_summary",
                        "selected": True,
                    },
                    "excerpt": excerpt[:selected_excerpt_limit],
                }
            )

        if context.get("include_notes"):
            with self.database.connect() as connection:
                notes = connection.execute(
                    """SELECT id, title, content FROM notes
                    WHERE course_id = ? ORDER BY updated_at DESC, id DESC LIMIT 8""",
                    (course_id,),
                ).fetchall()
                generic_notes = connection.execute(
                    """SELECT id, title, payload_json FROM generic_items
                    WHERE course_id = ? AND collection = 'notes'
                    ORDER BY updated_at DESC, id DESC LIMIT 8""",
                    (course_id,),
                ).fetchall()
            for note in notes:
                add(
                    {
                        "kind": "note",
                        "id": note["id"],
                        "title": note["title"],
                        "locator": {"note_id": note["id"]},
                        "excerpt": note["content"],
                    }
                )
            for note in generic_notes:
                payload = json.loads(note["payload_json"] or "{}")
                content = next(
                    (str(payload[key]) for key in ("content", "body", "text", "note") if payload.get(key)),
                    "",
                )
                add(
                    {
                        "kind": "note",
                        "id": f"generic:{note['id']}",
                        "title": note["title"],
                        "locator": {"generic_note_id": note["id"]},
                        "excerpt": content,
                    }
                )

        if context.get("include_knowledge"):
            notebook_id = context.get("notebook_id")
            parameters: list[Any] = [course_id]
            notebook_clause = ""
            edge_notebook_clause = ""
            if notebook_id:
                notebook_clause = "AND notebook_id = ?"
                edge_notebook_clause = "AND e.notebook_id = ?"
                parameters.append(int(notebook_id))
            with self.database.connect() as connection:
                notebook = connection.execute(
                    """SELECT id, title FROM knowledge_notebooks
                    WHERE id = ? AND course_id = ? AND deleted_at IS NULL""",
                    (int(notebook_id), course_id),
                ).fetchone() if notebook_id else None
                nodes = connection.execute(
                    f"""SELECT * FROM knowledge_nodes WHERE course_id = ?
                    {notebook_clause} ORDER BY id DESC LIMIT 10""",
                    parameters,
                ).fetchall()
                edges = connection.execute(
                    f"""SELECT e.*, source.title AS source_title,
                        target.title AS target_title
                    FROM knowledge_edges e
                    JOIN knowledge_nodes source ON source.id = e.source_id
                    JOIN knowledge_nodes target ON target.id = e.target_id
                    WHERE e.course_id = ? {edge_notebook_clause}
                    ORDER BY e.id DESC LIMIT 10""",
                    parameters,
                ).fetchall()
            if notebook:
                add(
                    {
                        "kind": "knowledge_notebook",
                        "id": notebook["id"],
                        "notebook_id": notebook["id"],
                        "title": notebook["title"],
                        "locator": {"notebook_id": notebook["id"]},
                        "excerpt": "当前知识画布，可在用户确认后创建或调整节点与关系。",
                    }
                )
            for node in nodes:
                add(
                    {
                        "kind": "knowledge",
                        "id": node["id"],
                        "notebook_id": node["notebook_id"],
                        "node_id": node["id"],
                        "title": node["title"],
                        "document_id": node["source_document_id"],
                        "block_key": node["source_block_key"],
                        "locator": json.loads(node["source_locator_json"] or "{}"),
                        "excerpt": "\n".join(
                            part
                            for part in (node["description"], node["content"], node["source_quote"])
                            if part
                        ) or node["title"],
                    }
                )
            for edge in edges:
                add(
                    {
                        "kind": "knowledge_edge",
                        "id": edge["id"],
                        "notebook_id": edge["notebook_id"],
                        "edge_id": edge["id"],
                        "source_id": edge["source_id"],
                        "target_id": edge["target_id"],
                        "title": f"{edge['source_title']} → {edge['target_title']}",
                        "locator": {"notebook_id": edge["notebook_id"]},
                        "excerpt": f"关系类型：{edge['relation']}",
                    }
                )

        if context.get("include_library"):
            selected = tuple(
                int(value)
                for value in (context.get("selected_document_ids") or [])
                if str(value).isdigit()
            )
            retrieval_scope = RetrievalScope(
                selected_document_ids=selected,
                include_notes=bool(context.get("include_notes")),
                include_knowledge=bool(context.get("include_knowledge")),
            )
            for result in self.retrieval.retrieve(
                course_id,
                question,
                retrieval_scope,
                max_chars=max(2000, 20000 - used_chars),
                limit=12,
            ):
                add(
                    {
                        "kind": (
                            "knowledge"
                            if result.source_kind == "knowledge_node"
                            else result.source_kind
                        ),
                        "id": result.source_id,
                        "title": result.title,
                        "document_id": result.document_id,
                        "block_key": result.block_key,
                        "locator": result.locator,
                        "excerpt": result.content,
                        "retrieval_score": result.score,
                    }
                )
        return sources

    def _context_document(self, course_id: int, document_id: int):
        with self.database.connect() as connection:
            row = connection.execute(
                """SELECT * FROM documents
                WHERE id = ? AND course_id = ? AND deleted_at IS NULL""",
                (document_id, course_id),
            ).fetchone()
        if not row:
            raise AppError(
                "AGENT_CONTEXT_FORBIDDEN", "当前对话不能读取其他课程的资料", 403
            )
        return row

    @staticmethod
    def _source_location_label(locator: dict[str, Any]) -> str:
        def positive_int(key: str) -> int | None:
            try:
                value = int(locator.get(key))
            except (TypeError, ValueError):
                return None
            return value if value > 0 else None

        line_start = positive_int("line_start")
        line_end = positive_int("line_end")
        if line_start:
            if line_end and line_end != line_start:
                return f"第 {line_start}–{line_end} 行"
            return f"第 {line_start} 行"
        page = positive_int("page")
        if page:
            return f"第 {page} 页"
        if "paragraph" in locator:
            try:
                return f"第 {int(locator['paragraph']) + 1} 段"
            except (TypeError, ValueError):
                pass
        sheet = str(locator.get("sheet") or "").strip()
        cell_range = str(locator.get("range") or "").strip()
        if sheet and cell_range:
            return f"工作表 {sheet} · {cell_range}"
        if sheet:
            return f"工作表 {sheet}"
        slide = positive_int("slide")
        if slide:
            return f"第 {slide} 张幻灯片"
        cell = positive_int("cell")
        if cell:
            cell_type = str(locator.get("cell_type") or "").lower()
            label = "代码单元" if cell_type == "code" else "Markdown 单元" if cell_type == "markdown" else "单元"
            return f"第 {cell} 个{label}"
        if "table" in locator:
            try:
                return f"第 {int(locator['table']) + 1} 个表格"
            except (TypeError, ValueError):
                pass
        if "section" in locator:
            try:
                return f"第 {int(locator['section']) + 1} 节"
            except (TypeError, ValueError):
                pass
        return ""
    @staticmethod
    def _document_source(document, block) -> dict:
        return {
            "kind": "document",
            "id": block["id"],
            "title": document["title"],
            "document_id": block["document_id"],
            "block_key": block["block_key"],
            "locator": json.loads(block["locator_json"]),
            "excerpt": block["text"],
        }

    @staticmethod
    def _search_terms(text: str) -> list[str]:
        result: list[str] = []
        for token in re.findall(r"[A-Za-z0-9_]+|[\u3400-\u9fff]+", text.lower()):
            if re.fullmatch(r"[\u3400-\u9fff]+", token) and len(token) > 2:
                result.extend(token[index : index + 2] for index in range(len(token) - 1))
            elif len(token) > 1:
                result.append(token)
        return list(dict.fromkeys(result))[:24]

    def _provider(self, provider_id: str) -> ProviderConfig:
        row = self._provider_row(provider_id)
        if not row["enabled"]:
            raise AppError("AGENT_PROVIDER_DISABLED", "该模型提供商已停用", 422)
        is_local = row["base_url"].startswith(("http://127.0.0.1", "http://localhost"))
        if not row["api_key"] and not is_local:
            raise AppError(
                "AGENT_PROVIDER_NOT_CONFIGURED", "请先填写模型 API 密钥", 422
            )
        return ProviderConfig(
            row["id"],
            row["protocol"],
            row["base_url"],
            row["model"],
            row["api_key"],
            row["max_output_tokens"],
            row["connect_timeout_seconds"],
            row["first_byte_timeout_seconds"],
            row["idle_timeout_seconds"],
        )

    def _provider_row(
        self,
        provider_id: str,
        required: bool = True,
        include_deleted: bool = False,
    ):
        deleted_filter = "" if include_deleted else " AND deleted_at IS NULL"
        with self.database.connect() as connection:
            row = connection.execute(
                f"SELECT * FROM agent_providers WHERE id = ?{deleted_filter}",
                (provider_id,),
            ).fetchone()
        if not row and required:
            raise AppError("AGENT_PROVIDER_NOT_FOUND", "模型提供商不存在", 404)
        return row

    @staticmethod
    def _serialize_provider(row) -> dict:
        item = as_dict(row)
        item["has_api_key"] = bool(item.pop("api_key"))
        item["enabled"] = bool(item["enabled"])
        return item

    def _course_learning_path(self, course_id: int) -> dict[str, Any] | None:
        roadmap = Repository(self.database).roadmap(course_id)
        phases = roadmap.get("phases") or []
        weeks = roadmap.get("weeks") or []
        if not phases or not weeks:
            return None
        with self.database.connect() as connection:
            course = connection.execute(
                "SELECT title, goal FROM courses WHERE id = ? AND deleted_at IS NULL",
                (course_id,),
            ).fetchone()
        if course is None:
            return None
        stages: list[dict[str, Any]] = []
        for phase in phases:
            phase_number = int(phase.get("phase") or 0)
            phase_weeks = [
                week for week in weeks if int(week.get("phase") or 0) == phase_number
            ]
            concepts: list[str] = []
            for week in phase_weeks:
                foundation = str(week.get("foundation") or "").strip()
                if foundation and foundation not in concepts:
                    concepts.append(foundation)
                for task in week.get("tasks") or []:
                    cleaned = str(task or "").strip()
                    if cleaned and cleaned not in concepts:
                        concepts.append(cleaned)
            stages.append(
                {
                    "title": str(phase.get("title") or f"阶段 {phase_number}"),
                    "objective": str(
                        phase.get("acceptance")
                        or phase.get("gate")
                        or phase.get("exit_criteria")
                        or ""
                    ),
                    "concepts": concepts[:24],
                }
            )
        goal = str(course["goal"] or "").strip()
        if not goal:
            goal = str(phases[-1].get("acceptance") or "完成课程学习路线")
        return {
            "subject": str(course["title"] or "当前课程"),
            "goal": goal,
            "stages": stages,
        }

    def _thread_row(self, thread_id: int):
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT * FROM agent_threads WHERE id = ?", (thread_id,)
            ).fetchone()
        if not row:
            raise AppError("AGENT_THREAD_NOT_FOUND", "对话不存在", 404)
        return row

    def _require_course(self, course_id: int) -> None:
        with self.database.connect() as connection:
            row = connection.execute(
                "SELECT id FROM courses WHERE id = ? AND deleted_at IS NULL", (course_id,)
            ).fetchone()
        if not row:
            raise AppError("COURSE_NOT_FOUND", "课程不存在", 404)

    @staticmethod
    def _serialize_thread(row) -> dict:
        item = as_dict(row)
        try:
            item["learning_state"] = json.loads(item.pop("learning_state_json") or "{}")
        except (TypeError, ValueError, json.JSONDecodeError):
            item["learning_state"] = {}
        item["mode"] = str(item.get("mode") or "assistant")
        item["pinned"] = bool(item.get("pinned"))
        return item

    def _serialize_message(self, row) -> dict:
        item = as_dict(row)
        item["sources"] = json.loads(item.pop("sources_json") or "[]")
        item["attachments"] = json.loads(item.pop("attachments_json") or "[]")
        try:
            item["metadata"] = json.loads(item.pop("metadata_json") or "{}")
        except (TypeError, ValueError, json.JSONDecodeError):
            item["metadata"] = {}
        item["action_plan"] = self.actions.for_message(int(item["id"]))
        return item
