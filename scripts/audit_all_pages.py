from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw
from playwright.sync_api import BrowserContext, Page, Route, sync_playwright


API_BASE = os.getenv("STUDYPILOT_AUDIT_API", "http://127.0.0.1:8877")
WEB_BASE = os.getenv("STUDYPILOT_AUDIT_WEB", "http://127.0.0.1:5274")
ARTIFACT_DIR = Path("artifacts/full-page-audit")
CHROME = Path("C:/Program Files/Google/Chrome/Application/chrome.exe")
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)


@dataclass(frozen=True)
class AuditRoute:
    slug: str
    path: str
    family: str


def response_data(response: Any) -> Any:
    if not response.ok:
        raise RuntimeError(f"{response.request.method} {response.url}: {response.status}")
    payload = response.json()
    return payload.get("data", payload)


def runtime_script() -> str:
    api_literal = json.dumps(API_BASE)
    return f"""
      window.studypilot = {{
        runtime: async () => ({{ apiBase: {api_literal}, dataDir: "isolated-all-pages-audit" }}),
        window: {{ minimize() {{}}, toggleMaximize() {{}}, close() {{}} }},
        files: {{
          chooseDocuments: async () => [],
          getExportDirectory: async () => "data/exports",
          openExportDirectory: async () => undefined,
          chooseExportDirectory: async () => null,
          resetExportDirectory: async () => "data/exports",
          saveToArchive: async (payload) => `data/exports/${{payload?.suggestedName || "export.md"}}`,
          chooseWallpaper: async () => null,
        }},
        fonts: {{ list: async () => ["cjkFonts 全瀨體", "Noto Sans SC", "Noto Serif SC", "Microsoft YaHei UI", "Segoe UI Variable Text", "KaiTi"] }},
        appearance: {{ setZoomFactor: async () => undefined }},
        clipboard: {{ readText: async () => "", writeText: async () => undefined }},
        capture: {{ currentWindow: async () => null }},
      }};
    """


def put_setting(request: Any, key: str, value: Any) -> None:
    response_data(request.put(f"{API_BASE}/api/settings/{key}", data={"value": value}))


