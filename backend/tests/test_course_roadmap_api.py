from __future__ import annotations

import json

from fastapi.testclient import TestClient

from backend.app.main import create_app


def roadmap_answer() -> str:
    payload = {
        "title": "线性代数两周路线",
        "summary": "依据课程目标先打基础再完成应用。",
        "goal": "能使用向量和矩阵解决基础线性问题。",
        "phases": [
            {
                "title": "向量基础",
                "objective": "掌握向量与线性组合。",
                "start_week": 1,
                "end_week": 1,
                "acceptance": "独立完成一组向量运算。",
                "remediation": "用二维图形重新解释并练习。",
                "weeks": [{
                    "week": 1,
                    "foundation": "向量与线性组合",
                    "tasks": ["完成基础运算练习"],
                    "deliverables": ["一页概念总结"],
                }],
            },
            {
                "title": "矩阵应用",
                "objective": "使用矩阵表达线性变换。",
                "start_week": 2,
                "end_week": 2,
                "acceptance": "构造并解释一个变换矩阵。",
                "remediation": "回到基向量逐列检查。",
                "weeks": [{
                    "week": 2,
                    "foundation": "矩阵与线性变换",
                    "tasks": ["实现二维旋转矩阵"],
                    "deliverables": ["代码与文字解释"],
                }],
            },
        ],
    }
    return "```studypilot-roadmap\n" + json.dumps(payload, ensure_ascii=False) + "\n```"


class SequenceGateway:
    def __init__(self, *answers: str) -> None:
        self.answers = list(answers)
        self.calls = []

    def complete(self, provider, messages):
        self.calls.append((provider, messages))
        if len(self.answers) > 1:
            return self.answers.pop(0)
        return self.answers[0]


def configure(client: TestClient) -> None:
    response = client.put(
        "/api/agent/providers/openai",
        json={
            "label": "OpenAI",
            "protocol": "openai_compatible",
            "base_url": "https://api.openai.com/v1",
            "model": "roadmap-model",
            "api_key": "secret",
        },
    )
    assert response.status_code == 200


def create_course(client: TestClient, title: str = "线性代数") -> int:
    response = client.post("/api/courses", json={"title": title})
    assert response.status_code == 201
    return int(response.json()["data"]["id"])


def request_payload() -> dict:
    return {
        "provider_id": "openai",
        "start_date": "2026-08-01",
        "target_weeks": 2,
        "weekly_hours": 4,
        "planning_goal": "以通过考研线性代数为目标，覆盖矩阵、特征值与二次型。",
        "document_ids": [],
    }


def test_generates_and_reads_one_canonical_course_roadmap(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        configure(client)
        course_id = create_course(client)
        gateway = SequenceGateway(roadmap_answer())
        client.app.state.agent.gateway = gateway

        generated = client.post(
            f"/api/courses/{course_id}/roadmap/generate",
            json=request_payload(),
        )
        reopened = client.get(f"/api/courses/{course_id}/roadmap")

    assert generated.status_code == 200
    result = generated.json()["data"]
    assert result["trace"]["schema"] == "studypilot-roadmap/v1"
    assert result["roadmap"]["weeks"][1]["week"] == 2
    assert reopened.status_code == 200
    assert reopened.json()["data"]["weeks"] == result["roadmap"]["weeks"]
    assert reopened.json()["data"]["generation"]["status"] == "completed"
    assert "线性代数" in gateway.calls[0][1][1]["content"]
    assert request_payload()["planning_goal"] in gateway.calls[0][1][0]["content"]
    assert reopened.json()["data"]["generation"]["request"]["planning_goal"] == request_payload()["planning_goal"]


def test_invalid_regeneration_preserves_the_previous_route(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        configure(client)
        course_id = create_course(client)
        client.app.state.agent.gateway = SequenceGateway(roadmap_answer())
        assert client.post(
            f"/api/courses/{course_id}/roadmap/generate",
            json=request_payload(),
        ).status_code == 200
        before = client.get(f"/api/courses/{course_id}/roadmap").json()["data"]

        client.app.state.agent.gateway = SequenceGateway("bad", "still bad")
        failed = client.post(
            f"/api/courses/{course_id}/roadmap/generate",
            json=request_payload(),
        )
        after = client.get(f"/api/courses/{course_id}/roadmap").json()["data"]

    assert failed.status_code == 502
    assert after["weeks"] == before["weeks"]
    assert after["generation"]["status"] == "failed"
