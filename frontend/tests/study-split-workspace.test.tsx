import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { StudySplitWorkspace } from "../src/components/StudySplitWorkspace";

test("resizes and swaps the knowledge-library linked workspace", async () => {
  const { container } = render(
    <StudySplitWorkspace
      primary={<main>知识网络</main>}
      companion={<main>资料正文</main>}
      companionKind="library"
      companionTitle="资料库"
      onClose={vi.fn()}
    />,
  );
  const workspace = container.querySelector(".study-split-workspace") as HTMLElement;
  vi.spyOn(workspace, "getBoundingClientRect").mockReturnValue({ left: 0, right: 1200, top: 0, bottom: 800, width: 1200, height: 800, x: 0, y: 0, toJSON: () => ({}) } as DOMRect);
  const divider = screen.getByRole("separator", { name: "调整知识网络与资料库宽度" });

  fireEvent.pointerDown(divider, { pointerId: 2, clientX: 620 });
  fireEvent.pointerMove(divider, { pointerId: 2, clientX: 720 });
  fireEvent.pointerUp(divider, { pointerId: 2, clientX: 720 });
  expect(workspace.style.getPropertyValue("--split-leading")).toBe("60%");

  await userEvent.click(screen.getByRole("button", { name: "交换知识网络与资料库位置" }));
  expect(workspace).toHaveAttribute("data-swapped", "true");
});

test("keeps both split panes aligned when the companion has a document selector", () => {
  const { container } = render(
    <StudySplitWorkspace
      primary={<main>知识网络</main>}
      companion={<main>资料正文</main>}
      companionKind="library"
      companionTitle="资料阅读"
      companionControls={<select aria-label="选择分屏资料"><option>资料 A</option></select>}
      onClose={vi.fn()}
    />,
  );

  const workspace = container.querySelector(".study-split-workspace") as HTMLElement;
  const primaryHeader = container.querySelector(".study-split-workspace__primary-header");
  const companionHeader = container.querySelector(".study-split-workspace__companion-header");
  expect(primaryHeader).not.toBeNull();
  expect(companionHeader).not.toBeNull();
  expect(workspace.style.getPropertyValue("--split-header-height")).toBe("50px");
  expect(screen.getByRole("combobox", { name: "选择分屏资料" }).closest(".study-split-workspace__companion-header")).not.toBeNull();
  expect(container.querySelectorAll(".study-split-workspace__pane")).toHaveLength(2);
});
test("uses a custom primary title for the Learning Center split", () => {
  render(
    <StudySplitWorkspace
      primary={<main>学习对话</main>}
      companion={<main>资料正文</main>}
      companionKind="library"
      companionTitle="资料阅读"
      primaryTitle="学习中心"
      onClose={vi.fn()}
    />,
  );

  expect(screen.getByRole("region", { name: "主工作区：学习中心" })).toBeInTheDocument();
  expect(screen.getByRole("separator", { name: "调整学习中心与资料阅读宽度" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "交换学习中心与资料阅读位置" })).toBeInTheDocument();
});
