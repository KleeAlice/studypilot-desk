import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function launchLanguageApp(dataDir: string) {
  return electron.launch({
    args: [
      "--no-sandbox",
      "--disable-gpu-sandbox",
      `--user-data-dir=${join(dataDir, "electron-profile")}`,
      ".",
    ],
    cwd: resolve("."),
    env: { ...process.env, STUDYPILOT_DATA_DIR: dataDir },
  });
}

test("a beginner can learn, restart, review, and open every built-in language path", async ({}, testInfo) => {
  test.setTimeout(210_000);
  const dataDir = await mkdtemp(join(tmpdir(), "studypilot-language-e2e-"));
  let app = await launchLanguageApp(dataDir);
  const rendererErrors: string[] = [];
  const observeRenderer = (page: Awaited<ReturnType<typeof app.firstWindow>>) => {
    page.on("pageerror", (error) => rendererErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") rendererErrors.push(message.text());
    });
  };

  try {
    let page = await app.firstWindow();
    observeRenderer(page);

    await expect(page.getByRole("heading", { name: "课程书架" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /新建课程/ }).first().click();
    const typeDialog = page.getByRole("dialog", { name: "选择这门课程的学习方式" });
    await typeDialog.getByRole("button", { name: "语言学习课程" }).click();
    await typeDialog.getByRole("button", { name: "下一步" }).click();

    const identityDialog = page.getByRole("dialog", { name: "建立你的语言学习空间" });
    await identityDialog.getByLabel("课程名称").fill("零基础英语");
    await identityDialog.getByLabel("目标语言").selectOption("en-US");
    await identityDialog.getByLabel("当前水平").selectOption("beginner");
    await identityDialog.getByRole("button", { name: "下一步" }).click();
    await page.getByRole("button", { name: "创建并进入课程" }).click();

    await expect(page.getByRole("heading", { name: "今天学什么" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "问候与声音" })).toBeVisible();
    await page.getByRole("button", { name: "一键开始学习" }).click();
    await expect(page.getByRole("heading", { name: "问候与声音" })).toBeVisible();

    await page.getByRole("button", { name: "开始热身" }).click();
    await expect(page.getByText("Hi, how are you?", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "进入情境" }).click();
    await expect(page.getByRole("heading", { name: "A quick hello" })).toBeVisible();
    await page.getByRole("button", { name: "开始听辨" }).click();
    await page.getByRole("button", { name: "Hi, how are you?", exact: true }).click();
    await expect(page.getByText(/再听一次/)).toBeVisible();
    await expect(page.getByRole("button", { name: "进入跟读" })).toBeDisabled();
    await page.getByRole("button", { name: "I'm good, thanks.", exact: true }).click();
    await page.getByRole("button", { name: "进入跟读" }).click();
    await page.getByRole("button", { name: "完成跟读" }).click();
    await page.getByRole("button", { name: "开始表达" }).click();
    await page.getByLabel("我的表达").fill("Hi, I'm good, thanks. See you later.");
    await page.getByRole("button", { name: "查看本课总结" }).click();
    await page.getByRole("button", { name: "完成本课" }).click();
    await expect(page.getByRole("heading", { name: "本课已完成" })).toBeVisible();

    const screenshotPath = testInfo.outputPath("completed-language-lesson.png");
    await page.screenshot({ path: screenshotPath, animations: "disabled" });
    await testInfo.attach("completed-language-lesson", {
      path: screenshotPath,
      contentType: "image/png",
    });

    const languageNav = page.getByRole("navigation", { name: "语言课程导航" });
    await languageNav.getByRole("button", { name: "设置" }).click();
    await expect(page.getByRole("heading", { name: "语言课程设置" })).toBeVisible();
    await page.getByLabel("当前水平").selectOption("elementary");
    await page.getByLabel("每日词汇目标").fill("16");
    await page.getByLabel("进入课节时自动朗读").check();
    await page.getByRole("button", { name: "保存语言设置" }).click();
    await expect(page.getByText("设置已保存")).toBeVisible();

    await languageNav.getByRole("button", { name: "学习路径" }).click();
    await expect(page.getByRole("heading", { name: /英语.*学习路径/ })).toBeVisible();
    await expect(page.getByText("A1", { exact: true })).toBeVisible();
    await expect(page.getByText("C1", { exact: true })).toBeVisible();
    await expect(page.getByText("1 / 42 课")).toBeVisible();
    await expect(page.getByText("阶段关卡 · 85 分达标").first()).toBeVisible();

    await languageNav.getByRole("button", { name: "课程资料" }).click();
    await expect(page.getByRole("heading", { name: "课程资料库" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "内置分级课程" })).toBeVisible();
    await expect(page.getByText("42 节内置课程")).toBeVisible();
    await page.getByLabel("搜索内置课程").fill("Hi, how are you?");
    await page.getByRole("button", { name: "展开材料：问候与声音", exact: true }).click();
    await expect(page.getByRole("heading", { name: "核心表达" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "A quick hello" })).toBeVisible();

    await languageNav.getByRole("button", { name: "成长记录" }).click();
    await expect(page.getByRole("heading", { name: "学习记录" })).toBeVisible();
    await expect(page.getByText("当前阶段 Pre-A1")).toBeVisible();
    await expect(page.getByText("1 / 7")).toBeVisible();
    await expect(page.getByText("关卡 85 分")).toBeVisible();

    const runtime = await page.evaluate(() => window.studypilot.runtime());
    const coursesPayload = await (await fetch(`${runtime.apiBase}/api/courses`)).json();
    const course = coursesPayload.data.find((item: { title: string }) => item.title === "零基础英语");
    const journeyPayload = await (
      await fetch(`${runtime.apiBase}/api/courses/${course.id}/language/journey`)
    ).json();
    const vocabularyPayload = await (
      await fetch(`${runtime.apiBase}/api/vocabulary?course_id=${course.id}&limit=200`)
    ).json();

    expect(journeyPayload.data.completed_lessons).toBe(1);
    expect(journeyPayload.data.current_lesson.order).toBe(2);
    expect(journeyPayload.data.total_lessons).toBe(42);
    expect(vocabularyPayload.data).toHaveLength(3);
    const refreshedCourse = (await (await fetch(`${runtime.apiBase}/api/courses`)).json()).data
      .find((item: { id: number }) => item.id === course.id);
    expect(refreshedCourse).toMatchObject({ proficiency_level: "elementary", daily_word_goal: 16, auto_play_audio: true });

    await page.getByRole("button", { name: "返回课程书架" }).click();
    await expect(page.getByRole("heading", { name: "课程书架" })).toBeVisible();
    await app.close();

    app = await launchLanguageApp(dataDir);
    page = await app.firstWindow();
    observeRenderer(page);
    await expect(page.getByRole("heading", { name: "课程书架" })).toBeVisible({ timeout: 20_000 });
    const restartedRuntime = await page.evaluate(() => window.studypilot.runtime());
    await page.getByRole("button", { name: "进入课程：零基础英语" }).click();
    await expect(page.getByRole("heading", { name: "今天学什么" })).toBeVisible({ timeout: 20_000 });

    const restartedNav = page.getByRole("navigation", { name: "语言课程导航" });
    await restartedNav.getByRole("button", { name: "设置" }).click();
    await expect(page.getByLabel("当前水平")).toHaveValue("elementary");
    await expect(page.getByLabel("每日词汇目标")).toHaveValue("16");
    await expect(page.getByLabel("进入课节时自动朗读")).toBeChecked();

    await restartedNav.getByRole("button", { name: "今日", exact: true }).click();
    await expect(page.getByText("3 个待复习")).toBeVisible();
    await page.getByRole("button", { name: "一键开始学习" }).click();
    await expect(page.getByRole("heading", { name: "今日训练" })).toBeVisible();
    for (let index = 0; index < 3; index += 1) {
      await page.getByRole("button", { name: "显示释义" }).click();
      await page.getByRole("button", { name: "完成阅读" }).click();
      await page.getByRole("button", { name: "记得" }).click();
    }
    await expect(page.getByText("今天的到期复习已完成")).toBeVisible();
    await page.getByRole("button", { name: "继续今日新课" }).click();
    await expect(page.getByRole("heading", { name: "问候与声音 · 强化" })).toBeVisible();

    await page.getByRole("button", { name: "返回课程书架" }).click();
    await expect(page.getByRole("heading", { name: "课程书架" })).toBeVisible();

    const additionalPacks = [
      { tag: "fr-FR", title: "零基础法语", firstPhrase: "Bonjour, comment ça va ?" },
      { tag: "ja-JP", title: "零基础日语", firstPhrase: "こんにちは" },
      { tag: "ko-KR", title: "零基础韩语", firstPhrase: "안녕하세요?" },
      { tag: "yue-Hant-HK", title: "零基础粤语", firstPhrase: "你好，最近點呀？" },
    ];
    const additionalCourses = await page.evaluate(async ({ apiBase, packs }) => {
      const created = [];
      for (const pack of packs) {
        const response = await fetch(`${apiBase}/api/courses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: pack.title,
            course_type: "language",
            target_language_tag: pack.tag,
            native_language_tag: "zh-CN",
            proficiency_level: "beginner",
            daily_word_goal: 10,
            lesson_minutes: 15,
            training_focus: ["reading", "listening", "speaking", "writing"],
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(JSON.stringify(payload));
        created.push(payload.data);
      }
      return created;
    }, { apiBase: restartedRuntime.apiBase, packs: additionalPacks });

    await page.reload();
    await expect(page.getByRole("heading", { name: "课程书架" })).toBeVisible({ timeout: 20_000 });
    for (const pack of additionalPacks) {
      const created = additionalCourses.find((item: { title: string }) => item.title === pack.title);
      const [packJourney, materials] = await Promise.all([
        (await fetch(`${restartedRuntime.apiBase}/api/courses/${created.id}/language/journey`)).json(),
        (await fetch(`${restartedRuntime.apiBase}/api/courses/${created.id}/language/materials`)).json(),
      ]);
      expect(packJourney.data.total_lessons).toBe(42);
      expect(packJourney.data.stages).toHaveLength(6);
      expect(materials.data.items).toHaveLength(42);

      await page.getByRole("button", { name: `进入课程：${pack.title}` }).click();
      await expect(page.getByRole("heading", { name: "今天学什么" })).toBeVisible();
      await page.getByRole("button", { name: "一键开始学习" }).click();
      await expect(page.getByRole("heading", { name: "问候与声音" })).toBeVisible();
      await page.getByRole("button", { name: "开始热身" }).click();
      await expect(page.locator(".guided-phrase-list").getByText(pack.firstPhrase, { exact: true }).first()).toBeVisible();
      await page.getByRole("button", { name: "返回课程书架" }).click();
      await expect(page.getByRole("heading", { name: "课程书架" })).toBeVisible();
    }
    expect(rendererErrors).toEqual([]);
  } finally {
    await app.close().catch(() => undefined);
    await rm(dataDir, { recursive: true, force: true });
  }
});
