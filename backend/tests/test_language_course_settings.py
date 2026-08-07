from fastapi.testclient import TestClient

from backend.app.main import create_app


def test_language_course_settings_are_editable_and_persisted(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        course = client.post(
            "/api/courses",
            json={
                "title": "My Japanese",
                "course_type": "language",
                "target_language_tag": "ja-JP",
                "pronunciation_scheme": "kana",
            },
        ).json()["data"]
        updated = client.patch(
            f"/api/courses/{course['id']}",
            json={
                "proficiency_level": "elementary",
                "daily_word_goal": 16,
                "lesson_minutes": 20,
                "speech_rate": 0.85,
                "auto_play_audio": True,
                "pronunciation_scheme": "kana",
                "romanization_enabled": True,
                "training_focus": ["listening", "speaking"],
            },
        )
        courses = client.get("/api/courses").json()["data"]

    assert updated.status_code == 200, updated.text
    saved = next(item for item in courses if item["id"] == course["id"])
    assert saved["proficiency_level"] == "elementary"
    assert saved["daily_word_goal"] == 16
    assert saved["lesson_minutes"] == 20
    assert saved["speech_rate"] == 0.85
    assert saved["auto_play_audio"] is True
    assert saved["romanization_enabled"] is True
    assert saved["training_focus"] == ["listening", "speaking"]
