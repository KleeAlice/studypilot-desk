import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const apiBase = process.env.STUDYPILOT_VERIFY_API || "http://127.0.0.1:8765";
const webBase = process.env.STUDYPILOT_VERIFY_WEB || "http://127.0.0.1:5173";
const artifactDir = "artifacts/glass-consistency";

await mkdir(artifactDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const page = await browser.newPage({
  viewport: { width: 1840, height: 1080 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") {
    const location = message.location();
    if (location.url.endsWith("/favicon.ico")) return;
    errors.push(`console: ${message.text()}${location.url ? ` @ ${location.url}` : ""}`);
  }
});
page.on("pageerror", (error) => errors.push(`page: ${error.message}`));
page.on("response", (response) => {
  if (response.status() >= 500) errors.push(`${response.status()} ${response.url()}`);
});

await page.addInitScript((runtimeApiBase) => {
  window.studypilot = {
    runtime: async () => ({ apiBase: runtimeApiBase, dataDir: "isolated-visual-check" }),
    window: { minimize() {}, toggleMaximize() {}, close() {} },
    files: {
      chooseDocuments: async () => [],
      getExportDirectory: async () => "data/exports",
      openExportDirectory: async () => undefined,
      chooseExportDirectory: async () => null,
      resetExportDirectory: async () => "data/exports",
    },
    fonts: { list: async () => ["Microsoft YaHei UI", "Segoe UI Variable Text", "KaiTi"] },
    appearance: { setZoomFactor: async () => undefined },
    clipboard: { readText: async () => "", writeText: async () => undefined },
  };
}, apiBase);

async function putSetting(key, value) {
  const response = await page.request.put(`${apiBase}/api/settings/${key}`, { data: { value } });
  if (!response.ok()) throw new Error(`Unable to set ${key}: ${response.status()}`);
}

await putSetting("theme", "light");
await putSetting("wallpaper_mode", "dawn");
await putSetting("wallpaper_opacity", 1);
await putSetting("wallpaper_blur", 4);
await putSetting("glass_opacity", 0.62);
await putSetting("workspace_toolbar_auto_hide", false);

const courseResponse = await page.request.post(`${apiBase}/api/courses`, {
  data: {
    title: "玻璃一致性走查",
    description: "隔离的 UI 验收课程",
    goal: "检查学习页、设置页和 Python 工作台",
    course_type: "knowledge",
  },
});
if (!courseResponse.ok()) throw new Error(`Unable to create course: ${courseResponse.status()}`);
const coursePayload = await courseResponse.json();
const courseId = Number(coursePayload.data.id);
await page.request.post(`${apiBase}/api/courses/${courseId}/activate`);

function materialSnapshot(selectors) {
  return page.evaluate((requestedSelectors) => Object.fromEntries(requestedSelectors.map((selector) => {
    const element = document.querySelector(selector);
    if (!element) return [selector, { missing: true }];
    const style = getComputedStyle(element);
    return [selector, {
      background: style.background,
      backgroundColor: style.backgroundColor,
      color: style.color,
      borderColor: style.borderColor,
      backdropFilter: style.backdropFilter || style.webkitBackdropFilter,
    }];
  })), selectors);
}

await page.goto(`${webBase}/courses/${courseId}/settings`);
await page.getByRole("heading", { name: "系统设置" }).waitFor({ timeout: 30_000 });
const settingsHashBefore = await page.evaluate(() => `${window.location.pathname}${window.location.hash}`);
const settingsNavButtons = page.locator(".settings-center__sidebar nav button");
const settingsNavLabels = await settingsNavButtons.allTextContents();
const typographyNav = settingsNavButtons.filter({ hasText: "字体与字号" });
if (await typographyNav.count() !== 1) {
  const debug = {
    url: page.url(),
    sidebar: await page.locator(".settings-center__sidebar").count(),
    text: (await page.locator("body").innerText()).slice(0, 1600),
  };
  throw new Error(`Unexpected settings navigation: ${JSON.stringify({ settingsNavLabels, debug })}`);
}
await typographyNav.click();
await page.waitForTimeout(300);
const settingsHashAfter = await page.evaluate(() => `${window.location.pathname}${window.location.hash}`);
const typographyTop = await page.locator("#settings-typography").evaluate((element) => Math.round(element.getBoundingClientRect().top));
await page.screenshot({ path: `${artifactDir}/settings-light-glass.png` });
const settingsMaterials = await materialSnapshot([
  ".settings-center__sidebar",
  ".settings-center__content",
  ".settings-panel",
]);

await page.goto(`${webBase}/courses/${courseId}/lab`);
await page.locator(".lab-v2-ide").waitFor({ timeout: 30_000 });
const duplicateConsoleControls = await page.getByText(/深色控制台|浅色控制台|跟随系统/).count();
const labMaterials = await materialSnapshot([
  ".lab-v2-toolbar",
  ".lab-v2-activity",
  ".lab-v2-sidebar",
  ".editor-tabs",
  ".lab-v2-editor-surface > textarea",
  ".code-workbench > .editor-actions",
  ".lab-v2-panel-tabs",
  ".lab-v2-panel-body",
]);
await page.screenshot({ path: `${artifactDir}/python-light-glass.png` });

await page.route("**/api/agent/threads/*/messages/stream", async (route) => {
  const match = route.request().url().match(/threads\/(\d+)\/messages\/stream/);
  const threadId = Number(match?.[1] || 1);
  const learningCard = {
    thread_title: "机器学习零基础路线",
    concept: "监督学习的核心目标",
    direct_answer: "监督学习是从带答案的样本中学习输入到输出的映射，用它对新样本作出预测。",
    explanation: "训练数据由特征和目标组成。模型先观察大量“题目—答案”配对，调整内部参数以缩小预测与真实答案的差距，再用未见过的数据检查能否举一反三。",
    example: {
      scenario: "邮件服务商根据历史邮件及其“垃圾/正常”标签训练过滤器。",
      analysis: "邮件内容是输入特征，标签是目标；训练完成后，模型对新邮件预测类别。",
    },
    practice: {
      concept: "监督学习",
      type: "multiple_choice",
      question: "下面哪个场景最符合监督学习？",
      options: [
        { id: "A", text: "根据带房价标签的历史成交数据预测新房价格" },
        { id: "B", text: "把没有标签的顾客自动分成若干群组" },
        { id: "C", text: "随机生成一组颜色" },
        { id: "D", text: "手工编写固定税率公式" },
      ],
      correct_option: "A",
      reference_answer: "A。历史样本中已有目标房价，模型学习后预测新房价格。",
    },
  };
  const message = {
    id: 102,
    role: "assistant",
    content: "",
    sources: [],
    attachments: [],
    metadata: {
      learning_card: learningCard,
      lesson_index: 1,
      generation: { schema: "studypilot-learning/v1", outcome: "valid" },
    },
    status: "complete",
    error: "",
  };
  const thread = {
    id: threadId,
    course_id: courseId,
    title: learningCard.thread_title,
    provider_id: "openai",
    model: "",
    mode: "learning",
    message_count: 2,
    learning_state: {
      lesson_index: 1,
      current_concept: learningCard.concept,
      completed_concepts: [],
      learning_path: {
        subject: "机器学习",
        goal: "从零理解并应用机器学习",
        stages: [
          { title: "基础概念", objective: "理解任务与数据", concepts: ["监督学习", "训练与评估"] },
          { title: "经典模型", objective: "掌握常用算法", concepts: ["线性模型", "决策树"] },
        ],
      },
    },
  };
  await route.fulfill({
    status: 200,
    contentType: "application/x-ndjson; charset=utf-8",
    headers: { "access-control-allow-origin": "*" },
    body: [
      JSON.stringify({ type: "start" }),
      JSON.stringify({ type: "final", data: { thread, message } }),
      "",
    ].join("\n"),
  });
});

await page.goto(`${webBase}/courses/${courseId}/learning`);
await page.getByLabel("学习中心工作区").waitFor({ timeout: 30_000 });
await page.getByLabel("想学习的主题").fill("机器学习");
await page.getByRole("button", { name: "规划并开始学习" }).click();
await page.locator(".learning-card").waitFor({ timeout: 30_000 });
await page.locator(".learning-card").scrollIntoViewIfNeeded();
await page.waitForTimeout(350);
const learningMaterials = await materialSnapshot([
  ".agent-dock--workspace",
  ".learning-workbench__topbar",
  ".agent-transcript",
  ".learning-card",
  ".learning-card__question",
  ".agent-composer",
]);
await page.screenshot({ path: `${artifactDir}/learning-light-glass.png` });

const checks = {
  settingsRoutePreserved: settingsHashBefore === settingsHashAfter,
  settingsHashBefore,
  settingsHashAfter,
  settingsNavLabels,
  typographyTop,
  duplicateConsoleControls,
  theme: await page.evaluate(() => document.documentElement.dataset.theme),
  glassOpacity: await page.evaluate(() => document.documentElement.style.getPropertyValue("--glass-opacity")),
  settingsMaterials,
  labMaterials,
  learningMaterials,
  errors,
};

if (!checks.settingsRoutePreserved) throw new Error(`Settings route changed: ${settingsHashBefore} -> ${settingsHashAfter}`);
if (Math.abs(typographyTop) > 220) throw new Error(`Typography section did not scroll into view: ${typographyTop}`);
if (duplicateConsoleControls !== 0) throw new Error("Duplicate Python console theme controls are still visible");
if (errors.length) throw new Error(`Runtime errors:\n${errors.join("\n")}`);

console.log(JSON.stringify(checks, null, 2));
await browser.close();