def seed_data(request: Any) -> dict[str, int]:
    initial_courses = response_data(request.get(f"{API_BASE}/api/courses"))
    initial_trash = response_data(request.get(f"{API_BASE}/api/courses/trash"))
    if len(initial_courses) != 1 or initial_trash:
        raise RuntimeError(
            "All-pages audit requires a fresh isolated database "
            f"(active={len(initial_courses)}, trash={len(initial_trash)})"
        )

    for key, value in {
        "theme": "light",
        "wallpaper_mode": "dawn",
        "wallpaper_opacity": 1,
        "wallpaper_blur": 4,
        "wallpaper_palette_enabled": True,
        "glass_opacity": 0.46,
        "workspace_toolbar_auto_hide": False,
        "font_size": "standard",
        "ui_font_scale": 1,
    }.items():
        put_setting(request, key, value)

    knowledge = response_data(request.post(
        f"{API_BASE}/api/courses",
        data={
            "title": "全页面验收 · 机器学习",
            "description": "用于隔离检查默认课程全部页面",
            "goal": "从基础概念走到能够完成一个小项目",
            "course_type": "knowledge",
            "cover_style": "indigo",
        },
    ))
    knowledge_id = int(knowledge["id"])
    response_data(request.post(f"{API_BASE}/api/courses/{knowledge_id}/activate"))

    imported_ids: list[int] = []
    for name, media_type, content in [
        (
            "machine-learning-notes.md",
            "text/markdown",
            b"# Machine learning\n\nSupervised learning maps examples to labels.\n\n## Evaluation\n\nUse held-out data to check generalization.",
        ),
        (
            "linear-algebra.txt",
            "text/plain",
            b"Vectors have magnitude and direction.\nMatrices represent linear transformations.",
        ),
    ]:
        imported = response_data(request.post(
            f"{API_BASE}/api/documents/import",
            multipart={"file": {"name": name, "mimeType": media_type, "buffer": content}},
        ))
        imported_ids.append(int(imported["id"]))

    for provider_id, label, icon, model in [
        ("openai", "OpenAI", "openai", "gpt-5.6-terra"),
        ("deepseek", "DeepSeek", "deepseek", "deepseek-v3"),
        ("deepseek-pro", "DeepSeek pro", "deepseek", "DeepSeek-V4-Pro"),
    ]:
        response_data(request.put(
            f"{API_BASE}/api/agent/providers/{provider_id}",
            data={
                "label": label,
                "icon": icon,
                "protocol": "openai_compatible",
                "base_url": "http://127.0.0.1:11434/v1",
                "model": model,
                "max_output_tokens": 32000,
                "connect_timeout_seconds": 10,
                "first_byte_timeout_seconds": 90,
                "idle_timeout_seconds": 45,
                "enabled": True,
            },
        ))

    notebooks = response_data(request.get(f"{API_BASE}/api/courses/{knowledge_id}/notebooks"))
    notebook_id = int(notebooks[0]["id"])
    response_data(request.post(
        f"{API_BASE}/api/courses/{knowledge_id}/notebooks/{notebook_id}/nodes",
        data={
            "title": "监督学习",
            "description": "从带答案的数据中学习输入到输出的映射",
            "module": "机器学习基础",
            "content": "训练集用于拟合参数，验证集用于选择方案，测试集用于最终评估。",
            "kind": "concept",
            "color": "blue",
            "position_x": 100,
            "position_y": 120,
        },
    ))

    trash_course = response_data(request.post(
        f"{API_BASE}/api/courses",
        data={"title": "待恢复课程", "description": "回收站页面验收数据"},
    ))
    response_data(request.delete(f"{API_BASE}/api/courses/{int(trash_course['id'])}"))

    seeded_courses = response_data(request.get(f"{API_BASE}/api/courses"))
    seeded_trash = response_data(request.get(f"{API_BASE}/api/courses/trash"))
    if len(seeded_courses) != 2 or len(seeded_trash) != 1:
        raise RuntimeError(
            "All-pages audit seed counts are invalid "
            f"(active={len(seeded_courses)}, trash={len(seeded_trash)})"
        )

    language = response_data(request.post(
        f"{API_BASE}/api/courses",
        data={
            "title": "英语从零到自然表达",
            "description": "内置资料与完整语言学习路径",
            "course_type": "language",
            "target_language_tag": "en-US",
            "native_language_tag": "zh-CN",
            "proficiency_level": "beginner",
            "daily_word_goal": 10,
            "lesson_minutes": 15,
            "pronunciation_scheme": "ipa",
            "training_focus": ["reading", "listening", "speaking", "writing"],
        },
    ))
    language_id = int(language["id"])
    response_data(request.post(f"{API_BASE}/api/courses/{knowledge_id}/activate"))
    final_courses = response_data(request.get(f"{API_BASE}/api/courses"))
    if len(final_courses) != 3:
        raise RuntimeError(
            "All-pages audit expected exactly three visible courses "
            f"after seeding, got {len(final_courses)}"
        )
    return {
        "knowledge": knowledge_id,
        "language": language_id,
        "notebook": notebook_id,
        "document": imported_ids[0],
    }


