import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";


function learningPath() {
  return {
    subject: "Python",
    goal: "从零掌握 Python，并能独立完成小型程序",
    stages: [
      {
        title: "语言基础",
        objective: "读写最小可运行程序",
        concepts: ["变量", "数据类型"],
      },
      {
        title: "控制流程",
        objective: "让程序根据条件重复执行",
        concepts: ["条件", "循环"],
      },
    ],
  };
}

function learningCard(turn: number) {
  const first = turn === 1;
  return {
    ...(first ? { thread_title: "Python 零基础实践路线", learning_path: learningPath() } : {}),
    concept: first ? "变量" : "数据类型",
    direct_answer: first
      ? "变量是给一个值起的可复用名称。"
      : "数据类型描述一个值能表示什么，以及可以对它做什么。",
    explanation: first
      ? "执行 name = 'Ada' 后，name 会指向字符串 Ada；后续代码可以通过这个名称再次使用它。"
      : "字符串适合文本，整数适合离散数量。选择合适的类型，能让运算意图更清晰。",
    example: {
      scenario: first ? "age = 18" : "name = 'Ada'，age = 18",
      analysis: first ? "age 是变量名，18 是它当前绑定的值。" : "name 是字符串，age 是整数。",
    },
    practice: {
      concept: first ? "变量" : "数据类型",
      type: "multiple_choice",
      question: first ? "下面哪一行创建了变量？" : "下面哪个值是整数？",
      options: first
        ? [
          { id: "A", text: "age = 18" },
          { id: "B", text: "print" },
          { id: "C", text: "if" },
          { id: "D", text: "return" },
        ]
        : [
          { id: "A", text: "'18'" },
          { id: "B", text: "18" },
          { id: "C", text: "True" },
          { id: "D", text: "[18]" },
        ],
      correct_option: first ? "A" : "B",
      reference_answer: first ? "A。等号把右侧的值绑定给左侧名称。" : "B。没有引号的 18 是整数。",
    },
  };
}

function assistantMessage(turn: number) {
  return {
    id: 100 + turn,
    role: "assistant",
    content: "",
    sources: [],
    attachments: [],
    metadata: {
      learning_card: learningCard(turn),
      lesson_index: turn,
    },
    status: "complete",
    error: "",
  };
}

async function removeTree(path: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
    }
  }
}

