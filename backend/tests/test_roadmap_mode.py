from __future__ import annotations

import json

from backend.app.services.roadmap_mode import parse_roadmap_response


def payload() -> dict:
    return {
        "title": "线性代数学习路线",
        "summary": "先建立向量直觉，再完成矩阵应用。",
        "goal": "能独立使用矩阵描述并求解线性问题。",
        "phases": [
            {
                "title": "向量基础",
                "objective": "理解向量与线性组合。",
                "start_week": 1,
                "end_week": 1,
                "acceptance": "能解释跨度并完成基础计算。",
                "remediation": "用二维几何例子重新练习。",
                "weeks": [
                    {
                        "week": 1,
                        "foundation": "向量与线性组合",
                        "tasks": ["完成向量运算练习"],
                        "deliverables": ["一页向量概念总结"],
                    }
                ],
            },
            {
                "title": "矩阵应用",
                "objective": "用矩阵表示线性变换。",
                "start_week": 2,
                "end_week": 2,
                "acceptance": "能构造并解释一个变换矩阵。",
                "remediation": "回到基向量逐列观察变换。",
                "weeks": [
                    {
                        "week": 2,
                        "foundation": "矩阵与线性变换",
                        "tasks": ["实现二维旋转矩阵"],
                        "deliverables": ["可运行示例与解释"],
                    }
                ],
            },
        ],
    }


def encode(value: dict) -> str:
    return "```studypilot-roadmap\n" + json.dumps(value, ensure_ascii=False) + "\n```"


def test_parses_a_complete_structured_roadmap() -> None:
    visible, roadmap = parse_roadmap_response(encode(payload()), target_weeks=2)

    assert visible == ""
    assert roadmap is not None
    assert roadmap["phases"][0]["phase"] == 1
    assert roadmap["phases"][1]["weeks"][0]["week"] == 2


def test_rejects_malformed_or_incomplete_protocol() -> None:
    assert parse_roadmap_response("not json", target_weeks=2)[1] is None
    broken = payload()
    broken["phases"][0]["weeks"][0]["tasks"] = []
    assert parse_roadmap_response(encode(broken), target_weeks=2)[1] is None


def test_rejects_duplicate_or_missing_weeks() -> None:
    duplicate = payload()
    duplicate["phases"][1]["weeks"][0]["week"] = 1
    assert parse_roadmap_response(encode(duplicate), target_weeks=2)[1] is None

    missing = payload()
    missing["phases"] = missing["phases"][:1]
    assert parse_roadmap_response(encode(missing), target_weeks=2)[1] is None


def test_rejects_non_contiguous_phase_ranges() -> None:
    broken = payload()
    broken["phases"][1]["start_week"] = 3
    broken["phases"][1]["end_week"] = 3
    assert parse_roadmap_response(encode(broken), target_weeks=2)[1] is None


def test_rejects_extra_visible_content() -> None:
    visible, roadmap = parse_roadmap_response(
        "这是额外内容\n" + encode(payload()),
        target_weeks=2,
    )
    assert visible == "这是额外内容"
    assert roadmap is None
