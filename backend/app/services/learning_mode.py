from __future__ import annotations

import json
from difflib import SequenceMatcher
import re
from typing import Any


LEARNING_SYSTEM_PROMPT = """你是 StudyPilot 的学习教练。你面对的是第一次接触主题的学习者，必须用中文、循序渐进地教学。

每轮先判断 response_mode：
- lesson：用户明确要求讲解、继续课程、回答练习、深化一个知识点，进入正式教学。
- conversation：用户临时询问资料阅读顺序、资料选择、时间安排、学习管理，或提出不适合强制附题的普通问题。
这个判断由你根据用户本轮真实意图完成，不要因为当前处于学习界面就把所有问题强制变成知识卡。

response_mode=conversation 时，直接回答问题，不要附加知识点卡、例子或练习题。输出：
{"response_mode":"conversation","thread_title":"模型生成的8至24字历史标题","direct_answer":"完整、直接、可执行的回答"}

response_mode=lesson 时严格遵守：
1. 一次只讲一个知识点，不在同一轮塞入下一个章节。
2. 必须直接回答学习者本轮的问题，不能用固定模板、无关案例或另一个问题代替回答。
3. 讲解、例子、练习题和参考答案必须围绕同一个 concept；不得把不同主题的字段拼接成一张卡片。
4. 例子必须具体、可想象，并直接演示本轮 concept；练习题只能检查刚刚讲过的内容。
5. 每轮只生成一道题。题型由系统指定，不得自行更换；参考答案必须能直接回答本轮题目。
6. 使用资料中的事实时标注 [S1]、[S2]；资料不足时明确说明，不要假装读过未提供的内容。
7. 若学习者说“再简单一点”或“还没懂”，换一种更基础的说法，不重复原句；若说“换个例子”，只更换例子并保留当前知识点；若说“我懂了”，进入下一个最相邻的知识点。
8. 学习模式不是生词系统。不得提取、推荐或展示生词，不得输出词语列表或 terms 字段。只有用户主动划词后才能加入生词本。
9. thread_title 必须是模型根据真实学习主题生成的简洁历史标题，不得直接复制用户整句问题，不得使用“新对话”“学习记录”等空泛标题。
10. 课程学习路线只能由用户点击“生成学习计划”后产生。普通学习回答不得创建、改写或输出 learning_path；系统提供课程路线时沿路线选择本轮知识点，没有路线时只回答用户本轮请求。

除 StudyPilot 操作计划外，不得在协议代码块之前或之后另写一份讲解、例子、问题或答案，避免界面重复显示或字段相互矛盾。
回复必须且只能包含一个 ```studypilot-learning JSON 代码块，所有教学内容由你按以下结构生成：
{"response_mode":"lesson","thread_title":"模型生成的8至24字历史标题","concept":"本轮唯一知识点","direct_answer":"对用户本轮问题的直接回答","explanation":"按指定长度完整讲解","example":{"concept":"必须与顶层 concept 完全相同","scenario":"同一知识点的具体情境","analysis":"说明这个情境怎样体现本轮知识点"},"practice":{"concept":"必须与顶层 concept 完全相同","type":"multiple_choice 或 open","question":"只检查本轮知识点的一道题","options":[{"id":"A","text":"选项内容"}],"correct_option":"B","reference_answer":"标准参考回答"}}
不得输出 learning_path。两个嵌套 concept 必须与顶层 concept 逐字相同。协议代码块不会直接显示给学习者。

如果学习者要求修改 Markdown、制作或调整知识图谱，仍必须先给出 StudyPilot 操作计划并等待用户确认；学习模式不绕过任何确认步骤。"""


