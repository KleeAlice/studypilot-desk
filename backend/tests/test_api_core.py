import base64
from concurrent.futures import ThreadPoolExecutor
from threading import Event

from fastapi.testclient import TestClient

from backend.app.main import create_app


def client_for(tmp_path) -> TestClient:
    return TestClient(create_app(data_dir=tmp_path))


def test_health_and_default_course_are_available(tmp_path) -> None:
    with client_for(tmp_path) as client:
        health = client.get("/api/health")
        courses = client.get("/api/courses")

    assert health.status_code == 200
    assert health.json()["data"]["status"] == "ok"
    assert courses.status_code == 200
    assert courses.json()["data"][0]["title"] == "通用学习示例路线"


def test_document_parsing_does_not_block_health_requests(tmp_path, monkeypatch) -> None:
    parsing_started = Event()
    release_parsing = Event()
    with client_for(tmp_path) as client:
        service = client.app.state.documents
        original = service.import_bytes

        def slow_import(*args):
            parsing_started.set()
            assert release_parsing.wait(3)
            return original(*args)

        monkeypatch.setattr(service, "import_bytes", slow_import)
        with ThreadPoolExecutor(max_workers=2) as executor:
            import_request = executor.submit(
                client.post,
                "/api/documents/import",
                files={"file": ("slow.txt", b"slow parser", "text/plain")},
            )
            assert parsing_started.wait(1)
            health_request = executor.submit(client.get, "/api/health")
            try:
                health = health_request.result(timeout=0.5)
            finally:
                release_parsing.set()
            imported = import_request.result(timeout=3)

    assert health.status_code == 200
    assert imported.status_code == 201


def test_course_scoped_document_list_does_not_follow_the_active_course(tmp_path) -> None:
    with client_for(tmp_path) as client:
        first_course_id = client.get("/api/settings/active-course").json()["data"]["course_id"]
        first_import = client.post(
            "/api/documents/import",
            files={"file": ("first.md", b"# First course", "text/markdown")},
        )
        second_course = client.post(
            "/api/courses",
            json={"title": "Second course"},
        ).json()["data"]
        client.post(f"/api/courses/{second_course['id']}/activate")
        second_import = client.post(
            "/api/documents/import",
            files={"file": ("second.md", b"# Second course", "text/markdown")},
        )

        first_list = client.get(f"/api/courses/{first_course_id}/documents")
        second_list = client.get(f"/api/courses/{second_course['id']}/documents")

    assert first_import.status_code == 201
    assert second_import.status_code == 201
    assert [item["filename"] for item in first_list.json()["data"]] == ["first.md"]
    assert [item["filename"] for item in second_list.json()["data"]] == ["second.md"]


def test_course_can_be_created_and_switched(tmp_path) -> None:
    with client_for(tmp_path) as client:
        created = client.post("/api/courses", json={"title": "检索专项", "description": "8 周检索强化"})
        course_id = created.json()["data"]["id"]
        switched = client.post(f"/api/courses/{course_id}/activate")
        active = client.get("/api/settings/active-course")

    assert created.status_code == 201
    assert switched.status_code == 200
    assert active.json()["data"]["course_id"] == course_id

def test_course_creation_persists_knowledge_or_language_course_type(tmp_path) -> None:
    with client_for(tmp_path) as client:
        knowledge = client.post("/api/courses", json={"title": "普通学习"})
        language = client.post(
            "/api/courses",
            json={
                "title": "我的英语",
                "course_type": "language",
                "target_language_tag": "en-US",
                "native_language_tag": "zh-CN",
                "proficiency_level": "elementary",
                "daily_word_goal": 12,
                "pronunciation_scheme": "ipa",
                "romanization_enabled": False,
                "training_focus": [
                    "reading",
                    "listening",
                    "speaking",
                    "writing",
                ],
            },
        )
        invalid = client.post(
            "/api/courses",
            json={
                "title": "缺少目标语言",
                "course_type": "language",
                "target_language_tag": "",
            },
        )
        courses = client.get("/api/courses")

    assert knowledge.status_code == 201
    assert knowledge.json()["data"]["course_type"] == "knowledge"
    assert language.status_code == 201
    created = language.json()["data"]
    assert created["course_type"] == "language"
    assert created["target_language_tag"] == "en-US"
    assert created["proficiency_level"] == "elementary"
    assert created["daily_word_goal"] == 12
    assert created["pronunciation_scheme"] == "ipa"
    assert created["romanization_enabled"] is False
    assert created["training_focus"] == [
        "reading",
        "listening",
        "speaking",
        "writing",
    ]
    persisted = next(item for item in courses.json()["data"] if item["id"] == created["id"])
    assert persisted["target_language_tag"] == "en-US"
    assert invalid.status_code == 422


