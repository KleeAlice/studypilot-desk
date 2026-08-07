import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { Knowledge } from "../src/features/Knowledge";
import { WorkspaceToolbarVisibilityProvider } from "../src/workspace/WorkspaceToolbarVisibility";

test("follows the shared automatic knowledge toolbar visibility state", async () => {
  const api = {
    get: vi.fn(async () => ({ nodes: [], edges: [] })),
    post: vi.fn(), patch: vi.fn(), delete: vi.fn(),
  } as any;
  render(
    <WorkspaceToolbarVisibilityProvider autoHide>
      <Knowledge api={api} />
    </WorkspaceToolbarVisibilityProvider>,
  );

  const toolbar = await screen.findByRole("toolbar", { name: "知识画布工具栏" });
  expect(toolbar).toHaveAttribute("data-toolbar-visible", "true");
  fireEvent.pointerLeave(toolbar);
  await waitFor(() => expect(toolbar).toHaveAttribute("data-toolbar-visible", "false"), { timeout: 1200 });
  fireEvent.pointerMove(window, { clientY: 45 });
  expect(toolbar).toHaveAttribute("data-toolbar-visible", "true");
});

test("opens the document library beside the knowledge canvas", async () => {
  const onOpenLibrarySplit = vi.fn();
  const api = {
    get: vi.fn(async () => ({ nodes: [], edges: [] })),
    post: vi.fn(), patch: vi.fn(), delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} onOpenLibrarySplit={onOpenLibrarySplit} />);
  await userEvent.click(await screen.findByRole("button", { name: "分屏打开资料库" }));

  expect(onOpenLibrarySplit).toHaveBeenCalledTimes(1);
});

test("uses the canvas toolbar as the only knowledge header and keeps the back action inside it", async () => {
  const api = {
    get: vi.fn(async () => ({ nodes: [], edges: [] })),
    post: vi.fn(), patch: vi.fn(), delete: vi.fn(),
  } as any;
  const { container } = render(<Knowledge api={api} onBack={vi.fn()} />);

  await screen.findByText("从第一张卡片开始");
  expect(screen.queryByRole("heading", { name: "默认知识画布" })).not.toBeInTheDocument();
  const back = screen.getByRole("button", { name: "返回笔记本书架" });
  expect(back.closest(".canvas-toolbar")).not.toBeNull();
  expect(container.querySelector(".knowledge-heading")).toBeNull();
  expect(container.querySelector(".canvas-toolbar__primary-actions")).not.toBeNull();
});

test("shows an unclipped canvas font panel with every installed font and live scaling", async () => {
  const api = {
    get: vi.fn(async () => ({
      nodes: [{ id: 1, title: "字体测试", module: "排版", kind: "concept", content: "字号应即时变化", color: "blue", position_x: 120, position_y: 110 }],
      edges: [],
    })),
    post: vi.fn(), patch: vi.fn(), delete: vi.fn(),
  } as any;
  const { container } = render(<Knowledge api={api} systemFonts={["Aptos", "霞鹜文楷"]} librarySplitOpen onOpenLibrarySplit={vi.fn()} />);
  await screen.findByText("字体测试");

  expect(screen.getByRole("button", { name: "关闭资料库分屏" })).toHaveAttribute("aria-pressed", "true");
  await userEvent.click(screen.getByRole("button", { name: "画布设置" }));
  const panel = screen.getByRole("dialog", { name: "画布设置面板" });
  expect(panel.closest(".canvas-toolbar")).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText("画布字体"), "霞鹜文楷");
  expect(screen.getByLabelText("画布字体")).toHaveValue("霞鹜文楷");
  fireEvent.change(screen.getByRole("slider", { name: "卡片字号" }), { target: { value: "150" } });

  const world = container.querySelector(".canvas-world") as HTMLElement;
  expect(world.style.fontFamily).toContain("霞鹜文楷");
  expect(world.style.getPropertyValue("--canvas-font-scale")).toBe("1.5");
});

test("opens a citation at its exact source locator", async () => {
  const onOpenSource = vi.fn();
  const api = {
    get: vi.fn(async (path: string) => path === "/api/knowledge" ? {
      nodes: [{
        id: 5, title: "引用", module: "资料摘录", kind: "citation", content: "Feature",
        color: "sand", position_x: 120, position_y: 110, mastery: .5,
        source_document_id: 9, source_title: "features.xlsx", source_quote: "Feature",
        source_block_key: "xlsx:1", source_locator: { sheet: "Sheet1", range: "A1" },
      }], edges: [],
    } : []),
    post: vi.fn(), patch: vi.fn(), delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} onOpenSource={onOpenSource} />);
  await userEvent.click(await screen.findByRole("button", { name: "打开来源：features.xlsx" }));
  expect(onOpenSource).toHaveBeenCalledWith(9, { sheet: "Sheet1", range: "A1" }, "xlsx:1");
});

