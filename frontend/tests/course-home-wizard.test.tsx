import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { CourseWizard } from "../src/features/CourseWizard";
import { CourseHome } from "../src/features/CourseHome";

test("creates a course through a skippable two-step wizard", async () => {
  const onCreate = vi.fn().mockResolvedValue(undefined);
  render(<CourseWizard open onClose={vi.fn()} onCreate={onCreate} />);

  await userEvent.type(screen.getByLabelText("课程名称"), "机器学习");
  await userEvent.type(screen.getByLabelText("课程简介"), "从基础到项目");
  await userEvent.click(screen.getByRole("button", { name: "下一步" }));
  await userEvent.type(screen.getByLabelText("学习目标"), "完成可复现实验");
  await userEvent.clear(screen.getByLabelText("预计学习周数"));
  await userEvent.type(screen.getByLabelText("预计学习周数"), "12");
  await userEvent.click(screen.getByRole("button", { name: "创建并进入课程" }));

  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
    title: "机器学习",
    description: "从基础到项目",
    goal: "完成可复现实验",
    target_weeks: 12,
  }));
});

test("course home is the module gateway and exposes continue learning", async () => {
  const onOpenModule = vi.fn();
  const onContinue = vi.fn();
  render(<CourseHome
    course={{ id: 3, title: "机器学习", description: "构建完整能力图谱", progress: 0.4, goal: "完成端到端项目" }}
    summary={{ task_counts: { todo: 4, doing: 2, done: 8 }, notebook_count: 3, document_count: 6, run_count: 11, recent_items: [] }}
    onOpenModule={onOpenModule}
    onContinue={onContinue}
  />);

  await userEvent.click(screen.getByRole("button", { name: /继续学习/ }));
  await userEvent.click(screen.getByRole("button", { name: /知识网络/ }));
  expect(onContinue).toHaveBeenCalledOnce();
  expect(onOpenModule).toHaveBeenCalledWith("knowledge");
});