def test_course_can_be_renamed_and_recolored(tmp_path) -> None:
    with client_for(tmp_path) as client:
        created = client.post("/api/courses", json={"title": "Machine Learning"}).json()["data"]
        renamed = client.patch(
            f"/api/courses/{created['id']}",
            json={"title": "概率图模型"},
        )
        recolored = client.patch(
            f"/api/courses/{created['id']}",
            json={"cover_style": "moss"},
        )
        courses = client.get("/api/courses").json()["data"]
        blank = client.patch(
            f"/api/courses/{created['id']}",
            json={"title": "   "},
        )

    persisted = next(item for item in courses if item["id"] == created["id"])
    assert renamed.status_code == 200
    assert renamed.json()["data"]["title"] == "概率图模型"
    assert recolored.status_code == 200
    assert recolored.json()["data"]["cover_style"] == "moss"
    assert persisted["title"] == "概率图模型"
    assert persisted["cover_style"] == "moss"
    assert blank.status_code == 422


def test_course_list_includes_graph_counts_and_trash_activates_fallback(tmp_path) -> None:
    with client_for(tmp_path) as client:
        default_course = client.get("/api/settings/active-course").json()["data"][
            "course_id"
        ]
        first = client.post("/api/knowledge/nodes", json={"title": "First"}).json()[
            "data"
        ]
        second = client.post(
            "/api/knowledge/nodes", json={"title": "Second"}
        ).json()["data"]
        assert client.post(
            "/api/knowledge/edges",
            json={"source_id": first["id"], "target_id": second["id"]},
        ).status_code == 201
        other = client.post(
            "/api/courses", json={"title": "Delete me", "description": "Temporary"}
        ).json()["data"]
        assert client.post(f"/api/courses/{other['id']}/activate").status_code == 200

        courses = client.get("/api/courses")
        deleted = client.delete(f"/api/courses/{other['id']}")
        active = client.get("/api/settings/active-course")
        trashed = client.get("/api/courses/trash")

    by_id = {course["id"]: course for course in courses.json()["data"]}
    assert by_id[default_course]["node_count"] == 2
    assert by_id[default_course]["edge_count"] == 1
    assert by_id[other["id"]]["node_count"] == 0
    assert by_id[other["id"]]["edge_count"] == 0
    assert deleted.status_code == 200
    assert deleted.json()["data"]["deleted_id"] == other["id"]
    assert deleted.json()["data"]["active_course"]["id"] == default_course
    assert active.json()["data"]["course_id"] == default_course
    assert [item["id"] for item in trashed.json()["data"]] == [other["id"]]


def test_course_trash_keeps_images_and_permanent_delete_removes_them(tmp_path) -> None:
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )
    with client_for(tmp_path) as client:
        course = client.post("/api/courses", json={"title": "Disposable"}).json()[
            "data"
        ]
        client.post(f"/api/courses/{course['id']}/activate")
        uploaded = client.post(
            "/api/media/images",
            files={"file": ("temporary.png", png, "image/png")},
        )
        assert uploaded.status_code == 201
        stored_files = list((tmp_path / "media").iterdir())
        assert len(stored_files) == 1

        deleted = client.delete(f"/api/courses/{course['id']}")
        retained_files = list((tmp_path / "media").iterdir())
        purged = client.delete(f"/api/courses/{course['id']}/permanent")

    assert deleted.status_code == 200
    assert len(retained_files) == 1
    assert purged.status_code == 200
    assert list((tmp_path / "media").iterdir()) == []


