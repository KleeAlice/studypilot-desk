from backend.app.db import Database
from backend.app.services.agent import AgentService


def test_provider_model_update_synchronizes_every_thread_for_that_provider(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()
    service = AgentService(database)
    with database.connect() as connection:
        course_id = int(connection.execute("SELECT MIN(id) FROM courses").fetchone()[0])

    service.configure_provider(
        "deepseek",
        {
            "label": "DeepSeek",
            "protocol": "openai_compatible",
            "base_url": "http://provider.test/v1",
            "model": "broken-default",
            "api_key": "secret",
        },
    )
    following = service.create_thread(course_id, {"provider_id": "deepseek"})
    custom = service.create_thread(
        course_id,
        {"provider_id": "deepseek", "model": "manually-selected-model"},
    )
    service.update_thread(following["id"], {"model": "broken-default"})

    service.configure_provider("deepseek", {"model": "working-default"})

    assert service.get_thread(following["id"], include_messages=False)["model"] == "working-default"
    assert service.get_thread(custom["id"], include_messages=False)["model"] == "working-default"


def test_database_initialization_repairs_stale_models_after_provider_switches(tmp_path) -> None:
    database = Database(tmp_path / "app.db")
    database.initialize()
    service = AgentService(database)
    with database.connect() as connection:
        course_id = int(connection.execute("SELECT MIN(id) FROM courses").fetchone()[0])
    service.configure_provider(
        "flash",
        {
            "label": "DeepSeek V4 Flash",
            "protocol": "anthropic",
            "base_url": "https://api.deepseek.com/anthropic",
            "model": "DeepSeek-V4-Flash",
            "api_key": "secret",
        },
    )
    thread = service.create_thread(course_id, {"provider_id": "flash"})
    with database.connect() as connection:
        connection.execute(
            "UPDATE agent_threads SET model = 'deepseek-v3' WHERE id = ?",
            (thread["id"],),
        )

    database.initialize()

    with database.connect() as connection:
        repaired = connection.execute(
            "SELECT provider_id, model FROM agent_threads WHERE id = ?",
            (thread["id"],),
        ).fetchone()
    assert tuple(repaired) == ("flash", "DeepSeek-V4-Flash")
