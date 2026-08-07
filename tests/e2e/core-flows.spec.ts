import { _electron as electron, expect, test, type Page, type TestInfo } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";


type ElectronApp = Awaited<ReturnType<typeof electron.launch>>;
const execFileAsync = promisify(execFile);

async function waitForMotionToSettle(page: Page) {
  await expect(page.locator("html")).not.toHaveAttribute("data-motion-state", "running", { timeout: 5_000 });
}

async function expectNavIndicatorAligned(page: Page, label: string) {
  const active = page.locator('.navrail nav button[aria-current="page"]');
  const indicator = page.locator(".navrail__indicator");
  await expect(active, `${label} active navigation item`).toBeVisible();
  await expect(indicator, `${label} moving navigation indicator`).toBeVisible();
  await expect.poll(async () => {
    const [activeBox, indicatorBox] = await Promise.all([active.boundingBox(), indicator.boundingBox()]);
    if (!activeBox || !indicatorBox) return Number.POSITIVE_INFINITY;
    return Math.abs(activeBox.y - indicatorBox.y);
  }, { message: `${label} indicator settles on active item`, timeout: 1_500 }).toBeLessThanOrEqual(1);
  const [activeBox, indicatorBox] = await Promise.all([active.boundingBox(), indicator.boundingBox()]);
  expect(activeBox, `${label} active item layout box`).not.toBeNull();
  expect(indicatorBox, `${label} indicator layout box`).not.toBeNull();
  expect(Math.abs(activeBox!.y - indicatorBox!.y), `${label} indicator top alignment`).toBeLessThanOrEqual(1);
  expect(Math.abs(activeBox!.height - indicatorBox!.height), `${label} indicator height alignment`).toBeLessThanOrEqual(1);
}

async function startFrameAudit(page: Page) {
  await page.evaluate(() => {
    const target = window as typeof window & { __studyPilotFrameAudit?: { samples: number[]; done: boolean } };
    const audit = { samples: [] as number[], done: false };
    target.__studyPilotFrameAudit = audit;
    const startedAt = performance.now();
    let previous = startedAt;
    const sample = (now: number) => {
      audit.samples.push(now - previous);
      previous = now;
      if (now - startedAt < 650) requestAnimationFrame(sample);
      else audit.done = true;
    };
    requestAnimationFrame(sample);
  });
}

async function finishFrameAudit(page: Page, label: string) {
  await page.waitForFunction(() => {
    const target = window as typeof window & { __studyPilotFrameAudit?: { done: boolean } };
    return target.__studyPilotFrameAudit?.done === true;
  }, undefined, { timeout: 2_500 });
  const metrics = await page.evaluate(() => {
    const target = window as typeof window & { __studyPilotFrameAudit?: { samples: number[] } };
    const samples = [...(target.__studyPilotFrameAudit?.samples || [])].sort((a, b) => a - b);
    const percentile95 = samples[Math.max(0, Math.ceil(samples.length * .95) - 1)] || 0;
    return { frames: samples.length, percentile95, max: samples.at(-1) || 0 };
  });
  console.log("[motion-perf] " + label + " " + JSON.stringify(metrics));
  expect(metrics.frames, label + " sampled frames").toBeGreaterThan(8);
  expect(metrics.percentile95, label + " p95 frame interval").toBeLessThan(50);
  expect(metrics.max, label + " worst frame interval").toBeLessThan(180);
  return metrics;
}

async function setWindowSize(app: ElectronApp, width: number, height: number) {
  await app.evaluate(({ BrowserWindow }, size) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.unmaximize();
    window.setSize(size.width, size.height);
  }, { width, height });
}


