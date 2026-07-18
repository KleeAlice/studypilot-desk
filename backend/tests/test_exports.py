from io import BytesIO
import base64

from docx import Document
from fastapi.testclient import TestClient
from PIL import Image
from pypdf import PdfReader

from backend.app.main import create_app


def seed_export_graph(client: TestClient) -> tuple[int, int]:
    course = client.get("/api/courses").json()["data"][0]
    notebook = client.get(f"/api/courses/{course['id']}/notebooks").json()["data"][0]
    base = f"/api/courses/{course['id']}/notebooks/{notebook['id']}"
    second = client.post(
        f"{base}/nodes",
        json={
            "title": "第二章 · 线性模型",
            "kind": "sticky_note",
            "content": "损失函数决定优化目标。",
            "module": "模型基础",
            "color": "sun",
            "position_x": 460,
            "position_y": 260,
        },
    ).json()["data"]
    first = client.post(
        f"{base}/nodes",
        json={
            "title": "第一章 · 学习目标",
            "kind": "concept",
            "content": "理解监督学习与泛化。",
            "module": "课程导论",
            "color": "indigo",
            "position_x": 80,
            "position_y": 60,
            "source_title": "课程讲义",
            "source_quote": "模型从数据中学习规律。",
        },
    ).json()["data"]
    client.post(
        f"{base}/edges",
        json={"source_id": first["id"], "target_id": second["id"], "relation": "mindmap"},
    )
    pixel = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=")
    asset = client.post("/api/media/images", files={"file": ("chart.png", pixel, "image/png")}).json()["data"]
    client.post(
        f"{base}/nodes",
        json={
            "title": "实验结果图",
            "kind": "image",
            "content": "验证集表现",
            "position_x": 100,
            "position_y": 520,
            "image_asset_id": asset["id"],
            "image_alt": "验证曲线",
        },
    )
    return course["id"], notebook["id"]


def test_exports_full_canvas_and_spatially_ordered_documents(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        course_id, notebook_id = seed_export_graph(client)
        url = f"/api/courses/{course_id}/notebooks/{notebook_id}/export"
        png = client.post(url, json={"format": "png"})
        pdf = client.post(url, json={"format": "pdf"})
        docx = client.post(url, json={"format": "docx"})
        markdown = client.post(url, json={"format": "md"})

    assert png.status_code == 200, png.text
    assert png.content.startswith(b"\x89PNG\r\n\x1a\n")
    image = Image.open(BytesIO(png.content))
    assert image.width >= 700 and image.height >= 500
    assert "filename*=UTF-8''" in png.headers["content-disposition"]

    assert pdf.status_code == 200, pdf.text
    assert pdf.content.startswith(b"%PDF")
    assert len(PdfReader(BytesIO(pdf.content)).pages) == 1

    assert docx.status_code == 200, docx.text
    document = Document(BytesIO(docx.content))
    text = "\n".join(paragraph.text for paragraph in document.paragraphs)
    assert text.index("第一章 · 学习目标") < text.index("第二章 · 线性模型")
    assert "理解监督学习与泛化。" in text
    assert "关系清单" in text
    assert len(document.inline_shapes) == 1

    assert markdown.status_code == 200, markdown.text
    md = markdown.content.decode("utf-8")
    assert md.index("第一章 · 学习目标") < md.index("第二章 · 线性模型")
    assert "课程讲义" in md
    assert "第一章 · 学习目标 → 第二章 · 线性模型" in md
    assert "data:image/png;base64," in md


def test_export_is_strictly_scoped_to_the_course_and_notebook(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        _, notebook_id = seed_export_graph(client)
        other = client.post("/api/courses", json={"title": "另一门课"}).json()["data"]
        response = client.post(
            f"/api/courses/{other['id']}/notebooks/{notebook_id}/export",
            json={"format": "md"},
        )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOTEBOOK_NOT_FOUND"


def test_export_format_is_an_allowlisted_literal(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        course_id, notebook_id = seed_export_graph(client)
        response = client.post(
            f"/api/courses/{course_id}/notebooks/{notebook_id}/export",
            json={"format": "html"},
        )

    assert response.status_code == 422


def test_legacy_knowledge_export_uses_the_active_courses_default_notebook(tmp_path) -> None:
    with TestClient(create_app(data_dir=tmp_path)) as client:
        seed_export_graph(client)
        response = client.post("/api/knowledge/export", json={"format": "png"})

    assert response.status_code == 200, response.text
    assert response.content.startswith(b"\x89PNG\r\n\x1a\n")
    assert "filename*=UTF-8''" in response.headers["content-disposition"]
