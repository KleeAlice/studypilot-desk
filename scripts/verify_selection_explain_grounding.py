from __future__ import annotations

import json
import re
from pathlib import Path

from playwright.sync_api import Route, sync_playwright


API_BASE = "http://127.0.0.1:8877"
WEB_BASE = "http://127.0.0.1:5274"
ROOT = Path(__file__).resolve().parents[1]
SCREENSHOT = ROOT / "artifacts" / "selection-explain-check" / "selection-explain.png"
SELECTED_TEXT = "The exact selected sentence must reach PILOT."


def response_data(response):
    if not response.ok:
        raise RuntimeError(f"{response.request.method} {response.url}: {response.status}")
    payload = response.json()
    return payload.get("data", payload)


def main() -> None:
    captured: list[dict] = []
    console_errors: list[str] = []
    with sync_playwright() as playwright:
        request = playwright.request.new_context(base_url=API_BASE)
        status = response_data(request.get("/api/system/status"))
        course_id = int(status["active_course"])
        response_data(request.put(
            "/api/agent/providers/selection-audit",
            data={
                "label": "Selection audit",
                "icon": "custom",
                "protocol": "openai_compatible",
                "base_url": "http://127.0.0.1:11434/v1",
                "model": "selection-audit",
                "max_output_tokens": 32000,
                "connect_timeout_seconds": 10,
                "first_byte_timeout_seconds": 90,
                "idle_timeout_seconds": 45,
                "enabled": True,
            },
        ))
        document = response_data(request.post(
            "/api/documents/import",
            multipart={
                "file": {
                    "name": "selection-grounding.md",
                    "mimeType": "text/markdown",
                    "buffer": f"# Selection grounding\n\n{SELECTED_TEXT}".encode(),
                }
            },
        ))

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
            localStorage.setItem("studypilot.selected-provider", "selection-audit");
            window.studypilot = {{
              runtime: async () => ({{ apiBase: {json.dumps(API_BASE)}, dataDir: "selection-audit" }}),
              window: {{ minimize() {{}}, toggleMaximize() {{}}, close() {{}} }},
              files: {{ chooseDocuments: async () => [] }},
              clipboard: {{ readText: async () => "", writeText: async () => undefined }},
              capture: {{ currentWindow: async () => null }}
            }};
            """
        )

        def fulfill_stream(route: Route) -> None:
            payload = route.request.post_data_json
            captured.append(payload)
            match = re.search(r"/threads/(\d+)/messages/stream", route.request.url)
            thread_id = int(match.group(1)) if match else 1
            thread = {
                "id": thread_id,
                "course_id": course_id,
                "title": "Selection grounding",
                "provider_id": "selection-audit",
                "model": "selection-audit",
                "mode": "assistant",
                "message_count": 2,
                "learning_state": {},
            }
            message = {
                "id": 2,
                "role": "assistant",
                "content": "The selected sentence is available.",
                "sources": [],
                "attachments": [],
                "metadata": {},
                "status": "complete",
                "error": "",
            }
            body = "\n".join([
                json.dumps({"type": "start"}),
                json.dumps({"type": "delta", "text": "The selected sentence is available."}),
                json.dumps({"type": "final", "data": {"thread": thread, "message": message}}),
                "",
            ])
            route.fulfill(
                status=200,
                content_type="application/x-ndjson; charset=utf-8",
                body=body,
            )

        page.route("**/api/agent/threads/*/messages/stream", fulfill_stream)
        page.goto(
            f"{WEB_BASE}/courses/{course_id}/library/documents/{int(document['id'])}",
            wait_until="networkidle",
        )
        paragraph = page.get_by_text(SELECTED_TEXT, exact=True)
        paragraph.wait_for(state="visible")
        paragraph.evaluate(
            """element => {
              const range = document.createRange();
              range.selectNodeContents(element);
              const selection = window.getSelection();
              selection.removeAllRanges();
              selection.addRange(range);
              document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
            }"""
        )
        toolbar = page.get_by_role("toolbar", name="文本选择操作")
        toolbar.wait_for(state="visible")
        toolbar.get_by_role("button", name="AI 解释", exact=True).click()
        page.get_by_role("complementary", name="PILOT 学习助手").wait_for(state="visible")
        page.wait_for_function("() => document.body.textContent.includes('The selected sentence is available.')")

        assert captured, "AI explain did not send a model request"
        payload = captured[-1]
        assert SELECTED_TEXT in payload["message"], payload["message"]
        assert payload["context"]["selected_text"] == SELECTED_TEXT, payload["context"]
        SCREENSHOT.parent.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(SCREENSHOT))
        assert not console_errors, console_errors
        print(json.dumps({
            "selectedText": payload["context"]["selected_text"],
            "messageContainsSelection": SELECTED_TEXT in payload["message"],
            "screenshot": str(SCREENSHOT),
            "consoleErrors": console_errors,
        }, ensure_ascii=False, indent=2))
        browser.close()
        request.dispose()


if __name__ == "__main__":
    main()