test("creates sticky notes, persists dragging, links nodes and cites imported text", async () => {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  const graph = {
    nodes: [
      { id: 1, title: "Python 基础", module: "基础", kind: "concept", content: "", color: "blue", position_x: 120, position_y: 110, mastery: .6 },
      { id: 2, title: "PyTorch", module: "框架", kind: "concept", content: "", color: "teal", position_x: 430, position_y: 220, mastery: .4 },
    ],
    edges: [],
  };
  const api = {
    get: vi.fn(async (path: string) => {
      calls.push({ method: "GET", path });
      if (path === "/api/knowledge") return graph;
      if (path === "/api/documents") return [{ id: 9, title: "RAG 论文", filename: "rag.md", body: "" }];
      if (path === "/api/documents/9") return { id: 9, title: "RAG 论文", filename: "rag.md", body: "检索增强生成把外部知识注入生成过程。" };
      return [];
    }),
    post: vi.fn(async (path: string, body: any) => {
      calls.push({ method: "POST", path, body });
      if (path.includes("/edges")) return { id: 3, ...body };
      return { id: 10, mastery: .5, ...body };
    }),
    patch: vi.fn(async (path: string, body: any) => { calls.push({ method: "PATCH", path, body }); return { ...graph.nodes[0], ...body }; }),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} />);
  expect((await screen.findAllByText("Python 基础")).length).toBeGreaterThan(0);

  await userEvent.click(screen.getByRole("button", { name: "新建便签" }));
  await waitFor(() => expect(calls.some((item) => item.method === "POST" && item.path === "/api/knowledge/nodes" && item.body.kind === "sticky_note")).toBe(true));
  await userEvent.click(screen.getByRole("button", { name: "关闭卡片检查器" }));

  const node = screen.getByTestId("knowledge-node-1");
  node.focus();
  fireEvent.keyDown(node, { key: "Enter" });
  expect(screen.getByRole("heading", { name: "编辑卡片" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "关闭卡片检查器" }));
  const nodeTitle = screen.getByText("Python 基础", { selector: "strong" });
  fireEvent.pointerDown(nodeTitle, { clientX: 150, clientY: 140, pointerId: 1 });
  fireEvent.pointerMove(nodeTitle, { clientX: 240, clientY: 200, pointerId: 1 });
  fireEvent.pointerUp(nodeTitle, { clientX: 240, clientY: 200, pointerId: 1 });
  await waitFor(() => expect(calls.some((item) => item.method === "PATCH" && item.path === "/api/knowledge/nodes/1" && Number.isFinite(item.body.position_x))).toBe(true));

  await userEvent.click(screen.getByRole("button", { name: "从 Python 基础开始连接" }));
  await userEvent.click(screen.getByRole("button", { name: "连接到 PyTorch" }));
  await waitFor(() => expect(calls.some((item) => item.path === "/api/knowledge/edges" && item.body.source_id === 1 && item.body.target_id === 2)).toBe(true));

  await userEvent.click(screen.getByRole("button", { name: "引用资料" }));
  expect(screen.getByRole("dialog", { name: "引用资料" })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: "关闭引用资料" })).toHaveFocus());
  await userEvent.tab({ shift: true });
  expect(screen.getByRole("button", { name: /RAG 论文/ })).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  expect(screen.getByRole("button", { name: "引用资料" })).toHaveFocus();
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "引用资料" })).not.toBeInTheDocument());
  await userEvent.click(screen.getByRole("button", { name: "引用资料" }));
  await userEvent.click(await screen.findByRole("button", { name: /RAG 论文/ }));
  const quote = await screen.findByLabelText("引用内容");
  await userEvent.clear(quote);
  await userEvent.type(quote, "外部知识注入生成过程");
  await userEvent.click(screen.getByRole("button", { name: /添加整段为引用卡片|添加为引用卡片/ }));
  await waitFor(() => expect(calls.some((item) => item.path === "/api/knowledge/nodes" && item.body.kind === "citation" && item.body.source_document_id === 9)).toBe(true));
});

test("rolls a card back when its dragged position cannot be saved", async () => {
  const api = {
    get: vi.fn(async () => ({
      nodes: [{ id: 1, title: "可靠拖拽", module: "交互", kind: "concept", content: "", color: "indigo", position_x: 120, position_y: 110 }],
      edges: [],
    })),
    post: vi.fn(),
    patch: vi.fn(async () => { throw new Error("位置保存失败"); }),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} />);
  const card = await screen.findByTestId("knowledge-node-1");
  const title = screen.getByText("可靠拖拽", { selector: "strong" });
  fireEvent.pointerDown(title, { clientX: 150, clientY: 140, pointerId: 7 });
  fireEvent.pointerMove(title, { clientX: 250, clientY: 220, pointerId: 7 });
  expect(card).toHaveStyle({ left: "220px", top: "190px" });
  fireEvent.pointerUp(title, { clientX: 250, clientY: 220, pointerId: 7 });

  expect(await screen.findByRole("alert")).toHaveTextContent("位置保存失败");
  await waitFor(() => expect(card).toHaveStyle({ left: "120px", top: "110px" }));
});

test("renders a real two-sided memory card and records review feedback", async () => {
  const patches: any[] = [];
  const posts: Array<{ path: string; body: any }> = [];
  const api = {
    get: vi.fn(async () => ({
      nodes: [{
        id: 4,
        title: "闭包记忆卡",
        module: "JavaScript",
        kind: "flashcard",
        content: "正面：什么是闭包？\n背面：函数与其词法环境的组合。",
        color: "mint",
        position_x: 120,
        position_y: 110,
        mastery: .4,
      }],
      edges: [],
    })),
    post: vi.fn(async (path: string, body: any) => {
      posts.push({ path, body });
      return { knowledge_id: 4, alpha: 2.2, beta: 1.8, mastery: .55 };
    }),
    patch: vi.fn(async (_path: string, body: any) => { patches.push(body); return body; }),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} />);
  const card = await screen.findByTestId("knowledge-node-4");
  expect(screen.getByText("什么是闭包？")).toBeVisible();
  expect(screen.queryByText("函数与其词法环境的组合。")).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "显示答案" }));
  expect(screen.getByText("函数与其词法环境的组合。")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "记住了" }));
  await waitFor(() => expect(posts).toContainEqual({
    path: "/api/mastery/4/evidence",
    body: { success: true, weight: 1, source: "flashcard-review" },
  }));

  fireEvent.doubleClick(card);
  const front = screen.getByLabelText("记忆卡正面");
  const back = screen.getByLabelText("记忆卡背面");
  expect(front).toHaveValue("什么是闭包？");
  expect(back).toHaveValue("函数与其词法环境的组合。");
  await userEvent.clear(front);
  await userEvent.type(front, "闭包由哪两部分组成？");
  fireEvent.blur(front);
  await waitFor(() => expect(patches.some((body) => body.content === "正面：闭包由哪两部分组成？\n背面：函数与其词法环境的组合。")).toBe(true));
});

test("places imported citations inside the current zoomed viewport", async () => {
  const posts: any[] = [];
  const api = {
    get: vi.fn(async (path: string) => {
      if (path === "/api/knowledge") return { nodes: [], edges: [] };
      if (path === "/api/documents") return [{ id: 3, title: "课程讲义", filename: "notes.md" }];
      if (path === "/api/documents/3") return { id: 3, title: "课程讲义", filename: "notes.md", body: "一段可引用内容" };
      return [];
    }),
    post: vi.fn(async (_path: string, body: any) => { posts.push(body); return { id: 8, mastery: 0, ...body }; }),
    patch: vi.fn(),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} />);
  await screen.findByRole("heading", { name: "从第一张卡片开始" });
  await userEvent.click(screen.getByRole("button", { name: "放大画布" }));
  await userEvent.click(screen.getByRole("button", { name: "放大画布" }));
  await userEvent.click(screen.getByRole("button", { name: "引用资料" }));
  await userEvent.click(await screen.findByRole("button", { name: /课程讲义/ }));
  await userEvent.click(await screen.findByRole("button", { name: /添加整段为引用卡片|添加为引用卡片/ }));

  const citation = posts.find((body) => body.kind === "citation");
  expect(citation).toBeTruthy();
  expect(citation.position_x).toBe(Math.round((180 - 12) / 1.2));
  expect(citation.position_y).toBe(Math.round((140 - 12) / 1.2));
});

