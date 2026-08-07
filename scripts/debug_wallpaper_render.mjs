import { chromium } from "@playwright/test";
const apiBase = process.env.STUDYPILOT_VERIFY_API || "http://127.0.0.1:8765";
const webBase = process.env.STUDYPILOT_VERIFY_WEB || "http://127.0.0.1:5173";


const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
page.on("pageerror", (error) => errors.push(error.message));
page.on("requestfailed", (request) => errors.push(`${request.url()} :: ${request.failure()?.errorText}`));
await page.addInitScript((runtimeApiBase) => {
  window.studypilot = {
    runtime: async () => ({ apiBase: runtimeApiBase, dataDir: "data" }),
    window: { minimize() {}, toggleMaximize() {}, close() {} },
    files: { getExportDirectory: async () => "data/exports", openExportDirectory: async () => undefined },
    fonts: { list: async () => [] },
    appearance: { setZoomFactor: async () => undefined },
    clipboard: { readText: async () => "" },
  };
}, apiBase);
await page.goto(`${webBase}/settings`);
await page.getByRole("heading", { name: "全局设置" }).waitFor();
const visibility = page.getByRole("slider", { name: "壁纸可见度" });
const initialVisibility = await visibility.inputValue();
await visibility.fill("100");
await page.waitForTimeout(1000);
const result = await page.evaluate(async () => {
  const root = document.documentElement;
  const before = getComputedStyle(document.body, "::before");
  const selectors = ["body", "#root", ".desktop-shell", ".agent-host", ".agent-host__content", ".global-subpage", ".settings-center"];
  const layers = selectors.map((selector) => {
    const element = document.querySelector(selector);
    if (!element) return { selector, missing: true };
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    return {
      selector,
      background: style.background,
      backgroundColor: style.backgroundColor,
      opacity: style.opacity,
      zIndex: style.zIndex,
      isolation: style.isolation,
      box: [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)],
    };
  });
  const rawImage = root.style.getPropertyValue("--app-wallpaper-image");
  return {
    dataset: { ...root.dataset },
    variables: {
      image: rawImage,
      opacity: root.style.getPropertyValue("--app-wallpaper-opacity"),
      blur: root.style.getPropertyValue("--app-wallpaper-blur"),
    },
    before: {
      content: before.content,
      background: before.background,
      backgroundImage: before.backgroundImage,
      opacity: before.opacity,
      filter: before.filter,
      zIndex: before.zIndex,
      display: before.display,
    },
    imageResponse: null,
    layers,
    pointLayers: document.elementsFromPoint(1100, 500).map((element) => ({
      tag: element.tagName,
      className: element.className,
      background: getComputedStyle(element).background,
    })),
  };
});
const imageUrl = result.variables.image.match(/url\(["']?(.*?)["']?\)/)?.[1] || "";
if (imageUrl) {
  const response = await fetch(imageUrl);
  result.imageResponse = {
    status: response.status,
    type: response.headers.get("content-type"),
    length: (await response.arrayBuffer()).byteLength,
  };
await visibility.fill(initialVisibility);
}
await page.waitForFunction((value) => document.documentElement.style.getPropertyValue("--app-wallpaper-opacity") === String(Number(value) / 100), initialVisibility);
console.log(JSON.stringify({ result, errors }, null, 2));
await browser.close();