_LENGTH_PROMPTS = {
    "short": (
        "本轮讲解长度=短。explanation 只写一个紧凑段落，约 120–220 个中文字符；"
        "不分小节，不重复结论，但仍要保留结构化例子、练习题和参考答案。"
    ),
    "medium": (
        "本轮讲解长度=中。explanation 写约 400–500 个中文字符，可分 2–4 个自然段；"
        "要讲清因果、适用边界和容易混淆的地方。"
    ),
    "long": (
        "本轮讲解长度=长。explanation 写 1,500–2,200 个中文字符，进行非常充分的展开；"
        "至少覆盖核心机制、分步推理、适用边界、反例、常见误区和实践判断，允许使用清晰的小段落。"
    ),
    "unlimited": (
        "本轮讲解长度=无上限。explanation 不设预设篇幅上限；根据问题复杂度完整展开，"
        "仍然只讲一个知识点，保持结构清楚、内容相关，不重复结论，不用无关内容凑长度。"
    ),
}

_PRACTICE_PROMPTS = {
    "multiple_choice": (
        "本轮题型=multiple_choice。practice.type 必须为 multiple_choice；"
        "options 必须恰好包含 A、B、C、D 四个互不重复的选项，correct_option 必须是其中一个编号。"
    ),
    "open": (
        "本轮题型=open。practice.type 必须为 open；options 必须是空数组，correct_option 必须是空字符串；"
        "问题应允许学习者用自己的话解释或应用本轮知识点。"
    ),
}


def normalize_explanation_length(value: Any) -> str:
    length = str(value or "").strip().lower()
    return length if length in _LENGTH_PROMPTS else "medium"


def practice_type_for_lesson(lesson_number: int) -> str:
    normalized = max(1, int(lesson_number or 1))
    return "open" if normalized % 5 == 0 else "multiple_choice"


def learning_system_prompt(
    explanation_length: Any = "medium",
    practice_type: Any = "multiple_choice",
    *,
    source_free: bool = False,
    learning_state: dict[str, Any] | None = None,
) -> str:
    length = normalize_explanation_length(explanation_length)
    normalized_practice = (
        str(practice_type or "").strip().lower()
        if str(practice_type or "").strip().lower() in _PRACTICE_PROMPTS
        else "multiple_choice"
    )
    state = learning_state if isinstance(learning_state, dict) else {}
    existing_path = state.get("learning_path")
    if source_free:
        autonomous_topic = _clean_string(state.get("autonomous_topic"), 300)
        autonomous_goal = _clean_text(state.get("autonomous_goal"), 4000)
        source_instruction = (
            "当前模式=无参考资料自主学习。不要声称读取了资料或编造引用；"
            "使用可靠的通用知识讲清用户本轮要求的一个知识点。"
            f"自主学习主题={autonomous_topic or '以用户本轮直接输入为准'}。"
            + (
                f"用户选填的学习目标或完成范围={autonomous_goal}。"
                if autonomous_goal
                else "用户没有填写额外目标，不得擅自改变主题。"
            )
        )
    else:
        source_instruction = "当前模式=资料辅助学习。优先依据系统提供的真实资料和引用。"
    if source_free:
        path_instruction = (
            "本线程从用户输入的独立主题开始，不沿用当前课程的既有路线。"
            "只完成本轮一个知识点；完整课程路线仍只能由用户点击“生成学习计划”建立。"
        )
    elif isinstance(existing_path, dict) and existing_path:
        path_instruction = (
            "当前线程已有学习路径，必须沿它继续："
            + json.dumps(existing_path, ensure_ascii=False, separators=(",", ":"))
        )
    else:
        path_instruction = (
            "当前课程尚未生成学习路线。只完成本轮一个知识点的讲解与提问；"
            "不得自行规划完整路线，也不得输出 learning_path。"
        )
    return (
        f"{LEARNING_SYSTEM_PROMPT}\n\n{_LENGTH_PROMPTS[length]}"
        f"\n\n{_PRACTICE_PROMPTS[normalized_practice]}"
        f"\n\n{source_instruction}\n{path_instruction}"
    )