test("serializes rapid position saves so the newest card position wins", async () => {
  const saves: Array<{ body: any; resolve: () => void }> = [];
  const api = {
    get: vi.fn(async () => ({
      nodes: [{ id: 6, title: "串行保存", module: "可靠性", kind: "concept", content: "", color: "indigo", position_x: 120, position_y: 110 }],
      edges: [],
    })),
    post: vi.fn(),
    patch: vi.fn((_path: string, body: any) => new Promise<void>((resolve) => saves.push({ body, resolve }))),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} />);
  const card = await screen.findByTestId("knowledge-node-6");
  card.focus();
  fireEvent.keyDown(card, { key: "ArrowRight" });
  fireEvent.keyDown(card, { key: "ArrowRight" });

  await waitFor(() => expect(saves).toHaveLength(1));
  expect(saves[0].body.position_x).toBe(128);
  saves[0].resolve();
  await waitFor(() => expect(saves).toHaveLength(2));
  expect(saves[1].body.position_x).toBe(136);
  saves[1].resolve();
});

test("keeps the latest selected source when document responses arrive out of order", async () => {
  let resolveFirst!: (value: any) => void;
  let resolveSecond!: (value: any) => void;
  const first = new Promise((resolve) => { resolveFirst = resolve; });
  const second = new Promise((resolve) => { resolveSecond = resolve; });
  const api = {
    get: vi.fn(async (path: string) => {
      if (path === "/api/knowledge") return { nodes: [], edges: [] };
      if (path === "/api/documents") return [
        { id: 1, title: "资料 A", filename: "a.md" },
        { id: 2, title: "资料 B", filename: "b.md" },
      ];
      if (path === "/api/documents/1") return first;
      if (path === "/api/documents/2") return second;
      return [];
    }),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} />);
  await userEvent.click(await screen.findByRole("button", { name: "引用资料" }));
  await userEvent.click(await screen.findByRole("button", { name: /资料 A/ }));
  await userEvent.click(screen.getByRole("button", { name: /资料 B/ }));
  resolveSecond({ id: 2, title: "资料 B", filename: "b.md", body: "B 的最新内容" });
  expect(await screen.findByDisplayValue("B 的最新内容")).toBeInTheDocument();
  resolveFirst({ id: 1, title: "资料 A", filename: "a.md", body: "A 的迟到内容" });
  await Promise.resolve();
  await waitFor(() => expect(screen.getByLabelText("引用内容")).toHaveValue("B 的最新内容"));
});

test("lets the user select and delete an accidental knowledge relation", async () => {
  const deleted: string[] = [];
  const api = {
    get: vi.fn(async () => ({
      nodes: [
        { id: 1, title: "向量", module: "基础", kind: "concept", content: "", color: "indigo", position_x: 120, position_y: 110 },
        { id: 2, title: "检索", module: "应用", kind: "concept", content: "", color: "mint", position_x: 430, position_y: 220 },
      ],
      edges: [{ id: 9, source_id: 1, target_id: 2, relation: "mindmap" }],
    })),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(async (path: string) => { deleted.push(path); }),
  } as any;

  render(<Knowledge api={api} />);
  const edge = await screen.findByRole("button", { name: "关系：向量 到 检索，思维分支" });
  await userEvent.click(edge);
  await userEvent.click(screen.getByRole("button", { name: "删除关系" }));
  await waitFor(() => expect(deleted).toContain("/api/knowledge/edges/9"));
  expect(screen.queryByRole("button", { name: "关系：向量 到 检索，思维分支" })).not.toBeInTheDocument();
});

test("deduplicates memory feedback while a review request is pending", async () => {
  let resolveReview!: (value: any) => void;
  const review = new Promise((resolve) => { resolveReview = resolve; });
  const api = {
    get: vi.fn(async () => ({
      nodes: [{ id: 4, title: "幂等复习", module: "可靠性", kind: "flashcard", content: "正面：问题\n背面：答案", color: "mint", position_x: 120, position_y: 110, mastery: .5 }],
      edges: [],
    })),
    post: vi.fn(() => review),
    patch: vi.fn(),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} />);
  await userEvent.click(await screen.findByRole("button", { name: "显示答案" }));
  const remembered = screen.getByRole("button", { name: "记住了" });
  fireEvent.click(remembered);
  fireEvent.click(remembered);
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(remembered).toBeDisabled();
  resolveReview({ mastery: .6 });
  await waitFor(() => expect(screen.getByRole("button", { name: "显示答案" })).toBeVisible());
});

test("serializes full-card edits so a late response cannot restore stale flashcard text", async () => {
  const saves: Array<{ body: any; resolve: () => void }> = [];
  const api = {
    get: vi.fn(async () => ({
      nodes: [{ id: 5, title: "编辑队列", module: "可靠性", kind: "flashcard", content: "正面：旧问题\n背面：旧答案", color: "mint", position_x: 120, position_y: 110 }],
      edges: [],
    })),
    post: vi.fn(),
    patch: vi.fn((_path: string, body: any) => new Promise<void>((resolve) => saves.push({ body, resolve }))),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} />);
  fireEvent.doubleClick(await screen.findByTestId("knowledge-node-5"));
  fireEvent.change(screen.getByLabelText("记忆卡正面"), { target: { value: "新问题" } });
  fireEvent.blur(screen.getByLabelText("记忆卡正面"));
  fireEvent.change(screen.getByLabelText("记忆卡背面"), { target: { value: "新答案" } });
  fireEvent.blur(screen.getByLabelText("记忆卡背面"));

  await waitFor(() => expect(saves).toHaveLength(1));
  saves[0].resolve();
  await waitFor(() => expect(saves).toHaveLength(2));
  expect(saves[1].body.content).toBe("正面：新问题\n背面：新答案");
  saves[1].resolve();
});

