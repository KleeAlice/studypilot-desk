from __future__ import annotations

import json
import os
from pathlib import Path
from time import perf_counter

from playwright.sync_api import sync_playwright


API_BASE = os.environ.get("STUDYPILOT_VERIFY_API", "http://127.0.0.1:8877")
APP_BASE = os.environ.get("STUDYPILOT_VERIFY_APP", "http://127.0.0.1:5173")


def data(response):
    assert response.ok, f"{response.status}: {response.text()}"
    return response.json()["data"]


source = Path(os.environ["STUDYPILOT_BENCHMARK_MD"])
assert source.is_file(), source

with sync_playwright() as playwright:
    browser_root = Path(os.environ["LOCALAPPDATA"]) / "ms-playwright"
    installed_shells = sorted(
        browser_root.glob(
            "chromium_headless_shell-*/chrome-headless-shell-win64/chrome-headless-shell.exe"
        )
    )
    browser = playwright.chromium.launch(
        headless=True,
        executable_path=str(installed_shells[-1]) if installed_shells else None,
    )
    context = browser.new_context(viewport={"width": 1680, "height": 1050})
    page = context.new_page()
    console_errors: list[str] = []
    page.on(
        "console",
        lambda message: console_errors.append(message.text)
        if message.type == "error"
        else None,
    )
    page.add_init_script(
        f"""
        window.studypilot = {{
          runtime: async () => ({{ apiBase: {json.dumps(API_BASE)}, dataDir: 'large-reader-test-data' }}),
          window: {{ minimize() {{}}, toggleMaximize() {{}}, close() {{}} }},
          clipboard: {{ readText: async () => '', readImage: async () => null }},
          files: {{ saveExport: async () => null }}
        }};
        """
    )

    courses = data(page.request.get(f"{API_BASE}/api/courses"))
    course_id = courses[0]["id"]
    data(
        page.request.put(
            f"{API_BASE}/api/settings/onboarding_complete", data={"value": True}
        )
    )
    imported = data(
        page.request.post(
            f"{API_BASE}/api/documents/import",
            multipart={
                "file": {
                    "name": source.name,
                    "mimeType": "text/markdown",
                    "buffer": source.read_bytes(),
                }
            },
        )
    )
    content = data(
        page.request.get(f"{API_BASE}/api/documents/{imported['id']}/content")
    )
    blocks = content["blocks"]
    assert len(blocks) == 399

    started = perf_counter()
    page.goto(
        f"{APP_BASE}/courses/{course_id}/library/documents/{imported['id']}",
        wait_until="networkidle",
    )
    page.get_by_label("主资料阅读区").wait_for()
    opened_seconds = perf_counter() - started

    rendered = page.locator("[data-document-block]")
    initial_rendered = rendered.count()
    assert initial_rendered <= 64, initial_rendered
    assert page.get_by_role(
        "button", name="继续载入后面的章节（还有 343 个）"
    ).is_visible()

    page.locator(".document-outline-hotspot").hover()
    page.get_by_role("navigation", name="资料大纲").wait_for()
    deepest = page.locator('.document-outline-item[data-outline-level="5"]')
    assert deepest.count() == 198

    target = blocks[-1]
    target_title = target["data"]["title"]
    page.locator(
        f'[id="document-outline-{target["block_key"]}"] .document-outline-link'
    ).click()
    target_block = page.locator(
        f'[data-document-block="{target["block_key"]}"]'
    )
    target_block.wait_for()
    jumped_rendered = rendered.count()
    assert jumped_rendered <= 64, jumped_rendered

    page.locator(".document-outline-hotspot").hover()
    active_outline = page.locator(
        f'[id="document-outline-{target["block_key"]}"]'
    )
    active_outline.wait_for(state="attached")
    page.wait_for_timeout(350)
    navigation = page.get_by_role("navigation", name="资料大纲", include_hidden=True)
    follow_state = {
        "active": active_outline.get_attribute("data-outline-active"),
        "active_visible": active_outline.is_visible(),
        "outline_hidden": navigation.get_attribute("aria-hidden"),
        "body_class": page.locator(".document-workspace__body").get_attribute("class"),
        "active_box": active_outline.bounding_box(),
        "outline_box": navigation.bounding_box(),
    }
    assert active_outline.get_attribute("data-outline-active") == "true"
    assert active_outline.is_visible(), follow_state
    assert navigation.get_attribute("aria-hidden") == "false", follow_state

    screenshot = Path("artifacts/large-markdown-reader.png")
    screenshot.parent.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(screenshot), full_page=True)
    assert console_errors == [], console_errors
    print(
        json.dumps(
            {
                "source_bytes": source.stat().st_size,
                "source_blocks": len(blocks),
                "initial_rendered_blocks": initial_rendered,
                "jumped_rendered_blocks": jumped_rendered,
                "deepest_outline_items": deepest.count(),
                "jump_target": target_title,
                "outline_followed": True,
                "follow_state": follow_state,
                "open_seconds": round(opened_seconds, 3),
                "console_errors": len(console_errors),
                "screenshot": str(screenshot.resolve()),
            },
            ensure_ascii=False,
        )
    )
    browser.close()
