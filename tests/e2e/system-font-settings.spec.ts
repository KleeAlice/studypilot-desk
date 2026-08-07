import { _electron as electron, expect, test } from "@playwright/test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";


test("global settings exposes every installed Windows font and applies the selected family", async () => {
  test.setTimeout(60_000);
  const dataDir = await mkdtemp(join(tmpdir(), "studypilot-system-fonts-"));
  const screenshotPath = resolve("artifacts", "system-font-settings-cjk.png");
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    app = await electron.launch({
      args: ["--no-sandbox", "--disable-gpu-sandbox", `--user-data-dir=${join(dataDir, "electron-profile")}`, "."],
      cwd: resolve("."),
      env: { ...process.env, STUDYPILOT_DATA_DIR: dataDir },
    });
    const page = await app.firstWindow();
    await expect(page.getByRole("heading", { name: "课程书架" })).toBeVisible({ timeout: 20_000 });

    const discoveredFonts = await page.evaluate(async () => {
      if (!window.studypilot.fonts?.list) throw new Error("Desktop font bridge is unavailable");
      const fonts = await window.studypilot.fonts.list();
      return [...new Set(fonts.map((font) => String(font).trim()).filter(Boolean))];
    });
    expect(discoveredFonts.length).toBeGreaterThan(0);
    expect(discoveredFonts).toContain("cjkFonts 全瀨體");

    await page.getByRole("button", { name: "全局设置" }).click();
    const uiFont = page.getByLabel("界面字体");
    const codeFont = page.getByLabel("代码字体");
    await expect(uiFont).toBeVisible();
    await expect(codeFont).toBeVisible();

    const optionState = await page.evaluate(() => {
      const read = (label: string) => {
        const select = document.querySelector(`select[aria-label="${label}"]`);
        const group = [...(select?.querySelectorAll("optgroup") || [])]
          .find((candidate) => candidate.label.startsWith("全部本机字体（"));
        return {
          groupLabel: group?.label || "",
          values: [...(group?.querySelectorAll("option") || [])].map((option) => option.value.replace(/^local:/, "")),
          misleadingCjkHeading: [...(select?.querySelectorAll("optgroup") || [])]
            .some((candidate) => candidate.label.includes("CJKFonts")),
        };
      };
      return { ui: read("界面字体"), code: read("代码字体") };
    });
    const expected = [...discoveredFonts].sort((left, right) => left.localeCompare(right, "en-US", { sensitivity: "base" }));
    expect(optionState.ui.groupLabel).toBe(`全部本机字体（${expected.length}）`);
    expect(optionState.code.groupLabel).toBe(`全部本机字体（${expected.length}）`);
    expect(optionState.ui.misleadingCjkHeading).toBe(false);
    expect(optionState.code.misleadingCjkHeading).toBe(false);
    expect(optionState.ui.values).toEqual(expected);
    expect(optionState.code.values).toEqual(expected);

    await uiFont.selectOption("local:cjkFonts 全瀨體");
    await expect(uiFont).toHaveValue("local:cjkFonts 全瀨體");
    await expect.poll(() => page.evaluate(() => ({
      ui: getComputedStyle(document.documentElement).getPropertyValue("--ui-font-family").trim(),
      display: getComputedStyle(document.documentElement).getPropertyValue("--display-font-family").trim(),
      body: getComputedStyle(document.body).fontFamily,
    }))).toEqual({
      ui: expect.stringMatching(/^"cjkFonts 全瀨體"/),
      display: expect.stringMatching(/^"cjkFonts 全瀨體"/),
      body: expect.stringMatching(/^"cjkFonts 全瀨體"/),
    });
    expect(await page.evaluate(() => document.fonts.check('16px "cjkFonts 全瀨體"', "中文字体"))).toBe(true);

    const uiSize = page.getByLabel("\u754c\u9762\u5b57\u53f7");
    await uiSize.selectOption("custom");
    const customSize = page.getByLabel("\u81ea\u5b9a\u4e49\u754c\u9762\u5b57\u53f7");
    await customSize.fill("24");
    await customSize.press("Enter");
    await expect.poll(() => page.evaluate(() => (
      getComputedStyle(document.documentElement).getPropertyValue("--ui-body-font-size").trim()
    ))).toBe("24px");
    await page.waitForTimeout(250);
    const customLayout = await page.evaluate(() => ({
      bodyFontSize: getComputedStyle(document.body).fontSize,
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      clippedSettingsPanels: [...document.querySelectorAll<HTMLElement>(".settings-panel")]
        .filter((panel) => panel.scrollWidth > panel.clientWidth + 1).length,
    }));
    expect(customLayout.bodyFontSize).toBe("24px");
    expect(customLayout.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(customLayout.clippedSettingsPanels).toBe(0);
    await customSize.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: resolve("artifacts", "system-font-settings-custom-24px.png"), animations: "disabled" });
    console.log("[system-font-settings] " + JSON.stringify({
      discovered: discoveredFonts.length,
      uiOptions: optionState.ui.values.length,
      codeOptions: optionState.code.values.length,
      selected: await uiFont.inputValue(),
      cssFamily: await page.evaluate(() => (
        getComputedStyle(document.documentElement).getPropertyValue("--ui-font-family").trim()
      )),
      customLayout,
    }));

    await mkdir(resolve("artifacts"), { recursive: true });
    await uiFont.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: screenshotPath, animations: "disabled" });
    await uiFont.click();
    await page.waitForTimeout(250);
    await page.screenshot({ path: resolve("artifacts", "system-font-settings-list-open.png"), animations: "disabled" });
  } finally {
    await app?.close().catch(() => undefined);
    await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