test("keeps card keyboard movement from hijacking controls inside the card", async () => {
  const api = {
    get: vi.fn(async () => ({
      nodes: [{ id: 7, title: "键盘记忆卡", module: "可访问性", kind: "flashcard", content: "正面：问题\n背面：答案", color: "mint", position_x: 120, position_y: 110 }],
      edges: [],
    })),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} />);
  const card = await screen.findByTestId("knowledge-node-7");
  const showAnswer = screen.getByRole("button", { name: "显示答案" });
  showAnswer.focus();
  fireEvent.keyDown(showAnswer, { key: "ArrowRight" });
  expect(api.patch).not.toHaveBeenCalled();
  expect(card).toHaveStyle({ left: "120px", top: "110px" });
  await userEvent.keyboard("{Enter}");
  expect(screen.getByText("答案")).toBeVisible();
});

test("fits distant cards back into the visible canvas", async () => {
  const api = {
    get: vi.fn(async () => ({
      nodes: [{ id: 8, title: "远处节点", module: "导航", kind: "concept", content: "", color: "indigo", position_x: 1200, position_y: 800 }],
      edges: [],
    })),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as any;

  const { container } = render(<Knowledge api={api} />);
  await screen.findByTestId("knowledge-node-8");
  const canvas = container.querySelector<HTMLElement>(".knowledge-canvas")!;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    width: 800, height: 500, top: 0, left: 0, right: 800, bottom: 500, x: 0, y: 0, toJSON: () => ({}),
  });
  expect(screen.getByRole("button", { name: "重置画布" })).toBeVisible();
  expect(screen.getByRole("button", { name: "适合全部内容" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "适合全部内容" }));

  const transform = container.querySelector<HTMLElement>(".canvas-world")!.style.transform;
  const match = transform.match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/);
  expect(match).toBeTruthy();
  const [, x, , zoom] = match!.map(Number);
  const cardLeft = x + 1200 * zoom;
  const cardRight = cardLeft + 232 * zoom;
  expect(cardLeft).toBeGreaterThanOrEqual(40);
  expect(cardRight).toBeLessThanOrEqual(760);

  await userEvent.click(screen.getByRole("button", { name: "重置画布" }));
  expect(container.querySelector<HTMLElement>(".canvas-world")!.style.transform).toBe("translate(12px, 12px) scale(1)");
});

test("creates a citation from only the selected source text", async () => {
  const posts: any[] = [];
  const api = {
    get: vi.fn(async (path: string) => {
      if (path === "/api/knowledge") return { nodes: [], edges: [] };
      if (path === "/api/documents") return [{ id: 12, title: "选区讲义", filename: "selection.md" }];
      if (path === "/api/documents/12") return { id: 12, title: "选区讲义", filename: "selection.md", body: "第一句。第二句。第三句。" };
      return [];
    }),
    post: vi.fn(async (_path: string, body: any) => { posts.push(body); return { id: 13, ...body }; }),
    patch: vi.fn(),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} />);
  await userEvent.click(await screen.findByRole("button", { name: "引用资料" }));
  await userEvent.click(await screen.findByRole("button", { name: /选区讲义/ }));
  const textarea = await screen.findByLabelText("引用内容") as HTMLTextAreaElement;
  textarea.setSelectionRange(4, 8);
  fireEvent.select(textarea);
  await userEvent.click(screen.getByRole("button", { name: "引用选中文字" }));

  expect(posts).toHaveLength(1);
  expect(posts[0].content).toBe("第二句。");
  expect(posts[0].source_quote).toBe("第二句。");
});

test("rolls a chain of failed position saves back to the last confirmed location", async () => {
  const saves: Array<{ reject: (reason: Error) => void }> = [];
  const api = {
    get: vi.fn(async () => ({
      nodes: [{ id: 14, title: "确认位置", module: "可靠性", kind: "concept", content: "", color: "indigo", position_x: 120, position_y: 110 }],
      edges: [],
    })),
    post: vi.fn(),
    patch: vi.fn(() => new Promise<void>((_resolve, reject) => saves.push({ reject }))),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} />);
  const card = await screen.findByTestId("knowledge-node-14");
  card.focus();
  fireEvent.keyDown(card, { key: "ArrowRight" });
  fireEvent.keyDown(card, { key: "ArrowRight" });
  await waitFor(() => expect(saves).toHaveLength(1));
  saves[0].reject(new Error("第一次保存失败"));
  await waitFor(() => expect(saves).toHaveLength(2));
  saves[1].reject(new Error("第二次保存失败"));

  await waitFor(() => expect(card).toHaveStyle({ left: "120px", top: "110px" }));
});

test("does not let a late initial graph snapshot erase a newly created card", async () => {
  let resolveGraph!: (value: any) => void;
  const graphResponse = new Promise((resolve) => { resolveGraph = resolve; });
  const api = {
    get: vi.fn((path: string) => path === "/api/knowledge" ? graphResponse : Promise.resolve([])),
    post: vi.fn(async (_path: string, body: any) => ({ id: 15, mastery: 0, ...body })),
    patch: vi.fn(),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} />);
  await userEvent.click(screen.getByRole("button", { name: "新建便签" }));
  expect(await screen.findByTestId("knowledge-node-15")).toBeInTheDocument();
  resolveGraph({ nodes: [], edges: [] });
  await graphResponse;
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(screen.getByTestId("knowledge-node-15")).toBeInTheDocument();
});

test("merges existing cards from a late initial snapshot with a newly created card", async () => {
  let resolveGraph!: (value: any) => void;
  const graphResponse = new Promise((resolve) => { resolveGraph = resolve; });
  const api = {
    get: vi.fn((path: string) => path === "/api/knowledge" ? graphResponse : Promise.resolve([])),
    post: vi.fn(async (_path: string, body: any) => ({ id: 16, mastery: 0, ...body })),
    patch: vi.fn(),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} />);
  await userEvent.click(screen.getByRole("button", { name: "新建便签" }));
  expect(await screen.findByTestId("knowledge-node-16")).toBeInTheDocument();
  resolveGraph({
    nodes: [{ id: 17, title: "已有概念", module: "基础", kind: "concept", content: "", color: "indigo", position_x: 40, position_y: 50 }],
    edges: [],
  });
  await graphResponse;

  expect(await screen.findByTestId("knowledge-node-17")).toBeInTheDocument();
  expect(screen.getByTestId("knowledge-node-16")).toBeInTheDocument();
});