def test_custom_wallpaper_is_persisted_served_and_cleared(tmp_path) -> None:
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )
    with client_for(tmp_path) as client:
        uploaded = client.post(
            "/api/settings/wallpaper",
            files={"file": ("study-wallpaper.png", png, "image/png")},
        )
        settings = client.get("/api/settings")
        image = client.get("/api/settings/wallpaper/image")
        cleared = client.delete("/api/settings/wallpaper")
        missing = client.get("/api/settings/wallpaper/image")

    assert uploaded.status_code == 201
    assert uploaded.json()["data"]["mode"] == "custom"
    assert uploaded.json()["data"]["revision"]
    assert settings.json()["data"]["wallpaper_mode"] == "custom"
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/png"
    assert image.content == png
    assert cleared.status_code == 200
    assert cleared.json()["data"]["mode"] == "none"
    assert missing.status_code == 404


def test_course_profile_can_be_created_trashed_and_restored(tmp_path) -> None:
    with client_for(tmp_path) as client:
        created = client.post(
            "/api/courses",
            json={
                "title": "Linear Algebra",
                "description": "Vectors and matrices",
                "cover_style": "cobalt",
                "icon": "matrix",
                "goal": "Build a strong foundation",
                "start_date": "2026-07-16",
                "target_weeks": 12,
                "weekly_hours": 6.5,
            },
        )
        course = created.json()["data"]
        deleted = client.delete(f"/api/courses/{course['id']}")
        visible = client.get("/api/courses").json()["data"]
        trash = client.get("/api/courses/trash").json()["data"]
        restored = client.post(f"/api/courses/{course['id']}/restore")

    assert created.status_code == 201
    assert course["goal"] == "Build a strong foundation"
    assert course["weekly_hours"] == 6.5
    assert deleted.status_code == 200
    assert all(item["id"] != course["id"] for item in visible)
    assert trash[0]["id"] == course["id"]
    assert trash[0]["purge_after"] is not None
    assert restored.status_code == 200
    assert restored.json()["data"]["deleted_at"] is None


def test_course_home_summarizes_course_modules(tmp_path) -> None:
    with client_for(tmp_path) as client:
        course = client.post(
            "/api/courses", json={"title": "Course home", "goal": "Ship a project"}
        ).json()["data"]
        client.post(f"/api/courses/{course['id']}/activate")
        client.post("/api/tasks", json={"title": "Read", "status": "doing"})
        client.post("/api/tasks", json={"title": "Practice", "status": "done"})
        response = client.get(f"/api/courses/{course['id']}/home")

    assert response.status_code == 200
    home = response.json()["data"]
    assert home["course"]["goal"] == "Ship a project"
    assert home["task_counts"] == {"todo": 0, "doing": 1, "blocked": 0, "done": 1}
    assert home["notebook_count"] == 1
    assert home["document_count"] == 0
    assert home["run_count"] == 0


def test_course_stats_use_real_learning_activity(tmp_path) -> None:
    with client_for(tmp_path) as client:
        course = client.post("/api/courses", json={"title": "Statistics"}).json()["data"]
        client.post(f"/api/courses/{course['id']}/activate")
        client.post("/api/tasks", json={"title": "Finish lesson", "status": "done"})
        client.post("/api/tasks", json={"title": "Review notes", "status": "todo"})
        client.post("/api/knowledge/nodes", json={"title": "Bayes theorem"})
        response = client.get(f"/api/courses/{course['id']}/stats")

    assert response.status_code == 200
    stats = response.json()["data"]
    assert stats["completed_tasks"] == 1
    assert stats["total_tasks"] == 2
    assert stats["completion_rate"] == 50
    assert stats["knowledge_nodes"] == 1
    assert stats["notebooks"] == 1
    assert stats["current_streak"] >= 1
    assert stats["active_days_14"] >= 1
    assert len(stats["daily_activity"]) == 14
    assert stats["daily_activity"][-1]["count"] >= 3