_LEARNING_BLOCK = re.compile(
    r"```studypilot-learning\s*(\{.*?\})\s*```",
    re.IGNORECASE | re.DOTALL,
)
_ANY_LEARNING_BLOCK = re.compile(
    r"```studypilot-learning\b.*?```",
    re.IGNORECASE | re.DOTALL,
)
_JSON_BLOCK = re.compile(
    r"```json\s*(\{.*?\})\s*```",
    re.IGNORECASE | re.DOTALL,
)
_ANY_JSON_BLOCK = re.compile(
    r"```json\b.*?```",
    re.IGNORECASE | re.DOTALL,
)
_VALID_FEEDBACK = {"simpler", "another_example", "understood", "confused"}


def _clean_string(value: Any, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.split()).strip()[:limit]


def _clean_text(value: Any, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    text = value.replace("\r\n", "\n").replace("\r", "\n").strip()
    text = re.sub(r"[^\S\n]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text[:limit].strip()


def _concept_key(value: str) -> str:
    return "".join(value.split()).casefold()


def _sanitize_learning_path(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    subject = _clean_string(value.get("subject"), 160)
    goal = _clean_text(value.get("goal"), 1200)
    raw_stages = value.get("stages")
    if not subject or not goal or not isinstance(raw_stages, list) or not raw_stages:
        return None
    stages: list[dict[str, Any]] = []
    for raw_stage in raw_stages[:8]:
        if not isinstance(raw_stage, dict):
            return None
        title = _clean_string(raw_stage.get("title"), 120)
        objective = _clean_text(raw_stage.get("objective"), 600)
        raw_concepts = raw_stage.get("concepts")
        if not title or not objective or not isinstance(raw_concepts, list):
            return None
        concepts = [
            concept
            for concept in (
                _clean_string(item, 120) for item in raw_concepts[:12]
            )
            if concept
        ]
        if not concepts:
            return None
        stages.append(
            {
                "title": title,
                "objective": objective,
                "concepts": concepts,
            }
        )
    return {"subject": subject, "goal": goal, "stages": stages}


def _sanitize_practice(
    raw_practice: dict[str, Any],
    concept: str,
) -> dict[str, Any] | None:
    practice_concept = _clean_string(raw_practice.get("concept"), 160)
    question = _clean_text(raw_practice.get("question"), 1200)
    reference_answer = _clean_text(
        raw_practice.get("reference_answer"),
        4000,
    )
    if (
        not practice_concept
        or not question
        or not reference_answer
        or _concept_key(practice_concept) != _concept_key(concept)
    ):
        return None
    raw_type = raw_practice.get("type")
    if raw_type is None:
        return {
            "concept": concept,
            "question": question,
            "reference_answer": reference_answer,
        }
    practice_type = _clean_string(raw_type, 32).lower()
    raw_options = raw_practice.get("options", [])
    correct_option = _clean_string(
        raw_practice.get("correct_option"),
        8,
    ).upper()
    if practice_type == "multiple_choice":
        if not isinstance(raw_options, list) or len(raw_options) != 4:
            return None
        options: list[dict[str, str]] = []
        for expected_id, raw_option in zip(("A", "B", "C", "D"), raw_options):
            if not isinstance(raw_option, dict):
                return None
            option_id = _clean_string(raw_option.get("id"), 4).upper()
            option_text = _clean_text(raw_option.get("text"), 600)
            if option_id != expected_id or not option_text:
                return None
            options.append({"id": option_id, "text": option_text})
        if correct_option not in {"A", "B", "C", "D"}:
            return None
        return {
            "concept": concept,
            "type": practice_type,
            "question": question,
            "options": options,
            "correct_option": correct_option,
            "reference_answer": reference_answer,
        }
    if practice_type == "open":
        if raw_options not in (None, []) or correct_option:
            return None
        return {
            "concept": concept,
            "type": practice_type,
            "question": question,
            "options": [],
            "correct_option": "",
            "reference_answer": reference_answer,
        }
    return None


def _sanitize_card(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    response_mode = _clean_string(value.get("response_mode"), 40).lower()
    if response_mode == "conversation":
        thread_title = _clean_string(value.get("thread_title"), 120)
        direct_answer = _clean_text(value.get("direct_answer"), 12000)
        if not direct_answer:
            return None
        result = {
            "response_mode": "conversation",
            "direct_answer": direct_answer,
        }
        if thread_title:
            result["thread_title"] = thread_title
        return result
    if response_mode not in {"", "lesson"}:
        return None
    concept = _clean_string(value.get("concept"), 160)
    direct_answer = _clean_text(value.get("direct_answer"), 3000)
    explanation = _clean_text(value.get("explanation"), 10000)
    raw_example = value.get("example")
    raw_practice = value.get("practice")
    if not isinstance(raw_example, dict):
        return None
    if not isinstance(raw_practice, dict):
        # Compatible providers sometimes close the example object one level too
        # late and place an otherwise complete practice card inside it. Recover
        # only this single, unambiguous structural slip; field validation below
        # still enforces matching concepts, option shape, and answer integrity.
        raw_practice = raw_example.get("practice")
    if not isinstance(raw_practice, dict):
        return None

    example_concept = _clean_string(raw_example.get("concept"), 160)
    scenario = _clean_text(raw_example.get("scenario"), 3000)
    analysis = _clean_text(raw_example.get("analysis"), 4000)
    required = (
        concept,
        direct_answer,
        explanation,
        example_concept,
        scenario,
        analysis,
    )
    if not all(required):
        return None
    concept_key = _concept_key(concept)
    if _concept_key(example_concept) != concept_key:
        return None
    practice = _sanitize_practice(raw_practice, concept)
    if practice is None:
        return None

    card: dict[str, Any] = {
        "concept": concept,
        "direct_answer": direct_answer,
        "explanation": explanation,
        "example": {
            "concept": concept,
            "scenario": scenario,
            "analysis": analysis,
        },
        "practice": practice,
    }
    thread_title = _clean_string(value.get("thread_title"), 120)
    if thread_title:
        card["thread_title"] = thread_title
    if "learning_path" in value:
        learning_path = _sanitize_learning_path(value.get("learning_path"))
        if learning_path is None:
            return None
        card["learning_path"] = learning_path
    return card



def _trailing_learning_card(raw: str) -> dict[str, Any] | None:
    """Accept a complete schema-valid object after provider mode commentary."""
    decoder = json.JSONDecoder()
    for match in re.finditer(r"\{", raw):
        candidate = raw[match.start():]
        try:
            payload, consumed = decoder.raw_decode(candidate)
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        if candidate[consumed:].strip():
            continue
        card = _sanitize_card(payload)
        if card is not None:
            return card
    return None



def _decode_learning_payload(payload_text: str) -> dict[str, Any] | None:
    """Decode a provider payload while tolerating only surplus root closers."""
    stripped = str(payload_text or "").strip()
    if not stripped:
        return None
    try:
        payload = json.loads(stripped)
    except (TypeError, ValueError, json.JSONDecodeError):
        try:
            payload, consumed = json.JSONDecoder().raw_decode(stripped)
        except (TypeError, ValueError, json.JSONDecodeError):
            return None
        trailing = stripped[consumed:].strip()
        if not trailing or re.fullmatch(r"[}\]]+", trailing) is None:
            return None
    return payload if isinstance(payload, dict) else None



def parse_learning_response(answer: str) -> tuple[str, dict[str, Any] | None]:
    """Remove the private protocol block and return a coherent bounded card."""
    raw = (answer or "").strip()
    matches = list(_LEARNING_BLOCK.finditer(raw))
    visible = _ANY_LEARNING_BLOCK.sub("", raw).strip()
    fenced_protocol = bool(matches)
    payload_text = ""
    bare_protocol = False
    if len(matches) == 1:
        payload_text = matches[0].group(1)
    elif len(matches) > 1:
        # Multiple private payloads are never ordinary conversation text.
        return "", None
    else:
        generic_matches = list(_JSON_BLOCK.finditer(raw))
        if len(generic_matches) == 1:
            payload_text = generic_matches[0].group(1)
            visible = _ANY_JSON_BLOCK.sub("", raw).strip()
            fenced_protocol = True
        elif len(generic_matches) > 1:
            return "", None
    if payload_text:
        pass
    elif raw.startswith("{"):
        # Compatible models commonly omit the requested fence. Accept a complete
        # bare object, but keep malformed/truncated JSON on the repair path.
        payload_text = raw
        bare_protocol = True
    elif re.search(r"```studypilot-learning\b", raw, re.IGNORECASE):
        # An unfinished private block must not leak into the visible transcript.
        return "", None
    else:
        trailing_card = _trailing_learning_card(raw)
        if trailing_card is not None:
            return "", trailing_card
        return visible, None
    payload = _decode_learning_payload(payload_text)
    if payload is None:
        return (visible if fenced_protocol else ""), None
    return ("" if bare_protocol else visible), _sanitize_card(payload)


def learning_response_is_lesson_draft(answer: str) -> bool:
    """Detect provider reasoning that explicitly chose lesson mode but omitted the card."""
    normalized = (answer or "").casefold()
    return bool(
        re.search(
            r"(?:^|[^a-z0-9])(?:response_)?mode\s*(?:=|:|是)\s*['\"]?lesson\b",
            normalized,
        )
    )


def requested_learning_topic(question: str) -> str | None:
    """Read the explicit subject from the learning-start prompt."""
    raw = str(question or "").strip()
    match = re.search(r'[“"]([^”"]{1,80})[”"]', raw)
    if match:
        topic = _clean_string(match.group(1), 80)
        return topic or None
    if re.match(
        r"^(?:继续|接着|下一(?:个|课)|我的(?:答案|回答)|我懂了|还没懂|再简单|换个例子)",
        raw,
        re.IGNORECASE,
    ):
        return None
    prefixed = re.match(
        r"^(?:我想(?:要)?学习|学习主题(?:是|为)?|主题(?:是|为)?|请(?:给我)?(?:讲解|教我|介绍))"
        r"[：:\s]*([^，。！？!?\n]{1,80})",
        raw,

        re.IGNORECASE,
    )
    if prefixed:
        topic = _clean_string(prefixed.group(1), 80)
        return topic or None
    english = re.match(
        r"^(?:teach\s+me|explain|introduce)\s+(.+?)(?:[.!?]|$)",
        raw,
        re.IGNORECASE,
    )
    if english:
        topic = _clean_string(english.group(1), 80)
        return topic or None
    topic = _clean_string(raw, 80) if 0 < len(raw) <= 40 and not re.search(r"[，。！？!?]", raw) else ""
    return topic or None


def _topic_key(value: str) -> str:
    return "".join(
        character.casefold()
        for character in value
        if character.isalnum() or "\u3400" <= character <= "\u9fff"
    )


_GENERIC_TOPIC_WORDS = (
    "零基础", "基础", "入门", "教程", "概论", "概述", "课程", "学习",
    "解析", "认识", "理解", "introduction", "intro", "basics", "course",
)


def _topic_core(value: str) -> str:
    normalized = _topic_key(value)
    for word in _GENERIC_TOPIC_WORDS:
        normalized = normalized.replace(_topic_key(word), "")
    return normalized


def _topic_keys_match(expected_value: str, actual_value: str) -> bool:
    expected = _topic_core(expected_value)
    actual = _topic_core(actual_value)
    if not expected or not actual:
        return False
    if expected in actual or actual in expected:
        return True
    # A course request may deliberately name a compound scope while each turn
    # teaches only one knowledge point (for example “命题逻辑与真值表” -> “命题”).
    # Accept a substantial named branch that is actually present in the card,
    # while keeping unrelated subjects and one-character conjunction fragments out.
    raw_parts = re.split(r"(?:与|和|及|、|/|／|&|\+)", str(expected_value or ""))
    if len(raw_parts) > 1:
        compound_parts = [_topic_core(part) for part in raw_parts]
        if any(
            len(part) >= 3 and part in actual
            for part in compound_parts
            if part
        ):
            return True
    # Models often normalize a user's colloquial Chinese term (for example
    # “二进制搜索树”) to the accepted term (“二叉搜索树”). Accept a small edit
    # inside a compact subject phrase, while short or unrelated subjects still
    # require an exact match. Comparing bounded windows avoids a long answer
    # passing merely because it shares generic characters somewhere.
    if len(expected) < 4 or not any("\u3400" <= char <= "\u9fff" for char in expected):
        return False
    minimum = max(2, len(expected) - 3)
    maximum = min(len(actual), len(expected) + 3)
    for width in range(minimum, maximum + 1):
        for start in range(0, len(actual) - width + 1):
            candidate = actual[start : start + width]
            matcher = SequenceMatcher(None, expected, candidate, autojunk=False)
            longest = matcher.find_longest_match(0, len(expected), 0, len(candidate)).size
            if longest >= 3 and matcher.ratio() >= 0.62:
                return True
    return False


def learning_card_matches_topic(
    card: dict[str, Any] | None,
    topic: str | None,
    *,
    require_path: bool = False,
) -> bool:
    if not isinstance(card, dict):
        return False
    learning_path = card.get("learning_path")
    if require_path and not isinstance(learning_path, dict):
        return False
    if not topic:
        return True
    if not isinstance(learning_path, dict):
        candidates = [
            str(card.get(key) or "")
            for key in ("thread_title", "concept", "direct_answer", "explanation")
        ]
        return any(_topic_keys_match(topic, candidate) for candidate in candidates)
    return _topic_keys_match(topic, str(learning_path.get("subject") or ""))


def learning_repair_prompt(
    question: str,
    answer: str,
    *,
    topic: str | None,
    practice_type: str,
    require_path: bool,
) -> str:
    requested_subject = topic or "用户当前正在学习的主题"
    path_rule = (
        "系统已提供课程学习路线，沿路线修复本轮卡片，但不要重复输出 learning_path。"
        if require_path
        else "不得创建或输出 learning_path；课程路线只能通过“生成学习计划”功能建立。"
    )
    clipped_answer = (answer or "")[-12000:]
    return f"""上一份学习内容没有通过 StudyPilot 结构校验。请修复，不要解释失败原因。

用户本轮请求：
{question}

必须满足：
1. 学习主题是“{requested_subject}”，不得改成其他学科或语言课程。
2. {path_rule}
3. practice.type 必须是 {practice_type}。
4. concept、example.concept、practice.concept 必须逐字相同。
5. 选择题必须恰好包含 A、B、C、D；开放题的 options 必须为空数组。
6. 回复必须且只能包含一个 ```studypilot-learning JSON 代码块，不得在代码块外补充正文。

待修复的上一份输出：
{clipped_answer or "（模型未返回任何内容）"}"""


def next_learning_state(
    previous: dict[str, Any] | None,
    card: dict[str, Any] | None,
    feedback_kind: str | None,
) -> dict[str, Any]:
    state = dict(previous or {})
    lesson_index = max(0, int(state.get("lesson_index") or 0))
    completed = [
        _clean_string(item, 160)
        for item in state.get("completed_concepts", [])
        if _clean_string(item, 160)
    ][:200]
    if card:
        lesson_index += 1
        concept = str(card.get("concept") or "")
        state["current_concept"] = concept
        if concept and concept not in completed:
            completed.append(concept)
        if isinstance(card.get("learning_path"), dict):
            state["learning_path"] = card["learning_path"]
    state["lesson_index"] = lesson_index
    state["completed_concepts"] = completed
    if feedback_kind in _VALID_FEEDBACK:
        state["last_feedback"] = feedback_kind
    else:
        state["last_feedback"] = str(state.get("last_feedback") or "")
    return state