test("still applies a late initial snapshot when creating a card fails", async () => {
  let resolveGraph!: (value: any) => void;
  const graphResponse = new Promise((resolve) => { resolveGraph = resolve; });
  const api = {
    get: vi.fn((path: string) => path === "/api/knowledge" ? graphResponse : Promise.resolve([])),
    post: vi.fn(async () => { throw new Error("创建失败"); }),
    patch: vi.fn(),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} />);
  await userEvent.click(screen.getByRole("button", { name: "新建便签" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("创建失败");
  resolveGraph({
    nodes: [{ id: 18, title: "服务端已有卡片", module: "基础", kind: "concept", content: "", color: "indigo", position_x: 70, position_y: 80 }],
    edges: [],
  });
  await graphResponse;

  expect(await screen.findByTestId("knowledge-node-18")).toBeInTheDocument();
});

test("autosaves inspector text while the editor still has focus", async () => {
  const api = {
    get: vi.fn(async () => ({
      nodes: [{ id: 19, title: "旧标题", module: "长期笔记", kind: "sticky_note", content: "旧内容", color: "sun", position_x: 80, position_y: 90 }],
      edges: [],
    })),
    post: vi.fn(),
    patch: vi.fn(async () => undefined),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} />);
  fireEvent.doubleClick(await screen.findByTestId("knowledge-node-19"));
  const title = screen.getByLabelText("标题");
  title.focus();
  fireEvent.change(title, { target: { value: "无需失焦也会保存" } });
  expect(title).toHaveFocus();
  expect(api.patch).not.toHaveBeenCalled();

  await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
    "/api/knowledge/nodes/19",
    { title: "无需失焦也会保存" },
  ), { timeout: 1_500 });
  expect(title).toHaveFocus();
  expect(screen.getByText("已自动保存")).toBeInTheDocument();
});

test("retries the latest inspector edit after a transient autosave failure", async () => {
  const storageKey = "studypilot.knowledge.pending.v1.701";
  window.localStorage.removeItem(storageKey);
  let attempts = 0;
  const api = {
    get: vi.fn(async () => ({
      nodes: [{ id: 20, title: "旧标题", module: "可靠保存", kind: "sticky_note", content: "", color: "sun", position_x: 80, position_y: 90 }],
      edges: [],
    })),
    post: vi.fn(),
    patch: vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("临时离线");
    }),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} courseId={701} />);
  fireEvent.doubleClick(await screen.findByTestId("knowledge-node-20"));
  const title = screen.getByLabelText("标题");
  fireEvent.change(title, { target: { value: "最终标题" } });

  await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(2), { timeout: 4_500 });
  expect(api.patch).toHaveBeenLastCalledWith("/api/knowledge/nodes/20", { title: "最终标题" });
  expect(await screen.findByText("已自动保存")).toBeInTheDocument();
  expect(window.localStorage.getItem(storageKey)).toBeNull();
});

test("replays a journaled edit after closing before the debounce finishes", async () => {
  const storageKey = "studypilot.knowledge.pending.v1.702";
  window.localStorage.removeItem(storageKey);
  const never = new Promise<void>(() => undefined);
  const firstApi = {
    get: vi.fn(async () => ({
      nodes: [{ id: 21, title: "关闭前", module: "可靠保存", kind: "sticky_note", content: "", color: "sun", position_x: 80, position_y: 90 }],
      edges: [],
    })),
    post: vi.fn(),
    patch: vi.fn(() => never),
    delete: vi.fn(),
  } as any;

  const first = render(<Knowledge api={firstApi} courseId={702} />);
  fireEvent.doubleClick(await screen.findByTestId("knowledge-node-21"));
  fireEvent.change(screen.getByLabelText("标题"), { target: { value: "关闭后仍可恢复" } });
  expect(window.localStorage.getItem(storageKey)).toContain("关闭后仍可恢复");
  first.unmount();

  const secondApi = {
    get: vi.fn(async () => ({
      nodes: [{ id: 21, title: "关闭前", module: "可靠保存", kind: "sticky_note", content: "", color: "sun", position_x: 80, position_y: 90 }],
      edges: [],
    })),
    post: vi.fn(),
    patch: vi.fn(async () => undefined),
    delete: vi.fn(),
  } as any;
  render(<Knowledge api={secondApi} courseId={702} />);

  expect(await screen.findByRole("article", { name: "知识卡片：关闭后仍可恢复" })).toBeInTheDocument();
  await waitFor(() => expect(secondApi.patch).toHaveBeenCalledWith(
    "/api/knowledge/nodes/21",
    { title: "关闭后仍可恢复" },
  ), { timeout: 2_000 });
  await waitFor(() => expect(window.localStorage.getItem(storageKey)).toBeNull());
});

test("imports an image file as a draggable image card", async () => {
  const calls: Array<{ path: string; body: any }> = [];
  const api = {
    baseUrl: "http://127.0.0.1:9000",
    get: vi.fn(async () => ({ nodes: [], edges: [] })),
    post: vi.fn(async (path: string, body: any) => {
      calls.push({ path, body });
      if (path === "/api/media/images") {
        return { id: "asset-1", filename: "diagram.png", media_type: "image/png", size_bytes: 8, url: "/api/media/images/asset-1" };
      }
      return { id: 30, mastery: .5, module: "图片", color: "slate", image_url: "/api/media/images/asset-1", ...body };
    }),
    patch: vi.fn(),
    delete: vi.fn(),
  } as any;
  const file = new File([new Uint8Array([137, 80, 78, 71])], "diagram.png", { type: "image/png" });

  render(<Knowledge api={api} courseId={801} />);
  await screen.findByText("从第一张卡片开始");
  await userEvent.upload(screen.getByLabelText("选择图片文件"), file);

  await waitFor(() => expect(calls.some((call) => call.path === "/api/media/images" && call.body instanceof FormData)).toBe(true));
  expect(calls.some((call) => call.path === "/api/knowledge/nodes" && call.body.kind === "image" && call.body.image_asset_id === "asset-1")).toBe(true);
  expect(await screen.findByRole("img", { name: "diagram.png" })).toHaveAttribute("src", "http://127.0.0.1:9000/api/media/images/asset-1");
});

