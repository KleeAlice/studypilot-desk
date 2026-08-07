from fastapi.testclient import TestClient
import json

from backend.app.main import create_app


class FakeGateway:
    def __init__(self) -> None:
        self.calls = []

    def complete(self, provider, messages):
        self.calls.append((provider, messages))
        return "API grounded answer"


def test_new_install_has_no_placeholder_models_and_persists_selected_icon(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        initial = client.get("/api/agent/providers")
        saved = client.put(
            "/api/agent/providers/my-deepseek",
            json={
                "label": "我的 DeepSeek",
                "icon": "deepseek",
                "protocol": "openai_compatible",
                "base_url": "https://api.deepseek.com/v1",
                "model": "deepseek-chat",
                "api_key": "write-only-secret",
            },
        )
        reopened = client.get("/api/agent/providers")

    assert initial.status_code == 200
    assert initial.json()["data"] == []
    assert saved.status_code == 200
    assert saved.json()["data"]["icon"] == "deepseek"
    assert reopened.json()["data"] == [saved.json()["data"]]


def test_agent_api_masks_provider_secret_and_tests_connection(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        gateway = FakeGateway()
        client.app.state.agent.gateway = gateway
        saved = client.put(
            "/api/agent/providers/openai",
            json={
                "label": "OpenAI",
                "protocol": "openai_compatible",
                "base_url": "https://api.openai.com/v1",
                "model": "gpt-5.6-terra",
                "api_key": "write-only-secret",
                "max_output_tokens": 100000,
                "enabled": True,
            },
        )
        providers = client.get("/api/agent/providers")
        tested = client.post("/api/agent/providers/openai/test")

    openai = next(item for item in providers.json()["data"] if item["id"] == "openai")
    assert saved.status_code == 200
    assert saved.json()["data"]["has_api_key"] is True
    assert "api_key" not in saved.json()["data"]
    assert "write-only-secret" not in providers.text
    assert openai["has_api_key"] is True
    assert openai["max_output_tokens"] == 100000
    assert gateway.calls[0][0].max_output_tokens == 100000
    assert tested.status_code == 200
    assert tested.json()["data"]["reply"] == "API grounded answer"


def test_agent_provider_delete_survives_restart_and_put_restores_it(tmp_path) -> None:
    payload = {
        "label": "OpenAI renamed",
        "protocol": "openai_compatible",
        "base_url": "https://api.openai.com/v1",
        "model": "gpt-5.6-terra",
        "api_key": "secret",
    }
    with TestClient(create_app(data_dir=tmp_path)) as client:
        assert client.put("/api/agent/providers/openai", json=payload).status_code == 200
        deleted = client.delete("/api/agent/providers/openai")
        assert deleted.status_code == 204
        assert all(
            item["id"] != "openai"
            for item in client.get("/api/agent/providers").json()["data"]
        )

    with TestClient(create_app(data_dir=tmp_path)) as client:
        assert all(
            item["id"] != "openai"
            for item in client.get("/api/agent/providers").json()["data"]
        )
        restored = client.put("/api/agent/providers/openai", json=payload)
        assert restored.status_code == 200
        assert restored.json()["data"]["label"] == "OpenAI renamed"


def test_agent_threads_and_messages_are_saved_across_requests(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        client.app.state.agent.gateway = FakeGateway()
        course_id = client.get("/api/settings/active-course").json()["data"]["course_id"]
        client.put(
            "/api/agent/providers/openai",
            json={
                "label": "OpenAI",
                "protocol": "openai_compatible",
                "base_url": "https://api.openai.com/v1",
                "model": "gpt-5.6-terra",
                "api_key": "secret",
            },
        )
        created = client.post(
            "/api/agent/threads",
            json={"course_id": course_id, "provider_id": "openai"},
        )
        thread_id = created.json()["data"]["id"]
        replied = client.post(
            f"/api/agent/threads/{thread_id}/messages",
            json={
                "message": "Explain my current course",
                "provider_id": "openai",
                "context": {
                    "document_ids": [],
                    "selected_document_ids": [],
                    "include_current": False,
                    "include_notes": False,
                    "include_knowledge": False,
                    "include_library": False,
                },
            },
        )
        reopened = client.get(f"/api/agent/threads/{thread_id}")
        listed = client.get(f"/api/agent/threads?course_id={course_id}")
        renamed = client.patch(
            f"/api/agent/threads/{thread_id}", json={"title": "Optimization review"}
        )
        deleted = client.delete(f"/api/agent/threads/{thread_id}")
        after_delete = client.get(f"/api/agent/threads?course_id={course_id}")

    assert created.status_code == 201
    assert replied.status_code == 201
    assert replied.json()["data"]["message"]["content"] == "API grounded answer"
    assert [item["role"] for item in reopened.json()["data"]["messages"]] == [
        "user",
        "assistant",
    ]
    assert listed.json()["data"][0]["message_count"] == 2
    assert renamed.json()["data"]["title"] == "Optimization review"
    assert deleted.status_code == 204
    assert after_delete.json()["data"] == []


def test_agent_message_validation_rejects_unbounded_or_unknown_input(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        course_id = client.get("/api/settings/active-course").json()["data"]["course_id"]
        thread = client.post(
            "/api/agent/threads", json={"course_id": course_id}
        ).json()["data"]
        invalid = client.post(
            f"/api/agent/threads/{thread['id']}/messages",
            json={"message": "", "surprise": "not allowed"},
        )

    assert invalid.status_code == 422


def test_agent_action_plan_api_confirms_cancels_and_undoes(tmp_path) -> None:
    class PlanGateway:
        def complete(self, _provider, _messages):
            return (
                "请确认下面的画布计划。\n```studypilot-plan\n"
                + json.dumps(
                    {
                        "title": "Create branch",
                        "summary": "One node",
                        "operations": [
                            {
                                "type": "create_knowledge_node",
                                "notebook_id": notebook_id,
                                "temp_id": "api-node",
                                "title": "API 节点",
                            }
                        ],
                    },
                    ensure_ascii=False,
                )
                + "\n```"
            )

    with TestClient(create_app(data_dir=tmp_path)) as client:
        course_id = client.get("/api/settings/active-course").json()["data"]["course_id"]
        with client.app.state.database.connect() as connection:
            notebook_id = int(
                connection.execute(
                    "SELECT MIN(id) FROM knowledge_notebooks WHERE course_id = ?",
                    (course_id,),
                ).fetchone()[0]
            )
        client.app.state.agent.gateway = PlanGateway()
        client.put(
            "/api/agent/providers/openai",
            json={
                "label": "OpenAI",
                "protocol": "openai_compatible",
                "base_url": "https://api.openai.com/v1",
                "model": "gpt-5.6-terra",
                "api_key": "secret",
            },
        )
        thread = client.post(
            "/api/agent/threads",
            json={"course_id": course_id, "provider_id": "openai"},
        ).json()["data"]
        reply = client.post(
            f"/api/agent/threads/{thread['id']}/messages",
            json={
                "message": "制作一个分支",
                "context": {"notebook_id": notebook_id, "include_knowledge": True},
            },
        )
        plan = reply.json()["data"]["message"]["action_plan"]

        confirmed = client.post(f"/api/agent/action-plans/{plan['id']}/confirm")
        repeated = client.post(f"/api/agent/action-plans/{plan['id']}/confirm")
        undone = client.post(f"/api/agent/action-plans/{plan['id']}/undo")

        with client.app.state.database.connect() as connection:
            assistant_id = int(
                connection.execute(
                    "INSERT INTO agent_messages(thread_id, role, content) VALUES (?, 'assistant', 'Cancel')",
                    (thread["id"],),
                ).lastrowid
            )
        pending = client.app.state.agent.actions.create_plan(
            thread["id"],
            assistant_id,
            course_id,
            {
                "title": "Cancel me",
                "summary": "No mutation",
                "operations": [
                    {
                        "type": "create_knowledge_node",
                        "notebook_id": notebook_id,
                        "temp_id": "cancel-api",
                        "title": "Never created",
                    }
                ],
            },
        )
        cancelled = client.post(
            f"/api/agent/action-plans/{pending['id']}/cancel"
        )

    assert confirmed.status_code == 200
    assert confirmed.json()["data"]["status"] == "completed"
    assert repeated.status_code == 409
    assert undone.status_code == 200
    assert undone.json()["data"]["status"] == "undone"
    assert cancelled.status_code == 200
    assert cancelled.json()["data"]["status"] == "cancelled"

def test_agent_api_persists_zero_as_no_application_token_ceiling(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        saved = client.put(
            "/api/agent/providers/openai",
            json={
                "label": "OpenAI",
                "protocol": "openai_compatible",
                "base_url": "https://api.openai.com/v1",
                "model": "gpt-5.6-terra",
                "api_key": "write-only-secret",
                "max_output_tokens": 0,
                "enabled": True,
            },
        )
        providers = client.get("/api/agent/providers")

    assert saved.status_code == 200
    openai = next(
        item for item in providers.json()["data"] if item["id"] == "openai"
    )
    assert openai["max_output_tokens"] == 0
