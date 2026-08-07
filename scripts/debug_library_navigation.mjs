import { _electron as electron } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(".");
const screenshots = resolve("artifacts/manual-acceptance/screenshots");
const videos = resolve("artifacts/manual-acceptance/videos");
await Promise.all([screenshots, videos].map((path) => mkdir(path, { recursive: true })));
const evidence = { startedAt: new Date().toISOString(), rendererErrors: [], requests: [], states: [] };
let app;
let page;

async function state(name) {
  const snapshot = await page.evaluate(() => ({
    headings: Array.from(document.querySelectorAll("h1,h2,h3")).map((element) => element.textContent?.trim()).filter(Boolean),
    mainText: document.querySelector(".main-stage")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 2000) || "",
    currentNavigation: document.querySelector('nav[aria-label="主导航"] button[aria-current="page"]')?.getAttribute("aria-label") || "",
    pageScrollChildren: document.querySelector(".page-scroll")?.children.length || 0,
    pageScrollHtml: document.querySelector(".page-scroll")?.innerHTML.slice(0, 1000) || "",
    titlebarAgent: document.querySelector(".titlebar-ai")?.getAttribute("aria-label") || "",
  }));
  evidence.states.push({ name, at: new Date().toISOString(), ...snapshot });
  await page.screenshot({ path: resolve(screenshots, `debug-library-${name}.png`), animations: "disabled" });
}

try {
  app = await electron.launch({ cwd: root, args: ["."], env: { ...process.env }, recordVideo: { dir: videos, size: { width: 1600, height: 900 } }, timeout: 45_000 });
  page = await app.firstWindow();
  page.on("pageerror", (error) => evidence.rendererErrors.push(String(error)));
  page.on("response", (response) => {
    if (response.url().includes("/api/courses/5/")) evidence.requests.push({ status: response.status(), url: response.url() });
  });
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setSize(1600, 900); window.center(); window.show();
  });
  await page.getByRole("heading", { name: "课程书架" }).waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: "进入课程：算法" }).waitFor({ state: "visible", timeout: 30_000 });
  await state("01-shelf-ready");
  await page.getByRole("button", { name: "进入课程：算法" }).click();
  const navigation = page.getByRole("navigation", { name: "主导航" });
  await navigation.waitFor({ state: "visible", timeout: 30_000 });
  await navigation.getByRole("button", { name: "课程主页", exact: true }).waitFor({ state: "visible", timeout: 30_000 });
  await state("02-course-home");
  await navigation.getByRole("button", { name: "资料书架", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('nav[aria-label="主导航"] button[aria-label="资料书架"]')?.getAttribute("aria-current") === "page");
  await page.waitForTimeout(3000);
  await state("03-library-after-three-seconds");
  evidence.libraryHeadingVisible = await page.getByRole("heading", { name: "本地资料库" }).isVisible();
  evidence.ok = evidence.libraryHeadingVisible && evidence.rendererErrors.length === 0;
} catch (error) {
  evidence.ok = false;
  evidence.error = error instanceof Error ? `${error.message}\n${error.stack || ""}` : String(error);
} finally {
  if (app) await app.close().catch(() => undefined);
  evidence.finishedAt = new Date().toISOString();
  if (page) evidence.videoPath = await page.video()?.path().catch(() => undefined);
  console.log(JSON.stringify(evidence, null, 2));
  if (!evidence.ok) process.exitCode = 1;
}