test("opens a canvas image in a complete keyboard-dismissible preview", async () => {
  const api = {
    baseUrl: "http://127.0.0.1:9000",
    get: vi.fn(async () => ({
      nodes: [{ id: 35, title: "架构全图", module: "图片", kind: "image", content: "", color: "slate", position_x: 80, position_y: 90, image_url: "/api/media/images/full-map", image_alt: "完整架构图" }],
      edges: [],
    })),
    post: vi.fn(), patch: vi.fn(), delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} courseId={805} />);
  const openPreview = await screen.findByRole("button", { name: "查看完整图片：完整架构图" });
  await userEvent.click(openPreview);

  const dialog = screen.getByRole("dialog", { name: "图片预览" });
  expect(dialog.querySelector("img")).toHaveAttribute("src", "http://127.0.0.1:9000/api/media/images/full-map");
  expect(dialog).toHaveTextContent("完整架构图");
  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "图片预览" })).not.toBeInTheDocument());
  expect(openPreview).toHaveFocus();
});

test("imports native clipboard bytes without a renderer-side base64 decode", async () => {
  const originalBridge = (window as any).studypilot;
  const readImage = vi.fn().mockResolvedValue(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  (window as any).studypilot = { clipboard: { readImage } };
  const api = {
    baseUrl: "http://127.0.0.1:9000",
    get: vi.fn(async () => ({ nodes: [], edges: [] })),
    post: vi.fn(async (path: string, body: any) => path === "/api/media/images"
      ? { id: "asset-native", filename: "clipboard.png", media_type: "image/png", size_bytes: 8, url: "/api/courses/804/media/images/asset-native" }
      : { id: 34, mastery: .5, module: "图片", color: "slate", image_url: "/api/courses/804/media/images/asset-native", ...body }),
    patch: vi.fn(),
    delete: vi.fn(),
  } as any;

  try {
    render(<Knowledge api={api} courseId={804} />);
    await screen.findByText("从第一张卡片开始");
    await userEvent.click(screen.getByRole("button", { name: "粘贴图片" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/media/images", expect.any(FormData)));
    expect(readImage).toHaveBeenCalledTimes(1);
  } finally {
    (window as any).studypilot = originalBridge;
  }
});

test("pasting an image attaches it to the selected sticky note", async () => {
  const file = new File([new Uint8Array([137, 80, 78, 71])], "clipboard.png", { type: "image/png" });
  const api = {
    baseUrl: "http://127.0.0.1:9000",
    get: vi.fn(async () => ({
      nodes: [{ id: 31, title: "视觉笔记", module: "便签", kind: "sticky_note", content: "观察", color: "sun", position_x: 80, position_y: 90 }],
      edges: [],
    })),
    post: vi.fn(async (path: string) => path === "/api/media/images"
      ? { id: "asset-2", filename: "clipboard.png", media_type: "image/png", size_bytes: 8, url: "/api/media/images/asset-2" }
      : undefined),
    patch: vi.fn(async (_path: string, body: any) => ({ image_url: "/api/media/images/asset-2", ...body })),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} courseId={802} />);
  fireEvent.doubleClick(await screen.findByTestId("knowledge-node-31"));
  fireEvent.paste(window, {
    clipboardData: {
      items: [{ kind: "file", type: "image/png", getAsFile: () => file }],
      files: [file],
    },
  });

  await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
    "/api/knowledge/nodes/31",
    expect.objectContaining({ image_asset_id: "asset-2", image_alt: "clipboard.png" }),
  ));
  expect(await screen.findByRole("img", { name: "clipboard.png" })).toBeInTheDocument();
});

test("persists per-course canvas dimensions font and font scale", async () => {
  const storageKey = "studypilot.knowledge.canvas.v1.803";
  window.localStorage.removeItem(storageKey);
  const api = {
    baseUrl: "http://127.0.0.1:9000",
    get: vi.fn(async () => ({ nodes: [], edges: [] })),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as any;
  const { container } = render(<Knowledge api={api} courseId={803} />);

  await userEvent.click(screen.getByRole("button", { name: "画布设置" }));
  await userEvent.selectOptions(screen.getByLabelText("画布尺寸"), "2400x1400");
  await userEvent.selectOptions(screen.getByLabelText("画布字体"), "KaiTi");
  fireEvent.change(screen.getByLabelText("卡片字号"), { target: { value: "125" } });
  await userEvent.selectOptions(screen.getByLabelText("卡片缩放模式"), "scale-text");

  const world = container.querySelector<HTMLElement>(".canvas-world")!;
  expect(world.style.width).toBe("2400px");
  expect(world.style.height).toBe("1400px");
  expect(world.style.fontFamily).toContain("KaiTi");
  expect(world.style.getPropertyValue("--canvas-font-scale")).toBe("1.25");
  expect(window.localStorage.getItem(storageKey)).toContain('"width":2400');
  expect(window.localStorage.getItem(storageKey)).toContain('"fontFamily":"KaiTi"');
  expect(window.localStorage.getItem(storageKey)).toContain('"resizeTextWithCard":true');
});

test("resizes a selected card from every edge and persists its geometry", async () => {
  const api = {
    get: vi.fn(async () => ({
      nodes: [{ id: 36, title: "可缩放便签", module: "便签", kind: "sticky_note", content: "文字会根据卡片宽度重新排布", color: "sun", position_x: 100, position_y: 90, width: 220, height: 160, font_scale: 1 }],
      edges: [],
    })),
    post: vi.fn(),
    patch: vi.fn(async (_path: string, body: any) => body),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} courseId={806} />);
  const card = await screen.findByTestId("knowledge-node-36");
  fireEvent.doubleClick(card);
  expect(screen.getAllByRole("button", { name: /调整“可缩放便签”大小/ })).toHaveLength(8);

  const handle = screen.getByRole("button", { name: "调整“可缩放便签”大小：右下角" });
  fireEvent.pointerDown(handle, { pointerId: 7, clientX: 320, clientY: 250 });
  fireEvent.pointerMove(handle, { pointerId: 7, clientX: 400, clientY: 318 });
  fireEvent.pointerUp(handle, { pointerId: 7, clientX: 400, clientY: 318 });

  expect(card).toHaveStyle({ width: "300px", height: "228px" });
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
    "/api/knowledge/nodes/36",
    expect.objectContaining({ width: 300, height: 228, position_x: 100, position_y: 90 }),
  ));
});

