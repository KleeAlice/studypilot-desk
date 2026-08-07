import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { Library } from "../src/features/Library";

function apiMock() {
  return {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({ id: 1 }),
    patch: vi.fn(),
    delete: vi.fn(),
  } as any;
}

const documentItem = {
  id: 7,
  title: "检索讲义",
  filename: "retrieval.pdf",
  body: "BM25 and dense retrieval",
  format: "pdf",
  status: "ready",
  metadata: { pages: 3 },
  structure: { pages: [{ page: 1 }] },
  source_created_at: "2025-02-03T04:05:06.000Z",
  created_at: "2026-07-20T04:30:00.000Z",
};

describe("document library import", () => {
  test("shows source creation and import times on a book-shaped document", async () => {
    const api = apiMock();
    api.get.mockResolvedValue([documentItem]);
    render(<Library api={api} />);

    const book = await screen.findByTestId("document-book-7");
    expect(book).toHaveAttribute("data-format", "pdf");
    expect(screen.getByTestId("book-spine-7")).toBeInTheDocument();
    expect(screen.getByText("文件创建")).toBeInTheDocument();
    expect(screen.getByText("导入时间")).toBeInTheDocument();
    expect(screen.getByText("2025-02-03 12:05")).toBeInTheDocument();
    expect(screen.getByText("2026-07-20 12:30")).toBeInTheDocument();
  });

  test("keeps favorites at the front for every sort mode and moves new favorites immediately", async () => {
    const api = apiMock();
    const favorite = { ...documentItem, id: 8, title: "已收藏资料", metadata: { pages: 3, favorite: true }, created_at: "2026-07-01T00:00:00.000Z" };
    const newest = { ...documentItem, id: 9, title: "最新资料", metadata: { pages: 3 }, created_at: "2026-07-30T00:00:00.000Z" };
    api.get.mockResolvedValue([newest, favorite]);
    api.patch.mockResolvedValue({ ...newest, metadata: { ...newest.metadata, favorite: true } });
    render(<Library api={api} />);

    await screen.findByRole("button", { name: "打开资料：已收藏资料" });
    expect(screen.getAllByRole("button", { name: /打开资料：/ }).map((button) => button.getAttribute("aria-label"))).toEqual([
      "打开资料：已收藏资料",
      "打开资料：最新资料",
    ]);

    await userEvent.click(screen.getByRole("button", { name: "收藏：最新资料" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/documents/9", { favorite: true }));
    expect(screen.getAllByRole("button", { name: /打开资料：/ }).map((button) => button.getAttribute("aria-label"))[0]).toBe("打开资料：最新资料");
  });

  test("filters by format and sorts books by source time with unknown dates last", async () => {
    const api = apiMock();
    api.get.mockResolvedValue([
      documentItem,
      { ...documentItem, id: 8, title: "Alpha Notes", filename: "alpha.md", format: "markdown", source_created_at: "2024-01-01T00:00:00.000Z", created_at: "2026-07-22 10:00:00" },
      { ...documentItem, id: 9, title: "No Date", filename: "unknown.docx", format: "docx", source_created_at: null, created_at: "2026-07-21 10:00:00" },
    ]);
    render(<Library api={api} />);
    await screen.findByRole("button", { name: "打开资料：检索讲义" });

    await userEvent.selectOptions(screen.getByLabelText("排序资料"), "source-oldest");
    expect(screen.getAllByRole("button", { name: /打开资料：/ }).map((button) => button.getAttribute("aria-label"))).toEqual([
      "打开资料：Alpha Notes",
      "打开资料：检索讲义",
      "打开资料：No Date",
    ]);

    await userEvent.selectOptions(screen.getByLabelText("筛选资料格式"), "pdf");
    expect(screen.getByText("显示 1 / 3 本")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开资料：检索讲义" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打开资料：Alpha Notes" })).not.toBeInTheDocument();
  });

  test("advertises Jupyter Notebook in the native picker and drop surface", async () => {
    render(<Library api={apiMock()} />);

    const input = screen.getByLabelText("选择资料文件") as HTMLInputElement;
    expect(input.accept.split(",")).toContain(".ipynb");

    const notebook = new File(["{}"], "experiment.ipynb", { type: "application/x-ipynb+json" });
    fireEvent.dragEnter(screen.getByTestId("document-library-page"), {
      dataTransfer: { files: [notebook], types: ["Files"] },
    });
    expect(screen.getAllByText(/Jupyter Notebook/).length).toBeGreaterThan(0);
  });

  test("opens the knowledge graph as a reflowing split workspace", async () => {
    const onOpenKnowledgeSplit = vi.fn();
    render(<Library api={apiMock()} onOpenKnowledgeSplit={onOpenKnowledgeSplit} />);

    await userEvent.click(screen.getByRole("button", { name: "分屏打开知识图谱" }));

    expect(onOpenKnowledgeSplit).toHaveBeenCalledTimes(1);
  });

  test("clears completed import rows and shows a transient batch result", async () => {
    const api = apiMock();
    render(<Library api={api} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/api/documents"));
    const page = screen.getByTestId("document-library-page");
    const files = [
      new File(["retrieval"], "notes.md", { type: "text/markdown" }),
      new File(["cells"], "matrix.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      new File(["name,score\nRRF,0.95"], "metrics.csv", { type: "text/csv" }),
    ];

    fireEvent.dragEnter(page, { dataTransfer: { files, types: ["Files"] } });
    expect(screen.getByText("释放文件，加入资料库")).toBeInTheDocument();
    fireEvent.dragOver(page, { dataTransfer: { files, types: ["Files"] } });
    fireEvent.drop(page, { dataTransfer: { files, types: ["Files"] } });

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(3));
    expect(api.post).toHaveBeenNthCalledWith(
      1,
      "/api/documents/import",
      expect.any(FormData),
      { timeoutMs: 600_000 },
    );
    const result = await screen.findByRole("status", { name: "资料导入结果" });
    expect(result).toHaveTextContent("3 份资料导入完成");
    expect(screen.queryByText("notes.md")).not.toBeInTheDocument();
    expect(screen.queryByText("matrix.xlsx")).not.toBeInTheDocument();
    expect(screen.queryByText("metrics.csv")).not.toBeInTheDocument();
  });

  test("keeps an imported document visible when the initial list request finishes late", async () => {
    const api = apiMock();
    const imported = { ...documentItem, id: 88, title: "Late response regression", filename: "late.md", format: "markdown" };
    let resolveInitial: (value: typeof imported[]) => void;
    const initialList = new Promise<typeof imported[]>((resolve) => { resolveInitial = resolve; });
    api.get
      .mockImplementationOnce(() => initialList)
      .mockResolvedValue([imported]);
    api.post.mockResolvedValue(imported);
    render(<Library api={api} />);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));

    const page = screen.getByTestId("document-library-page");
    const file = new File(["# fresh"], "late.md", { type: "text/markdown" });
    fireEvent.drop(page, { dataTransfer: { files: [file], types: ["Files"] } });

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    await screen.findByTestId("document-book-88");
    resolveInitial!([]);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(screen.getByTestId("document-book-88")).toBeInTheDocument();
  });

  test("does not reopen the native picker until the first picker closes", async () => {
    const api = apiMock();
    render(<Library api={api} />);
    const input = screen.getByLabelText("选择资料文件") as HTMLInputElement;
    const click = vi.spyOn(input, "click").mockImplementation(() => undefined);
    const trigger = screen.getByRole("button", { name: "导入资料" });

    await userEvent.click(trigger);
    await userEvent.click(trigger);
    expect(click).toHaveBeenCalledTimes(1);

    fireEvent.focus(window);
    await userEvent.click(trigger);
    expect(click).toHaveBeenCalledTimes(2);
  });

  test("opens a document from its card without treating the three-dot menu as open", async () => {
    const api = apiMock();
    api.get.mockResolvedValue([documentItem]);
    const onOpen = vi.fn();
    render(<Library api={api} onOpen={onOpen} />);

    await userEvent.click(await screen.findByRole("button", { name: "打开资料：检索讲义" }));
    expect(onOpen).toHaveBeenCalledWith(documentItem);
    onOpen.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "更多资料操作：检索讲义" }));
    expect(onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole("menu", { name: "检索讲义的资料操作" })).toBeInTheDocument();
  });

  test("renames and safely deletes a document from its aligned action menu", async () => {
    const api = apiMock();
    api.get.mockResolvedValue([documentItem]);
    api.patch.mockResolvedValue({ ...documentItem, title: "混合检索讲义" });
    api.delete.mockResolvedValue(undefined);
    render(<Library api={api} />);
    await screen.findByRole("button", { name: "打开资料：检索讲义" });

    await userEvent.click(screen.getByRole("button", { name: "更多资料操作：检索讲义" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "重命名资料" }));
    const input = screen.getByLabelText("资料名称");
    await userEvent.clear(input);
    await userEvent.type(input, "混合检索讲义");
    await userEvent.click(screen.getByRole("button", { name: "保存资料名称" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/documents/7", { title: "混合检索讲义" }));

    await userEvent.click(screen.getByRole("button", { name: "更多资料操作：混合检索讲义" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "移入回收站" }));
    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog", { name: "将资料移入回收站？" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "确认移入回收站" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/api/documents/7"));
    expect(screen.queryByRole("button", { name: "打开资料：混合检索讲义" })).not.toBeInTheDocument();
  });

  test("exports editable documents with explicit source-format and PDF labels", async () => {
    const api = apiMock();
    api.get.mockResolvedValue([{ ...documentItem, format: "markdown", filename: "notes.md", title: "学习笔记" }]);
    api.download = vi.fn().mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), filename: "学习笔记.md", mediaType: "text/markdown" });
    (window as any).studypilot = { files: { saveExport: vi.fn().mockResolvedValue("C:/Study/学习笔记.md") } };
    render(<Library api={api} />);
    await screen.findByRole("button", { name: "打开资料：学习笔记" });

    await userEvent.click(screen.getByRole("button", { name: "更多资料操作：学习笔记" }));
    expect(screen.getByRole("menuitem", { name: "导出为 Markdown" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "导出为 PDF" })).toBeInTheDocument();
    expect(screen.queryByText(/原资料格式/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem", { name: "导出为 Markdown" }));

    await waitFor(() => expect(api.download).toHaveBeenCalledWith("/api/documents/7/export", { format: "source" }));
    expect(window.studypilot.files.saveExport).toHaveBeenCalledWith({ suggestedName: "学习笔记.md", bytes: new Uint8Array([1, 2, 3]) });
  });

  test("labels editable code exports by their real source format", async () => {
    const api = apiMock();
    api.get.mockResolvedValue([{ ...documentItem, format: "text", filename: "analysis.py", title: "分析脚本" }]);
    render(<Library api={api} />);
    await screen.findByRole("button", { name: "打开资料：分析脚本" });

    await userEvent.click(screen.getByRole("button", { name: "更多资料操作：分析脚本" }));
    expect(screen.getByRole("menuitem", { name: "导出为 Python" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "导出为 TXT" })).not.toBeInTheDocument();
  });

  test("selects all visible documents and safely deletes them in one action", async () => {
    const api = apiMock();
    api.get.mockResolvedValue([
      documentItem,
      { ...documentItem, id: 8, title: "矩阵习题", filename: "matrix.md", format: "markdown" },
    ]);
    api.delete.mockResolvedValue(undefined);
    render(<Library api={api} />);
    await screen.findByRole("button", { name: "打开资料：检索讲义" });

    await userEvent.click(screen.getByRole("button", { name: "全选全部资料" }));
    expect(screen.getByText("已选 2")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "删除所选资料" }));
    expect(screen.getByRole("alertdialog", { name: "删除 2 份资料？" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "确认删除 2 份资料" }));

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith("/api/documents/7");
      expect(api.delete).toHaveBeenCalledWith("/api/documents/8");
    });
    expect(screen.queryByRole("button", { name: "打开资料：检索讲义" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "打开资料：矩阵习题" })).not.toBeInTheDocument();
  });
});
