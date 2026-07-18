import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { Trash } from "../src/features/Trash";

test("restores and permanently deletes courses from the global trash", async () => {
  const course = { id: 9, title: "旧课程", description: "可恢复的数据", deleted_at: "2026-07-16", purge_after: "2026-08-15", node_count: 4 };
  const onRestore = vi.fn().mockResolvedValue(undefined);
  const onPurge = vi.fn().mockResolvedValue(undefined);
  render(<Trash courses={[course]} onRestore={onRestore} onPurge={onPurge} onBack={vi.fn()} />);

  await userEvent.click(screen.getByRole("button", { name: "恢复课程：旧课程" }));
  expect(onRestore).toHaveBeenCalledWith(course);
  await userEvent.click(screen.getByRole("button", { name: "永久删除课程：旧课程" }));
  expect(onPurge).toHaveBeenCalledWith(course);
});
