from fastapi.testclient import TestClient

from backend.app.main import create_app


def test_materials_expose_all_builtin_content_and_search_without_imports(
    tmp_path,
) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        course = client.post(
            "/api/courses",
            json={
                "title": "Offline English",
                "course_type": "language",
                "target_language_tag": "en-US",
            },
        ).json()["data"]
        all_materials = client.get(
            f"/api/courses/{course['id']}/language/materials"
        )
        searched = client.get(
            f"/api/courses/{course['id']}/language/materials",
            params={"q": "without sugar"},
        )

    assert all_materials.status_code == 200, all_materials.text
    data = all_materials.json()["data"]
    assert data["language_tag"] == "en-US"
    assert data["total_lessons"] == 42
    assert len(data["items"]) == 42
    first = data["items"][0]
    assert first["phrases"]
    assert first["dialogue"]
    assert first["passage"]["text"]
    assert first["passage"]["translation"]
    assert first["shadowing"]["text"]
    assert first["culture_note"]

    results = searched.json()["data"]
    assert results["query"] == "without sugar"
    assert 1 <= len(results["items"]) < 42
    assert any(
        "without sugar" in " ".join(
            phrase["term"] + " " + phrase["example"]
            for phrase in item["phrases"]
        ).lower()
        for item in results["items"]
    )


def test_materials_are_only_available_for_language_courses(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        course = client.post(
            "/api/courses", json={"title": "Knowledge"}
        ).json()["data"]
        response = client.get(
            f"/api/courses/{course['id']}/language/materials"
        )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "LANGUAGE_COURSE_REQUIRED"
