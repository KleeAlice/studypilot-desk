from datetime import date

from fastapi.testclient import TestClient

from backend.app.main import create_app


def client_for(tmp_path) -> TestClient:
    return TestClient(create_app(data_dir=tmp_path))


def create_language_course(client: TestClient, title: str = "English") -> dict:
    response = client.post(
        "/api/courses",
        json={
            "title": title,
            "course_type": "language",
            "target_language_tag": "en-US",
            "daily_word_goal": 12,
            "pronunciation_scheme": "ipa",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def add_word(client: TestClient, course_id: int, term: str) -> dict:
    response = client.post(
        "/api/vocabulary",
        json={
            "course_id": course_id,
            "language_tag": "en-US",
            "term": term,
            "pronunciation": f"/{term}/",
            "meaning": f"{term} meaning",
            "example": f"Example with {term}.",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def test_language_overview_uses_persisted_vocabulary_goal_and_streak(tmp_path) -> None:
    with client_for(tmp_path) as client:
        course = create_language_course(client)
        future_word = add_word(client, course["id"], "future")
        due_word = add_word(client, course["id"], "today")
        reviewed = client.post(
            f"/api/vocabulary/{future_word['id']}/review",
            json={"rating": "good"},
        )
        check_in = client.post(
            "/api/vocabulary/check-in",
            json={
                "course_id": course["id"],
                "local_date": date.today().isoformat(),
                "reviewed_count": 3,
            },
        )
        overview = client.get(f"/api/courses/{course['id']}/language/overview")

    assert reviewed.status_code == 200
    assert check_in.status_code == 200
    assert overview.status_code == 200
    data = overview.json()["data"]
    assert data["target_language_tag"] == "en-US"
    assert data["daily_word_goal"] == 12
    assert data["total_vocabulary"] == 2
    assert data["due_vocabulary"] == 1
    assert data["reviewed_today"] == 3
    assert data["streak_days"] == 1
    assert data["due_word"]["id"] == due_word["id"]
    assert data["practice_counts"] == {
        "reading": 0,
        "listening": 0,
        "speaking": 0,
        "writing": 0,
    }


def test_language_practice_sessions_are_persisted_and_course_isolated(tmp_path) -> None:
    with client_for(tmp_path) as client:
        course = create_language_course(client, "English")
        other = create_language_course(client, "French")
        word = add_word(client, course["id"], "spell")
        created = client.post(
            f"/api/courses/{course['id']}/language/practice",
            json={
                "practice_type": "writing",
                "vocabulary_item_id": word["id"],
                "prompt": "spell meaning",
                "answer": "spell",
                "result": "correct",
                "feedback": "拼写正确",
                "duration_seconds": 8,
            },
        )
        sessions = client.get(f"/api/courses/{course['id']}/language/sessions")
        isolated = client.get(f"/api/courses/{other['id']}/language/sessions")

    assert created.status_code == 201, created.text
    assert created.json()["data"]["practice_type"] == "writing"
    assert created.json()["data"]["vocabulary_item_id"] == word["id"]
    assert [item["id"] for item in sessions.json()["data"]] == [
        created.json()["data"]["id"]
    ]
    assert isolated.json()["data"] == []


def test_language_endpoints_reject_a_knowledge_course(tmp_path) -> None:
    with client_for(tmp_path) as client:
        course = client.post("/api/courses", json={"title": "Knowledge"}).json()["data"]
        response = client.get(f"/api/courses/{course['id']}/language/overview")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "LANGUAGE_COURSE_REQUIRED"
