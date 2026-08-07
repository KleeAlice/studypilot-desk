from backend.app.db import Database
from backend.app.services.agent import AgentService


def test_language_course_prompt_contains_target_language_and_level(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()
    with database.connect() as connection:
        course_id = int(
            connection.execute(
                """INSERT INTO courses(
                    title, course_type, target_language_tag,
                    native_language_tag, proficiency_level
                ) VALUES ('My French', 'language', 'fr-FR', 'zh-CN', 'elementary')"""
            ).lastrowid
        )
    service = AgentService(database)
    thread = service.create_thread(course_id, {"mode": "learning"})

    messages = service._provider_messages(
        thread["id"], [], mode="learning"
    )

    prompt = messages[0]["content"]
    assert "fr-FR" in prompt
    assert "zh-CN" in prompt
    assert "elementary" in prompt
    assert "优先使用目标语言" in prompt