async function dragTitlebar(app: ElectronApp, page: Page, deltaX: number, deltaY: number) {
  const dragFill = page.locator(".titlebar__drag-fill");
  await expect(dragFill).toBeVisible();
  const box = await dragFill.boundingBox();
  expect(box).not.toBeNull();
  if (process.platform !== "win32") {
    const startX = box!.x + box!.width / 2;
    const startY = box!.y + box!.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(30);
    await page.mouse.move(startX + deltaX, startY + deltaY, { steps: 4 });
    await page.mouse.up();
    return;
  }

  const metrics = await app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setAlwaysOnTop(true, "screen-saver");
    win.show();
    win.focus();
    win.moveTop();
    const bounds = win.getBounds();
    return {
      bounds,
      displayScaleFactor: screen.getDisplayMatching(bounds).scaleFactor,
    };
  });
  await page.waitForTimeout(100);
  const devicePixelRatio = await page.evaluate(() => window.devicePixelRatio);
  const startX = Math.round((metrics.bounds.x * metrics.displayScaleFactor) + ((box!.x + box!.width / 2) * devicePixelRatio));
  const startY = Math.round((metrics.bounds.y * metrics.displayScaleFactor) + ((box!.y + box!.height / 2) * devicePixelRatio));
  try {
    await execFileAsync("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", resolve("scripts/native-window-drag.ps1"),
      "-StartX", String(startX),
      "-StartY", String(startY),
      "-EndX", String(Math.round(startX + (deltaX * metrics.displayScaleFactor))),
      "-EndY", String(Math.round(startY + (deltaY * metrics.displayScaleFactor))),
      "-Steps", "8",
    ]);
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setAlwaysOnTop(false));
  }
}
async function captureResponsiveViewport(
  app: ElectronApp,
  page: Page,
  testInfo: TestInfo,
  view: "knowledge" | "lab",
  width: number,
  height: number,
) {
  await setWindowSize(app, width, height);
  await page.waitForTimeout(250);
  const metrics = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(metrics.documentWidth, `${view} document overflow at ${width}x${height}`).toBeLessThanOrEqual(metrics.viewportWidth + 1);
  expect(metrics.bodyWidth, `${view} body overflow at ${width}x${height}`).toBeLessThanOrEqual(metrics.viewportWidth + 1);

  const criticalRegions = view === "knowledge"
    ? [
      { name: "knowledge toolbar", locator: page.getByLabel("知识画布工具栏"), minHeight: 48 },
      { name: "knowledge canvas", locator: page.locator(".knowledge-canvas"), minHeight: 180 },
    ]
    : [
      { name: "lab toolbar", locator: page.getByLabel("Python 工作台工具栏"), minHeight: 48 },
      { name: "lab editor", locator: page.getByLabel("Python 代码编辑器"), minHeight: 140 },
      { name: "lab bottom panel", locator: page.getByTestId("output-console"), minHeight: 120 },
      { name: "lab status bar", locator: page.getByLabel("Python 编辑器状态栏"), minHeight: 24 },
    ];
  for (const region of criticalRegions) {
    await expect(region.locator, `${region.name} visible at ${width}x${height}`).toBeVisible();
    const box = await region.locator.boundingBox();
    expect(box, `${region.name} has a layout box at ${width}x${height}`).not.toBeNull();
    if (!box) continue;
    expect(box.x, `${region.name} left edge at ${width}x${height}`).toBeGreaterThanOrEqual(-2);
    expect(box.y, `${region.name} top edge at ${width}x${height}`).toBeGreaterThanOrEqual(-2);
    expect(box.x + box.width, `${region.name} right edge at ${width}x${height}`).toBeLessThanOrEqual(metrics.viewportWidth + 2);
    expect(box.y + box.height, `${region.name} bottom edge at ${width}x${height}`).toBeLessThanOrEqual(metrics.viewportHeight + 2);
    expect(box.height, `${region.name} usable height at ${width}x${height}`).toBeGreaterThanOrEqual(region.minHeight);
  }

  const name = `${view}-${width}x${height}`;
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await waitForMotionToSettle(page);
  await page.screenshot({ path: screenshotPath, animations: "disabled" });
  await testInfo.attach(name, { path: screenshotPath, contentType: "image/png" });
}

async function removeTreeWithRetry(path: string) {
  let failure: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      failure = error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
    }
  }
  throw failure;
}

