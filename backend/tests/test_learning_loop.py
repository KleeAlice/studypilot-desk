from datetime import date

from fastapi.testclient import TestClient

from backend.app.main import create_app


def create_knowledge(client: TestClient, title: str = "RRF") -> int:
    return client.post("/api/knowledge/nodes", json={"title": title}).json()["data"]["id"]


def test_evidence_updates_beta_binomial_mastery(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        knowledge_id = create_knowledge(client)
        updated = client.post(
            f"/api/mastery/{knowledge_id}/evidence",
            json={"success": True, "weight": 2.0, "source": "public_test"},
        )

    data = updated.json()["data"]
    assert updated.status_code == 200
    assert data["alpha"] == 3.0
    assert data["beta"] == 1.0
    assert data["mastery"] == 0.75


def test_quiz_grading_updates_mastery_and_creates_review(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        knowledge_id = create_knowledge(client, "混合检索")
        graded = client.post(
            "/api/quizzes/grade",
            json={
                "knowledge_id": knowledge_id,
                "prompt": "RRF 的作用是什么？",
                "answer": "融合多个检索排序结果",
                "expected_keywords": ["融合", "排序"],
            },
        )
        reviews = client.get("/api/reviews")

    result = graded.json()["data"]
    assert graded.status_code == 200
    assert result["correct"] is True
    assert result["mastery"] > 0.5
    assert len(reviews.json()["data"]) == 1
    assert date.fromisoformat(reviews.json()["data"][0]["due_date"]) > date.today()


def test_wrong_quiz_answer_records_error_reason_and_short_review(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        knowledge_id = create_knowledge(client, "BM25")
        graded = client.post(
            "/api/quizzes/grade",
            json={
                "knowledge_id": knowledge_id,
                "prompt": "BM25 属于哪类检索？",
                "answer": "向量检索",
                "expected_keywords": ["稀疏", "词项"],
            },
        )
        reviews = client.get("/api/reviews").json()["data"]

    assert graded.json()["data"]["correct"] is False
    assert "缺少关键词" in graded.json()["data"]["error_reason"]
    assert reviews[0]["interval_days"] == 1

