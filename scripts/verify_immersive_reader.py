from __future__ import annotations

import json
from pathlib import Path
from time import time_ns

from playwright.sync_api import sync_playwright


API_BASE = "http://127.0.0.1:8765"
APP_BASE = "http://127.0.0.1:5173"
ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / "docs" / "samples" / "immersive-reader-showcase.md"
SCREENSHOT = ROOT / "screenshots" / "immersive-reader-verification.png"


def main() -> None:
    console_errors: list[str] = []
    with sync_playwright() as playwright:
        request = playwright.request.new_context(base_url=API_BASE)
        imported_response = request.post(
            "/api/documents/import",
            multipart={
                "file": {
                    "name": SAMPLE.name,
                    "mimeType": "text/markdown",
                    "buffer": SAMPLE.read_bytes(),
                }
            },
        )
        assert imported_response.ok, imported_response.text()
        imported = imported_response.json()["data"]
        while request.get(f"/api/documents/{imported['id']}/revisions").json()["data"]["can_undo"]:
            reset_response = request.post(f"/api/documents/{imported['id']}/revisions/undo", data={})
            assert reset_response.ok, reset_response.text()
        status = request.get("/api/system/status").json()["data"]
        course_id = int(status["active_course"])

        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 1000}, device_scale_factor=1)
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.on("pageerror", lambda error: console_errors.append(str(error)))
        page.add_init_script(
            f"""
            window.studypilot = {{
              runtime: async () => ({{ apiBase: {json.dumps(API_BASE)}, dataDir: 'local-test-data' }}),
              window: {{ minimize: () => {{}}, toggleMaximize: () => {{}}, close: () => {{}} }},
              files: {{ chooseDocuments: async () => [] }},
              clipboard: {{ readText: async () => '' }}
            }};
            """
        )
        page.goto(f"{APP_BASE}/courses/{course_id}/library/documents/{imported['id']}")
        page.wait_for_load_state("networkidle")
        page.get_by_role("heading", name="StudyPilot 沉浸式 Markdown 阅读示例").wait_for()

        assert page.locator(".desktop-shell--document").count() == 1
        assert page.get_by_role("navigation", name="主导航").count() == 0
        assert page.locator(".page-scroll").count() == 0
        assert page.locator(".markdown-document").count() == 1
        assert page.get_by_role("table").count() >= 1
        assert page.locator(".markdown-document input[type=checkbox]").count() >= 1

        edit_button = page.locator(".markdown-edit-trigger").first
        edit_button.click()
        editor = page.locator(".markdown-source-editor textarea")
        original = editor.input_value()
        revision_marker = f"UI automation revision {time_ns()}."
        editor.fill(original + f"\n\n{revision_marker}")
        page.locator(".markdown-source-editor button.primary-action").click()
        page.get_by_text(revision_marker, exact=True).wait_for()
        page.keyboard.press("Control+z")
        page.get_by_text(revision_marker, exact=True).wait_for(state="detached")
        page.keyboard.press("Control+Shift+z")
        page.get_by_text(revision_marker, exact=True).wait_for()
        page.keyboard.press("Control+z")
        page.get_by_text(revision_marker, exact=True).wait_for(state="detached")

        page.get_by_role("button", name="椭圆").click()
        overlay = page.locator(".annotation-overlay")
        overlay_box = overlay.bounding_box()
        assert overlay_box and overlay_box["width"] > 100 and overlay_box["height"] > 40, overlay_box
        page.mouse.move(overlay_box["x"] + overlay_box["width"] * 0.18, overlay_box["y"] + overlay_box["height"] * 0.22)
        page.mouse.down()
        page.mouse.move(overlay_box["x"] + overlay_box["width"] * 0.48, overlay_box["y"] + overlay_box["height"] * 0.48, steps=6)
        page.mouse.up()
        ellipse = page.locator(".annotation-overlay ellipse.is-ellipse:not(.is-preview)").last
        ellipse.wait_for()
        ellipse_annotation_id = ellipse.get_attribute("data-annotation-id")
        assert ellipse_annotation_id
        ellipse = page.locator(
            f'.annotation-overlay ellipse[data-annotation-id="{ellipse_annotation_id}"]'
        )
        ellipse_before = ellipse.evaluate("node => [node.getAttribute('cx'), node.getAttribute('cy'), node.getAttribute('rx'), node.getAttribute('ry')]")
        page.get_by_role("button", name="放大资料").click()
        page.locator(".document-reader-zoom").first.wait_for()
        assert page.locator(".document-reader-zoom").first.get_attribute("data-zoom") == "110"
        ellipse_after = ellipse.evaluate("node => [node.getAttribute('cx'), node.getAttribute('cy'), node.getAttribute('rx'), node.getAttribute('ry')]")
        assert ellipse_after == ellipse_before, {"before": ellipse_before, "after": ellipse_after}
        overlay_zoom_box = overlay.bounding_box()
        assert overlay_zoom_box
        zoom_ratio = overlay_zoom_box["width"] / overlay_box["width"]
        assert 1.08 <= zoom_ratio <= 1.12, {"before": overlay_box, "after": overlay_zoom_box}

        ellipse_box = ellipse.bounding_box()
        assert ellipse_box
        page.get_by_role("button", name="橡皮擦").click()
        erase_point = {
            "x": ellipse_box["x"] + 1,
            "y": ellipse_box["y"] + ellipse_box["height"] / 2,
        }
        erased_annotation_id = page.evaluate(
            "({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-annotation-id]')?.dataset.annotationId",
            erase_point,
        )
        assert erased_annotation_id
        erased_shape = page.locator(f'[data-annotation-id="{erased_annotation_id}"]')
        page.mouse.click(erase_point["x"], erase_point["y"])
        erased_shape.wait_for(state="detached")

        stage = page.get_by_label("主资料阅读区")
        scroll_metrics = stage.evaluate("node => { node.scrollTop = Math.min(320, node.scrollHeight - node.clientHeight); node.dispatchEvent(new Event('scroll', { bubbles: true })); return { top: node.scrollTop, height: node.scrollHeight, client: node.clientHeight }; }")
        layout_metrics = page.evaluate("""() => Object.fromEntries(['.desktop-shell--document', '.document-workspace', '.document-workspace__body', '.document-readers', '.document-reader-stage'].map(selector => { const node = document.querySelector(selector); const style = getComputedStyle(node); return [selector, { rect: node.getBoundingClientRect().toJSON(), height: style.height, minHeight: style.minHeight, overflow: style.overflow, gridRows: style.gridTemplateRows }]; }))""")
        assert scroll_metrics["top"] > 72, {"scroll": scroll_metrics, "layout": layout_metrics}
        page.wait_for_function("document.querySelector('.document-workspace__body')?.classList.contains('is-outline-collapsed')")
        page.get_by_role("button", name="显示章节目录").click()
        page.wait_for_function("!document.querySelector('.document-workspace__body')?.classList.contains('is-outline-collapsed')")

        page.get_by_role("button", name="打开分栏阅读").click()
        secondary_stage = page.locator(".document-reader-stage").nth(1)
        secondary_stage.wait_for()
        assert page.locator(".document-reader-stage").count() == 2
        primary_top = stage.evaluate("node => node.scrollTop")
        secondary_metrics = secondary_stage.evaluate("node => { node.scrollTop = Math.min(180, node.scrollHeight - node.clientHeight); return { top: node.scrollTop, max: node.scrollHeight - node.clientHeight }; }")
        if secondary_metrics["max"] > 72:
            assert secondary_metrics["top"] > 72, secondary_metrics
        assert stage.evaluate("node => node.scrollTop") == primary_top

        SCREENSHOT.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(SCREENSHOT), full_page=False)
        browser.close()
        request.dispose()

    assert not console_errors, console_errors
    print(json.dumps({
        "document_id": imported["id"],
        "course_id": course_id,
        "markdown_title": imported["title"],
        "ellipse_geometry": ellipse_before,
        "erased_annotation_id": erased_annotation_id,
        "screenshot": str(SCREENSHOT),
        "console_errors": console_errors,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
