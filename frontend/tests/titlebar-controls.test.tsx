import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { TitleBar } from "../src/components/TitleBar";

test("places a fixed AI launcher beside the StudyPilot name", async () => {
  const toggleAgent = vi.fn();
  window.addEventListener("studypilot:toggle-agent", toggleAgent, { once: true });

  const { container } = render(<TitleBar language="zh-CN" />);
  const button = screen.getByRole("button", { name: "打开 PILOT 助手" });

  expect(button.closest(".titlebar__controls")).not.toBeNull();
  expect(container.querySelector(".titlebar__drag")?.nextElementSibling).toHaveClass("titlebar__controls");
  await userEvent.click(button);
  expect(toggleAgent).toHaveBeenCalledOnce();
});

test("shows the navigation restore control only while the rail is collapsed", async () => {
  const onExpandNavigation = vi.fn();
  const { rerender } = render(
    <TitleBar language="zh-CN" navigationCollapsed={false} onExpandNavigation={onExpandNavigation} />,
  );

  expect(screen.queryByRole("button", { name: "展开导航" })).not.toBeInTheDocument();

  rerender(
    <TitleBar language="zh-CN" navigationCollapsed onExpandNavigation={onExpandNavigation} />,
  );
  await userEvent.click(screen.getByRole("button", { name: "展开导航" }));
  expect(onExpandNavigation).toHaveBeenCalledOnce();
});

test("reflects the active PILOT state announced by the agent host", () => {
  render(<TitleBar language="zh-CN" />);
  const button = screen.getByRole("button", { name: "打开 PILOT 助手" });

  fireEvent(window, new CustomEvent("studypilot:agent-state", { detail: { open: true } }));
  expect(button).toHaveAttribute("aria-pressed", "true");

  fireEvent(window, new CustomEvent("studypilot:agent-state", { detail: { open: false } }));
  expect(button).toHaveAttribute("aria-pressed", "false");
});
test("reserves one blank titlebar surface outside every interactive control", () => {
  const { container } = render(<TitleBar language="zh-CN" />);
  const dragFill = container.querySelector(".titlebar__drag-fill");

  expect(dragFill).not.toBeNull();
  expect(dragFill?.querySelector("button, input, select, textarea, a")).toBeNull();
  expect(dragFill?.previousElementSibling).toHaveClass("titlebar__controls");
  expect(dragFill?.nextElementSibling).toHaveClass("window-actions");
});

test("marks blank titlebar surfaces as Tauri native drag regions", () => {
  const { container } = render(<TitleBar language="zh-CN" />);

  expect(container.querySelector(".titlebar__drag")).toHaveAttribute("data-tauri-drag-region");
  expect(container.querySelector(".titlebar__drag-fill")).toHaveAttribute("data-tauri-drag-region");
});
