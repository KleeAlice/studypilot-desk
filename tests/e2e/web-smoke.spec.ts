import { expect, test } from "@playwright/test";

const today = {
  week: { week: 1, phase: 0, gate: "NEW", foundation: "", tasks: [], deliverables: [] },
  phase: { phase: 0, title: "算法基础", gate: "NEW", acceptance: "", start_week: 1, end_week: 1 },
  tasks: [],
};

test("web workspace boots, calls the API, and navigates without browser errors", async ({ page }) => {
  const requestedApiPaths = new Set<string>();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    requestedApiPaths.add(requestUrl.pathname);
    const responses: Record<string, unknown> = {
      "/api/settings": {
        active_course: 1,
        startup_destination: "course_library",
        theme: "light",
        ui_language: "zh-CN",
        wallpaper_mode: "none",
      },
      "/api/today": today,
      "/api/system/status": { status: "ready", active_course: 1 },
      "/api/courses": [{
        id: 1,
        title: "算法基础",
        description: "跨平台学习课程",
        course_type: "knowledge",
      }],
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: responses[requestUrl.pathname] ?? [] }),
    });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "课程书架" })).toBeVisible();
  await expect(page.getByRole("button", { name: "进入课程：算法基础" })).toBeVisible();
  await page.getByRole("button", { name: "全局设置" }).click();
  await expect(page.getByRole("heading", { name: "全局设置" })).toBeVisible();
  await page.getByRole("button", { name: /返回课程书架/ }).click();
  await expect(page.getByRole("heading", { name: "课程书架" })).toBeVisible();

  expect(requestedApiPaths).toEqual(new Set([
    "/api/settings",
    "/api/today",
    "/api/system/status",
    "/api/courses",
  ]));
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
