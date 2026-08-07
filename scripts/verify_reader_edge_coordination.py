from __future__ import annotations

import json
from pathlib import Path

from playwright.sync_api import sync_playwright


API_BASE = "http://127.0.0.1:8877"
WEB_BASE = "http://127.0.0.1:5274"
ROOT = Path(__file__).resolve().parents[1]
SCREENSHOT = ROOT / "artifacts" / "reader-edge-check" / "reader-edge.png"


def overlaps(left: dict, right: dict) -> bool:
    return not (
        left["x"] + left["width"] <= right["x"]
        or right["x"] + right["width"] <= left["x"]
        or left["y"] + left["height"] <= right["y"]
        or right["y"] + right["height"] <= left["y"]
    )


def main() -> None:
    console_errors: list[str] = []
    with sync_playwright() as playwright:
        request = playwright.request.new_context(base_url=API_BASE)
        status = request.get("/api/system/status").json()["data"]
        course_id = int(status["active_course"])
        imported_response = request.post(
            "/api/documents/import",
            multipart={
                "file": {
                    "name": "edge-coordination.md",
                    "mimeType": "text/markdown",
                    "buffer": (
                        b"# Reader edge coordination\n\n"
                        b"Selected text must stay grounded in its exact source.\n\n"
                        b"## Second section\n\n"
                        b"The outline and course menu must never open together."
                    ),
                }
            },
        )
        assert imported_response.ok, imported_response.text()
        document_id = int(imported_response.json()["data"]["id"])

        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 1000})
        page.on(
            "console",
            lambda message: console_errors.append(message.text)
            if message.type == "error"
            else None,
        )
        page.on("pageerror", lambda error: console_errors.append(str(error)))
        page.add_init_script(
            f"""
            window.studypilot = {{
              runtime: async () => ({{ apiBase: {json.dumps(API_BASE)}, dataDir: "reader-edge-audit" }}),
              window: {{ minimize() {{}}, toggleMaximize() {{}}, close() {{}} }},
              files: {{ chooseDocuments: async () => [] }},
              clipboard: {{ readText: async () => "", writeText: async () => undefined }}
            }};
            """
        )
        page.goto(
            f"{WEB_BASE}/courses/{course_id}/library/documents/{document_id}"
        )
        page.wait_for_load_state("networkidle")
        toolbar = page.get_by_role("toolbar", name="资料批注工具")
        toolbar.wait_for()

        buttons = {
            "course": page.get_by_role("button", name="打开课程导航"),
            "back": page.get_by_role("button", name="返回资料库"),
            "outline": page.get_by_role("button", name="显示章节目录"),
        }
        boxes = {name: button.bounding_box() for name, button in buttons.items()}
        assert all(boxes.values()), boxes
        assert boxes["course"]["x"] < boxes["back"]["x"] < boxes["outline"]["x"], boxes
        assert not overlaps(boxes["course"], boxes["back"]), boxes
        assert not overlaps(boxes["back"], boxes["outline"]), boxes

        flyout = page.locator(".document-navigation-flyout")
        body = page.locator(".document-workspace__body")
        outline_hotspot = page.locator(".document-outline-hotspot")
        screen_hotspot = page.locator(".document-navigation-hotspot")
        assert flyout.get_attribute("data-open") == "false"

        hotspot_box = screen_hotspot.bounding_box()
        assert hotspot_box and hotspot_box["x"] == 0 and hotspot_box["width"] >= 8
        page.mouse.move(2, 260)
        page.wait_for_function(
            "document.querySelector('.document-navigation-flyout')?.dataset.open === 'true'"
        )
        assert body.evaluate("node => node.classList.contains('is-outline-collapsed')")
        assert outline_hotspot.get_attribute("data-disabled") == "true"

        page.wait_for_timeout(220)
        flyout_box = flyout.bounding_box()
        assert flyout_box
        page.mouse.move(flyout_box["x"] + flyout_box["width"] + 12, 300)
        page.wait_for_timeout(240)
        assert flyout.get_attribute("data-open") == "false"

        inner_edge = outline_hotspot.bounding_box()
        assert inner_edge
        page.mouse.move(
            inner_edge["x"] + inner_edge["width"] - 2,
            inner_edge["y"] + min(120, inner_edge["height"] / 2),
        )
        page.wait_for_function(
            "document.querySelector('.document-workspace__body')?.classList.contains('is-outline-peeking')"
        )
        assert flyout.get_attribute("data-open") == "false"

        SCREENSHOT.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(SCREENSHOT))

        page.mouse.move(900, 500)
        page.wait_for_timeout(80)
        for _ in range(3):
            page.mouse.move(2, 300)
            page.wait_for_function(
                "document.querySelector('.document-navigation-flyout')?.dataset.open === 'true'"
            )
            assert not body.evaluate(
                "node => node.classList.contains('is-outline-peeking')"
            )
            page.wait_for_timeout(220)
            flyout_box = flyout.bounding_box()
            assert flyout_box
            page.mouse.move(flyout_box["x"] + flyout_box["width"] + 10, 320)
            page.wait_for_timeout(240)
            assert flyout.get_attribute("data-open") == "false"

        metrics = {
            "courseButton": boxes["course"],
            "backButton": boxes["back"],
            "outlineButton": boxes["outline"],
            "screenHotspot": hotspot_box,
            "outlineHotspot": inner_edge,
            "screenshot": str(SCREENSHOT),
            "consoleErrors": console_errors,
        }
        browser.close()
        request.dispose()

    assert not console_errors, console_errors
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
