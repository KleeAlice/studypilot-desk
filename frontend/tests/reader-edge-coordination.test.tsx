import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { DocumentWorkspace } from "../src/document/DocumentWorkspace";


function readerApi() {
  const content = {
    document: {
      id: 9,
      title: "边界测试资料",
      filename: "edge.txt",
      body: "边界测试正文",
      format: "text",
      status: "ready",
      metadata: {},
      structure: {},
    },
    blocks: [{
      id: 90,
      document_id: 9,
      block_key: "paragraph:0",
      block_type: "paragraph",
      ordinal: 0,
      locator: { paragraph: 0 },
      text: "边界测试正文",
      data: {},
    }],
  };
  return {
    get: vi.fn((path: string) => Promise.resolve(
      path.endsWith("/annotations") ? []
        : path.endsWith("/revisions") ? { can_undo: false, can_redo: false }
          : path === "/api/documents" ? []
            : content,
    )),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    baseUrl: "http://127.0.0.1:8000",
  } as any;
}


test("course navigation lives in the reader toolbar instead of overlapping it", async () => {
  render(
    <DocumentWorkspace
      api={readerApi()}
      documentId={9}
      onBack={vi.fn()}
      {...({
        courseNavigationOpen: false,
        onCourseNavigationChange: vi.fn(),
      } as any)}
    />,
  );

  const toolbar = await screen.findByRole("toolbar", { name: "资料批注工具" });
  expect(toolbar).toContainElement(
    screen.getByRole("button", { name: "打开课程导航" }),
  );
  expect(toolbar).toContainElement(screen.getByRole("button", { name: "返回资料库" }));
  expect(toolbar).toContainElement(screen.getByRole("button", { name: "显示章节目录" }));
});


test("chapter outline edge stays inactive while course navigation is open", async () => {
  const { container } = render(
    <DocumentWorkspace
      api={readerApi()}
      documentId={9}
      onBack={vi.fn()}
      {...({
        courseNavigationOpen: true,
        onCourseNavigationChange: vi.fn(),
      } as any)}
    />,
  );

  await screen.findByLabelText("主资料阅读区");
  const body = container.querySelector(".document-workspace__body");
  expect(body).toHaveClass("is-outline-collapsed");
  fireEvent.mouseEnter(container.querySelector(".document-outline-hotspot")!);
  expect(body).toHaveClass("is-outline-collapsed");
  expect(body).not.toHaveClass("is-outline-peeking");
});

test("chapter outline stays open while the pointer owns the outline edge during scroll", async () => {
  const { container } = render(
    <DocumentWorkspace
      api={readerApi()}
      documentId={9}
      onBack={vi.fn()}
      {...({
        courseNavigationOpen: false,
        onCourseNavigationChange: vi.fn(),
      } as any)}
    />,
  );

  const reader = await screen.findByLabelText("主资料阅读区");
  const body = container.querySelector(".document-workspace__body");
  const hotspot = container.querySelector(".document-outline-hotspot")!;
  fireEvent.mouseEnter(hotspot);
  expect(body).toHaveClass("is-outline-peeking");

  Object.defineProperty(reader, "scrollTop", { configurable: true, value: 180 });
  fireEvent.scroll(reader);

  expect(body).toHaveClass("is-outline-peeking");
  expect(body).not.toHaveClass("is-outline-collapsed");
});