def build_routes(ids: dict[str, int]) -> list[AuditRoute]:
    knowledge = ids["knowledge"]
    language = ids["language"]
    notebook = ids["notebook"]
    document = ids["document"]
    return [
        AuditRoute("global-courses", "/courses", "global"),
        AuditRoute("global-trash", "/trash", "global"),
        AuditRoute("global-settings", "/settings", "global"),
        AuditRoute("knowledge-home", f"/courses/{knowledge}/home", "knowledge"),
        AuditRoute("knowledge-learning", f"/courses/{knowledge}/learning", "knowledge"),
        AuditRoute("knowledge-roadmap", f"/courses/{knowledge}/roadmap", "knowledge"),
        AuditRoute("knowledge-knowledge", f"/courses/{knowledge}/knowledge", "knowledge"),
        AuditRoute(
            "knowledge-notebook",
            f"/courses/{knowledge}/knowledge/{notebook}",
            "knowledge",
        ),
        AuditRoute("knowledge-library", f"/courses/{knowledge}/library", "knowledge"),
        AuditRoute(
            "knowledge-document",
            f"/courses/{knowledge}/library/documents/{document}",
            "knowledge",
        ),
        AuditRoute("knowledge-lab", f"/courses/{knowledge}/lab", "knowledge"),
        AuditRoute("knowledge-studio", f"/courses/{knowledge}/studio", "knowledge"),
        AuditRoute("knowledge-stats", f"/courses/{knowledge}/stats", "knowledge"),
        AuditRoute("knowledge-settings", f"/courses/{knowledge}/settings", "knowledge"),
        AuditRoute("language-home", f"/courses/{language}/home", "language"),
        AuditRoute("language-journey", f"/courses/{language}/journey", "language"),
        AuditRoute("language-lesson", f"/courses/{language}/lesson", "language"),
        AuditRoute("language-practice", f"/courses/{language}/practice", "language"),
        AuditRoute("language-vocabulary", f"/courses/{language}/vocabulary", "language"),
        AuditRoute("language-library", f"/courses/{language}/library", "language"),
        AuditRoute("language-stats", f"/courses/{language}/stats", "language"),
        AuditRoute("language-settings", f"/courses/{language}/settings", "language"),
    ]


METRICS_SCRIPT = """
() => {
  const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
  const parseColor = (value) => {
    const rgb = value.match(/rgba?\\(([^)]+)\\)/i);
    if (rgb) {
      const parts = rgb[1].replaceAll(",", " ").split(/\\s+/).filter(Boolean);
      const values = parts.filter((part) => part !== "/").map(Number);
      return { r: values[0] || 0, g: values[1] || 0, b: values[2] || 0, a: Number.isFinite(values[3]) ? values[3] : 1 };
    }
    const srgb = value.match(/color\\(srgb\\s+([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)(?:\\s*\\/\\s*([\\d.]+))?\\)/i);
    if (srgb) return { r: Number(srgb[1]) * 255, g: Number(srgb[2]) * 255, b: Number(srgb[3]) * 255, a: srgb[4] ? Number(srgb[4]) : 1 };
    return null;
  };
  const pathFor = (element) => {
    if (element.id) return `#${element.id}`;
    const classes = Array.from(element.classList || []).slice(0, 3);
    return `${element.tagName.toLowerCase()}${classes.map((name) => `.${name}`).join("")}`;
  };
  const leaks = [];
  const opaque = [];
  let glassNodes = 0;
  for (const element of document.querySelectorAll("body *")) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2 || rect.bottom < 0 || rect.top > innerHeight) continue;
    const style = getComputedStyle(element);
    const backdrop = style.backdropFilter || style.webkitBackdropFilter || "";
    if (backdrop && backdrop !== "none") glassNodes += 1;
    const color = parseColor(style.backgroundColor);
    const areaRatio = Math.min(rect.width, innerWidth) * Math.min(rect.height, innerHeight) / viewportArea;
    if (!color || color.a < 0.94 || areaRatio < 0.055) continue;
    const luminance = (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
    const item = {
      selector: pathFor(element),
      areaRatio: Number(areaRatio.toFixed(3)),
      background: style.backgroundColor,
      luminance: Number(luminance.toFixed(3)),
    };
    opaque.push(item);
    const theme = document.documentElement.dataset.theme;
    if ((theme === "light" && luminance < 0.19) || (theme === "dark" && luminance > 0.9)) leaks.push(item);
  }
  const body = document.body;
  const root = document.documentElement;
  return {
    pathname: location.pathname,
    hash: location.hash,
    theme: root.dataset.theme || "",
    title: document.title,
    heading: document.querySelector("h1, h2")?.textContent?.trim() || "",
    bodyText: body.innerText.trim().slice(0, 320),
    horizontalOverflow: Math.max(root.scrollWidth, body.scrollWidth) - innerWidth,
    glassNodes,
    opaqueLargeSurfaces: opaque.slice(0, 24),
    themeLeaks: leaks.slice(0, 24),
    glassOpacity: getComputedStyle(root).getPropertyValue("--glass-opacity").trim(),
  };
}
"""


