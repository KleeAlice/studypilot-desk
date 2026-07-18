import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { CourseLibrary } from "../src/features/CourseLibrary";
import type { Course } from "../src/types";

const course: Course = {
  id: 7,
  title: "机器学习",
  description: "从线性模型到神经网络",
  cover_style: "cobalt",
  progress: 0.4,
  node_count: 12,
};

test("three-dot course control opens a safe menu and requires explicit confirmation", async () => {
  const onTrash = vi.fn().mockResolvedValue(undefined);
  render(<CourseLibrary
    courses={[course]}
    activeCourseId={course.id}
    onOpen={vi.fn().mockResolvedValue(undefined)}
    onCreate={vi.fn()}
    onUpdate={vi.fn().mockResolvedValue(undefined)}
    onTrash={onTrash}
    onOpenTrash={vi.fn()}
    onOpenSettings={vi.fn()}
  />);

  await userEvent.click(screen.getByRole("button", { name: "更多课程操作：机器学习" }));
  expect(onTrash).not.toHaveBeenCalled();
  expect(screen.getByRole("menu", { name: "机器学习的课程操作" })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("menuitem", { name: "移入回收站" }));
  expect(onTrash).not.toHaveBeenCalled();
  expect(screen.getByRole("alertdialog", { name: "将课程移入回收站？" })).toHaveTextContent("机器学习");

  await userEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(onTrash).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole("button", { name: "更多课程操作：机器学习" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "移入回收站" }));
  await userEvent.click(screen.getByRole("button", { name: "确认移入回收站" }));
  await waitFor(() => expect(onTrash).toHaveBeenCalledTimes(1));
});

test("three-dot course control renames the course and applies a named cover preset", async () => {
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  render(<CourseLibrary
    courses={[course]}
    activeCourseId={course.id}
    onOpen={vi.fn().mockResolvedValue(undefined)}
    onCreate={vi.fn()}
    onUpdate={onUpdate}
    onTrash={vi.fn().mockResolvedValue(undefined)}
    onOpenTrash={vi.fn()}
    onOpenSettings={vi.fn()}
  />);

  await userEvent.click(screen.getByRole("button", { name: "更多课程操作：机器学习" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "重命名课程" }));
  const nameInput = screen.getByRole("textbox", { name: "课程名称" });
  await userEvent.clear(nameInput);
  await userEvent.type(nameInput, "概率图模型");
  await userEvent.click(screen.getByRole("button", { name: "保存名称" }));
  await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(course, { title: "概率图模型" }));

  await userEvent.click(screen.getByRole("button", { name: "更多课程操作：机器学习" }));
  expect(screen.getAllByRole("menuitemradio")).toHaveLength(6);
  await userEvent.click(screen.getByRole("menuitemradio", { name: "更换为苔原绿封面" }));
  await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(course, { cover_style: "moss" }));
});

test("keeps the selected course visually committed while the workspace is opening", async () => {
  let finishOpen!: () => void;
  const onOpen = vi.fn(() => new Promise<void>((resolve) => { finishOpen = resolve; }));
  const { container } = render(<CourseLibrary
    courses={[course]}
    activeCourseId={course.id}
    onOpen={onOpen}
    onCreate={vi.fn()}
    onUpdate={vi.fn().mockResolvedValue(undefined)}
    onTrash={vi.fn().mockResolvedValue(undefined)}
    onOpenTrash={vi.fn()}
    onOpenSettings={vi.fn()}
  />);

  await userEvent.click(screen.getByRole("button", { name: `进入课程：${course.title}` }));

  expect(container.querySelector(".course-library-shell")).toHaveAttribute("data-course-launching", String(course.id));
  expect(container.querySelector(".course-volume")).toHaveClass("is-launching");
  expect(screen.getByRole("button", { name: `进入课程：${course.title}` })).toHaveAttribute("aria-busy", "true");

  finishOpen();
  await waitFor(() => expect(container.querySelector(".course-library-shell")).not.toHaveAttribute("data-course-launching"));
});