async function revealKnowledgeToolbar(page: Page) {
  const toolbar = page.getByLabel("知识画布工具栏");
  await page.mouse.move(640, 120);
  await expect(toolbar).toHaveAttribute("data-toolbar-visible", "true");
  await page.waitForTimeout(240);
}

async function createKnowledgeCard(page: Page, buttonName: string, cardName: string) {
  await revealKnowledgeToolbar(page);
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  const card = page.getByLabel(`知识卡片：${cardName}`, { exact: true });
  await expect(card).toBeVisible();
  return card;
}


test("frameless ToC workspace persists a course knowledge canvas and runs the selected Python environment", async ({}, testInfo) => {
  test.setTimeout(120_000);
  const dataDir = await mkdtemp(join(tmpdir(), "studypilot-toc-e2e-"));
  const fixtureName = "e2e-reference.txt";
  const fixturePath = join(dataDir, fixtureName);
  const selectedQuote = "间隔重复需要在恰当的时间主动回忆。";
  await writeFile(
    fixturePath,
    `学习科学测试资料。\n${selectedQuote}\n这段文字不应进入引用卡的选区。`,
    "utf-8",
  );

  const rendererErrors: string[] = [];
  let app: ElectronApp | undefined;
  let apiBase = "";
  try {
    app = await electron.launch({
      args: ["--no-sandbox", "--disable-gpu-sandbox", `--user-data-dir=${join(dataDir, "electron-profile")}`, "."],
      cwd: resolve("."),
      env: { ...process.env, STUDYPILOT_DATA_DIR: dataDir },
    });
    const page = await app.firstWindow();
    page.on("pageerror", (error) => rendererErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") rendererErrors.push(message.text());
    });

    try {
      await expect(page.getByRole("heading", { name: "课程书架" })).toBeVisible({ timeout: 20_000 });
    } catch (error) {
      const body = (await page.locator("body").innerText().catch(() => "<body unavailable>")).slice(0, 1_500);
      throw new Error(`StudyPilot did not reach the course library. url=${page.url()} body=${JSON.stringify(body)} rendererErrors=${JSON.stringify(rendererErrors)}`, { cause: error });
    }
    await expect(page.getByRole("heading", { name: "建立学习画像" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "课程书架" })).toBeVisible();
    const libraryScreenshot = testInfo.outputPath("course-library.png");
    await waitForMotionToSettle(page);
    await page.screenshot({ path: libraryScreenshot, animations: "disabled" });
    await testInfo.attach("course-library", { path: libraryScreenshot, contentType: "image/png" });

    const runtime = await page.evaluate(() => window.studypilot.runtime());
    apiBase = runtime.apiBase;
    expect((await fetch(`${apiBase}/api/health`)).status).toBe(200);
    await page.getByLabel("最大化或还原窗口").click();
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
    await page.getByLabel("最大化或还原窗口").click();

    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setBounds({ ...win.getBounds(), x: 140, y: 100 }, false);
    });
    await page.waitForTimeout(500);
    const boundsBeforeTitlebarDrag = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
    await dragTitlebar(app, page, 96, 56);
    await page.waitForTimeout(150);
    const boundsAfterTitlebarDrag = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds());
    globalThis.console.log(`[window-drag] normal before=${JSON.stringify(boundsBeforeTitlebarDrag)} after=${JSON.stringify(boundsAfterTitlebarDrag)}`);
    expect(Math.abs(boundsAfterTitlebarDrag.width - boundsBeforeTitlebarDrag.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(boundsAfterTitlebarDrag.height - boundsBeforeTitlebarDrag.height)).toBeLessThanOrEqual(1);

    await page.getByLabel("最大化或还原窗口").click();
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized())).toBe(true);
    await page.waitForTimeout(150);
    await dragTitlebar(app, page, 84, 48);
    await expect.poll(
      () => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMaximized()),
      { message: "dragging a maximized titlebar restores the native window", timeout: 3_000 },
    ).toBe(false);
    const positionAfterMaximizedDrag = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getPosition());
    globalThis.console.log(`[window-drag] maximized restored=${positionAfterMaximizedDrag.join(",")}`);
    const uniqueStamp = Date.now();
    const courseTitle = `E2E 知识课程 ${uniqueStamp}`;
    const notebookTitle = `E2E 知识笔记 ${uniqueStamp}`;
    const conceptTitle = `E2E 概念 ${uniqueStamp}`;
    await page.getByRole("button", { name: /新建课程/ }).first().click();
    const typeWizard = page.getByRole("dialog", { name: "选择这门课程的学习方式" });
    await typeWizard.getByRole("button", { name: "默认学习课程" }).click();
    await typeWizard.getByRole("button", { name: "下一步" }).click();
    const courseWizard = page.getByRole("dialog", { name: "给课程一个清晰的身份" });
    await courseWizard.getByLabel("课程名称").fill(courseTitle);
    await courseWizard.getByLabel("课程简介").fill("验证卡片、引用、关系和 Python 实验闭环");
    await courseWizard.getByRole("button", { name: "创建并进入课程" }).click();
    await expect(page).toHaveURL(/#\/courses\/\d+\/home$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "课程书架", level: 1 })).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: courseTitle })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: `当前课程：${courseTitle}` })).toBeVisible();
    const homeScreenshot = testInfo.outputPath("course-home.png");
    await waitForMotionToSettle(page);
    await page.screenshot({ path: homeScreenshot, animations: "disabled" });
    await testInfo.attach("course-home", { path: homeScreenshot, contentType: "image/png" });

    await page.getByRole("button", { name: "学习中心", exact: true }).click();
    await expect(page.getByLabel("学习中心工作区")).toBeVisible();
    await expect(page.getByRole("log", { name: "学习对话" })).toBeVisible();
    await expect(page.locator(".learning-workbench__sources")).toHaveCount(0);
    await expect(page.locator(".learning-workbench__trail")).toHaveCount(0);
    await expect(page.getByRole("region", { name: "学习资料" })).toHaveCount(0);
    const learningCenterScreenshot = testInfo.outputPath("learning-center-unified.png");
    await waitForMotionToSettle(page);
    await page.screenshot({ path: learningCenterScreenshot, animations: "disabled" });
    await testInfo.attach("learning-center-unified", { path: learningCenterScreenshot, contentType: "image/png" });
    await page.getByRole("button", { name: "选择学习资料" }).click();
    await expect(page.getByRole("region", { name: "学习资料" })).toBeVisible();
    const materialDrawerScreenshot = testInfo.outputPath("learning-center-material-drawer.png");
    await page.screenshot({ path: materialDrawerScreenshot, animations: "disabled" });
    await testInfo.attach("learning-center-material-drawer", { path: materialDrawerScreenshot, contentType: "image/png" });
    await page.getByRole("button", { name: "完成资料选择" }).click();
    await page.getByRole("button", { name: "课程主页", exact: true }).click();
    await expect(page.getByRole("heading", { name: courseTitle })).toBeVisible();

    await page.getByRole("button", { name: "打开知识网络" }).click();
    await expect(page.getByRole("heading", { name: "知识笔记", exact: true })).toBeVisible();
    const notebookLibraryScreenshot = testInfo.outputPath("notebook-library-redesign.png");
    await waitForMotionToSettle(page);
    await page.screenshot({ path: notebookLibraryScreenshot, animations: "disabled" });
    await testInfo.attach("notebook-library-redesign", { path: notebookLibraryScreenshot, contentType: "image/png" });
    await page.getByRole("button", { name: "新建知识笔记", exact: true }).click();
    const notebookDialog = page.getByRole("dialog", { name: "新建知识笔记" });
    await notebookDialog.getByLabel("知识笔记名称").fill(notebookTitle);
    await notebookDialog.getByLabel("笔记说明").fill("端到端知识画布与引用验证");
    await notebookDialog.getByRole("button", { name: "思维导图", exact: true }).click();
    await notebookDialog.getByRole("button", { name: "创建知识笔记" }).click();
    await expect(page.getByLabel("知识画布工具栏")).toBeVisible();

    const clipboardPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    await app.evaluate(({ clipboard, nativeImage }, base64) => {
      clipboard.writeImage(nativeImage.createFromDataURL(`data:image/png;base64,${base64}`));
    }, clipboardPng);
    await revealKnowledgeToolbar(page);
    await page.getByRole("button", { name: "粘贴图片", exact: true }).click();
    const pastedImage = page.locator(".canvas-card__image").first();
    await expect(pastedImage).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => pastedImage.evaluate((image) => (image as HTMLImageElement).naturalWidth), {
      message: "clipboard image is decoded from the course-scoped local media endpoint",
      timeout: 20_000,
    }).toBeGreaterThan(0);
    await expect(pastedImage).toHaveAttribute("src", /\/api\/courses\/\d+\/media\/images\//);
    await page.locator(".canvas-card__image-button").first().click();
    await expect(page.getByRole("dialog", { name: "图片预览" })).toBeVisible();
    await expect(page.getByRole("dialog", { name: "图片预览" }).locator("img")).toHaveAttribute("src", /\/api\/courses\/\d+\/media\/images\//);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "图片预览" })).toBeHidden();

    const canvasBoxForCursor = await page.locator(".knowledge-canvas").boundingBox();
    expect(canvasBoxForCursor).not.toBeNull();
    const cursorPoint = {
      x: canvasBoxForCursor!.x + 44,
      y: canvasBoxForCursor!.y + canvasBoxForCursor!.height - 44,
    };
    await page.mouse.move(cursorPoint.x, cursorPoint.y, { steps: 18 });
    const canvasCursor = await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y);
      return target ? getComputedStyle(target).cursor : "missing";
    }, cursorPoint);
    expect(["wait", "progress"]).not.toContain(canvasCursor);

    let concept = await createKnowledgeCard(page, "新建概念", "新概念");
    const conceptTitleSaved = page.waitForResponse((response) =>
      response.request().method() === "PATCH"
      && /\/notebooks\/\d+\/nodes\/\d+$/.test(response.url()),
    );
    await page.getByLabel("卡片检查器").getByLabel("标题").fill(conceptTitle);
    expect((await conceptTitleSaved).ok()).toBe(true);
    concept = page.getByLabel(`知识卡片：${conceptTitle}`, { exact: true });
    await expect(concept).toBeVisible();
    await createKnowledgeCard(page, "新建便签", "新便签");
    await createKnowledgeCard(page, "新建记忆卡", "新记忆卡");
    await page.getByRole("button", { name: "适合全部内容" }).click();

    await page.getByLabel("关系类型").selectOption("mindmap");
    await page.getByRole("button", { name: `从 ${conceptTitle}开始连接` }).click();
    await page.getByRole("button", { name: "连接到 新便签" }).click();
    const mindmapEdge = page.locator(`g.knowledge-edge-group[aria-label="关系：${conceptTitle} 到 新便签，思维分支"]`);
    await expect(mindmapEdge).toHaveCount(1);

    await mindmapEdge.click({ force: true });
    await expect(page.getByRole("button", { name: "删除关系" })).toBeVisible();
    await page.getByRole("button", { name: "删除关系" }).click();
    await expect(mindmapEdge).toHaveCount(0);

    await page.getByLabel("关系类型").selectOption("association");
    await page.getByRole("button", { name: `从 ${conceptTitle}开始连接` }).click();
    await page.getByRole("button", { name: "连接到 新记忆卡" }).click();
    const associationEdge = page.locator(`g.knowledge-edge-group[aria-label="关系：${conceptTitle} 到 新记忆卡，自由关联"]`);
    await expect(associationEdge).toHaveCount(1);

    await concept.focus();
    await concept.press("Enter");
    await expect(page.getByRole("complementary", { name: "卡片检查器" })).toBeVisible();
    const masterySaved = page.waitForResponse((response) =>
      response.request().method() === "PATCH"
      && /\/notebooks\/\d+\/nodes\/\d+$/.test(response.url()),
    );
    const mastery = page.getByRole("slider", { name: `调整“${conceptTitle}”掌握度` });
    await mastery.fill("80");
    await mastery.blur();
    expect((await masterySaved).ok()).toBe(true);
    await expect(concept).toContainText("80% 掌握");

    const beforeSize = await concept.evaluate((element) => ({
      width: Number.parseFloat((element as HTMLElement).style.width),
      height: Number.parseFloat((element as HTMLElement).style.height),
    }));
    const resizeHandle = page.getByRole("button", { name: `调整“${conceptTitle}”大小：右下角` });
    const resizeBox = await resizeHandle.boundingBox();
    expect(resizeBox).not.toBeNull();
    const geometrySaved = page.waitForResponse((response) =>
      response.request().method() === "PATCH"
      && /\/notebooks\/\d+\/nodes\/\d+$/.test(response.url()),
    );
    await page.mouse.move(resizeBox!.x + resizeBox!.width / 2, resizeBox!.y + resizeBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(resizeBox!.x + 72, resizeBox!.y + 52, { steps: 8 });
    await page.mouse.up();
    expect((await geometrySaved).ok()).toBe(true);
    const resized = await concept.evaluate((element) => ({
      width: Number.parseFloat((element as HTMLElement).style.width),
      height: Number.parseFloat((element as HTMLElement).style.height),
    }));
    expect(resized.width - beforeSize.width).toBeGreaterThan(40);
    expect(resized.height - beforeSize.height).toBeGreaterThan(25);
    const resizedScreenshot = testInfo.outputPath("knowledge-card-resize.png");
    await page.screenshot({ path: resizedScreenshot, animations: "disabled" });
    await testInfo.attach("knowledge-card-resize", { path: resizedScreenshot, contentType: "image/png" });
    const beforePosition = await concept.evaluate((element) => ({
      x: Number.parseFloat((element as HTMLElement).style.left),
      y: Number.parseFloat((element as HTMLElement).style.top),
    }));
    const box = await concept.boundingBox();
    expect(box).not.toBeNull();
    const positionSaved = page.waitForResponse((response) =>
      response.request().method() === "PATCH"
      && /\/notebooks\/\d+\/nodes\/\d+$/.test(response.url()),
    );
    await page.mouse.move(box!.x + 64, box!.y + 54);
    await page.mouse.down();
    await page.mouse.move(box!.x + 164, box!.y + 119, { steps: 8 });
    await page.mouse.up();
    expect((await positionSaved).ok()).toBe(true);
    const movedPosition = await concept.evaluate((element) => ({
      x: Number.parseFloat((element as HTMLElement).style.left),
      y: Number.parseFloat((element as HTMLElement).style.top),
    }));
    expect(Math.abs(movedPosition.x - beforePosition.x)).toBeGreaterThan(50);
    expect(Math.abs(movedPosition.y - beforePosition.y)).toBeGreaterThan(25);

    await startFrameAudit(page);
    await page.getByRole("button", { name: "课程主页" }).click();
    await expect(page.getByRole("heading", { name: "本周执行" })).toBeVisible();
    await expectNavIndicatorAligned(page, "home");
    await finishFrameAudit(page, "knowledge-to-home");
    await startFrameAudit(page);
    await page.getByRole("button", { name: "知识网络", exact: true }).click();
    await expect(page.getByRole("heading", { name: "知识笔记", exact: true })).toBeVisible();
    await expectNavIndicatorAligned(page, "knowledge");
    await finishFrameAudit(page, "home-to-notebook-library");
    await page.getByRole("button", { name: `打开知识笔记：${notebookTitle}` }).click();
    await expect(page.getByLabel("知识画布工具栏")).toBeVisible();
    const reloadedConcept = page.getByLabel(`知识卡片：${conceptTitle}`, { exact: true });
    const persistedPosition = await reloadedConcept.evaluate((element) => ({
      x: Number.parseFloat((element as HTMLElement).style.left),
      y: Number.parseFloat((element as HTMLElement).style.top),
    }));
    expect(Math.abs(persistedPosition.x - movedPosition.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(persistedPosition.y - movedPosition.y)).toBeLessThanOrEqual(2);
    await expect(page.locator(`g.knowledge-edge-group[aria-label="关系：${conceptTitle} 到 新记忆卡，自由关联"]`)).toHaveCount(1);

    await page.getByRole("button", { name: "资料书架" }).click();
    await expect(page.getByRole("heading", { name: "本地资料库" })).toBeVisible();
    const chooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "导入资料" }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(fixturePath);
    await expect(page.getByRole("heading", { name: "e2e-reference" })).toBeVisible();

    await page.getByRole("button", { name: "知识网络", exact: true }).click();
    await expect(page.getByRole("heading", { name: "知识笔记", exact: true })).toBeVisible();
    await page.getByRole("button", { name: `打开知识笔记：${notebookTitle}` }).click();
    await expect(page.getByLabel("知识画布工具栏")).toBeVisible();
    await revealKnowledgeToolbar(page);
    await page.getByRole("button", { name: "引用资料" }).click();
    const sourceDialog = page.getByRole("dialog", { name: "引用资料" });
    await sourceDialog.getByRole("button", { name: `e2e-reference · ${fixtureName}` }).click();
    const quoteEditor = sourceDialog.getByLabel("引用内容");
    const fullQuote = await quoteEditor.inputValue();
    const selectionStart = fullQuote.indexOf(selectedQuote);
    expect(selectionStart).toBeGreaterThanOrEqual(0);
    await quoteEditor.evaluate((element, selection) => {
      const textarea = element as HTMLTextAreaElement;
      textarea.focus();
      textarea.setSelectionRange(selection.start, selection.end);
      textarea.dispatchEvent(new Event("select", { bubbles: true }));
      document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
    }, { start: selectionStart, end: selectionStart + selectedQuote.length });
    const citeSelection = sourceDialog.getByRole("button", { name: "引用选中文字" });
    await expect(citeSelection).toBeVisible();
    await citeSelection.click();
    const citation = page.getByLabel("知识卡片：摘录 · e2e-reference", { exact: true });
    await expect(citation).toContainText(selectedQuote);
    await expect(citation).not.toContainText("这段文字不应进入引用卡的选区");
    await page.getByRole("button", { name: "适合全部内容" }).click();

    await expect(page.getByRole("button", { name: /专注/ })).toHaveCount(0);

    for (const [width, height] of [[1366, 768], [1920, 1080]] as const) {
      await captureResponsiveViewport(app, page, testInfo, "knowledge", width, height);
    }

    const environmentResponsePromise = page.waitForResponse((response) =>
      response.request().method() === "GET"
      && response.url().includes("/api/python/environments"),
    );
    await page.getByRole("button", { name: "Python 实验室" }).click();
    await expect(page.getByLabel("Python 代码", { exact: true })).toBeVisible();
    await expectNavIndicatorAligned(page, "lab");
    const environmentResponse = await environmentResponsePromise;
    expect(environmentResponse.ok(), "Python environment discovery response").toBe(true);
    const environmentPayload = await environmentResponse.json() as { data?: unknown[] };
    expect(environmentPayload.data?.length, "backend always exposes the current Python interpreter").toBeGreaterThan(0);
    const environment = page.getByLabel("Python 环境", { exact: true });
    await expect.poll(async () => environment.inputValue(), {
      message: "wait for a real Python environment id",
      timeout: 20_000,
    }).not.toBe("");
    await expect(environment).toBeEnabled();

    const runMarker = `STUDYPILOT_E2E_${Date.now()}`;
    await page.getByLabel("Python 代码", { exact: true }).fill(`print("${runMarker}")`);
    await page.getByRole("button", { name: "运行代码", exact: true }).click();
    const console = page.getByTestId("output-console");
    await expect(console.locator(".lab-v2-output")).toContainText(runMarker, { timeout: 20_000 });
    await expect(page.getByLabel("Python 编辑器状态栏")).toContainText("运行通过");

    await expect(page.getByRole("button", { name: /深色控制台|浅色控制台/ })).toHaveCount(0);
    await expect(console).toBeVisible();
    await captureResponsiveViewport(app, page, testInfo, "lab", 1366, 768);
    await captureResponsiveViewport(app, page, testInfo, "lab", 1920, 1080);

    await startFrameAudit(page);
    await page.getByRole("button", { name: "学习统计", exact: true }).click();
    await expect(page.getByRole("heading", { name: "学习统计", exact: true })).toBeVisible();
    await expectNavIndicatorAligned(page, "stats");
    await expect(page.getByRole("img", { name: /过去 14 天共有/ })).toBeVisible();
    await finishFrameAudit(page, "lab-to-learning-stats");
    const statsScreenshot = testInfo.outputPath("learning-stats.png");
    await waitForMotionToSettle(page);
    await page.screenshot({ path: statsScreenshot, animations: "disabled" });
    await testInfo.attach("learning-stats", { path: statsScreenshot, contentType: "image/png" });

    await page.getByRole("button", { name: "设置", exact: true }).click();
    await expect(page.getByRole("heading", { name: "系统设置" })).toBeVisible();
    await page.getByRole("button", { name: "晨雾壁纸" }).click();
    await page.getByRole("slider", { name: "壁纸可见度" }).fill("100");
    await expect(page.locator("html")).not.toHaveAttribute("data-wallpaper-clarity", /.+/);
    const wallpaperAppearance = await page.evaluate(() => ({
      mode: document.documentElement.dataset.wallpaper,
      opacity: getComputedStyle(document.documentElement).getPropertyValue("--app-wallpaper-opacity").trim(),
      image: getComputedStyle(document.body, "::before").backgroundImage,
    }));
    expect(wallpaperAppearance.mode).toBe("dawn");
    expect(wallpaperAppearance.opacity).toBe("1");
    expect(wallpaperAppearance.image).not.toBe("none");
    await page.getByLabel("界面字体").selectOption("song");
    await page.getByLabel("代码字体").selectOption("consolas");
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.uiFont)).toBe("song");
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.codeFont)).toBe("consolas");
    const settingsScreenshot = testInfo.outputPath("settings-typography.png");
    await waitForMotionToSettle(page);
    await page.screenshot({ path: settingsScreenshot, animations: "disabled" });
    await testInfo.attach("settings-typography", { path: settingsScreenshot, contentType: "image/png" });

    await page.getByLabel("界面字体").selectOption("system");
    await page.getByLabel("代码字体").selectOption("system");
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.uiFont)).toBe("system");
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.codeFont)).toBe("system");
    await page.getByRole("button", { name: "深色", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "课程主页", exact: true }).click();
    await expect(page.locator(".course-home")).toBeVisible();
    const darkHomeScreenshot = testInfo.outputPath("course-home-dark.png");
    await page.screenshot({ path: darkHomeScreenshot, animations: "disabled" });
    await testInfo.attach("course-home-dark", { path: darkHomeScreenshot, contentType: "image/png" });
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("button", { name: "浅色", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByLabel("界面语言").selectOption("en-US");
    await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
    await expect(page.getByRole("button", { name: "Course Home", exact: true })).toBeVisible();

    expect(rendererErrors).toEqual([]);
    await app.close();
    await expect.poll(async () => {
      try {
        await fetch(`${apiBase}/api/health`, { signal: AbortSignal.timeout(150) });
        return false;
      } catch {
        return true;
      }
    }, { timeout: 5_000 }).toBe(true);
    app = undefined;
  } finally {
    if (app) {
      try { await app.close(); } catch {}
    }
    await removeTreeWithRetry(dataDir);
  }
});
