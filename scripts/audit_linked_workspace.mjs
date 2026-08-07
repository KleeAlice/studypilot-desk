import { chromium } from "@playwright/test";

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
const consoleErrors = [];
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
page.on("pageerror", (error) => consoleErrors.push(error.message));

await page.addInitScript(() => {
  window.studypilot = {
    runtime: async () => ({ apiBase: "http://127.0.0.1:9000", dataDir: "C:/StudyPilot/Audit" }),
    window: { minimize() {}, toggleMaximize() {}, close() {} },
    files: {
      chooseDocuments: async () => [],
      getExportDirectory: async () => "C:/StudyPilot/Audit/exports",
      openExportDirectory: async () => undefined,
    },
    fonts: { list: async () => ["Microsoft YaHei UI", "Aptos"] },
    appearance: { setZoomFactor: async () => undefined },
    clipboard: { readText: async () => "" },
  };
});

const course = { id: 1, title: "联动测试课程", description: "资料与图谱工作台", is_default: 1 };
const notebook = { id: 5, course_id: 1, title: "检索流程图谱", description: "", kind: "mixed", cover_style: "plum", node_count: 0, edge_count: 0 };
const documents = [
  { id: 10, course_id: 1, title: "RAG 流程", filename: "rag-flow.md", body: "flowchart LR", format: "markdown", status: "ready" },
  { id: 12, course_id: 1, title: "评估清单", filename: "evaluation.txt", body: "precision recall", format: "text", status: "ready" },
];
const markdownContent = {
  document: documents[0],
  blocks: [{
    id: 1, document_id: 10, block_key: "markdown:1", block_type: "markdown", ordinal: 0,
    locator: { section: 0 }, data: { title: "RAG Pipeline" },
    text: "# RAG Pipeline\n\n```mermaid\nflowchart LR\n  A[Import] --> B[Index]\n  B --> C[Answer]\n```",
  }],
};

await page.route("http://127.0.0.1:9000/api/**", async (route) => {
  const url = new URL(route.request().url());
  const path = url.pathname;
  let data = [];
  if (path === "/api/settings") data = { onboarding_complete: true, theme: "light", active_course: 1, wallpaper_mode: "none" };
  else if (path.startsWith("/api/settings/")) data = { saved: true };
  else if (path === "/api/today") data = { week: { week: 1, phase: 1, gate: "G1", foundation: "", tasks: [], deliverables: [] }, phase: { phase: 1, title: "联动测试", gate: "G1", acceptance: "", start_week: 1, end_week: 4 }, tasks: [] };
  else if (path === "/api/system/status") data = { status: "ready", active_course: 1 };
  else if (path === "/api/courses") data = [course];
  else if (path === "/api/courses/1/notebooks") data = [notebook];
  else if (path === "/api/courses/1/notebooks/5/graph") data = { nodes: [], edges: [] };
  else if (path === "/api/documents") data = documents;
  else if (path === "/api/documents/10/content") data = markdownContent;
  else if (path === "/api/documents/10/annotations") data = [];
  else if (path === "/api/documents/10/revisions") data = { can_undo: false, can_redo: false };
  else if (path === "/api/agent/providers") data = [];
  else if (path.startsWith("/api/agent/threads")) data = [];
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data }) });
});

await page.goto("http://127.0.0.1:5173/courses/1/knowledge/5");
await page.getByRole("heading", { name: "检索流程图谱" }).waitFor();
await page.getByRole("button", { name: "分屏打开资料库" }).click();
await page.getByRole("complementary", { name: "联动分屏：资料库" }).waitFor();
await page.getByRole("button", { name: "打开资料：RAG 流程" }).click();
await page.getByRole("img", { name: "Mermaid 流程图" }).locator("svg").waitFor();
await page.screenshot({ path: "studypilot-linked-workspace.png", fullPage: true });

await page.goto("http://127.0.0.1:5173/courses/1/library");
await page.getByRole("button", { name: "分屏打开知识图谱" }).click();
await page.getByRole("complementary", { name: "联动分屏：知识图谱" }).waitFor();

await page.getByRole("button", { name: "设置", exact: true }).click();
await page.getByRole("button", { name: "晨雾壁纸" }).click();
const wallpaper = await page.evaluate(() => ({
  mode: document.documentElement.dataset.wallpaper,
  body: getComputedStyle(document.body).backgroundImage,
  shell: getComputedStyle(document.querySelector(".desktop-shell")).backgroundColor,
}));
if (wallpaper.mode !== "dawn" || wallpaper.body === "none" || wallpaper.shell !== "rgba(0, 0, 0, 0)") {
  throw new Error(`Wallpaper did not become visibly active: ${JSON.stringify(wallpaper)}`);
}
if (consoleErrors.length) throw new Error(`Browser errors: ${consoleErrors.join(" | ")}`);

console.log(JSON.stringify({ linkedWorkspace: true, mermaid: true, wallpaper, screenshot: "studypilot-linked-workspace.png" }));
await browser.close();