def test_last_visible_course_can_move_to_trash_and_be_restored(tmp_path) -> None:
    with client_for(tmp_path) as client:
        course = client.get("/api/courses").json()["data"][0]
        deleted = client.delete(f"/api/courses/{course['id']}")
        visible = client.get("/api/courses")
        active = client.get("/api/settings/active-course")
        restored = client.post(f"/api/courses/{course['id']}/restore")

    assert deleted.status_code == 200
    assert visible.json()["data"] == []
    assert active.json()["data"]["course_id"] == 0
    assert restored.status_code == 200


def test_blank_course_today_returns_synthetic_custom_context(tmp_path) -> None:
    with client_for(tmp_path) as client:
        created = client.post(
            "/api/courses",
            json={"title": "My custom course", "description": "Built from scratch"},
        )
        course_id = created.json()["data"]["id"]
        assert client.post(f"/api/courses/{course_id}/activate").status_code == 200
        response = client.get("/api/today")

    assert response.status_code == 200
    assert response.json() == {
        "data": {
            "week": {
                "week": 1,
                "phase": 0,
                "gate": "CUSTOM",
                "foundation": "开始搭建你的课程知识空间",
                "tasks": [],
                "deliverables": [],
            },
            "phase": {
                "phase": 0,
                "title": "My custom course",
                "gate": "CUSTOM",
                "acceptance": "用知识卡片、引用和练习建立证据",
                "remediation": "",
                "start_week": 1,
                "end_week": 1,
            },
            "tasks": [],
        },
        "meta": {"total": 0},
    }


def test_task_update_and_evidence_survive_new_client(tmp_path) -> None:
    with client_for(tmp_path) as client:
        created = client.post(
            "/api/tasks",
            json={"title": "实现 BM25 基线", "week": 5, "kind": "project", "priority": 2},
        )
        task_id = created.json()["data"]["id"]
        updated = client.patch(f"/api/tasks/{task_id}", json={"status": "done"})
        evidence = client.post(
            f"/api/tasks/{task_id}/evidence",
            json={"kind": "test", "title": "召回测试", "content": "Recall@5=0.82"},
        )

    with client_for(tmp_path) as restarted:
        loaded = restarted.get(f"/api/tasks/{task_id}")

    assert created.status_code == 201
    assert updated.json()["data"]["status"] == "done"
    assert evidence.status_code == 201
    assert loaded.json()["data"]["evidence"][0]["content"] == "Recall@5=0.82"


def test_task_list_supports_pagination_search_and_filter(tmp_path) -> None:
    with client_for(tmp_path) as client:
        for title, status in [("RAG 基线", "todo"), ("RAG 评测", "done"), ("Python 练习", "todo")]:
            response = client.post("/api/tasks", json={"title": title, "status": status})
            assert response.status_code == 201
        response = client.get("/api/tasks", params={"q": "RAG", "status": "todo", "page": 1, "page_size": 1})

    body = response.json()
    assert response.status_code == 200
    assert [item["title"] for item in body["data"]] == ["RAG 基线"]
    assert body["meta"] == {"page": 1, "page_size": 1, "total": 1}


def test_validation_and_not_found_use_uniform_error_shape(tmp_path) -> None:
    with client_for(tmp_path) as client:
        invalid = client.post("/api/tasks", json={"title": ""})
        missing = client.get("/api/tasks/99999")

    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "VALIDATION_ERROR"
    assert missing.status_code == 404
    assert missing.json() == {
        "error": {"code": "TASK_NOT_FOUND", "message": "任务不存在", "details": None}
    }


def test_generic_record_can_be_deleted_without_affecting_siblings(tmp_path) -> None:
    with client_for(tmp_path) as client:
        first = client.post(
            "/api/notes", json={"title": "Disposable memo", "payload": {"content": "temporary"}}
        ).json()["data"]
        second = client.post(
            "/api/notes", json={"title": "Keep memo", "payload": {"content": "persistent"}}
        ).json()["data"]

        deleted = client.delete(f"/api/notes/{first['id']}")
        remaining = client.get("/api/notes")
        missing = client.get(f"/api/notes/{first['id']}")

    assert deleted.status_code == 200
    assert deleted.json()["data"] == first
    assert remaining.status_code == 200
    assert [item["id"] for item in remaining.json()["data"]] == [second["id"]]
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "ITEM_NOT_FOUND"
