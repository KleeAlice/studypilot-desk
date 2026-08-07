from fastapi.testclient import TestClient

from backend.app.main import create_app


def client_for(tmp_path) -> TestClient:
    return TestClient(create_app(data_dir=tmp_path))


def create_language_course(client: TestClient, tag: str = "en-US") -> dict:
    response = client.post(
        "/api/courses",
        json={
            "title": f"Language {tag}",
            "course_type": "language",
            "target_language_tag": tag,
            "daily_word_goal": 8,
            "pronunciation_scheme": "ipa",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def test_journey_starts_without_imports_and_seeds_builtin_vocabulary_once(
    tmp_path,
) -> None:
    with client_for(tmp_path) as client:
        course = create_language_course(client)
        journey = client.get(
            f"/api/courses/{course['id']}/language/journey"
        )
        assert journey.status_code == 200, journey.text
        before = journey.json()["data"]
        first_lesson = before["current_lesson"]

        first_start = client.post(
            f"/api/courses/{course['id']}/language/start"
        )
        second_start = client.post(
            f"/api/courses/{course['id']}/language/start"
        )
        vocabulary = client.get(
            f"/api/vocabulary?course_id={course['id']}&limit=200"
        )

    assert before["initialized"] is False
    assert before["total_lessons"] == 42
    assert len(before["stages"]) == 6
    assert first_lesson["phrases"]
    assert first_start.status_code == 200, first_start.text
    assert second_start.status_code == 200, second_start.text
    assert first_start.json()["data"]["initialized"] is True
    items = vocabulary.json()["data"]
    assert len(items) == len(first_lesson["phrases"])
    assert {item["source_kind"] for item in items} == {
        "builtin_language_pack"
    }
    assert {item["source_id"] for item in items} == {first_lesson["id"]}


def test_completing_a_lesson_persists_best_score_and_unlocks_the_next(
    tmp_path,
) -> None:
    with client_for(tmp_path) as client:
        course = create_language_course(client)
        started = client.post(
            f"/api/courses/{course['id']}/language/start"
        ).json()["data"]
        first_id = started["current_lesson"]["id"]

        completed = client.post(
            f"/api/courses/{course['id']}/language/lessons/{first_id}/complete",
            json={
                "score": 82,
                "duration_seconds": 240,
                "activity_results": [
                    {"activity": "listening", "result": "correct"},
                    {"activity": "speaking", "result": "self_reviewed"},
                    {"activity": "writing", "result": "self_reviewed"},
                ],
            },
        )
        repeated = client.post(
            f"/api/courses/{course['id']}/language/lessons/{first_id}/complete",
            json={
                "score": 71,
                "duration_seconds": 180,
                "activity_results": [],
            },
        )
        journey = client.get(
            f"/api/courses/{course['id']}/language/journey"
        ).json()["data"]

    assert completed.status_code == 200, completed.text
    assert repeated.status_code == 200, repeated.text
    progress = completed.json()["data"]["completed"]
    assert progress["lesson_id"] == first_id
    assert progress["status"] == "completed"
    assert repeated.json()["data"]["completed"]["best_score"] == 82
    assert repeated.json()["data"]["completed"]["attempts"] == 2
    assert journey["completed_lessons"] == 1
    assert journey["current_lesson"]["id"] != first_id
    assert journey["current_lesson"]["status"] == "current"


def test_journey_rejects_wrong_pack_lessons_and_knowledge_courses(
    tmp_path,
) -> None:
    with client_for(tmp_path) as client:
        english = create_language_course(client, "en-US")
        french = create_language_course(client, "fr-FR")
        french_lesson = client.get(
            f"/api/courses/{french['id']}/language/journey"
        ).json()["data"]["current_lesson"]["id"]
        wrong_lesson = client.get(
            f"/api/courses/{english['id']}/language/lessons/{french_lesson}"
        )
        knowledge = client.post(
            "/api/courses", json={"title": "Knowledge"}
        ).json()["data"]
        wrong_course = client.post(
            f"/api/courses/{knowledge['id']}/language/start"
        )

    assert wrong_lesson.status_code == 404
    assert wrong_lesson.json()["error"]["code"] == "LANGUAGE_LESSON_NOT_FOUND"
    assert wrong_course.status_code == 409
    assert wrong_course.json()["error"]["code"] == "LANGUAGE_COURSE_REQUIRED"


def mastery_payload(score: int = 92) -> dict:
    return {
        "score": score,
        "duration_seconds": 180,
        "activity_results": [
            {"activity": "listening", "result": "correct"},
            {"activity": "speaking", "result": "self_reviewed"},
            {"activity": "writing", "result": "self_reviewed"},
        ],
    }


def test_failed_mastery_stays_current_and_cannot_unlock_the_next_lesson(
    tmp_path,
) -> None:
    with client_for(tmp_path) as client:
        course = create_language_course(client)
        journey = client.post(
            f"/api/courses/{course['id']}/language/start"
        ).json()["data"]
        first = journey["current_lesson"]
        second = journey["stages"][0]["lessons"][1]

        failed = client.post(
            f"/api/courses/{course['id']}/language/lessons/{first['id']}/complete",
            json=mastery_payload(score=79),
        )
        after = client.get(
            f"/api/courses/{course['id']}/language/journey"
        ).json()["data"]
        bypass = client.post(
            f"/api/courses/{course['id']}/language/lessons/{second['id']}/complete",
            json=mastery_payload(),
        )

    assert failed.status_code == 200, failed.text
    assert failed.json()["data"]["mastered"] is False
    assert failed.json()["data"]["required_score"] == 80
    assert failed.json()["data"]["completed"]["status"] == "started"
    assert after["completed_lessons"] == 0
    assert after["current_lesson"]["id"] == first["id"]
    assert bypass.status_code == 409
    assert bypass.json()["error"]["code"] == "LANGUAGE_LESSON_LOCKED"


def test_spiral_unit_reuses_vocabulary_and_stage_checkpoint_requires_85(
    tmp_path,
) -> None:
    with client_for(tmp_path) as client:
        course = create_language_course(client)
        course_id = course["id"]
        for expected_order in range(1, 7):
            journey = client.post(
                f"/api/courses/{course_id}/language/start"
            ).json()["data"]
            lesson = journey["current_lesson"]
            assert lesson["order"] == expected_order
            assert lesson["lesson_type"] != "checkpoint"
            response = client.post(
                f"/api/courses/{course_id}/language/lessons/{lesson['id']}/complete",
                json=mastery_payload(),
            )
            assert response.json()["data"]["mastered"] is True

        checkpoint = client.post(
            f"/api/courses/{course_id}/language/start"
        ).json()["data"]["current_lesson"]
        vocabulary = client.get(
            f"/api/vocabulary?course_id={course_id}&limit=200"
        ).json()["data"]
        failed = client.post(
            f"/api/courses/{course_id}/language/lessons/{checkpoint['id']}/complete",
            json=mastery_payload(score=84),
        )
        passed = client.post(
            f"/api/courses/{course_id}/language/lessons/{checkpoint['id']}/complete",
            json=mastery_payload(score=85),
        )

    assert checkpoint["lesson_type"] == "checkpoint"
    assert checkpoint["mastery_threshold"] == 85
    assert len(vocabulary) == 6
    assert len({item["term"] for item in vocabulary}) == 6
    assert failed.json()["data"]["mastered"] is False
    assert failed.json()["data"]["journey"]["stages"][0]["status"] == "current"
    assert passed.json()["data"]["mastered"] is True
    assert passed.json()["data"]["journey"]["stages"][0]["status"] == "completed"
    assert passed.json()["data"]["journey"]["current_lesson"]["order"] == 8


def test_pack_v1_progress_is_carried_forward_to_the_stable_discover_lesson(
    tmp_path,
) -> None:
    with client_for(tmp_path) as client:
        course = create_language_course(client)
        course_id = course["id"]
        first = client.get(
            f"/api/courses/{course_id}/language/journey"
        ).json()["data"]["current_lesson"]
        database = client.app.state.database
        with database.connect() as connection:
            connection.execute(
                """INSERT INTO language_lesson_progress(
                    course_id, lesson_id, pack_version, status, best_score,
                    attempts, completed_at
                ) VALUES (?, ?, 1, 'completed', 91, 1, CURRENT_TIMESTAMP)""",
                (course_id, first["id"]),
            )

        migrated = client.get(
            f"/api/courses/{course_id}/language/journey"
        ).json()["data"]

    assert migrated["pack_version"] == 2
    assert migrated["completed_lessons"] == 1
    assert migrated["stages"][0]["lessons"][0]["status"] == "completed"
    assert migrated["current_lesson"]["lesson_type"] == "practice"