test("optionally couples the lower-left resize handle to card text scale", async () => {
  const api = {
    get: vi.fn(async () => ({
      nodes: [{ id: 37, title: "联动字号", module: "便签", kind: "sticky_note", content: "放大卡片时同步放大文字", color: "sun", position_x: 100, position_y: 90, width: 220, height: 160, font_scale: 1 }],
      edges: [],
    })),
    post: vi.fn(),
    patch: vi.fn(async (_path: string, body: any) => body),
    delete: vi.fn(),
  } as any;

  const { container } = render(<Knowledge api={api} courseId={807} />);
  await userEvent.click(screen.getByRole("button", { name: "画布设置" }));
  await userEvent.selectOptions(screen.getByLabelText("卡片缩放模式"), "scale-text");
  const card = await screen.findByTestId("knowledge-node-37");
  fireEvent.doubleClick(card);

  const handle = screen.getByRole("button", { name: "调整“联动字号”大小：左下角并同步字号" });
  fireEvent.pointerDown(handle, { pointerId: 8, clientX: 100, clientY: 250 });
  fireEvent.pointerMove(handle, { pointerId: 8, clientX: 56, clientY: 282 });
  fireEvent.pointerUp(handle, { pointerId: 8, clientX: 56, clientY: 282 });

  expect(card).toHaveStyle({ left: "56px", width: "264px", height: "192px" });
  expect(card.style.getPropertyValue("--node-font-scale")).toBe("1.2");
  expect(container.querySelector(".canvas-world")).toHaveAttribute("data-resize-mode", "scale-text");
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
    "/api/knowledge/nodes/37",
    expect.objectContaining({ width: 264, height: 192, position_x: 56, position_y: 90, font_scale: 1.2 }),
  ));
});

test("lets a concept mastery slider persist a directly selected level", async () => {
  const api = {
    get: vi.fn(async () => ({
      nodes: [{ id: 38, title: "可交互概念", module: "概念", kind: "concept", content: "", color: "indigo", position_x: 100, position_y: 90, mastery: .5 }],
      edges: [],
    })),
    post: vi.fn(),
    patch: vi.fn(async (_path: string, body: any) => ({ ...body, mastery: body.mastery })),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} courseId={808} />);
  const slider = await screen.findByRole("slider", { name: "调整“可交互概念”掌握度" });
  fireEvent.change(slider, { target: { value: "80" } });
  fireEvent.blur(slider);

  expect(slider).toHaveValue("80");
  expect(screen.getByText("80% 掌握")).toBeInTheDocument();
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/knowledge/nodes/38", expect.objectContaining({ mastery: .8 })));
});

test("exports the current notebook in visual and structured formats through native save", async () => {
  const originalBridge = (window as any).studypilot;
  const saveToArchive = vi.fn().mockResolvedValue("C:/Exports/模型图谱.png");
  const openExportDirectory = vi.fn().mockResolvedValue(undefined);
  (window as any).studypilot = { files: { saveToArchive, openExportDirectory }, clipboard: {} };
  const api = {
    baseUrl: "http://127.0.0.1:9000",
    get: vi.fn(async () => ({ nodes: [], edges: [] })),
    post: vi.fn(), patch: vi.fn(), delete: vi.fn(),
    download: vi.fn(async (_path: string, body: { format: string }) => ({
      bytes: new Uint8Array([1, 2, 3]),
      filename: `模型图谱.${body.format}`,
      mediaType: body.format === "png" ? "image/png" : "application/octet-stream",
    })),
  } as any;

  try {
    render(<Knowledge api={api} courseId={41} notebookId={12} />);
    await screen.findByText("从第一张卡片开始");
    for (const [format, label] of [["png", "导出 PNG 画布"], ["pdf", "导出 PDF 画布"], ["docx", "整理为 Word"], ["md", "整理为 Markdown"]] as const) {
      await userEvent.click(screen.getByRole("button", { name: "导出知识画布" }));
      await userEvent.click(screen.getByRole("menuitem", { name: label }));
      await waitFor(() => expect(api.download).toHaveBeenCalledWith(
        "/api/courses/41/notebooks/12/export",
        expect.objectContaining({ format, canvas_width: 1800, canvas_height: 1100 }),
      ));
    }
    expect(saveToArchive).toHaveBeenCalledTimes(4);
    expect(await screen.findByRole("status")).toHaveTextContent("已导出");
    await userEvent.click(screen.getByRole("button", { name: "打开导出文件夹" }));
    expect(openExportDirectory).toHaveBeenCalled();
  } finally {
    (window as any).studypilot = originalBridge;
  }
});

test("exports the legacy knowledge canvas instead of silently disabling the action", async () => {
  const originalBridge = (window as any).studypilot;
  const saveToArchive = vi.fn().mockResolvedValue("C:/Exports/默认知识画布.png");
  (window as any).studypilot = { files: { saveToArchive }, clipboard: {} };
  const api = {
    get: vi.fn(async () => ({ nodes: [], edges: [] })),
    post: vi.fn(), patch: vi.fn(), delete: vi.fn(),
    download: vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]), filename: "默认知识画布.png", mediaType: "image/png" })),
  } as any;

  try {
    render(<Knowledge api={api} courseId={41} />);
    await screen.findByText("从第一张卡片开始");
    const exportButton = screen.getByRole("button", { name: "导出知识画布" });
    expect(exportButton).toBeEnabled();
    await userEvent.click(exportButton);
    await userEvent.click(screen.getByRole("menuitem", { name: "导出 PNG 画布" }));

    await waitFor(() => expect(api.download).toHaveBeenCalledWith(
      "/api/knowledge/export",
      expect.objectContaining({ format: "png", canvas_width: 1800, canvas_height: 1100 }),
    ));
    expect(saveToArchive).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("status")).toHaveTextContent("已导出 默认知识画布.png");
  } finally {
    (window as any).studypilot = originalBridge;
  }
});