def learning_card(concept: str, question: str) -> dict[str, Any]:
    return {
        "thread_title": "机器学习资料精读",
        "concept": concept,
        "direct_answer": f"{concept}是本轮需要掌握的唯一知识点。",
        "explanation": "训练数据提供输入与答案，模型通过缩小预测误差学习可复用的规律，再用没有见过的数据检查是否真正学会。",
        "example": {
            "concept": concept,
            "scenario": "邮件系统利用历史邮件及垃圾邮件标签训练过滤器。",
            "analysis": "邮件正文是输入，垃圾或正常是答案；模型学习后对新邮件作出预测。",
        },
        "practice": {
            "concept": concept,
            "type": "multiple_choice",
            "question": question,
            "options": [
                {"id": "A", "text": "根据带房价标签的历史数据预测新房价格"},
                {"id": "B", "text": "把没有标签的顾客自动分组"},
                {"id": "C", "text": "随机生成颜色"},
                {"id": "D", "text": "手工编写固定税率公式"},
            ],
            "correct_option": "A",
            "reference_answer": "A。历史数据已经带有目标房价。",
        },
    }


def install_learning_mock(page: Page, course_id: int, captured: list[dict[str, Any]]) -> None:
    call_count = {"value": 0}

    def fulfill(route: Route) -> None:
        call_count["value"] += 1
        try:
            captured.append(route.request.post_data_json or {})
        except Exception:
            captured.append({})
        index = call_count["value"]
        concept = "监督学习的目标" if index == 1 else "训练集与测试集"
        card = learning_card(
            concept,
            "下面哪个场景最符合监督学习？" if index == 1 else "测试集最重要的作用是什么？",
        )
        thread_match = re.search(r"/threads/(\\d+)/", route.request.url)
        thread_id = int(thread_match.group(1)) if thread_match else 1
        message = {
            "id": 100 + index,
            "role": "assistant",
            "content": "",
            "sources": [],
            "attachments": [],
            "metadata": {
                "learning_card": card,
                "lesson_index": index,
                "generation_trace": {
                    "schema": "studypilot-learning/v1",
                    "outcome": "valid",
                    "fields": [],
                },
            },
            "status": "complete",
            "error": "",
        }
        thread = {
            "id": thread_id,
            "course_id": course_id,
            "title": "机器学习资料精读",
            "provider_id": "openai",
            "model": "",
            "mode": "learning",
            "message_count": index * 2,
            "learning_state": {
                "lesson_index": index,
                "current_concept": concept,
                "completed_concepts": ["监督学习的目标"] if index > 1 else [],
            },
        }
        body = "\n".join([
            json.dumps({"type": "start"}, ensure_ascii=False),
            json.dumps({"type": "final", "data": {"thread": thread, "message": message}}, ensure_ascii=False),
            "",
        ])
        route.fulfill(
            status=200,
            content_type="application/x-ndjson; charset=utf-8",
            headers={"access-control-allow-origin": "*"},
            body=body,
        )

    page.route("**/api/agent/threads/*/messages/stream", fulfill)


def audit_page(
    page: Page,
    route: AuditRoute,
    theme: str,
    errors: list[dict[str, str]],
    suffix: str = "",
    navigate: bool = True,
) -> dict[str, Any]:
    if navigate:
        page.goto(f"{WEB_BASE}{route.path}", wait_until="domcontentloaded", timeout=45_000)
        page.locator(".desktop-shell").wait_for(state="visible", timeout=45_000)
        page.wait_for_timeout(650)
    expected_path = route.path
    actual_path = page.evaluate("location.pathname")
    slug = f"{route.slug}{suffix}"
    screenshot = ARTIFACT_DIR / theme / f"{slug}.png"
    screenshot.parent.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(screenshot))
    metrics = page.evaluate(METRICS_SCRIPT)
    metrics.update({
        "slug": slug,
        "family": route.family,
        "expectedPath": expected_path,
        "routePreserved": actual_path == expected_path,
        "screenshot": str(screenshot).replace("\\", "/"),
        "errors": [item for item in errors if item.get("slug") == route.slug],
    })
    return metrics