test("plans a source-free course, answers a lesson, and restores it from learning history", async ({}, testInfo) => {
  test.setTimeout(120_000);
  const dataDir = await mkdtemp(join(tmpdir(), "studypilot-autonomous-learning-"));
  let app: ElectronApplication | undefined;
  let oldThreadId = 0;
  let latestThread: Record<string, unknown> | undefined;
  const savedMessages: Array<Record<string, unknown>> = [];
  const requestBodies: Array<Record<string, unknown>> = [];

  try {
    app = await electron.launch({
      args: [
        "--no-sandbox",
        "--disable-gpu-sandbox",
        `--user-data-dir=${join(dataDir, "electron-profile")}`,
        ".",
      ],
      cwd: resolve("."),
      env: { ...process.env, STUDYPILOT_DATA_DIR: dataDir },
    });
    const page = await app.firstWindow();
    const rendererErrors: string[] = [];
    page.on("pageerror", (error) => rendererErrors.push(error.message));

    await expect(page.getByRole("heading", { name: "课程书架" })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: /新建课程/ }).first().click();
    const typeDialog = page.getByRole("dialog", { name: "选择这门课程的学习方式" });
    await typeDialog.getByRole("button", { name: "默认学习课程" }).click();
    await typeDialog.getByRole("button", { name: "下一步" }).click();
    const identityDialog = page.getByRole("dialog", { name: "给课程一个清晰的身份" });
    await identityDialog.getByLabel("课程名称").fill("自主学习走查");
    await identityDialog.getByRole("button", { name: "创建并进入课程" }).click();
    await expect(page.getByRole("heading", { name: "自主学习走查" })).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "学习中心", exact: true }).click();
    await expect(page.getByLabel("学习中心工作区")).toBeVisible();
    await expect(page.getByLabel("想学习的主题")).toBeVisible();
    await expect(page.getByRole("button", { name: "新对话" })).toBeVisible();
    await expect(page.getByRole("button", { name: "历史对话" })).toBeVisible();
    await expect(page.getByText("本地自动保存")).toBeVisible();

    await page.route("**/api/agent/threads/*/messages/stream", async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      requestBodies.push(body);
      const match = route.request().url().match(/threads\/(\d+)\/messages\/stream/);
      const threadId = Number(match?.[1] || 0);
      if (!oldThreadId) oldThreadId = threadId;
      const turn = requestBodies.length;
      const card = learningCard(turn);
      const message = assistantMessage(turn);
      savedMessages.push(
        {
          id: turn * 2 - 1,
          role: "user",
          content: body.message,
          sources: [],
          attachments: [],
          metadata: {},
          status: "complete",
          error: "",
        },
        message,
      );
      latestThread = {
        id: threadId,
        title: "Python 零基础实践路线",
        provider_id: String(body.provider_id || "openai"),
        model: "",
        mode: "learning",
        message_count: turn * 2,
        learning_state: {
          lesson_index: turn,
          current_concept: card.concept,
          completed_concepts: turn === 1 ? ["变量"] : ["变量", "数据类型"],
          learning_path: learningPath(),
          last_feedback: "",
        },
      };
      const reply = { thread: latestThread, message };
      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson; charset=utf-8",
        headers: { "access-control-allow-origin": "*" },
        body: [
          JSON.stringify({ type: "start" }),
          JSON.stringify({ type: "final", data: reply }),
          "",
        ].join("\n"),
      });
    });

    await page.getByLabel("想学习的主题").fill("Python");
    await page.getByRole("button", { name: "规划并开始学习" }).click();
    await expect(page.getByRole("complementary", { name: "本轮学习轨迹" })).toHaveCount(0);
    await page.getByRole("button", { name: "查看学习进度" }).click();
    const progressDrawer = page.getByRole("complementary", { name: "本轮学习轨迹" });
    await expect(progressDrawer).toBeVisible();
    await expect(progressDrawer).toContainText("Python · 完整路径");
    await expect(page.getByLabel("学习知识点：变量")).toBeVisible();
    expect((requestBodies[0].context as Record<string, unknown>).source_free).toBe(true);
    expect((requestBodies[0].context as Record<string, unknown>).include_current).toBe(false);
    expect((requestBodies[0].context as Record<string, unknown>).include_library).toBe(false);

    await page.getByRole("radio", { name: "A. age = 18" }).check();
    await page.getByRole("button", { name: "提交答案" }).first().click();
    await expect(page.getByLabel("学习知识点：数据类型")).toBeVisible();
    expect(String(requestBodies[1].message)).toContain("我的答案：A. age = 18");

    const learningScreenshot = testInfo.outputPath("autonomous-learning-path.png");
    await page.screenshot({ path: learningScreenshot, animations: "disabled" });
    await testInfo.attach("autonomous-learning-path", {
      path: learningScreenshot,
      contentType: "image/png",
    });

    await page.getByRole("button", { name: "新对话" }).click();
    await expect(page.getByLabel("想学习的主题")).toBeVisible();
    await page.getByRole("button", { name: "历史对话" }).click();
    const historyRail = page.getByRole("region", { name: "学习历史" });
    await expect(historyRail).toBeVisible();
    await expect(page.getByText("Python 零基础实践路线", { exact: true })).toBeVisible();
    await expect(page.getByText("已学习 2 个知识点")).toBeVisible();
    await expect(page.getByText("当前：数据类型")).toBeVisible();

    await page.route("**/api/agent/threads/**", async (route) => {
      const isSavedThreadDetail = route.request().method() === "GET"
        && new URL(route.request().url()).pathname.endsWith(
          `/api/agent/threads/${oldThreadId}`,
        );
      if (!isSavedThreadDetail || !latestThread) return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          data: { ...latestThread, messages: savedMessages },
        }),
      });
    });
    await page.getByRole("button", { name: "打开对话 Python 零基础实践路线" }).click();
    await expect(page.getByLabel("学习知识点：数据类型")).toBeVisible();

    const historyScreenshot = testInfo.outputPath("learning-history-restored.png");
    await page.screenshot({ path: historyScreenshot, animations: "disabled" });
    await testInfo.attach("learning-history-restored", {
      path: historyScreenshot,
      contentType: "image/png",
    });
    expect(rendererErrors).toEqual([]);
  } finally {
    await app?.close().catch(() => undefined);
    await removeTree(dataDir);
  }
});
