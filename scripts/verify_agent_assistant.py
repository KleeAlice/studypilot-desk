from __future__ import annotations

import json
import os
import re
from pathlib import Path

from playwright.sync_api import sync_playwright


API_BASE = "http://127.0.0.1:8765"
APP_BASE = "http://127.0.0.1:5173"


def data(response):
    assert response.ok, f"{response.status}: {response.text()}"
    return response.json()["data"]


with sync_playwright() as playwright:
    browser_root = Path(os.environ["LOCALAPPDATA"]) / "ms-playwright"
    installed_shells = sorted(
        browser_root.glob("chromium_headless_shell-*/chrome-headless-shell-win64/chrome-headless-shell.exe")
    )
    browser = playwright.chromium.launch(
        headless=True,
        executable_path=str(installed_shells[-1]) if installed_shells else None,
    )
    context = browser.new_context(viewport={"width": 1600, "height": 1000})
    page = context.new_page()
    errors: list[str] = []
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.add_init_script(
        f"""
        window.studypilot = {{
          runtime: async () => ({{ apiBase: {json.dumps(API_BASE)}, dataDir: 'data' }}),
          window: {{ minimize() {{}}, toggleMaximize() {{}}, close() {{}} }},
          clipboard: {{ readText: async () => '', readImage: async () => null }},
          files: {{ saveExport: async () => null }}
        }};
        """
    )

    courses = data(page.request.get(f"{API_BASE}/api/courses"))
    assert courses, "expected the migrated database to contain a course"
    course_id = courses[0]["id"]
    data(
        page.request.put(
            f"{API_BASE}/api/settings/onboarding_complete",
            data={"value": True},
        )
    )
    markdown = """# Agent Context Verification

StudyPilot keeps document citations attached to the exact source block.

## Linked workflow

- Read the active document.
- Use notes and the knowledge graph when selected.
- Return to the cited source from the answer.
"""
    imported = data(
        page.request.post(
            f"{API_BASE}/api/documents/import",
            multipart={
                "file": {
                    "name": "agent-context-verification.md",
                    "mimeType": "text/markdown",
                    "buffer": markdown.encode("utf-8"),
                }
            },
        )
    )
    document_id = imported["id"]
    configured = data(
        page.request.put(
            f"{API_BASE}/api/agent/providers/openai",
            data={
                "label": "Local verification model",
                "protocol": "openai_compatible",
                "base_url": "http://127.0.0.1:8877/v1",
                "model": "study-verifier",
                "api_key": "",
                "enabled": True,
            },
        )
    )
    assert configured["has_api_key"] is False
    assert "api_key" not in configured
    data(
        page.request.post(
            f"{API_BASE}/api/agent/threads",
            data={"course_id": course_id, "provider_id": "openai", "title": "Browser verification"},
        )
    )

    page.goto(f"{APP_BASE}/courses/{course_id}/library/documents/{document_id}")
    page.wait_for_load_state("networkidle")
    page.screenshot(path="artifacts/agent-before-open.png", full_page=True)
    assert page.get_by_role("heading", name="Agent Context Verification").is_visible()

    host = page.locator(".agent-host")
    content = page.locator(".agent-host__content")
    width_before = content.bounding_box()["width"]
    page.get_by_role("button", name=re.compile("PILOT")).click()
    dock = page.get_by_role("complementary", name=re.compile("PILOT"))
    dock.wait_for(state="visible")
    dock_animations = dock.evaluate(
        "element => element.getAnimations().map(animation => animation.animationName)"
    )
    assert "agent-dock-in" in dock_animations, dock_animations
    page.wait_for_timeout(350)
    content_box = content.bounding_box()
    dock_box = dock.bounding_box()
    assert width_before - content_box["width"] >= 350
    assert content_box["x"] + content_box["width"] <= dock_box["x"] + 1
    assert host.evaluate("element => getComputedStyle(element).gridTemplateColumns").split()[1] != "0px"
    assert page.get_by_role("button", name="当前资料").get_attribute("aria-pressed") == "true"

    page.get_by_role("button", name="选择指定资料").click()
    picker_slot = page.get_by_test_id("agent-document-picker-slot")
    assert picker_slot.get_attribute("data-state") == "open"
    picker = page.get_by_role("region", name="选择 Agent 阅读的资料")
    assert picker.is_visible()
    assert "max-height" in picker_slot.evaluate(
        "element => getComputedStyle(element).transitionProperty"
    )
    picker.get_by_role("button", name="完成资料选择").click()
    assert picker_slot.get_attribute("data-state") == "closed"

    model_selector = page.get_by_role("combobox", name="当前模型")
    assert model_selector.is_visible()
    assert "study-verifier" in model_selector.locator("option:checked").inner_text()
    page.get_by_role("button", name="模型设置").click()
    saved_models = page.get_by_role("region", name="已保存模型配置")
    assert saved_models.is_visible()
    assert saved_models.get_by_role("button", name=re.compile("Local verification model")).is_visible()
    model_input = page.get_by_role("textbox", name="模型名称")
    model_input.fill("study-verifier-updated")
    page.get_by_role("button", name="保存模型配置").click()
    page.get_by_role("status").filter(has_text="模型配置已保存").wait_for()
    assert model_input.input_value() == "study-verifier-updated"
    page.get_by_role("button", name="测试模型连接").click()
    page.get_by_role("status").filter(has_text="连接正常").wait_for(timeout=15_000)
    page.get_by_role("button", name="返回", exact=True).click()
    assert "study-verifier-updated" in model_selector.locator("option:checked").inner_text()

    composer = page.get_by_role("textbox", name=re.compile("PILOT"))
    question = "请根据当前资料说明来源回跳能力"
    composer.fill(question)
    send_button = page.get_by_role("button", name="发送给 PILOT")
    assert composer.input_value() == question
    assert send_button.is_enabled(), "PILOT send button stayed disabled after filling the composer"
    with page.expect_response(
        lambda response: bool(re.search(r"/api/agent/threads/\d+/messages$", response.url)),
        timeout=15_000,
    ) as message_response:
        send_button.click()
    assert message_response.value.ok, (
        f"agent message request failed: {message_response.value.status} "
        f"{message_response.value.text()}"
    )
    page.get_by_text("这份资料说明上下文检索会保留精确来源").wait_for(timeout=15_000)
    assistant_message = page.locator(".agent-message.is-assistant").last
    message_animations = assistant_message.evaluate(
        "element => element.getAnimations().map(animation => animation.animationName)"
    )
    assert "agent-message-assistant-in" in message_animations, message_animations
    assistant_message.get_by_text(re.compile(r"参考来源\s*·\s*\d+")).click()
    source = page.get_by_role("button", name=re.compile("来源"))
    assert source.is_visible()
    page.evaluate(
        """
        () => {
          window.__agentLocatorWrites = [];
          const original = Storage.prototype.setItem;
          Storage.prototype.setItem = function(key, value) {
            if (key.startsWith('studypilot.document.locator.')) {
              window.__agentLocatorWrites.push({ key, value });
            }
            return original.call(this, key, value);
          };
        }
        """
    )
    source.click()
    writes = page.evaluate("window.__agentLocatorWrites")
    assert writes and json.loads(writes[-1]["value"])["blockKey"].startswith("section:")
    assert page.get_by_role("heading", name="Agent Context Verification").is_visible()

    page.get_by_role("button", name="对话历史").click()
    saved_thread = page.get_by_role("button", name=re.compile("打开对话"))
    assert saved_thread.count() >= 1
    saved_thread.first.click()
    page.get_by_text("这份资料说明上下文检索会保留精确来源").first.wait_for()

    page.screenshot(path="artifacts/agent-open-with-answer.png", full_page=True)
    page.get_by_role("button", name="关闭助手").click()
    page.wait_for_timeout(350)
    assert content.bounding_box()["width"] >= width_before - 2
    assert errors == [], errors
    print(
        json.dumps(
            {
                "course_id": course_id,
                "document_id": document_id,
                "width_before": width_before,
                "width_open": content_box["width"],
                "source_return": True,
                "history_restored": True,
                "configuration_saved": True,
                "model_selector": True,
                "dock_animation": "agent-dock-in",
                "reply_animation": "agent-message-assistant-in",
                "console_errors": len(errors),
            },
            ensure_ascii=False,
        )
    )
    browser.close()
