import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { DocumentWorkspace } from "../src/document/DocumentWorkspace";
import { WorkspaceToolbarVisibilityProvider } from "../src/workspace/WorkspaceToolbarVisibility";

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async (id: string) => ({ svg: `<svg data-mermaid-id="${id}" viewBox="0 0 4800 340"><path d="M0 0h1"/><text>Rendered flow</text></svg>` })),
  },
}));

function fixture(format: string) {
  const locator = format === "pdf" ? { page: 1 }
    : format === "xlsx" || format === "csv" ? { sheet: "Sheet1", range: "A1:B2" }
    : format === "pptx" ? { slide: 1 }
    : format === "markdown" ? { section: 0 }
    : { paragraph: 0 };
  const data = format === "xlsx" || format === "csv"
    ? { title: "Sheet1", cells: [{ address: "A1", value: "Feature" }, { address: "B2", value: 42 }] }
    : format === "pptx"
      ? { elements: [{ shape_id: 2, name: "Title", text: "Attention" }] }
      : format === "docx" ? { style: "Heading 1" } : {};
  return {
    document: {
      id: 9,
      title: `${format} 资料`,
      filename: `source.${format === "markdown" ? "md" : format === "text" ? "txt" : format}`,
      body: "Source content",
      format,
      status: "ready",
      metadata: {},
      structure: {},
    },
    blocks: [{ id: 1, document_id: 9, block_key: `${format}:1`, block_type: format, ordinal: 0, locator, text: format === "pptx" ? "Attention" : "Source content", data }],
  };
}

function apiFor(format: string) {
  const content = fixture(format);
  return {
    baseUrl: "http://127.0.0.1:8765",
    get: vi.fn((path: string) => Promise.resolve(
      path.endsWith("/annotations") ? []
        : path.endsWith("/revisions") ? { can_undo: false, can_redo: false }
          : path === "/api/documents" ? [content.document]
            : content,
    )),
    post: vi.fn().mockImplementation((_path: string, body: any) => Promise.resolve({
      revision: { id: 1 },
      block: { ...content.blocks[0], text: body.after.text, data: body.after.data ?? content.blocks[0].data },
    })),
  } as any;
}