def make_contact_sheets(routes: list[dict[str, Any]], theme: str) -> None:
    for family in ("global", "knowledge", "language"):
        items = [item for item in routes if item["theme"] == theme and item["family"] == family]
        if not items:
            continue
        cell_width, cell_height = 460, 292
        columns = 3
        rows = (len(items) + columns - 1) // columns
        sheet = Image.new("RGB", (cell_width * columns, cell_height * rows), "#e8ebf3")
        draw = ImageDraw.Draw(sheet)
        for index, item in enumerate(items):
            source = Image.open(item["screenshot"]).convert("RGB")
            source.thumbnail((cell_width - 12, cell_height - 30))
            x = (index % columns) * cell_width + 6
            y = (index // columns) * cell_height + 22
            sheet.paste(source, (x, y))
            draw.text((x, y - 17), item["slug"], fill="#182033")
        target = ARTIFACT_DIR / f"contact-{theme}-{family}.jpg"
        sheet.save(target, quality=78, optimize=True)


def run_theme(
    browser: Any,
    request: Any,
    theme: str,
    routes: list[AuditRoute],
    ids: dict[str, int],
) -> tuple[list[dict[str, Any]], list[dict[str, str]], list[dict[str, Any]]]:
    put_setting(request, "theme", theme)
    context: BrowserContext = browser.new_context(
        viewport={"width": 1840, "height": 1080},
        device_scale_factor=1,
    )
    context.add_init_script(script=runtime_script())
    page = context.new_page()
    errors: list[dict[str, str]] = []
    current_slug = {"value": "boot"}
    captured_learning_requests: list[dict[str, Any]] = []

    def record(kind: str, text: str) -> None:
        if "favicon.ico" not in text:
            errors.append({"slug": current_slug["value"], "kind": kind, "message": text})

    page.on("pageerror", lambda error: record("page", str(error)))
    page.on(
        "console",
        lambda message: record("console", message.text)
        if message.type == "error"
        else None,
    )
    page.on(
        "response",
        lambda response: record("response", f"{response.status} {response.url}")
        if response.status >= 500
        else None,
    )
    install_learning_mock(page, ids["knowledge"], captured_learning_requests)

    results: list[dict[str, Any]] = []
    for item in routes:
        current_slug["value"] = item.slug
        if item.slug != "knowledge-learning":
            results.append(audit_page(page, item, theme, errors))
            if item.slug == "global-settings":
                font_select = page.get_by_label("界面字体")
                cjk_option = font_select.locator('option[value="local:cjkFonts 全瀨體"]')
                if cjk_option.count() != 1:
                    raise RuntimeError("CJKFonts is not visible in the interface font selector")
                font_select.select_option("local:cjkFonts 全瀨體")
                page.wait_for_function(
                    """() => getComputedStyle(document.documentElement)
                      .getPropertyValue("--ui-font-family")
                      .trim()
                      .startsWith('"cjkFonts 全瀨體"')"""
                )
                cjk_loaded = page.evaluate(
                    """() => !document.fonts || document.fonts.check(
                      '16px "cjkFonts 全瀨體"', '中文字体'
                    )"""
                )
                if not cjk_loaded:
                    raise RuntimeError("CJKFonts is listed but the browser cannot load it")
                results.append(audit_page(
                    page, item, theme, errors, suffix="-cjkfonts", navigate=False,
                ))
                font_select.select_option("system")
                page.wait_for_function(
                    """() => document.documentElement.dataset.uiFont === "system" """
                )
            if item.slug == "knowledge-home":
                put_setting(request, "ui_font_scale", 1.4)
                page.reload(wait_until="domcontentloaded")
                page.locator(".desktop-shell").wait_for(state="visible", timeout=45_000)
                page.wait_for_timeout(350)
                page.get_by_role("button", name="打开 PILOT 助手").click()
                page.get_by_role("button", name="模型设置").click()
                settings = page.locator(".agent-settings-sheet")
                settings.wait_for(state="visible", timeout=20_000)
                page.wait_for_timeout(250)
                action_names = [
                    "删除全部模型配置",
                    "新建模型配置",
                ]
                action_names.extend(
                    button.get_attribute("aria-label") or ""
                    for button in page.locator(".agent-provider-card-actions button").all()
                )
                action_names = [name for name in action_names if name]
                boxes = []
                for name in action_names:
                    button = page.get_by_role("button", name=name)
                    if button.count() == 1 and button.is_visible():
                        boxes.append((name, button.bounding_box()))
                for left_index, (left_name, left_box) in enumerate(boxes):
                    if not left_box:
                        continue
                    for right_name, right_box in boxes[left_index + 1:]:
                        if not right_box:
                            continue
                        intersects = not (
                            left_box["x"] + left_box["width"] <= right_box["x"]
                            or right_box["x"] + right_box["width"] <= left_box["x"]
                            or left_box["y"] + left_box["height"] <= right_box["y"]
                            or right_box["y"] + right_box["height"] <= left_box["y"]
                        )
                        if intersects:
                            raise RuntimeError(
                                f"Agent settings controls overlap: {left_name} / {right_name}"
                            )
                results.append(audit_page(
                    page, item, theme, errors, suffix="-agent-settings", navigate=False,
                ))
                put_setting(request, "ui_font_scale", 1)
                page.reload(wait_until="domcontentloaded")
                page.locator(".desktop-shell").wait_for(state="visible", timeout=45_000)
            continue

        page.goto(f"{WEB_BASE}{item.path}", wait_until="domcontentloaded", timeout=45_000)
        page.locator(".desktop-shell").wait_for(state="visible", timeout=45_000)
        page.get_by_label("学习中心工作区").wait_for(state="visible", timeout=45_000)
        page.wait_for_timeout(500)

        start_shot = ARTIFACT_DIR / theme / "knowledge-learning-start.png"
        page.screenshot(path=str(start_shot))
        results.append({
            **page.evaluate(METRICS_SCRIPT),
            "slug": "knowledge-learning-start",
            "family": "knowledge",
            "expectedPath": item.path,
            "routePreserved": page.evaluate("location.pathname") == item.path,
            "screenshot": str(start_shot).replace("\\", "/"),
            "errors": [error for error in errors if error["slug"] == item.slug],
        })

        page.get_by_role("button", name="管理学习资料").click()
        picker = page.get_by_role("region", name="学习资料")
        picker.wait_for(state="visible", timeout=20_000)
        page.get_by_text("machine-learning-notes", exact=False).first.wait_for(timeout=20_000)
        picker_shot = ARTIFACT_DIR / theme / "knowledge-learning-material-picker.png"
        page.screenshot(path=str(picker_shot))
        results.append({
            **page.evaluate(METRICS_SCRIPT),
            "slug": "knowledge-learning-material-picker",
            "family": "knowledge",
            "expectedPath": item.path,
            "routePreserved": page.evaluate("location.pathname") == item.path,
            "screenshot": str(picker_shot).replace("\\", "/"),
            "errors": [error for error in errors if error["slug"] == item.slug],
        })
        picker.get_by_role("button", name="全选全部资料").click()
        picker.get_by_role("button", name="完成资料选择").click()
        selected_list = page.get_by_role("list", name="已选学习资料")
        selected_list.wait_for(state="visible", timeout=20_000)
        if selected_list.get_by_role("listitem").count() != 2:
            raise RuntimeError("Selected learning materials are not shown directly")
        page.mouse.move(1500, 260)
        page.wait_for_timeout(320)
        history_rail = page.locator(".learning-history-rail")
        if history_rail.get_attribute("data-open") == "true":
            raise RuntimeError("Learning history rail stayed open after the pointer left")
        start_bounds = page.locator(".learning-start").bounding_box()
        option_bounds = page.locator(".learning-start__options").bounding_box()
        if not start_bounds or start_bounds["width"] < 850:
            raise RuntimeError(f"Learning start layout is still too narrow: {start_bounds}")
        if not option_bounds or option_bounds["width"] < 850:
            raise RuntimeError(f"Learning path cards are still too narrow: {option_bounds}")
        selected_shot = ARTIFACT_DIR / theme / "knowledge-learning-selected.png"
        page.screenshot(path=str(selected_shot))
        results.append({
            **page.evaluate(METRICS_SCRIPT),
            "slug": "knowledge-learning-selected",
            "family": "knowledge",
            "expectedPath": item.path,
            "routePreserved": page.evaluate("location.pathname") == item.path,
            "screenshot": str(selected_shot).replace("\\", "/"),
            "errors": [error for error in errors if error["slug"] == item.slug],
            "learningStartBounds": start_bounds,
            "learningOptionsBounds": option_bounds,
        })
        material_start = page.get_by_role("button", name="从这些资料开始")
        if material_start.is_disabled():
            raise RuntimeError("Material learning stayed disabled after selecting every document")
        material_start.click()
        page.locator(".learning-card").first.wait_for(state="visible", timeout=30_000)
        page.wait_for_timeout(350)
        results.append(audit_page(page, item, theme, errors, navigate=False))

        page.get_by_role("radio", name=re.compile(r"^A\.")).last.check()
        page.get_by_role("button", name="提交答案").last.click()
        page.locator(".learning-card").nth(1).wait_for(state="visible", timeout=30_000)
        page.locator(".learning-card").nth(1).scroll_into_view_if_needed()
        page.wait_for_timeout(350)
        complete_shot = ARTIFACT_DIR / theme / "knowledge-learning-complete.png"
        page.screenshot(path=str(complete_shot))
        results.append({
            **page.evaluate(METRICS_SCRIPT),
            "slug": "knowledge-learning-complete",
            "family": "knowledge",
            "expectedPath": item.path,
            "routePreserved": page.evaluate("location.pathname") == item.path,
            "screenshot": str(complete_shot).replace("\\", "/"),
            "errors": [error for error in errors if error["slug"] == item.slug],
        })

    context.close()
    return results, errors, captured_learning_requests


def main() -> None:
    with sync_playwright() as playwright:
        launch_options: dict[str, Any] = {"headless": True}
        if CHROME.exists():
            launch_options["executable_path"] = str(CHROME)
        browser = playwright.chromium.launch(**launch_options)
        request_context = playwright.request.new_context()
        ids = seed_data(request_context)
        routes = build_routes(ids)
        all_results: list[dict[str, Any]] = []
        all_errors: list[dict[str, str]] = []
        learning_requests: dict[str, list[dict[str, Any]]] = {}
        for theme in ("light", "dark"):
            results, errors, captured = run_theme(
                browser, request_context, theme, routes, ids
            )
            all_results.extend(results)
            all_errors.extend(errors)
            learning_requests[theme] = captured
            make_contact_sheets(results, theme)
        browser.close()
        request_context.dispose()

    material_request_checks = {
        theme: bool(requests)
        and len(requests[0].get("context", {}).get("selected_document_ids", [])) == 2
        and requests[0].get("context", {}).get("source_free") is False
        for theme, requests in learning_requests.items()
    }
    report = {
        "ids": ids,
        "routeCount": len(routes),
        "stateCount": len(all_results),
        "results": all_results,
        "errors": all_errors,
        "learningRequests": learning_requests,
        "materialRequestChecks": material_request_checks,
    }
    report_path = ARTIFACT_DIR / "report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    failures: list[str] = []
    failures.extend(
        f"{item['theme']}:{item['slug']} route changed"
        for item in all_results
        if not item["routePreserved"]
    )
    failures.extend(
        f"{item['theme']}:{item['slug']} horizontal overflow {item['horizontalOverflow']}"
        for item in all_results
        if item["horizontalOverflow"] > 2
    )
    for theme, passed in material_request_checks.items():
        if not passed:
            failures.append(f"{theme} material request payload was incorrect")
    failures.extend(
        f"{item['slug']} {item['kind']}: {item['message']}" for item in all_errors
    )
    print(json.dumps({
        "report": str(report_path),
        "routes": len(routes),
        "states": len(all_results),
        "runtimeErrors": len(all_errors),
        "themeLeakStates": [
            f"{item['theme']}:{item['slug']}"
            for item in all_results
            if item["themeLeaks"]
        ],
        "materialRequestChecks": material_request_checks,
        "failures": failures,
    }, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
