import { chromium } from "@playwright/test";

const apiBase = "http://127.0.0.1:59999";
const screenshotPath = "C:\\tmp\\studypilot-workspace-shell.png";
const course = { id: 1, title: "机器学习基础", description: "响应式工作区测试课程", is_default: 1 };
const documents = [
  { id: 10, title: "算法复习笔记", filename: "algorithms.md", format: "markdown", status: "ready", created_at: "2026-07-25T09:30:00Z", source_created_at: "2026-07-24T18:20:00Z", excerpt: "从线性模型到神经网络的复习提纲。", body: "从线性模型到神经网络的复习提纲。" },
  { id: 11, title: "模型评估手册", filename: "evaluation.pdf", format: "pdf", status: "ready", created_at: "2026-07-25T10:10:00Z", source_created_at: "2026-07-23T16:00:00Z", excerpt: "交叉验证、偏差与方差。", body: "交叉验证、偏差与方差。" },
];

function dataFor(pathname, method, requestBody) {
  if (pathname === "/api/settings") return {
    onboarding_complete: true, active_course: 1, theme: "light", ui_language: "zh-CN",
    startup_destination: "library", workspace_toolbar_auto_hide: true, wallpaper_mode: "none",
    wallpaper_opacity: 0.82, ui_font: "system", code_font: "system", ui_font_scale: 1,
  };
  if (pathname === "/api/today") return {
    week: { week: 1, phase: 1, gate: "READY", foundation: "", tasks: [], deliverables: [] },
    phase: { phase: 1, title: "基础阶段", gate: "READY", acceptance: "", start_week: 1, end_week: 4 },
    tasks: [],
  };
  if (pathname === "/api/system/status") return { active_course: 1, ready: true };
  if (pathname === "/api/courses") return [course];
  if (pathname === "/api/courses/1/notebooks") return [{
    id: 7, course_id: 1, title: "默认知识画布", description: "", kind: "mixed",
    cover_style: "indigo", canvas_settings: {}, node_count: 2, edge_count: 1,
  }];
  if (pathname === "/api/courses/1/notebooks/7/graph") return {
    nodes: [
      { id: 1, title: "线性模型", module: "基础", kind: "concept", content: "从损失函数理解模型。", color: "blue", position_x: 140, position_y: 140, mastery: 0.7 },
      { id: 2, title: "神经网络", module: "进阶", kind: "concept", content: "组合非线性变换。", color: "teal", position_x: 470, position_y: 250, mastery: 0.5 },
    ],
    edges: [{ id: 1, source_id: 1, target_id: 2, relation: "prerequisite" }],
  };
  if (pathname === "/api/documents") return documents;
  if (method === "PUT" && pathname.startsWith("/api/settings/")) return requestBody?.value ?? requestBody ?? {};
  return {};
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 760 } });
const consoleErrors = [];
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

await page.addInitScript(({ runtimeApiBase }) => {
  window.studypilot = {
    runtime: async () => ({ apiBase: runtimeApiBase, dataDir: "C:\\tmp\\studypilot-shell-test" }),
    window: {
      minimize: async () => undefined, toggleMaximize: async () => undefined,
      close: async () => undefined, isMaximized: async () => false,
    },
    files: {
      chooseDocuments: async () => [], sourceCreatedAt: async () => null,
      getExportDirectory: async () => "C:\\tmp\\studypilot-shell-test\\exports",
      openExportDirectory: async () => undefined,
    },
    fonts: { list: async () => ["Microsoft YaHei UI", "Segoe UI"] },
    appearance: { setZoomFactor: () => undefined },
    capture: { window: async () => null },
    clipboard: { readText: async () => "", readImage: async () => null },
  };
}, { runtimeApiBase: apiBase });

await page.route(`${apiBase}/api/**`, async (route) => {
  const request = route.request();
  const pathname = new URL(request.url()).pathname;
  const body = request.postDataJSON?.() ?? undefined;
  await route.fulfill({
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify({ data: dataFor(pathname, request.method(), body) }),
  });
});

try {
  await page.goto("http://127.0.0.1:5173/courses/1/knowledge/7", { waitUntil: "networkidle" });
  await page.locator(".canvas-toolbar").waitFor();

  const aiBox = await page.getByRole("button", { name: "打开 PILOT 助手" }).boundingBox();
  assert(aiBox && aiBox.x >= 0 && aiBox.x + aiBox.width <= 720, "PILOT 入口超出窄窗口");

  await page.locator(".navrail .nav-toggle").click();
  await page.waitForFunction(() => document.querySelector(".navrail")?.classList.contains("navrail--collapsed"));
  const collapsedWidth = await page.locator(".navrail").evaluate((element) => element.getBoundingClientRect().width);
  assert(collapsedWidth <= 1, `导航收起后仍占据 ${collapsedWidth}px`);
  const restoreNavigation = page.getByRole("button", { name: "展开导航" });
  await restoreNavigation.waitFor();
  await restoreNavigation.click();
  await page.locator(".navrail:not(.navrail--collapsed)").waitFor();

  const toolbar = page.locator(".canvas-toolbar");
  await page.waitForTimeout(1750);
  assert(await toolbar.getAttribute("data-toolbar-visible") === "false", "知识工具栏未按默认设置自动隐藏");
  await page.mouse.move(320, 1);
  await page.waitForFunction(() => document.querySelector(".canvas-toolbar")?.getAttribute("data-toolbar-visible") === "true");

  const splitButton = page.getByRole("button", { name: "分屏打开资料库" });
  await splitButton.click();
  await page.waitForTimeout(500);
  const splitWorkspace = page.locator(".study-split-workspace");
  const splitCount = await splitWorkspace.count();
  const closeSplitCount = await page.getByRole("button", { name: "关闭资料库分屏" }).count();
  const bodyText = (await page.locator("body").innerText()).slice(0, 600);
  assert(splitCount === 1, `分屏状态未保持：workspace=${splitCount}, closeButton=${closeSplitCount}, url=${page.url()}, console=${JSON.stringify(consoleErrors)}, pageErrors=${JSON.stringify(pageErrors)}, body=${bodyText}`);
  const workspaceBox = await splitWorkspace.boundingBox();
  assert(workspaceBox && workspaceBox.width > 0 && workspaceBox.height > 100, "窄窗口分屏容器没有可用尺寸");
  const primaryHeader = await page.locator(".study-split-workspace__primary-header").boundingBox();
  const companionHeader = await page.locator(".study-split-workspace__companion-header").boundingBox();
  assert(primaryHeader && companionHeader, "分屏标题区域未渲染");
  assert(Math.abs(primaryHeader.y - companionHeader.y) <= 1, "分屏标题顶部未对齐");
  assert(Math.abs(primaryHeader.height - companionHeader.height) <= 1, "分屏标题高度不一致");

  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(JSON.stringify({
    aiWithinViewport: true,
    navigationCollapsedWidth: collapsedWidth,
    toolbarAutoHideAndReveal: true,
    splitHeaderDelta: {
      y: Math.abs(primaryHeader.y - companionHeader.y),
      height: Math.abs(primaryHeader.height - companionHeader.height),
    },
    screenshotPath,
    consoleErrors,
  }, null, 2));
} finally {
  await browser.close();
}
