import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  WorkspaceToolbarVisibilityProvider,
  useWorkspaceToolbarVisibility,
} from "../src/workspace/WorkspaceToolbarVisibility";

function Probe({ name }: { name: string }) {
  const toolbar = useWorkspaceToolbarVisibility();
  return (
    <div
      data-testid={name}
      data-visible={String(toolbar.visible)}
      data-auto-hide={String(toolbar.autoHide)}
      {...toolbar.toolbarProps}
    >
      {name}
    </div>
  );
}

afterEach(() => {
  vi.useRealTimers();
});

test("hides after the teaching delay and reveals all workspace toolbars together", () => {
  vi.useFakeTimers();
  render(
    <WorkspaceToolbarVisibilityProvider autoHide>
      <Probe name="document" />
      <Probe name="knowledge" />
    </WorkspaceToolbarVisibilityProvider>,
  );

  expect(screen.getByTestId("document")).toHaveAttribute("data-visible", "true");
  act(() => vi.advanceTimersByTime(1300));
  expect(screen.getByTestId("document")).toHaveAttribute("data-visible", "false");
  expect(screen.getByTestId("knowledge")).toHaveAttribute("data-visible", "false");

  fireEvent.pointerMove(window, { clientY: 45 });
  expect(screen.getByTestId("document")).toHaveAttribute("data-visible", "true");
  expect(screen.getByTestId("knowledge")).toHaveAttribute("data-visible", "true");

  act(() => vi.advanceTimersByTime(1700));
  expect(screen.getByTestId("document")).toHaveAttribute("data-visible", "false");
  expect(screen.getByTestId("knowledge")).toHaveAttribute("data-visible", "false");
  fireEvent.pointerMove(window, { clientY: 120 });
  expect(screen.getByTestId("document")).toHaveAttribute("data-visible", "true");
  act(() => vi.advanceTimersByTime(1700));
  expect(screen.getByTestId("document")).toHaveAttribute("data-visible", "false");

  fireEvent.pointerMove(window, { clientY: 45 });
  fireEvent.pointerEnter(screen.getByTestId("document"));
  act(() => vi.advanceTimersByTime(1700));
  expect(screen.getByTestId("document")).toHaveAttribute("data-visible", "true");

  fireEvent.pointerLeave(screen.getByTestId("document"));
  act(() => vi.advanceTimersByTime(700));
  expect(screen.getByTestId("document")).toHaveAttribute("data-visible", "false");
  expect(screen.getByTestId("knowledge")).toHaveAttribute("data-visible", "false");
});

test("keeps every toolbar visible when automatic hiding is disabled", () => {
  vi.useFakeTimers();
  render(
    <WorkspaceToolbarVisibilityProvider autoHide={false}>
      <Probe name="document" />
      <Probe name="knowledge" />
    </WorkspaceToolbarVisibilityProvider>,
  );

  act(() => vi.advanceTimersByTime(10_000));
  fireEvent.pointerLeave(screen.getByTestId("knowledge"));
  act(() => vi.advanceTimersByTime(10_000));
  expect(screen.getByTestId("document")).toHaveAttribute("data-visible", "true");
  expect(screen.getByTestId("knowledge")).toHaveAttribute("data-visible", "true");
});
