import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { TextSelectionToolbar } from "../src/components/TextSelectionToolbar";


function selectText(node: Text, start: number, end: number) {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  Object.defineProperty(range, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ left: 120, right: 260, top: 180, bottom: 204, width: 140, height: 24 }),
  });
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  fireEvent.mouseUp(document);
}


test("offers the same five actions for selected text and saves only on explicit clicks", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const api = {
    post: vi.fn().mockImplementation((path: string) => Promise.resolve(
      path === "/api/vocabulary" ? { id: 9, term: "人工卡片" } : { id: 8 },
    )),
  } as any;
  const onExplain = vi.fn();
  render(
    <>
      <p>人工卡片把最终判断交给人处理。</p>
      <TextSelectionToolbar
        api={api}
        courseId={3}
        context={{ view: "learning", documentId: 7, blockKey: "section:2" }}
        onExplain={onExplain}
      />
    </>,
  );

  const paragraph = screen.getByText("人工卡片把最终判断交给人处理。");
  selectText(paragraph.firstChild as Text, 0, 4);

  const toolbar = await screen.findByRole("toolbar", { name: "文本选择操作" });
  expect(toolbar).toHaveStyle({ position: "fixed" });
  for (const label of ["复制", "全选本段", "AI 解释", "加入备忘录", "加入生词本"]) {
    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
  }
  expect(api.post).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole("button", { name: "复制" }));
  expect(writeText).toHaveBeenCalledWith("人工卡片");

  await userEvent.click(screen.getByRole("button", { name: "AI 解释" }));
  expect(onExplain).toHaveBeenCalledWith(expect.objectContaining({ text: "人工卡片" }));

  await userEvent.click(screen.getByRole("button", { name: "加入备忘录" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/notes",
    expect.objectContaining({ payload: expect.objectContaining({ content: "人工卡片" }) }),
  ));

  await userEvent.click(screen.getByRole("button", { name: "加入生词本" }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/vocabulary",
    expect.objectContaining({ term: "人工卡片", source_kind: "selection" }),
  ));

  await userEvent.click(screen.getByRole("button", { name: "全选本段" }));
  expect(window.getSelection()?.toString()).toBe("人工卡片把最终判断交给人处理。");
});
