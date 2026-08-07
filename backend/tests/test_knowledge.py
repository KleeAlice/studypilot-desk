import base64

import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app


def create_node(client: TestClient, title: str, **overrides) -> dict:
    response = client.post(
        "/api/knowledge/nodes", json={"title": title, **overrides}
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


def create_edge(
    client: TestClient, source_id: int, target_id: int, relation: str = "prerequisite"
) -> dict:
    response = client.post(
        "/api/knowledge/edges",
        json={"source_id": source_id, "target_id": target_id, "relation": relation},
    )
    assert response.status_code == 201, response.text
    return response.json()["data"]


@pytest.mark.parametrize("kind", ["concept", "sticky_note", "flashcard", "citation"])
def test_creates_supported_node_kinds_with_canvas_and_citation_fields(
    tmp_path, kind: str
) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        document = client.post(
            "/api/documents/import",
            files={"file": ("source.txt", b"Quoted evidence", "text/plain")},
        ).json()["data"]
        payload = {
            "title": f"A {kind}",
            "description": "Legacy summary",
            "module": "Module A",
            "kind": kind,
            "content": "Editable body",
            "color": "teal",
            "position_x": 125.5,
            "position_y": -42.25,
        }
        if kind == "citation":
            block = client.get(
                f"/api/documents/{document['id']}/content"
            ).json()["data"]["blocks"][0]
            payload.update(
                {
                    "source_document_id": document["id"],
                    "source_title": document["title"],
                    "source_quote": "Quoted evidence",
                    "source_block_key": block["block_key"],
                    "source_locator": block["locator"],
                }
            )
        response = client.post("/api/knowledge/nodes", json=payload)

    assert response.status_code == 201, response.text
    node = response.json()["data"]
    for field, value in payload.items():
        assert node[field] == value
    assert node["mastery"] == 0.5


def test_knowledge_literals_and_position_bounds_are_validated(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        invalid_kind = client.post(
            "/api/knowledge/nodes", json={"title": "Bad kind", "kind": "unknown"}
        )
        invalid_position = client.post(
            "/api/knowledge/nodes", json={"title": "Too far", "position_x": 100000.01}
        )
        invalid_relation = client.post(
            "/api/knowledge/edges",
            json={"source_id": 1, "target_id": 2, "relation": "depends_on"},
        )

    assert invalid_kind.status_code == 422
    assert invalid_position.status_code == 422
    assert invalid_relation.status_code == 422


def test_patch_rejects_null_for_required_node_fields(tmp_path) -> None:
    with TestClient(
        create_app(data_dir=tmp_path), raise_server_exceptions=False
    ) as client:
        node = create_node(client, "Required title")
        response = client.patch(
            f"/api/knowledge/nodes/{node['id']}", json={"title": None}
        )

    assert response.status_code == 422


def test_patch_node_updates_editable_fields_and_position(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        node = create_node(
            client,
            "Draft",
            kind="sticky_note",
            content="Before",
            color="yellow",
            position_x=10,
            position_y=20,
        )
        response = client.patch(
            f"/api/knowledge/nodes/{node['id']}",
            json={
                "title": "Revised",
                "content": "After",
                "color": "coral",
                "position_x": -150.75,
                "position_y": 280.5,
            },
        )
        graph = client.get("/api/knowledge")

    assert response.status_code == 200, response.text
    updated = response.json()["data"]
    assert updated["title"] == "Revised"
    assert updated["content"] == "After"
    assert updated["color"] == "coral"
    assert updated["position_x"] == -150.75
    assert updated["position_y"] == 280.5
    assert updated["kind"] == "sticky_note"
    assert graph.json()["data"]["nodes"] == [updated]


def test_patch_node_persists_resizable_geometry_font_scale_and_manual_mastery(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        node = create_node(
            client,
            "Resizable concept",
            kind="concept",
            width=240,
            height=150,
            font_scale=1.0,
        )
        response = client.patch(
            f"/api/knowledge/nodes/{node['id']}",
            json={"width": 360, "height": 240, "font_scale": 1.35, "mastery": 0.8},
        )
        graph = client.get("/api/knowledge").json()["data"]

    assert response.status_code == 200, response.text
    updated = response.json()["data"]
    assert (updated["width"], updated["height"], updated["font_scale"]) == (360, 240, 1.35)
    assert updated["mastery"] == pytest.approx(0.8)
    assert graph["nodes"][0]["width"] == 360
    assert graph["nodes"][0]["mastery"] == pytest.approx(0.8)


def test_delete_node_removes_attached_edges_and_missing_node_is_404(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        first = create_node(client, "First")
        second = create_node(client, "Second")
        create_edge(client, first["id"], second["id"])

        deleted = client.delete(f"/api/knowledge/nodes/{first['id']}")
        missing_patch = client.patch(
            f"/api/knowledge/nodes/{first['id']}", json={"title": "Gone"}
        )
        graph = client.get("/api/knowledge")

    assert deleted.status_code == 204
    assert deleted.content == b""
    assert missing_patch.status_code == 404
    assert [node["id"] for node in graph.json()["data"]["nodes"]] == [second["id"]]
    assert graph.json()["data"]["edges"] == []


def test_delete_edge_is_course_scoped_and_returns_204(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        first = create_node(client, "First")
        second = create_node(client, "Second")
        edge = create_edge(client, first["id"], second["id"])

        deleted = client.delete(f"/api/knowledge/edges/{edge['id']}")
        missing = client.delete(f"/api/knowledge/edges/{edge['id']}")
        graph = client.get("/api/knowledge")

    assert deleted.status_code == 204
    assert deleted.content == b""
    assert missing.status_code == 404
    assert graph.json()["data"]["edges"] == []


def test_only_prerequisite_edges_are_acyclic_and_count_as_prerequisites(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        first = create_node(client, "First")
        second = create_node(client, "Second")
        third = create_node(client, "Third")

        create_edge(client, first["id"], second["id"], "prerequisite")
        prerequisite_cycle = client.post(
            "/api/knowledge/edges",
            json={
                "source_id": second["id"],
                "target_id": first["id"],
                "relation": "prerequisite",
            },
        )
        association = create_edge(
            client, second["id"], first["id"], "association"
        )
        create_edge(client, second["id"], third["id"], "mindmap")
        mindmap_cycle = create_edge(
            client, third["id"], second["id"], "mindmap"
        )
        prerequisites = client.get(
            f"/api/knowledge/nodes/{second['id']}/prerequisites"
        )

    assert prerequisite_cycle.status_code == 409
    assert prerequisite_cycle.json()["error"]["code"] == "DAG_CYCLE"
    assert association["relation"] == "association"
    assert mindmap_cycle["relation"] == "mindmap"
    assert [node["id"] for node in prerequisites.json()["data"]] == [first["id"]]


def test_create_edge_uses_one_active_course_snapshot(tmp_path, monkeypatch) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        default_course = client.get("/api/settings/active-course").json()["data"][
            "course_id"
        ]
        first = create_node(client, "Pinned first")
        second = create_node(client, "Pinned second")
        other_course = client.post(
            "/api/courses", json={"title": "Potential concurrent switch"}
        ).json()["data"]["id"]
        calls = 0

        def changing_course_id() -> int:
            nonlocal calls
            calls += 1
            return default_course if calls == 1 else other_course

        monkeypatch.setattr(
            client.app.state.knowledge, "_course_id", changing_course_id
        )
        response = client.post(
            "/api/knowledge/edges",
            json={"source_id": first["id"], "target_id": second["id"]},
        )

    assert response.status_code == 201, response.text
    assert response.json()["data"]["course_id"] == default_course
    assert calls == 1


def test_update_node_uses_one_active_course_snapshot(tmp_path, monkeypatch) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        default_course = client.get("/api/settings/active-course").json()["data"][
            "course_id"
        ]
        node = create_node(client, "Pinned update")
        other_course = client.post(
            "/api/courses", json={"title": "Potential update switch"}
        ).json()["data"]["id"]
        calls = 0

        def changing_course_id() -> int:
            nonlocal calls
            calls += 1
            return default_course if calls == 1 else other_course

        monkeypatch.setattr(
            client.app.state.knowledge, "_course_id", changing_course_id
        )
        response = client.patch(
            f"/api/knowledge/nodes/{node['id']}", json={"title": "Pinned result"}
        )

    assert response.status_code == 200, response.text
    assert response.json()["data"]["title"] == "Pinned result"
    assert response.json()["data"]["course_id"] == default_course
    assert calls == 1


def test_prerequisites_use_one_active_course_snapshot(tmp_path, monkeypatch) -> None:
    with TestClient(
        create_app(data_dir=tmp_path), raise_server_exceptions=False
    ) as client:
        default_course = client.get("/api/settings/active-course").json()["data"][
            "course_id"
        ]
        default_first = create_node(client, "Default prerequisite")
        default_second = create_node(client, "Default target")
        create_edge(client, default_first["id"], default_second["id"])

        other_course = client.post(
            "/api/courses", json={"title": "Potential graph switch"}
        ).json()["data"]["id"]
        client.post(f"/api/courses/{other_course}/activate")
        other_first = create_node(client, "Other prerequisite")
        other_second = create_node(client, "Other target")
        create_edge(client, other_first["id"], other_second["id"])
        client.post(f"/api/courses/{default_course}/activate")
        calls = 0

        def changing_course_id() -> int:
            nonlocal calls
            calls += 1
            return default_course if calls == 1 else other_course

        monkeypatch.setattr(
            client.app.state.knowledge, "_course_id", changing_course_id
        )
        response = client.get(
            f"/api/knowledge/nodes/{default_second['id']}/prerequisites"
        )

    assert response.status_code == 200, response.text
    assert [item["id"] for item in response.json()["data"]] == [
        default_first["id"]
    ]
    assert calls == 1


def test_knowledge_nodes_edges_and_citation_sources_are_course_isolated(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        default_course = client.get("/api/settings/active-course").json()["data"][
            "course_id"
        ]
        document = client.post(
            "/api/documents/import",
            files={"file": ("private.txt", b"Private quote", "text/plain")},
        ).json()["data"]
        first = create_node(client, "Default first")
        second = create_node(client, "Default second")
        edge = create_edge(client, first["id"], second["id"])

        other_course = client.post(
            "/api/courses", json={"title": "Other course"}
        ).json()["data"]
        client.post(f"/api/courses/{other_course['id']}/activate")

        empty_graph = client.get("/api/knowledge")
        hidden_patch = client.patch(
            f"/api/knowledge/nodes/{first['id']}", json={"title": "Cross-course edit"}
        )
        hidden_delete = client.delete(f"/api/knowledge/edges/{edge['id']}")
        hidden_source = client.post(
            "/api/knowledge/nodes",
            json={
                "title": "Leaked citation",
                "kind": "citation",
                "source_document_id": document["id"],
                "source_quote": "Private quote",
            },
        )
        other_node = create_node(client, "Other node")

        client.post(f"/api/courses/{default_course}/activate")
        default_graph = client.get("/api/knowledge")

    assert empty_graph.json()["data"] == {"nodes": [], "edges": []}
    assert hidden_patch.status_code == 404
    assert hidden_delete.status_code == 404
    assert hidden_source.status_code == 404
    assert hidden_source.json()["error"]["code"] == "DOCUMENT_NOT_FOUND"
    assert {node["id"] for node in default_graph.json()["data"]["nodes"]} == {
        first["id"],
        second["id"],
    }
    assert other_node["id"] not in {
        node["id"] for node in default_graph.json()["data"]["nodes"]
    }
    assert [item["id"] for item in default_graph.json()["data"]["edges"]] == [
        edge["id"]
    ]


def test_image_asset_can_be_uploaded_rendered_and_attached_to_node(tmp_path) -> None:
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )
    with TestClient(create_app(data_dir=tmp_path)) as client:
        uploaded = client.post(
            "/api/media/images",
            files={"file": ("pixel.png", png, "image/png")},
        )
        asset = uploaded.json()["data"]
        node = client.post(
            "/api/knowledge/nodes",
            json={
                "title": "Screenshot",
                "kind": "image",
                "image_asset_id": asset["id"],
                "image_alt": "A one pixel test image",
            },
        )
        graph = client.get("/api/knowledge")
        image = client.get(asset["url"])

    assert uploaded.status_code == 201, uploaded.text
    assert asset["filename"] == "pixel.png"
    assert asset["media_type"] == "image/png"
    assert node.status_code == 201, node.text
    created = node.json()["data"]
    assert created["kind"] == "image"
    assert created["image_asset_id"] == asset["id"]
    assert created["image_alt"] == "A one pixel test image"
    assert created["image_url"] == asset["url"]
    assert graph.json()["data"]["nodes"][0]["image_url"] == asset["url"]
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/png"
    assert image.content == png


def test_image_upload_rejects_non_image_and_assets_are_course_scoped(tmp_path) -> None:
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )
    with TestClient(create_app(data_dir=tmp_path)) as client:
        rejected = client.post(
            "/api/media/images",
            files={"file": ("notes.txt", b"not an image", "text/plain")},
        )
        asset = client.post(
            "/api/media/images",
            files={"file": ("pixel.png", png, "image/png")},
        ).json()["data"]
        other = client.post("/api/courses", json={"title": "Other"}).json()[
            "data"
        ]
        client.post(f"/api/courses/{other['id']}/activate")
        cross_course_node = client.post(
            "/api/knowledge/nodes",
            json={
                "title": "Leaked image",
                "kind": "image",
                "image_asset_id": asset["id"],
            },
        )
        original_course_image = client.get(asset["url"])

    assert rejected.status_code == 415
    assert rejected.json()["error"]["code"] == "UNSUPPORTED_IMAGE"
    assert cross_course_node.status_code == 404
    assert cross_course_node.json()["error"]["code"] == "MEDIA_NOT_FOUND"
    assert asset["url"].startswith("/api/courses/1/media/images/")
    assert original_course_image.status_code == 200
    assert original_course_image.content == png


def test_knowledge_dag_rejects_cycles_and_checks_prerequisites(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        ids = []
        for title in ["Python 基础", "PyTorch", "Transformer"]:
            response = client.post("/api/knowledge/nodes", json={"title": title, "module": "基础"})
            assert response.status_code == 201
            ids.append(response.json()["data"]["id"])

        assert client.post("/api/knowledge/edges", json={"source_id": ids[0], "target_id": ids[1]}).status_code == 201
        assert client.post("/api/knowledge/edges", json={"source_id": ids[1], "target_id": ids[2]}).status_code == 201
        cycle = client.post("/api/knowledge/edges", json={"source_id": ids[2], "target_id": ids[0]})
        prerequisites = client.get(f"/api/knowledge/nodes/{ids[2]}/prerequisites")

    assert cycle.status_code == 409
    assert cycle.json()["error"]["code"] == "DAG_CYCLE"
    assert [item["title"] for item in prerequisites.json()["data"]] == ["Python 基础", "PyTorch"]


def test_mindmap_graph_is_editable_and_persistent(tmp_path) -> None:
    graph = {
        "nodes": [{"id": "root", "text": "RAG"}, {"id": "retrieval", "text": "检索"}],
        "edges": [{"source": "root", "target": "retrieval"}],
    }
    with TestClient(create_app(data_dir=tmp_path)) as client:
        created = client.post("/api/mindmaps", json={"title": "RAG 导图", "payload": graph})
        item_id = created.json()["data"]["id"]
        changed_graph = {**graph, "nodes": [*graph["nodes"], {"id": "rerank", "text": "重排"}]}
        client.patch(f"/api/mindmaps/{item_id}", json={"payload": changed_graph})

    with TestClient(create_app(data_dir=tmp_path)) as client:
        loaded = client.get(f"/api/mindmaps/{item_id}")

    assert loaded.status_code == 200
    assert [node["id"] for node in loaded.json()["data"]["payload"]["nodes"]] == [
        "root",
        "retrieval",
        "rerank",
    ]


def test_course_supports_multiple_isolated_knowledge_notebooks(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        course = client.get("/api/courses").json()["data"][0]
        defaults = client.get(f"/api/courses/{course['id']}/notebooks")
        first = client.post(
            f"/api/courses/{course['id']}/notebooks",
            json={"title": "Foundations", "kind": "mindmap", "cover_style": "cobalt"},
        ).json()["data"]
        second = client.post(
            f"/api/courses/{course['id']}/notebooks",
            json={"title": "Exercises", "kind": "canvas"},
        ).json()["data"]
        node = client.post(
            f"/api/courses/{course['id']}/notebooks/{first['id']}/nodes",
            json={"title": "Vector", "kind": "concept"},
        )
        first_graph = client.get(
            f"/api/courses/{course['id']}/notebooks/{first['id']}/graph"
        )
        second_graph = client.get(
            f"/api/courses/{course['id']}/notebooks/{second['id']}/graph"
        )

    assert defaults.status_code == 200
    assert len(defaults.json()["data"]) == 1
    assert node.status_code == 201, node.text
    assert node.json()["data"]["notebook_id"] == first["id"]
    assert [item["title"] for item in first_graph.json()["data"]["nodes"]] == ["Vector"]
    assert second_graph.json()["data"] == {"nodes": [], "edges": []}


def test_notebook_graph_rejects_cross_course_access(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        first_course = client.post("/api/courses", json={"title": "Course A"}).json()["data"]
        second_course = client.post("/api/courses", json={"title": "Course B"}).json()["data"]
        notebook = client.post(
            f"/api/courses/{first_course['id']}/notebooks",
            json={"title": "Private notes"},
        ).json()["data"]
        response = client.get(
            f"/api/courses/{second_course['id']}/notebooks/{notebook['id']}/graph"
        )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOTEBOOK_NOT_FOUND"