describe("document workspace readers", () => {
  test("follows the shared automatic toolbar visibility state", async () => {
    const { container } = render(
      <WorkspaceToolbarVisibilityProvider autoHide>
        <DocumentWorkspace api={apiFor("markdown")} documentId={9} onBack={vi.fn()} />
      </WorkspaceToolbarVisibilityProvider>,
    );

    const toolbar = await screen.findByRole("toolbar", { name: "资料批注工具" });
    const body = container.querySelector(".document-workspace__body");
    expect(toolbar).toHaveAttribute("data-toolbar-visible", "true");
    expect(body).toHaveAttribute("data-toolbar-clearance", "visible");
    fireEvent.pointerLeave(toolbar);
    await waitFor(() => expect(toolbar).toHaveAttribute("data-toolbar-visible", "false"), { timeout: 1200 });
    expect(body).toHaveAttribute("data-toolbar-clearance", "hidden");
    fireEvent.pointerMove(window, { clientY: 45 });
    expect(toolbar).toHaveAttribute("data-toolbar-visible", "true");
    expect(body).toHaveAttribute("data-toolbar-clearance", "visible");
  });

  test("opens PDF in an inline original-layout reader instead of rebuilding text cards", async () => {
    const { container } = render(<DocumentWorkspace api={apiFor("pdf")} documentId={9} onBack={vi.fn()} />);

    const reader = await screen.findByTitle("PDF 原版阅读器");
    expect(reader).toHaveAttribute("src", expect.stringContaining("/api/documents/9/file"));
    expect(container.querySelector(".pdf-reader")).toBeNull();
    expect(screen.queryByText("PDF TEXT LAYER")).not.toBeInTheDocument();
  });

  test("shows Word in original layout by default and opens a continuous Office-style editing mode", async () => {
    render(<DocumentWorkspace api={apiFor("docx")} documentId={9} onBack={vi.fn()} />);

    expect(await screen.findByRole("region", { name: "Word 原版阅读器" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "进入编辑模式" }));
    expect(screen.getByRole("toolbar", { name: "Word 编辑工具" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Word 文档编辑器" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存文档" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑段落 1" })).not.toBeInTheDocument();
  });

  test("renders styled spreadsheet cells at their real coordinates", async () => {
    const api = apiFor("xlsx");
    const styled: any = fixture("xlsx");
    styled.blocks[0].data = {
      title: "Sheet1",
      dimensions: "A1:B2",
      merged_ranges: ["A1:B1"],
      column_widths: { A: 24, B: 12 },
      row_heights: { "1": 30 },
      cells: [{
        address: "A1", row: 1, column: 1, value: "Feature",
        style: {
          font: { bold: true, color: "FFFFFF", size: 16 },
          fill: "2F5597",
          alignment: { horizontal: "center", vertical: "center" },
        },
      }],
    };
    api.get.mockImplementation((path: string) => Promise.resolve(
      path.endsWith("/annotations") ? []
        : path.endsWith("/revisions") ? { can_undo: false, can_redo: false }
          : styled,
    ));

    render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);
    const cell = await screen.findByRole("gridcell", { name: /A1/ });
    expect(cell).toHaveStyle({ gridColumn: "2 / span 2", gridRow: "2 / span 1", backgroundColor: "#2F5597" });
    expect(cell).toHaveStyle({ color: "#FFFFFF", fontWeight: "700" });
  });

  test("renders Jupyter markdown, code, execution count and output as notebook cells", async () => {
    const api = apiFor("ipynb");
    const notebook: any = fixture("text");
    notebook.document = { ...notebook.document, format: "ipynb", filename: "experiment.ipynb" };
    notebook.blocks = [
      { ...notebook.blocks[0], block_key: "cell:0", block_type: "notebook_markdown", locator: { cell: 1, cell_type: "markdown" }, text: "# Experiment", data: { cell_type: "markdown", source: "# Experiment", outputs: [] } },
      { ...notebook.blocks[0], id: 2, ordinal: 1, block_key: "cell:1", block_type: "notebook_code", locator: { cell: 2, cell_type: "code" }, text: "score = 0.95", data: { cell_type: "code", source: "score = 0.95", execution_count: 7, outputs: [{ output_type: "execute_result", text: "0.95" }] } },
    ];
    api.get.mockImplementation((path: string) => Promise.resolve(
      path.endsWith("/annotations") ? []
        : path.endsWith("/revisions") ? { can_undo: false, can_redo: false }
          : notebook,
    ));

    render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Experiment" })).toBeInTheDocument();
    expect(screen.getByText("In [7]")).toBeInTheDocument();
    expect(screen.getByText("score = 0.95")).toBeInTheDocument();
    expect(screen.getByText("0.95")).toBeInTheDocument();
  });

  test("places PowerPoint text boxes using original slide coordinates and formatting", async () => {
    const api = apiFor("pptx");
    const slides: any = fixture("pptx");
    slides.blocks[0].data = {
      slide_size: { width: 10, height: 7.5 },
      elements: [{
        shape_id: 2,
        name: "Title",
        text: "Positioned title",
        layout: { left: 0.1, top: 0.2, width: 0.6, height: 0.16 },
        style: { font_size: 28, bold: true, color: "2F5597", align: "center" },
      }],
    };
    api.get.mockImplementation((path: string) => Promise.resolve(
      path.endsWith("/annotations") ? []
        : path.endsWith("/revisions") ? { can_undo: false, can_redo: false }
          : slides,
    ));

    render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);
    const title = await screen.findByRole("button", { name: "编辑文本框 Title" });
    expect(title).toHaveStyle({ left: "10%", top: "20%", width: "60%", height: "16%", fontSize: "28px", color: "#2F5597", fontWeight: "700" });
  });

  test("moves the back action into the annotation toolbar and removes the oversized document masthead", async () => {
    const { container } = render(<DocumentWorkspace api={apiFor("text")} documentId={9} onBack={vi.fn()} />);

    await screen.findByText("Source content");
    expect(screen.queryByRole("heading", { name: "text 资料" })).not.toBeInTheDocument();
    expect(container.querySelector(".document-workspace__header")).toBeNull();
    expect(screen.getByRole("button", { name: "返回资料库" }).closest(".document-annotation-toolbar")).not.toBeNull();
  });

  test("reports the active document block and visible selection to the Agent host", async () => {
    const onAgentContextChange = vi.fn();
    const selection = vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "Source content",
    } as Selection);
    render(
      <DocumentWorkspace
        api={apiFor("text")}
        documentId={9}
        onBack={vi.fn()}
        onAgentContextChange={onAgentContextChange}
      />,
    );

    await screen.findByText("Source content");
    await waitFor(() => expect(onAgentContextChange).toHaveBeenCalledWith(expect.objectContaining({
      blockKey: "text:1",
      selectedText: "",
      locator: { paragraph: 0 },
    })));
    fireEvent.mouseUp(screen.getByText("Source content"));
    await waitFor(() => expect(onAgentContextChange).toHaveBeenCalledWith(expect.objectContaining({
      blockKey: "text:1",
      selectedText: "Source content",
    })));
    selection.mockRestore();
  });

  test("renders Markdown as one continuous GFM document instead of page cards", async () => {
    const content = fixture("markdown");
    content.blocks = [
      { ...content.blocks[0], block_key: "markdown:1", text: "# Overview\n\n- [x] Imported\n\n| Item | State |\n| --- | --- |\n| Reader | Ready |" },
      { ...content.blocks[0], id: 2, block_key: "markdown:2", ordinal: 1, locator: { section: 1 }, text: "## Details\n\n> Linked notes\n\n`inline code`" },
    ];
    const api = {
      get: vi.fn((path: string) => Promise.resolve(path.endsWith("/annotations") ? [] : content)),
      post: vi.fn(),
    } as any;

    const { container } = render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Details" })).toBeInTheDocument();
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByText("Linked notes").closest("blockquote")).not.toBeNull();
    expect(container.querySelectorAll(".markdown-document")).toHaveLength(1);
    expect(container.querySelector(".reader--markdown")).toBeNull();
  });

  test("renders inline and display LaTeX from imported Markdown documents", async () => {
    const content = fixture("markdown");
    content.blocks = [{
      ...content.blocks[0],
      block_key: "markdown:formulae",
      text: "设 $H_u(t)$ 为上游水头。\n\n$$\n\\Delta H(t)=H_u(t)-\\max[H_r(t), z_c]\n$$",
    }];
    const api = { get: vi.fn((path: string) => Promise.resolve(path.endsWith("/annotations") ? [] : content)), post: vi.fn() } as any;

    const { container } = render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);

    await screen.findByText(/设/);
    expect(container.querySelectorAll(".katex")).toHaveLength(2);
    expect(container.querySelector(".katex-display")).not.toBeNull();
    expect(screen.queryByText("$H_u(t)$", { exact: false })).not.toBeInTheDocument();
  });

  test("edits a complete Markdown document with source, live preview, undo and one save action", async () => {
    const api = apiFor("markdown");
    const user = userEvent.setup();
    render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "进入 Markdown 编辑模式" }));
    const editor = screen.getByRole("textbox", { name: "Markdown 源码编辑器" });
    expect(screen.getByRole("region", { name: "Markdown 实时预览" })).toBeInTheDocument();
    await user.clear(editor);
    await user.type(editor, "# 新标题{Enter}{Enter}新的正文");
    expect(editor).toHaveValue("# 新标题\n\n新的正文");
    expect(screen.getByRole("button", { name: "撤销文档编辑" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "保存文档" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/api/documents/9/revisions",
      expect.objectContaining({ block_key: "markdown:1", after: expect.objectContaining({ text: "# 新标题\n\n新的正文" }) }),
    ));
  });

  test("uses a continuous read-edit-save workflow for plain text and code-like documents", async () => {
    const api = apiFor("text");
    const user = userEvent.setup();
    render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "进入文本编辑模式" }));
    const editor = screen.getByRole("textbox", { name: "文本内容编辑器" });
    fireEvent.change(editor, { target: { value: "print('StudyPilot')" } });
    await user.click(screen.getByRole("button", { name: "保存文档" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/api/documents/9/revisions",
      expect.objectContaining({ block_key: "text:1", after: expect.objectContaining({ text: "print('StudyPilot')" }) }),
    ));
  });

  test("opens CSV in the spreadsheet reader and saves cell edits from an explicit edit mode", async () => {
    const api = apiFor("csv");
    const user = userEvent.setup();
    render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "进入表格编辑模式" }));
    const cell = screen.getByRole("textbox", { name: "编辑单元格 A1" });
    await user.clear(cell);
    await user.type(cell, "Metric");
    await user.click(screen.getByRole("button", { name: "保存表格" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/api/documents/9/revisions",
      expect.objectContaining({
        block_key: "csv:1",
        after: expect.objectContaining({ data: expect.objectContaining({ cells: expect.arrayContaining([expect.objectContaining({ address: "A1", value: "Metric" })]) }) }),
      }),
    ));
  });

  test.each([
    ["pdf", "第 1 页"],
    ["docx", "段落 1"],
    ["markdown", "章节 1"],
    ["text", "段落 1"],
    ["xlsx", "Sheet1"],
    ["csv", "Sheet1"],
    ["pptx", "第 1 张幻灯片"],
  ])("opens the %s reader with stable navigation", async (format, navigationLabel) => {
    render(<DocumentWorkspace api={apiFor(format)} documentId={9} onBack={vi.fn()} />);
    expect(await screen.findByRole("toolbar", { name: "资料批注工具" })).toBeInTheDocument();
    expect(screen.getAllByText(navigationLabel).length).toBeGreaterThan(0);
    if (format === "pdf") expect(screen.getByTitle("PDF 原版阅读器")).toBeInTheDocument();
    else if (format === "docx") expect(screen.getByRole("region", { name: "Word 原版阅读器" })).toBeInTheDocument();
    else expect(screen.getByText(format === "xlsx" || format === "csv" ? "Feature" : format === "pptx" ? "Attention" : "Source content")).toBeInTheDocument();
  });

  test("saves a text block as a non-destructive revision", async () => {
    const api = apiFor("text");
    render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "编辑段落 1" }));
    const editor = screen.getByLabelText("编辑段落 1");
    await userEvent.clear(editor);
    await userEvent.type(editor, "Revised local content");
    await userEvent.click(screen.getByRole("button", { name: "保存段落 1" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/api/documents/9/revisions",
      {
        block_key: "text:1",
        before: { text: "Source content" },
        after: { text: "Revised local content" },
      },
    ));
    expect(screen.getByText("已保存")).toBeInTheDocument();
  });

  test("undoes and redoes saved document revisions from the reader toolbar", async () => {
    const api = apiFor("text");
    api.get.mockImplementation((path: string) => Promise.resolve(
      path.endsWith("/annotations") ? []
        : path.endsWith("/revisions") ? { can_undo: true, can_redo: false }
          : fixture("text"),
    ));
    api.post.mockImplementation((path: string) => Promise.resolve(
      path.endsWith("/undo")
        ? { block: { ...fixture("text").blocks[0], text: "Original content" }, history: { can_undo: false, can_redo: true } }
        : { block: { ...fixture("text").blocks[0], text: "Source content" }, history: { can_undo: true, can_redo: false } },
    ));
    render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);

    await userEvent.click(await screen.findByRole("button", { name: "撤销上次编辑" }));
    expect(await screen.findByText("Original content")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "重做上次编辑" }));

    expect(api.post).toHaveBeenCalledWith("/api/documents/9/revisions/undo", {});
    expect(api.post).toHaveBeenCalledWith("/api/documents/9/revisions/redo", {});
  });

  test("uses Ctrl+Z and Cmd+Z to undo outside an editor", async () => {
    const api = apiFor("text");
    api.get.mockImplementation((path: string) => Promise.resolve(
      path.endsWith("/annotations") ? []
        : path.endsWith("/revisions") ? { can_undo: true, can_redo: false }
          : fixture("text"),
    ));
    api.post.mockResolvedValue({
      block: { ...fixture("text").blocks[0], text: "Original content" },
      history: { can_undo: true, can_redo: false },
    });
    render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);
    await screen.findByRole("toolbar", { name: "资料批注工具" });

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/documents/9/revisions/undo", {}));
    await screen.findByText("Original content");

    api.post.mockClear();
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/documents/9/revisions/undo", {}));
  });

  test("keeps Ctrl+Z native while editing document text", async () => {
    const api = apiFor("text");
    render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "编辑段落 1" }));
    const editor = screen.getByLabelText("编辑段落 1");

    fireEvent.keyDown(editor, { key: "z", ctrlKey: true });

    expect(api.post).not.toHaveBeenCalled();
  });

  test("auto-hides the outline while reading and restores it on demand", async () => {
    const { container } = render(<DocumentWorkspace api={apiFor("text")} documentId={9} onBack={vi.fn()} />);
    const stage = await screen.findByLabelText("主资料阅读区");
    Object.defineProperty(stage, "scrollTop", { configurable: true, value: 180 });
    fireEvent.scroll(stage);

    await waitFor(() => expect(container.querySelector(".document-workspace__body")).toHaveClass("is-outline-collapsed"));
    await userEvent.click(screen.getByRole("button", { name: "显示章节目录" }));
    expect(container.querySelector(".document-workspace__body")).not.toHaveClass("is-outline-collapsed");
  });

  test("peeks the hidden outline from the left edge and closes it after pointer leave", async () => {
    const { container } = render(<DocumentWorkspace api={apiFor("text")} documentId={9} onBack={vi.fn()} />);
    await screen.findByLabelText("主资料阅读区");
    const body = container.querySelector(".document-workspace__body");
    expect(body).toHaveClass("is-outline-collapsed");

    fireEvent.mouseEnter(container.querySelector(".document-outline-hotspot")!);
    expect(body).toHaveClass("is-outline-peeking");
    fireEvent.mouseLeave(screen.getByRole("navigation", { name: "资料大纲", hidden: true }));
    expect(body).toHaveClass("is-outline-collapsed");
  });

  test("builds a collapsible H1-H5 outline instead of flattening a large markdown document", async () => {
    const api = apiFor("markdown");
    const content: any = fixture("markdown");
    const titles = ["合订版", "第一部分", "第一册", "第一章", "规则 A"];
    content.blocks = titles.map((title, index) => ({
      id: index + 1,
      document_id: 9,
      block_key: `section:${index}`,
      block_type: "section",
      ordinal: index,
      locator: { section: index, line_start: index * 3 + 1, line_end: index * 3 + 2 },
      text: `${"#".repeat(index + 1)} ${title}\n正文`,
      data: { title, heading_level: index + 1 },
    }));
    api.get.mockImplementation((path: string) => Promise.resolve(
      path.endsWith("/annotations") ? []
        : path.endsWith("/revisions") ? { can_undo: false, can_redo: false }
          : path === "/api/documents" ? [content.document]
            : content,
    ));

    const { container } = render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);
    await screen.findByLabelText("主资料阅读区");
    fireEvent.mouseEnter(container.querySelector(".document-outline-hotspot")!);

    expect(screen.getByRole("button", { name: "规则 A" }).closest(".document-outline-item")).toHaveAttribute("data-outline-level", "5");
    await userEvent.click(screen.getByRole("button", { name: "折叠 第一部分" }));
    expect(screen.queryByRole("button", { name: "第一册" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "展开 第一部分" }));
    expect(screen.getByRole("button", { name: "第一册" })).toBeInTheDocument();
  });

  test("keeps the outline expanded and focused on the chapter currently being read", async () => {
    const api = apiFor("markdown");
    const content: any = fixture("markdown");
    content.blocks = ["总册", "第一部分", "当前章节"].map((title, index) => ({
      id: index + 1,
      document_id: 9,
      block_key: `section:${index}`,
      block_type: "section",
      ordinal: index,
      locator: { section: index },
      text: `${"#".repeat(index + 1)} ${title}\n正文`,
      data: { title, heading_level: index + 1 },
    }));
    api.get.mockImplementation((path: string) => Promise.resolve(
      path.endsWith("/annotations") ? []
        : path.endsWith("/revisions") ? { can_undo: false, can_redo: false }
          : path === "/api/documents" ? [content.document]
            : content,
    ));

    const { container } = render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);
    await screen.findByLabelText("主资料阅读区");
    fireEvent.mouseEnter(container.querySelector(".document-outline-hotspot")!);
    await userEvent.click(screen.getByRole("button", { name: "折叠 总册" }));
    expect(screen.queryByRole("button", { name: "当前章节" })).not.toBeInTheDocument();

    fireEvent.click(container.querySelector('[data-document-block="section:2"]')!);
    await waitFor(() => {
      const current = screen.getByRole("button", { name: "当前章节" });
      expect(current).toHaveClass("is-active");
      expect(current.closest(".document-outline-item")).toHaveAttribute("data-outline-active", "true");
    });
  });

  test("progressively renders large block collections and can jump directly to an unloaded chapter", async () => {
    const api = apiFor("markdown");
    const content: any = fixture("markdown");
    content.blocks = Array.from({ length: 180 }, (_, index) => ({
      id: index + 1,
      document_id: 9,
      block_key: `section:${index}`,
      block_type: "section",
      ordinal: index,
      locator: { section: index, line_start: index * 3 + 1, line_end: index * 3 + 2 },
      text: `## 第 ${index + 1} 章\n内容 ${index + 1}`,
      data: { title: `第 ${index + 1} 章`, heading_level: 2 },
    }));
    api.get.mockImplementation((path: string) => Promise.resolve(
      path.endsWith("/annotations") ? []
        : path.endsWith("/revisions") ? { can_undo: false, can_redo: false }
          : path === "/api/documents" ? [content.document]
            : content,
    ));

    const { container } = render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);
    await screen.findByLabelText("主资料阅读区");
    await waitFor(() => expect(container.querySelectorAll("[data-document-block]").length).toBeLessThan(90));
    expect(screen.getByRole("button", { name: /继续载入后面的章节/ })).toBeInTheDocument();

    fireEvent.mouseEnter(container.querySelector(".document-outline-hotspot")!);
    await userEvent.click(screen.getByRole("button", { name: "第 151 章" }));
    await waitFor(() => expect(container.querySelector('[data-document-block="section:150"]')).toBeInTheDocument());
    expect(container.querySelectorAll("[data-document-block]").length).toBeLessThan(90);
    fireEvent.scroll(screen.getByLabelText("主资料阅读区"));
    fireEvent.mouseEnter(container.querySelector(".document-outline-hotspot")!);
    await waitFor(() => expect(
      container.querySelector('[id="document-outline-section:150"]'),
    ).toHaveAttribute("data-outline-active", "true"));
  });

  test("chunks a single oversized markdown chapter instead of parsing the whole chapter at once", async () => {
    const api = apiFor("markdown");
    const content: any = fixture("markdown");
    const paragraphs = Array.from({ length: 110 }, (_, index) => (
      `${index === 109 ? "LAST_MARKER " : ""}${`paragraph-${index} `.repeat(60)}`
    ));
    content.blocks[0] = {
      ...content.blocks[0],
      block_key: "section:huge",
      text: `# 超长章节\n\n${paragraphs.join("\n\n")}`,
      data: { title: "超长章节", heading_level: 1 },
    };
    api.get.mockImplementation((path: string) => Promise.resolve(
      path.endsWith("/annotations") ? []
        : path.endsWith("/revisions") ? { can_undo: false, can_redo: false }
          : path === "/api/documents" ? [content.document]
            : content,
    ));

    render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);
    await screen.findByRole("heading", { name: "超长章节" });
    expect(screen.queryByText(/LAST_MARKER/)).not.toBeInTheDocument();
    const more = screen.getByRole("button", { name: /继续载入本节后文/ });
    await userEvent.click(more);
    expect(await screen.findByText(/LAST_MARKER/)).toBeInTheDocument();
  });

  test("adds, opens, and removes a persistent bookmark for the current block", async () => {
    const api = apiFor("text");
    api.delete = vi.fn().mockResolvedValue(undefined);
    api.post.mockImplementation((path: string, body: any) => Promise.resolve(
      path.endsWith("/annotations")
        ? {
          id: 28,
          document_id: 9,
          revision: 1,
          locator: { paragraph: 0 },
          quote: "",
          geometry: {},
          ...body,
        }
        : { revision: { id: 1 }, block: fixture("text").blocks[0] },
    ));
    render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "添加当前书签" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/api/documents/9/annotations",
      expect.objectContaining({ block_key: "text:1", kind: "tag" }),
    ));
    expect(screen.getByRole("button", { name: "移除当前书签" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "移除当前书签" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/api/documents/9/annotations/28"));
  });

  test("restores the last scroll position when reopening the same document", async () => {
    window.localStorage.removeItem("studypilot.reading-position.v1.primary.9");
    const first = render(<DocumentWorkspace api={apiFor("text")} documentId={9} onBack={vi.fn()} />);
    const stage = await screen.findByLabelText("主资料阅读区");
    stage.scrollTop = 486;
    fireEvent.scroll(stage);
    await waitFor(() => expect(
      window.localStorage.getItem("studypilot.reading-position.v1.primary.9"),
    ).toBe("486"));
    first.unmount();

    render(<DocumentWorkspace api={apiFor("text")} documentId={9} onBack={vi.fn()} />);
    const restored = await screen.findByLabelText("主资料阅读区");
    await waitFor(() => expect(restored.scrollTop).toBe(486));
    window.localStorage.removeItem("studypilot.reading-position.v1.primary.9");
  });

  test("keeps an independent last position for the second split document", async () => {
    window.localStorage.removeItem("studypilot.reading-position.v1.secondary.12");
    const api = apiFor("markdown");
    const primary = fixture("markdown");
    const secondary = fixture("text");
    secondary.document = { ...secondary.document, id: 12, title: "Second source", filename: "second.txt" };
    secondary.blocks = secondary.blocks.map((block) => ({ ...block, document_id: 12, block_key: "text:12" }));
    api.get.mockImplementation((path: string) => Promise.resolve(
      path === "/api/documents" ? [primary.document, secondary.document]
        : path.includes("/documents/12/content") ? secondary
          : path.endsWith("/annotations") ? []
            : path.endsWith("/revisions") ? { can_undo: false, can_redo: false }
              : primary,
    ));
    render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "打开分栏阅读" }));
    const secondaryStage = await screen.findByLabelText("第二资料阅读区");
    secondaryStage.scrollTop = 327;
    fireEvent.scroll(secondaryStage);
    await waitFor(() => expect(
      window.localStorage.getItem("studypilot.reading-position.v1.secondary.12"),
    ).toBe("327"));

    await userEvent.click(screen.getByRole("button", { name: "关闭第二份资料" }));
    await userEvent.click(screen.getByRole("button", { name: "打开分栏阅读" }));
    const restored = await screen.findByLabelText("第二资料阅读区");
    await waitFor(() => expect(restored.scrollTop).toBe(327));
    window.localStorage.removeItem("studypilot.reading-position.v1.secondary.12");
  });

  test("opens a second document in an independent split reader", async () => {
    const api = apiFor("markdown");
    const primary = fixture("markdown");
    const secondary = fixture("text");
    secondary.document = { ...secondary.document, id: 12, title: "Second source", filename: "second.txt" };
    secondary.blocks = secondary.blocks.map((block) => ({ ...block, id: 12, document_id: 12, block_key: "text:12", text: "Parallel reading" }));
    api.get.mockImplementation((path: string) => Promise.resolve(
      path === "/api/documents" ? [primary.document, secondary.document]
        : path.includes("/documents/12/content") ? secondary
          : path.endsWith("/annotations") ? []
            : path.endsWith("/revisions") ? { can_undo: false, can_redo: false }
              : primary,
    ));
    const { container } = render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);

    await userEvent.click(await screen.findByRole("button", { name: "打开分栏阅读" }));

    expect((await screen.findAllByText("Second source")).length).toBeGreaterThan(0);
    expect(screen.getByText("Parallel reading")).toBeInTheDocument();
    expect(container.querySelectorAll(".document-reader-stage")).toHaveLength(2);
    expect(container.querySelector(".document-primary-pane > header")).not.toBeNull();
    expect(container.querySelector(".document-split-pane:not(.document-primary-pane) > header")).not.toBeNull();
    expect(container.querySelector(".document-primary-pane")).toHaveClass("is-split");
  });

  test("resizes and swaps two visible documents from the center divider", async () => {
    const api = apiFor("markdown");
    const primary = fixture("markdown");
    const secondary = fixture("text");
    secondary.document = { ...secondary.document, id: 12, title: "Second source", filename: "second.txt" };
    secondary.blocks = secondary.blocks.map((block) => ({ ...block, document_id: 12, block_key: "text:12" }));
    api.get.mockImplementation((path: string) => Promise.resolve(
      path === "/api/documents" ? [primary.document, secondary.document]
        : path.includes("/documents/12/content") ? secondary
          : path.endsWith("/annotations") ? []
            : path.endsWith("/revisions") ? { can_undo: false, can_redo: false }
              : primary,
    ));
    const { container } = render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "打开分栏阅读" }));
    expect((await screen.findAllByText("Second source")).length).toBeGreaterThan(0);

    const readers = container.querySelector(".document-readers") as HTMLElement;
    vi.spyOn(readers, "getBoundingClientRect").mockReturnValue({ left: 0, right: 1000, top: 0, bottom: 700, width: 1000, height: 700, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
    const divider = screen.getByRole("separator", { name: "调整两份资料宽度" });
    fireEvent.pointerDown(divider, { pointerId: 3, clientX: 500 });
    fireEvent.pointerMove(divider, { pointerId: 3, clientX: 640 });
    fireEvent.pointerUp(divider, { pointerId: 3, clientX: 640 });
    expect(readers.style.getPropertyValue("--split-leading")).toBe("64%");

    await userEvent.click(screen.getByRole("button", { name: "交换两份资料位置" }));
    expect(readers).toHaveAttribute("data-swapped", "true");
  });

  test("reports both visible documents to the Agent and drops the second after closing", async () => {
    const api = apiFor("markdown");
    const primary = fixture("markdown");
    const secondary = fixture("text");
    secondary.document = { ...secondary.document, id: 12, title: "Second source", filename: "second.txt" };
    secondary.blocks = secondary.blocks.map((block) => ({ ...block, id: 12, document_id: 12, block_key: "text:12" }));
    api.get.mockImplementation((path: string) => Promise.resolve(
      path === "/api/documents" ? [primary.document, secondary.document]
        : path.includes("/documents/12/content") ? secondary
          : path.endsWith("/annotations") ? []
            : path.endsWith("/revisions") ? { can_undo: false, can_redo: false }
              : primary,
    ));
    const onAgentContextChange = vi.fn();
    render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} onAgentContextChange={onAgentContextChange} />);

    await userEvent.click(await screen.findByRole("button", { name: "打开分栏阅读" }));
    await waitFor(() => expect(onAgentContextChange).toHaveBeenLastCalledWith(expect.objectContaining({ documentIds: [9, 12] })));
    await userEvent.click(screen.getByRole("button", { name: "关闭第二份资料" }));
    await waitFor(() => expect(onAgentContextChange).toHaveBeenLastCalledWith(expect.objectContaining({ documentIds: [9] })));
  });

  test("switches from a second document to the knowledge graph split", async () => {
    const onKnowledgeSplitChange = vi.fn();
    render(<DocumentWorkspace api={apiFor("text")} documentId={9} onBack={vi.fn()} onKnowledgeSplitChange={onKnowledgeSplitChange} />);

    await userEvent.click(await screen.findByRole("button", { name: "分屏打开知识图谱" }));

    expect(onKnowledgeSplitChange).toHaveBeenCalledWith(true);
  });

  test("renders Mermaid flowcharts inside Markdown instead of showing the code fence", async () => {
    const api = apiFor("markdown");
    const markdown = fixture("markdown");
    const mermaid = (await import("mermaid")).default;
    vi.mocked(mermaid.render).mockClear();
    markdown.blocks = [...markdown.blocks.map((block, index) => index === 0 ? {
      ...block,
      text: "# Pipeline\n\n```mermaid\nflowchart LR\n  A[Import] --> B[Read]\n```",
    } : block), {
      ...markdown.blocks[0], id: 2, block_key: "markdown:2", ordinal: 1,
      locator: { section: 1 }, text: "## Following section\n\nKeep reading",
    }];
    api.get.mockImplementation((path: string) => Promise.resolve(
      path.endsWith("/annotations") ? [] : path.endsWith("/revisions") ? { can_undo: false, can_redo: false } : markdown,
    ));

    render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);

    const diagram = await screen.findByRole("img", { name: "Mermaid 流程图" });
    await waitFor(() => expect(diagram.innerHTML).toContain("Rendered flow"));
    expect(screen.getByRole("button", { name: "缩小流程图" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "放大流程图" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "适应流程图宽度" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "原始大小显示流程图" }));
    expect(diagram).toHaveAttribute("data-fit", "false");
    expect(diagram.querySelector("svg")?.style.width).toBe("4800px");
    expect(screen.queryByText("flowchart LR", { exact: false })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Keep reading"));
    expect(document.body.contains(diagram)).toBe(true);
    expect(diagram.innerHTML).toContain("Rendered flow");
    expect(mermaid.render).toHaveBeenCalledTimes(1);
  });

  test("zooms the reader canvas without changing annotation coordinates", async () => {
    const { container } = render(<DocumentWorkspace api={apiFor("pdf")} documentId={9} onBack={vi.fn()} />);
    await userEvent.click(await screen.findByRole("button", { name: "放大资料" }));
    expect(container.querySelector(".document-reader-zoom")).toHaveAttribute("data-zoom", "110");
  });

  test("keeps PDF source text read-only while exposing annotation tools", async () => {
    render(<DocumentWorkspace api={apiFor("pdf")} documentId={9} onBack={vi.fn()} />);
    await screen.findByRole("toolbar", { name: "资料批注工具" });
    expect(screen.queryByRole("button", { name: "编辑第 1 页" })).not.toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "资料批注工具" })).toBeInTheDocument();
  });

  test("persists an ellipse drawing with normalized block geometry", async () => {
    const api = apiFor("pdf");
    api.post.mockImplementation((path: string, body: any) => Promise.resolve(
      path.endsWith("/annotations")
        ? { id: 17, document_id: 9, revision: 1, note: "", quote: "", color: "red", ...body }
        : { revision: { id: 1 }, block: fixture("pdf").blocks[0] },
    ));
    render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);
    await screen.findByRole("toolbar", { name: "资料批注工具" });
    await userEvent.click(screen.getByRole("button", { name: "椭圆" }));
    const overlay = screen.getByLabelText("在当前资料块上圈画");
    vi.spyOn(overlay, "getBoundingClientRect").mockReturnValue({
      x: 10, y: 20, left: 10, top: 20, right: 210, bottom: 120,
      width: 200, height: 100, toJSON: () => ({}),
    });
    fireEvent.pointerDown(overlay, { pointerId: 4, clientX: 30, clientY: 30 });
    fireEvent.pointerMove(overlay, { pointerId: 4, clientX: 130, clientY: 80 });
    fireEvent.pointerUp(overlay, { pointerId: 4, clientX: 130, clientY: 80 });

    await waitFor(() => expect(api.post).toHaveBeenCalledWith(
      "/api/documents/9/annotations",
      expect.objectContaining({
        block_key: "pdf:1",
        kind: "ellipse",
        geometry: expect.objectContaining({ x: .1, y: .1, width: .5, height: .5 }),
      }),
    ));
  });

  test("erases a clicked drawing and removes it from the overlay", async () => {
    const api = apiFor("pdf");
    const annotation = {
      id: 17,
      document_id: 9,
      block_key: "pdf:1",
      kind: "ellipse",
      locator: { page: 1 },
      quote: "",
      note: "",
      color: "red",
      geometry: { x: .1, y: .1, width: .5, height: .5, coordinate_space: "block-normalized-v2" },
      revision: 1,
    };
    api.get.mockImplementation((path: string) => Promise.resolve(
      path.endsWith("/annotations") ? [annotation]
        : path.endsWith("/revisions") ? { can_undo: false, can_redo: false }
          : fixture("pdf"),
    ));
    api.delete = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);

    await userEvent.click(await screen.findByRole("button", { name: "橡皮擦" }));
    const shape = container.querySelector('[data-annotation-id="17"]');
    expect(shape).not.toBeNull();
    fireEvent.pointerDown(shape!);

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/api/documents/9/annotations/17"));
    await waitFor(() => expect(container.querySelector('[data-annotation-id="17"]')).toBeNull());
  });

  test("removes the legacy reader selection panel in favor of the global five-action toolbar", async () => {
    const api = apiFor("xlsx");
    render(<DocumentWorkspace api={api} courseId={3} documentId={9} onBack={vi.fn()} />);

    await userEvent.click(await screen.findByRole("button", { name: "编辑单元格 A1" }));

    expect(screen.queryByLabelText("知识笔记")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "引用到知识图谱" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("批注内容")).not.toBeInTheDocument();
  });
  test("opens a stored learning source at its exact block and highlights it", async () => {
    window.sessionStorage.setItem("studypilot.document.locator.9", JSON.stringify({
      documentId: 9,
      blockKey: "markdown:1",
      locator: { section: 0, line_start: 12, line_end: 18 },
      locationLabel: "第 12–18 行",
      quote: "Source content",
      originMode: "learning",
    }));
    const { container } = render(<DocumentWorkspace api={apiFor("markdown")} documentId={9} onBack={vi.fn()} />);

    expect(await screen.findByLabelText("学习出处：第 12–18 行")).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('[data-document-block="markdown:1"]')).toHaveClass("is-source-focus"));
    expect(screen.getByRole("button", { name: "回到学习对话" })).toBeInTheDocument();
  });

  test("opens a cited second document in the existing resizable reader split", async () => {
    const api = apiFor("markdown");
    const primary = fixture("markdown");
    const secondary = fixture("text");
    secondary.document = { ...secondary.document, id: 12, title: "Second source", filename: "second.txt" };
    secondary.blocks = secondary.blocks.map((block) => ({ ...block, id: 12, document_id: 12, block_key: "text:12" }));
    api.get.mockImplementation((path: string) => Promise.resolve(
      path === "/api/documents" ? [primary.document, secondary.document]
        : path.includes("/documents/12/content") ? secondary
          : path.endsWith("/annotations") ? []
            : path.endsWith("/revisions") ? { can_undo: false, can_redo: false }
              : primary,
    ));
    const { container } = render(<DocumentWorkspace api={api} documentId={9} onBack={vi.fn()} />);
    await screen.findByText("Source content");

    fireEvent(window, new CustomEvent("studypilot:open-document-source", { detail: {
      placement: "secondary",
      focus: {
        documentId: 12,
        blockKey: "text:12",
        locator: { paragraph: 0 },
        locationLabel: "第 1 段",
        quote: "Source content",
        originMode: "learning",
      },
    } }));

    expect(await screen.findByLabelText("学习出处：第 1 段")).toBeInTheDocument();
    expect(screen.getByRole("separator", { name: "调整两份资料宽度" })).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('.document-split-pane [data-document-block="text:12"]')).toHaveClass("is-source-focus"));
  });
});
