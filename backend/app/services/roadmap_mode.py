from __future__ import annotations

import json
import re
from typing import Any


ROADMAP_SCHEMA = "studypilot-roadmap/v1"
_ROADMAP_BLOCK = re.compile(
    r"```studypilot-roadmap\s*(\{.*?\})\s*```",
    re.IGNORECASE | re.DOTALL,
)
_ANY_ROADMAP_BLOCK = re.compile(
    r"```studypilot-roadmap\b.*?```",
    re.IGNORECASE | re.DOTALL,
)


def roadmap_system_prompt(
    *,
    target_weeks: int,
    weekly_hours: float,
    planning_goal: str = "",
) -> str:
    normalized_goal = " ".join(str(planning_goal or "").split()).strip()
    goal_instruction = (
        f"用户最高优先级目标：{normalized_goal}\n"
        "路线的范围、阶段、任务和交付物必须首先满足这个目标；"
        "当资料内容与目标取舍冲突时，以用户目标为准，但不得编造资料事实。"
        if normalized_goal
        else "用户未填写额外目标；请根据课程、历史对话与所选资料合理确定范围。"
    )
    return f"""你是 StudyPilot 的课程规划师。请依据课程信息、历史对话与用户明确选择的资料，规划一条可执行、可验收的学习路线。

{goal_instruction}

规则：
1. 用户填写的计划目标或完成范围是最高优先级约束。
2. 总周期必须正好是 {target_weeks} 周，每周约投入 {weekly_hours:g} 小时。
3. 阶段必须从第 1 周连续覆盖到第 {target_weeks} 周，不得缺周、重周或越界。
4. 每周只设一个清晰主线，任务必须在当周投入内可完成，并给出至少一个可验证交付物。
5. acceptance 必须可验证；remediation 必须说明未通过时如何补救。
6. 历史对话反映用户已经学过、困惑或关注的内容；路线应避免无意义重复，并补齐先修缺口。
7. 只使用系统提供的资料，不得声称读取未选择的内容。

回复必须且只能包含一个 ```studypilot-roadmap JSON 代码块：
{{"title":"路线标题","summary":"规划依据与整体策略","goal":"完成路线后的可验证能力","phases":[{{"title":"阶段名称","objective":"阶段目标","start_week":1,"end_week":2,"acceptance":"通过标准","remediation":"补救方式","weeks":[{{"week":1,"foundation":"本周唯一主线","tasks":["可执行任务"],"deliverables":["可验证交付物"]}}]}}]}}
"""


def roadmap_repair_prompt(answer: str, *, target_weeks: int) -> str:
    clipped = (answer or "")[-16000:]
    return f"""上一份学习路线没有通过 StudyPilot 结构校验。请修复，不要解释失败原因。

必须满足：
1. 回复只能有一个 studypilot-roadmap JSON 代码块，代码块外不能有文字。
2. phases 从第 1 周连续覆盖到第 {target_weeks} 周。
3. weeks 必须恰好包含 1 到 {target_weeks}，每周只出现一次。
4. 每周至少包含一个 tasks 和一个 deliverables。
5. 每个阶段都包含 title、objective、acceptance、remediation。

待修复输出：
{clipped or "（模型未返回内容）"}"""


def _clean_line(value: Any, limit: int) -> str:
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


def _clean_list(value: Any, *, limit: int, item_limit: int) -> list[str] | None:
    if not isinstance(value, list):
        return None
    items = [
        cleaned
        for cleaned in (_clean_text(item, item_limit) for item in value[:limit])
        if cleaned
    ]
    return items or None


def _sanitize_week(value: Any, *, start: int, end: int) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    try:
        number = int(value.get("week"))
    except (TypeError, ValueError):
        return None
    if number < start or number > end:
        return None
    foundation = _clean_text(value.get("foundation"), 1000)
    tasks = _clean_list(value.get("tasks"), limit=8, item_limit=800)
    deliverables = _clean_list(
        value.get("deliverables"),
        limit=6,
        item_limit=800,
    )
    if not foundation or tasks is None or deliverables is None:
        return None
    return {
        "week": number,
        "foundation": foundation,
        "tasks": tasks,
        "deliverables": deliverables,
    }


def _sanitize_roadmap(value: Any, *, target_weeks: int) -> dict[str, Any] | None:
    if not isinstance(value, dict) or target_weeks < 1:
        return None
    title = _clean_line(value.get("title"), 160)
    summary = _clean_text(value.get("summary"), 2400)
    goal = _clean_text(value.get("goal"), 2000)
    raw_phases = value.get("phases")
    if (
        not title
        or not summary
        or not goal
        or not isinstance(raw_phases, list)
        or not raw_phases
    ):
        return None

    phases: list[dict[str, Any]] = []
    expected_start = 1
    seen_weeks: set[int] = set()
    for phase_number, raw_phase in enumerate(raw_phases[:12], start=1):
        if not isinstance(raw_phase, dict):
            return None
        try:
            start_week = int(raw_phase.get("start_week"))
            end_week = int(raw_phase.get("end_week"))
        except (TypeError, ValueError):
            return None
        if (
            start_week != expected_start
            or end_week < start_week
            or end_week > target_weeks
        ):
            return None
        phase_title = _clean_line(raw_phase.get("title"), 160)
        objective = _clean_text(raw_phase.get("objective"), 1200)
        acceptance = _clean_text(raw_phase.get("acceptance"), 1200)
        remediation = _clean_text(raw_phase.get("remediation"), 1200)
        raw_weeks = raw_phase.get("weeks")
        if (
            not phase_title
            or not objective
            or not acceptance
            or not remediation
            or not isinstance(raw_weeks, list)
            or len(raw_weeks) != end_week - start_week + 1
        ):
            return None
        weeks: list[dict[str, Any]] = []
        for raw_week in raw_weeks:
            week = _sanitize_week(raw_week, start=start_week, end=end_week)
            if week is None or week["week"] in seen_weeks:
                return None
            seen_weeks.add(week["week"])
            weeks.append(week)
        weeks.sort(key=lambda item: item["week"])
        if [item["week"] for item in weeks] != list(
            range(start_week, end_week + 1)
        ):
            return None
        phases.append(
            {
                "phase": phase_number,
                "title": phase_title,
                "objective": objective,
                "start_week": start_week,
                "end_week": end_week,
                "acceptance": acceptance,
                "remediation": remediation,
                "weeks": weeks,
            }
        )
        expected_start = end_week + 1

    if expected_start != target_weeks + 1:
        return None
    if seen_weeks != set(range(1, target_weeks + 1)):
        return None
    return {
        "schema": ROADMAP_SCHEMA,
        "title": title,
        "summary": summary,
        "goal": goal,
        "phases": phases,
    }


def parse_roadmap_response(
    answer: str,
    *,
    target_weeks: int,
) -> tuple[str, dict[str, Any] | None]:
    matches = list(_ROADMAP_BLOCK.finditer(answer or ""))
    visible = _ANY_ROADMAP_BLOCK.sub("", answer or "").strip()
    if len(matches) != 1 or visible:
        return visible, None
    try:
        payload = json.loads(matches[0].group(1))
    except (TypeError, ValueError, json.JSONDecodeError):
        return visible, None
    return visible, _sanitize_roadmap(payload, target_weeks=target_weeks)
