from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import Route, sync_playwright


def envelope(data: object) -> str:
    return json.dumps({"data": data}, ensure_ascii=False)


def assert_ok(response, label: str) -> dict:
    if not response.ok:
        raise AssertionError(f"{label} failed: {response.status} {response.text()}")
    payload = response.json()
    return payload["data"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cdp", default="http://127.0.0.1:9333")
    parser.add_argument("--screenshot", required=True)
    args = parser.parse_args()

    screenshot = Path(args.screenshot).resolve()
    screenshot.parent.mkdir(parents=True, exist_ok=True)
    renderer_errors: list[str] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.connect_over_cdp(args.cdp)
        contexts = browser.contexts
        if not contexts:
            raise AssertionError("Electron did not expose a browser context")
        context = contexts[0]
        page = context.pages[0] if context.pages else context.wait_for_event("page")
        page.wait_for_load_state("domcontentloaded")
        page.wait_for_function("typeof window.studypilot?.runtime === 'function'")
        page.on("pageerror", lambda error: renderer_errors.append(str(error)))
        page.on(
            "console",
            lambda message: renderer_errors.append(message.text)
            if message.type == "error"
            else None,
        )

        runtime = page.evaluate("window.studypilot.runtime()")
        request = playwright.request.new_context(base_url=runtime["apiBase"])
        assert_ok(
            request.put("/api/settings/onboarding_complete", data={"value": True}),
            "complete onboarding",
        )
        course = assert_ok(
            request.post("/api/courses", data={"title": "学习模式真实界面验证"}),
            "create course",
        )
        assert_ok(
            request.post(f"/api/courses/{course['id']}/activate"),
            "activate course",
        )
        notebook = assert_ok(
            request.post(
                f"/api/courses/{course['id']}/notebooks",
                data={"title": "学习出处联动画布", "kind": "mindmap"},
            ),
            "create notebook",
        )
        imported = assert_ok(
            request.post(
                "/api/documents/import",
                multipart={
                    "file": {
                        "name": "learning-source.md",
                        "mimeType": "text/markdown",
                        "buffer": (
                            "# 梯度下降入门\n\n"
                            "梯度可以理解为当前位置最陡的方向。\n\n"
                            "学习率决定每一步走多远。\n"
                        ).encode("utf-8"),
                    }
                },
            ),
            "import learning markdown",
        )
        content = assert_ok(
            request.get(f"/api/documents/{imported['id']}/content"),
            "read imported document",
        )
        source_block = content["blocks"][0]
        source = {
            "kind": "document",
            "title": "learning-source.md",
            "document_id": imported["id"],
            "block_key": source_block["block_key"],
            "locator": source_block["locator"],
            "location_label": "第 1–5 行",
            "excerpt": "梯度可以理解为当前位置最陡的方向。",
            "citation": "S1",
        }
        provider = {
            "id": "ui-test",
            "label": "UI Test Model",
            "protocol": "openai_compatible",
            "base_url": "http://127.0.0.1:65535/v1",
            "model": "guided-learning-test",
            "max_output_tokens": 100000,
            "has_api_key": True,
            "enabled": True,
        }
        thread = {
            "id": 901,
            "course_id": course["id"],
            "title": "梯度下降入门",
            "provider_id": provider["id"],
            "model": provider["model"],
            "mode": "learning",
            "learning_state": {
                "lesson_index": 1,
                "current_concept": "梯度",
                "last_feedback": "",
            },
            "message_count": 2,
        }
        reply = {
            "thread": thread,
            "user_message_id": 902,
            "message": {
                "id": 903,
                "role": "assistant",
                "content": "先不用公式，我们先看方向。[S1]",
                "sources": [source],
                "status": "complete",
                "error": "",
                "metadata": {
                    "lesson_index": 1,
                    "learning_card": {
                        "concept": "梯度",
                        "direct_answer": "梯度表示当前位置变化最快的方向和程度。",
                        "explanation": "把它想成站在山坡上判断哪一个方向最陡：方向告诉你往哪里走，大小告诉你坡有多陡。",
                        "example": {
                            "concept": "梯度",
                            "scenario": "下山时每走一步，都重新观察哪边下降最快。",
                            "analysis": "每次重新判断最陡方向，就像根据当前位置重新计算梯度。",
                        },
                        "practice": {
                            "concept": "梯度",
                            "question": "如果一步迈得太大，你觉得可能会发生什么？",
                            "reference_answer": "可能越过合适位置，来回震荡甚至无法收敛。",
                        },
                    },                },
            },
        }

        agent_state = {"created": False}

        def handle_agent(route: Route) -> None:
            request_url = urlparse(route.request.url)
            path = request_url.path
            method = route.request.method
            if method == "GET" and path == "/api/agent/providers":
                data = [provider]
            elif method == "GET" and path == "/api/agent/threads":
                data = [thread] if agent_state["created"] else []
            elif method == "GET" and path == "/api/agent/threads/901":
                data = {**thread, "messages": [reply["message"]]}
            elif method == "POST" and path == "/api/agent/threads":
                agent_state["created"] = True
                data = thread
            elif method == "POST" and path == "/api/agent/threads/901/messages/stream":
                body = (
                    json.dumps({"type": "start"}, ensure_ascii=False)
                    + "\n"
                    + json.dumps({"type": "final", "data": reply}, ensure_ascii=False)
                    + "\n"
                )
                route.fulfill(
                    status=200,
                    content_type="application/x-ndjson; charset=utf-8",
                    body=body,
                )
                return
            elif method == "POST" and path == "/api/agent/threads/901/messages":
                data = reply
            else:
                route.continue_()
                return
            route.fulfill(
                status=200,
                content_type="application/json; charset=utf-8",
                body=envelope(data),
            )

        page.route("**/api/agent/**", handle_agent)
        base_url = page.url.split("#", 1)[0]
        learning_url = f"{base_url}#/courses/{course['id']}/learning"
        page.goto(learning_url)
        page.wait_for_load_state("networkidle")
        page.get_by_label("学习中心工作区").wait_for(state="visible")
        page.get_by_role("button", name="查看学习进度", exact=True).click()
        page.get_by_role("complementary", name="本轮学习轨迹", exact=True).wait_for(state="visible")
        if page.get_by_role("button", name="当前页面").count():
            raise AssertionError("Learning Center must not expose a current-page scope")
        if page.get_by_role("tablist", name="PILOT 模式").count():
            raise AssertionError("Learning Center must not reuse the assistant mode switch")
        if page.get_by_text("STUDY AGENT", exact=True).count():
            raise AssertionError("Learning Center must not reuse the assistant brand header")

        page.get_by_role("button", name="选择学习资料").click()
        picker = page.get_by_role("region", name="学习资料", exact=True)
        picker.wait_for(state="visible")
        picker.get_by_label("learning-source · learning-source.md").check()
        page.get_by_role("button", name="完成资料选择").click()
        page.get_by_role("button", name="从这些资料开始").click()

        page.get_by_label("学习知识点：梯度").wait_for(state="visible")
        page.get_by_text("先给结论", exact=True).wait_for(state="visible")
        page.get_by_text("与本题对齐的例子", exact=True).wait_for(state="visible")
        page.get_by_text("轮到你", exact=True).wait_for(state="visible")
        if page.get_by_text("词语拆开看", exact=True).count():
            raise AssertionError("Guided Learning still exposes automatic vocabulary")
        if page.get_by_role("button", name="加入生词本", exact=True).count():
            raise AssertionError("Vocabulary may only appear after an explicit text selection")

        page.locator(".learning-card__answer p").evaluate(
            """element => {
              const range = document.createRange();
              range.selectNodeContents(element);
              const selection = window.getSelection();
              selection.removeAllRanges();
              selection.addRange(range);
              document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            }"""
        )
        selection_toolbar = page.get_by_role("toolbar", name="文本选择操作")
        selection_toolbar.wait_for(state="visible")
        for action in ["复制", "全选本段", "AI 解释", "加入备忘录", "加入生词本"]:
            selection_toolbar.get_by_role("button", name=action, exact=True).wait_for(
                state="visible"
            )
        page.keyboard.press("Escape")

        page.get_by_text("查看参考答案", exact=True).click()
        page.get_by_text("可能越过合适位置，来回震荡甚至无法收敛。", exact=True).wait_for(
            state="visible"
        )
        page.get_by_text("参考来源 · 1").click()
        page.get_by_role(
            "button",
            name="来源：learning-source.md · 第 1–5 行",
        ).click()

        page.get_by_label("联动分屏：资料阅读").wait_for(state="visible")
        page.get_by_label("学习出处：第 1–5 行").wait_for(state="visible")
        page.locator(".document-reader-stage .is-source-focus").wait_for(
            state="visible"
        )
        primary_title = page.locator(
            ".study-split-workspace__primary-header strong"
        ).inner_text()
        if primary_title != "学习中心":
            raise AssertionError(f"wrong split primary title: {primary_title}")
        if page.url != learning_url:
            raise AssertionError(
                f"source opened outside the Learning Center split: {page.url}"
            )

        page.get_by_role("button", name="在右侧助手继续").click()
        page.get_by_role("complementary", name="PILOT 学习助手").wait_for(
            state="visible"
        )
        page.wait_for_timeout(450)

        page.get_by_text("梯度下降入门", exact=True).last.wait_for(
            state="visible"
        )
        layout = page.evaluate(
            """() => ({
              innerWidth: window.innerWidth,
              documentWidth: document.documentElement.scrollWidth,
              devicePixelRatio: window.devicePixelRatio,
              hostWidth: document.querySelector('.agent-host')?.getBoundingClientRect().width || 0,
              hostGrid: getComputedStyle(document.querySelector('.agent-host')).gridTemplateColumns,
              contentWidth: document.querySelector('.agent-host__content')?.getBoundingClientRect().width || 0,
              splitWidth: document.querySelector('.study-split-workspace')?.getBoundingClientRect().width || 0,
              workspaceWidth: document.querySelector('.agent-dock--workspace')?.getBoundingClientRect().width || 0,
              dockWidth: document.querySelector('.agent-dock--dock')?.getBoundingClientRect().width || 0,
            })"""
        )
        if layout["documentWidth"] > layout["innerWidth"] + 2:
            raise AssertionError(f"horizontal overflow: {layout}")
        if (
            layout["splitWidth"] < 520
            or layout["workspaceWidth"] < 240
            or layout["dockWidth"] < 300
        ):
            raise AssertionError(f"Learning Center split is not usable: {layout}")

        page.screenshot(path=str(screenshot), full_page=True, animations="disabled")
        actionable_errors = [
            error
            for error in renderer_errors
            if "favicon" not in error.lower()
            and "devtools" not in error.lower()
        ]
        if actionable_errors:
            raise AssertionError(f"renderer errors: {actionable_errors}")
        print(
            "LEARNING_CENTER_UI_OK "
            + json.dumps(
                {
                    "course_id": course["id"],
                    "document_id": imported["id"],
                    "block_key": source_block["block_key"],
                    "layout": layout,
                    "screenshot": str(screenshot),
                },
                ensure_ascii=False,
            )
        )
        request.dispose()
        browser.close()


if __name__ == "__main__":
    main()
