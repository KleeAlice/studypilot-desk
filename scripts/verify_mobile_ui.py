from pathlib import Path

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "test-results" / "mobile-ui"


def main() -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    console_errors: list[str] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(
            viewport={"width": 393, "height": 852},
            device_scale_factor=1,
            is_mobile=True,
            has_touch=True,
        )
        page.on(
            "console",
            lambda message: console_errors.append(message.text)
            if message.type == "error"
            else None,
        )
        page.goto("http://127.0.0.1:5174/mobile.html")
        page.wait_for_load_state("networkidle")

        page.locator("#sp-mobile-heading-home").wait_for(state="visible")
        assert page.locator("#sp-mobile-heading-home").evaluate(
            "node => getComputedStyle(node).outlineStyle"
        ) == "none"
        screen = page.locator(".sp-mobile-screen")
        assert float(screen.evaluate("node => getComputedStyle(node).animationDuration.replace('s', '')")) > 0
        page.wait_for_timeout(300)
        page.screenshot(path=str(ARTIFACTS / "01-home.png"), full_page=True)

        incomplete = page.locator(".sp-task-card:not([data-complete]) .sp-task-card__check").first
        incomplete.click()
        celebrating = page.locator(".sp-task-card[data-celebrate]")
        celebrating.wait_for(state="visible")
        assert celebrating.locator(".sp-task-card__particles i").count() == 6
        page.screenshot(path=str(ARTIFACTS / "02-task-feedback.png"), full_page=True)

        page.get_by_role("button", name="笔记", exact=True).click()
        page.locator("#sp-mobile-heading-notes").wait_for(state="visible")
        page.wait_for_timeout(300)
        page.locator(".sp-graph-node").first.click()
        page.get_by_role("dialog").wait_for(state="visible")
        page.screenshot(path=str(ARTIFACTS / "03-graph-sheet.png"), full_page=True)

        page.get_by_role("button", name="关闭节点详情", exact=True).last.click()
        page.get_by_role("button", name="统计", exact=True).click()
        page.locator("#sp-mobile-heading-stats").wait_for(state="visible")
        page.wait_for_timeout(300)
        page.screenshot(path=str(ARTIFACTS / "04-stats.png"), full_page=True)

        page.emulate_media(color_scheme="dark", reduced_motion="reduce")
        page.goto("http://127.0.0.1:5174/mobile.html")
        page.wait_for_load_state("networkidle")
        page.locator("#sp-mobile-heading-home").wait_for(state="visible")
        reduced_duration_ms = page.locator(".sp-mobile-screen").evaluate(
            "node => parseFloat(getComputedStyle(node).animationDuration) * 1000"
        )
        assert reduced_duration_ms <= 1
        page.screenshot(path=str(ARTIFACTS / "05-dark-reduced-motion.png"), full_page=True)

        assert not console_errors, f"Browser console errors: {console_errors}"
        browser.close()

    print(f"mobile-ui-smoke=passed screenshots={ARTIFACTS}")


if __name__ == "__main__":
    main()
