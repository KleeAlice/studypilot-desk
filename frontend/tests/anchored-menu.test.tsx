import { createRef, useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AnchoredMenu } from "../src/components/AnchoredMenu";
import { ConfirmDialog } from "../src/components/ConfirmDialog";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

describe("shared overlay primitives", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("portals a menu, flips it inside the viewport and restores focus", async () => {
    vi.stubGlobal("innerWidth", 800);
    vi.stubGlobal("innerHeight", 600);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.getAttribute("role") === "menu" ? rect(0, 0, 190, 180) : rect(750, 560, 40, 30);
    });
    function Harness() {
      const [open, setOpen] = useState(false);
      const anchor = createRef<HTMLButtonElement>();
      return <div data-testid="transformed-card">
        <button ref={anchor} onClick={() => setOpen(true)}>更多</button>
        <AnchoredMenu open={open} anchorRef={anchor} ariaLabel="资料操作" onClose={() => setOpen(false)}>
          <button role="menuitem">删除</button>
        </AnchoredMenu>
      </div>;
    }
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "更多" });
    await userEvent.click(trigger);
    const menu = await screen.findByRole("menu", { name: "资料操作" });

    expect(menu.parentElement).toBe(document.body);
    await waitFor(() => expect(menu.style.visibility).toBe("visible"));
    expect(menu.style.position).toBe("fixed");
    expect(Number.parseFloat(menu.style.left)).toBeGreaterThanOrEqual(12);
    expect(Number.parseFloat(menu.style.left) + 190).toBeLessThanOrEqual(788);
    expect(Number.parseFloat(menu.style.top) + 180).toBeLessThanOrEqual(588);

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu", { name: "资料操作" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  test("renders a long-title confirmation dialog outside clipped cards", async () => {
    const longTitle = `删除${"很长的资料标题".repeat(20)}？`;
    const cancel = vi.fn();
    render(<div style={{ overflow: "hidden", transform: "translateY(1px)" }}>
      <ConfirmDialog
        open
        title={longTitle}
        description="资料会移入回收站，知识引用快照会保留。"
        confirmLabel="确认移入回收站"
        onCancel={cancel}
        onConfirm={vi.fn()}
      />
    </div>);

    const dialog = screen.getByRole("alertdialog", { name: longTitle });
    expect(document.body.contains(dialog)).toBe(true);
    expect(dialog.closest(".safe-confirm-backdrop")?.parentElement).toBe(document.body);
    expect(screen.getByRole("button", { name: "取消" })).toBeVisible();
    expect(screen.getByRole("button", { name: "确认移入回收站" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(cancel).toHaveBeenCalledOnce();
  });
});
