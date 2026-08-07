import { chromium } from "@playwright/test";
const apiBase = process.env.STUDYPILOT_VERIFY_API || "http://127.0.0.1:8765";
const webBase = process.env.STUDYPILOT_VERIFY_WEB || "http://127.0.0.1:5173";


const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 1 });
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(error.message));

await page.addInitScript((runtimeApiBase) => {
  window.studypilot = {
    runtime: async () => ({ apiBase: runtimeApiBase, dataDir: "data" }),
    window: { minimize() {}, toggleMaximize() {}, close() {} },
    files: {
      chooseDocuments: async () => [],
      getExportDirectory: async () => "data/exports",
      openExportDirectory: async () => undefined,
      chooseExportDirectory: async () => null,
      resetExportDirectory: async () => "data/exports",
    },
    fonts: { list: async () => ["Microsoft YaHei UI", "SimSun", "KaiTi"] },
    appearance: { setZoomFactor: async () => undefined },
    clipboard: { readText: async () => "", writeText: async () => undefined },
  };
}, apiBase);

await page.goto(`${webBase}/settings`);
await page.getByRole("heading", { name: "全局设置" }).waitFor({ timeout: 30_000 });
await page.getByRole("navigation", { name: "设置分类" }).waitFor();

const visibility = page.getByRole("slider", { name: "壁纸可见度" });
const blur = page.getByRole("slider", { name: "壁纸模糊程度" });
const fontSize = page.getByRole("combobox", { name: "界面字号" });
const adaptive = page.getByRole("checkbox", { name: /从壁纸吸取主题色/ });
const initial = {
  visibility: await visibility.inputValue(),
  blur: await blur.inputValue(),
  fontScale: await fontSize.inputValue(),
  adaptive: await adaptive.isChecked(),
};

await visibility.fill("100");
await page.waitForFunction(() => document.documentElement.style.getPropertyValue("--app-wallpaper-opacity") === "1");
await blur.fill("24");
await page.waitForFunction(() => document.documentElement.style.getPropertyValue("--app-wallpaper-blur") === "24px");
await page.waitForTimeout(350);

const atOneHundred = await page.evaluate(() => {
  const root = document.documentElement;
  const before = getComputedStyle(document.body, "::before");
  const panels = [...document.querySelectorAll(".settings-center__content > .settings-panel")];
  const boxes = panels.map((panel) => {
    const box = panel.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
  const sidebar = document.querySelector(".settings-center__sidebar")?.getBoundingClientRect();
  const content = document.querySelector(".settings-center__content")?.getBoundingClientRect();
  return {
    wallpaper: root.dataset.wallpaper,
    opacity: root.style.getPropertyValue("--app-wallpaper-opacity"),
    blur: root.style.getPropertyValue("--app-wallpaper-blur"),
    beforeOpacity: before.opacity,
    beforeFilter: before.filter,
    beforeBackgroundImage: before.backgroundImage,
    adaptive: root.dataset.wallpaperAdaptive,
    accent: root.style.getPropertyValue("--blue"),
    focusRing: root.style.getPropertyValue("--focus-ring"),
    selectionSurface: root.style.getPropertyValue("--selection-surface"),
    panelCount: panels.length,
    panelWidths: boxes.map((box) => Math.round(box.width)),
    verticalGaps: boxes.slice(1).map((box, index) => Math.round(box.y - (boxes[index].y + boxes[index].height))),
    sidebarRight: sidebar ? Math.round(sidebar.right) : 0,
    contentLeft: content ? Math.round(content.left) : 0,
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
});

await page.evaluate(() => document.querySelector(".global-subpage")?.scrollTo({ top: 0 }));
await page.screenshot({ path: "artifacts/settings-center-wallpaper-100-blur-24.png" });
await page.locator(".wallpaper-settings").screenshot({ path: "artifacts/settings-wallpaper-panel-100-blur-24.png" });

await blur.fill("0");
await page.waitForFunction(() => document.documentElement.style.getPropertyValue("--app-wallpaper-blur") === "0px");
await page.waitForTimeout(350);
await page.evaluate(() => document.querySelector(".global-subpage")?.scrollTo({ top: 0 }));
await page.screenshot({ path: "artifacts/settings-center-wallpaper-100-clear.png" });
await page.locator(".wallpaper-settings").screenshot({ path: "artifacts/settings-wallpaper-panel-100-clear.png" });

await visibility.fill("0");
await page.waitForFunction(() => document.documentElement.style.getPropertyValue("--app-wallpaper-opacity") === "0");
await page.waitForTimeout(350);
const atZero = await page.evaluate(() => ({
  opacity: document.documentElement.style.getPropertyValue("--app-wallpaper-opacity"),
  beforeOpacity: getComputedStyle(document.body, "::before").opacity,
}));

await fontSize.selectOption("0.85");
await page.waitForFunction(() => document.documentElement.style.getPropertyValue("--ui-body-font-size") === "11.9px");
const smallBody = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ui-body-font-size").trim());
const smallFixed = await page.locator(".titlebar__name").evaluate((element) => getComputedStyle(element).fontSize);
await fontSize.selectOption("1.4");
await page.waitForFunction(() => document.documentElement.style.getPropertyValue("--ui-body-font-size") === "19.6px");
const extraLargeBody = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ui-body-font-size").trim());
const extraLargeFixed = await page.locator(".titlebar__name").evaluate((element) => getComputedStyle(element).fontSize);

if (initial.adaptive) {
  await adaptive.uncheck();
  await page.waitForFunction(() => !document.documentElement.dataset.wallpaperAdaptive);
  await page.waitForTimeout(250);
  await adaptive.check();
  await adaptive.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.documentElement.dataset.wallpaperAdaptive === "true");
}
const paletteAfterRetoggle = await page.evaluate(() => ({
  accent: document.documentElement.style.getPropertyValue("--blue"),
  focusRing: document.documentElement.style.getPropertyValue("--focus-ring"),
  selectionSurface: document.documentElement.style.getPropertyValue("--selection-surface"),
}));

await visibility.fill(initial.visibility);
await blur.fill(initial.blur);
await fontSize.selectOption(initial.fontScale);
await page.waitForFunction((scale) => document.documentElement.style.getPropertyValue("--ui-font-scale") === scale, initial.fontScale);
if (!initial.adaptive && await adaptive.isChecked()) await adaptive.uncheck();

console.log(JSON.stringify({
  initial,
  atOneHundred,
  atZero,
  typography: { smallBody, extraLargeBody, smallFixed, extraLargeFixed },
  paletteAfterRetoggle,
  errors,
}, null, 2));
await browser.close();