test("does not expose the redundant focus mode in the knowledge canvas", async () => {
  const api = {
    get: vi.fn(async () => ({ nodes: [], edges: [] })),
    post: vi.fn(), patch: vi.fn(), delete: vi.fn(),
  } as any;
  const { container } = render(<Knowledge api={api} />);
  await screen.findByText("从第一张卡片开始");

  expect(container.querySelector(".knowledge-page")).not.toHaveClass("is-focus-mode");
  expect(screen.queryByRole("button", { name: /专注/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: /专注/ })).not.toBeInTheDocument();
});

test("deletes the selected canvas card with Delete but never hijacks text inputs", async () => {
  const api = {
    get: vi.fn(async () => ({
      nodes: [{ id: 51, title: "快捷键卡片", module: "交互", kind: "concept", content: "保留输入", color: "indigo", position_x: 120, position_y: 110 }],
      edges: [],
    })),
    post: vi.fn(),
    patch: vi.fn(async (_path: string, body: any) => body),
    delete: vi.fn(async () => undefined),
  } as any;

  render(<Knowledge api={api} courseId={901} />);
  const card = await screen.findByTestId("knowledge-node-51");
  fireEvent.doubleClick(card);
  const title = screen.getByDisplayValue("快捷键卡片");

  fireEvent.keyDown(title, { key: "Delete" });
  expect(api.delete).not.toHaveBeenCalled();
  expect(card).toBeInTheDocument();

  card.focus();
  fireEvent.keyDown(window, { key: "Delete" });
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/api/knowledge/nodes/51"));
  expect(screen.queryByTestId("knowledge-node-51")).not.toBeInTheDocument();
});

test("undoes and redoes canvas movement with standard desktop shortcuts", async () => {
  const api = {
    get: vi.fn(async () => ({
      nodes: [{ id: 52, title: "可撤销移动", module: "交互", kind: "concept", content: "", color: "indigo", position_x: 120, position_y: 110 }],
      edges: [],
    })),
    post: vi.fn(),
    patch: vi.fn(async (_path: string, body: any) => body),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} courseId={902} />);
  const card = await screen.findByTestId("knowledge-node-52");
  card.focus();
  fireEvent.keyDown(card, { key: "ArrowRight" });
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
    "/api/knowledge/nodes/52",
    expect.objectContaining({ position_x: 128, position_y: 110 }),
  ));

  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
    "/api/knowledge/nodes/52",
    expect.objectContaining({ position_x: 120, position_y: 110 }),
  ));
  expect(card).toHaveStyle({ left: "120px", top: "110px" });

  fireEvent.keyDown(window, { key: "y", ctrlKey: true });
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
    "/api/knowledge/nodes/52",
    expect.objectContaining({ position_x: 128, position_y: 110 }),
  ));
  expect(card).toHaveStyle({ left: "128px", top: "110px" });
});

test("keeps Ctrl+Z native while editing card text", async () => {
  const api = {
    get: vi.fn(async () => ({
      nodes: [{ id: 53, title: "文字撤销", module: "交互", kind: "sticky_note", content: "正文", color: "sun", position_x: 120, position_y: 110 }],
      edges: [],
    })),
    post: vi.fn(),
    patch: vi.fn(async (_path: string, body: any) => body),
    delete: vi.fn(),
  } as any;

  render(<Knowledge api={api} courseId={903} />);
  fireEvent.doubleClick(await screen.findByTestId("knowledge-node-53"));
  const title = screen.getByDisplayValue("文字撤销");
  fireEvent.keyDown(title, { key: "z", ctrlKey: true });

  expect(api.patch).not.toHaveBeenCalled();
  expect(api.delete).not.toHaveBeenCalled();
});

test("centers and selects an exact knowledge node opened from an assistant source", async () => {
  const api = {
    get: vi.fn(async () => ({
      nodes: [
        { id: 61, title: "来源节点", module: "来源", kind: "concept", content: "精确定位", color: "blue", position_x: 1320, position_y: 780 },
        { id: 62, title: "其他节点", module: "来源", kind: "concept", content: "不应选中", color: "teal", position_x: 120, position_y: 110 },
      ],
      edges: [],
    })),
    post: vi.fn(), patch: vi.fn(), delete: vi.fn(),
  } as any;

  const { container } = render(<Knowledge api={api} courseId={1} notebookId={5} sourceFocus={{ nodeId: 61, title: "来源节点", requestId: 1 }} />);
  const focused = await screen.findByTestId("knowledge-node-61");
  await waitFor(() => expect(focused).toHaveAttribute("data-source-focus", "true"));
  expect(focused).toHaveClass("is-selected", "is-source-focus");
  expect(screen.getByTestId("knowledge-node-62")).not.toHaveClass("is-selected", "is-source-focus");
  await waitFor(() => expect(container.querySelector<HTMLElement>(".canvas-world")?.style.transform).not.toBe("translate(12px, 12px) scale(1)"));
});

test("centers and selects an exact knowledge relationship opened from an assistant source", async () => {
  const api = {
    get: vi.fn(async () => ({
      nodes: [
        { id: 71, title: "前置概念", module: "关系", kind: "concept", content: "A", color: "blue", position_x: 900, position_y: 620 },
        { id: 72, title: "后续概念", module: "关系", kind: "concept", content: "B", color: "teal", position_x: 1260, position_y: 720 },
      ],
      edges: [{ id: 79, source_id: 71, target_id: 72, relation: "prerequisite" }],
    })),
    post: vi.fn(), patch: vi.fn(), delete: vi.fn(),
  } as any;

  const { container } = render(<Knowledge api={api} courseId={1} notebookId={5} sourceFocus={{ edgeId: 79, title: "前置概念 → 后续概念", requestId: 2 }} />);
  const focused = await screen.findByTestId("knowledge-edge-79");
  await waitFor(() => expect(focused).toHaveAttribute("data-source-focus", "true"));
  expect(focused).toHaveClass("is-selected", "is-source-focus");
  expect(screen.getByTestId("knowledge-node-71")).not.toHaveClass("is-selected");
  expect(screen.getByTestId("knowledge-node-72")).not.toHaveClass("is-selected");
  await waitFor(() => expect(container.querySelector<HTMLElement>(".canvas-world")?.style.transform).not.toBe("translate(12px, 12px) scale(1)"));
});
