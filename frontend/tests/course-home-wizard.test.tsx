import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { CourseWizard } from "../src/features/CourseCreationWizard";
import { CourseHome } from "../src/features/CourseHome";

test("creates a knowledge course without asking for a plan", async () => {
  const onCreate = vi.fn().mockResolvedValue(undefined);
  render(<CourseWizard open onClose={vi.fn()} onCreate={onCreate} />);
  await userEvent.click(screen.getByRole("button", { name: "默认学习课程" }));
  await userEvent.click(screen.getByRole("button", { name: "下一步" }));

  await userEvent.type(screen.getByLabelText("课程名称"), "机器学习");
  await userEvent.type(screen.getByLabelText("课程简介"), "从基础到项目");
  await userEvent.click(screen.getByRole("button", { name: "创建并进入课程" }));

  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
    title: "机器学习",
    description: "从基础到项目",
    goal: "",
    target_weeks: null,
  }));
});

test("chooses a language course before configuring its independent learning profile", async () => {
  const onCreate = vi.fn().mockResolvedValue(undefined);
  render(<CourseWizard open onClose={vi.fn()} onCreate={onCreate} />);

  await userEvent.click(screen.getByRole("button", { name: "语言学习课程" }));
  await userEvent.click(screen.getByRole("button", { name: "下一步" }));
  await userEvent.type(screen.getByLabelText("课程名称"), "我的英语");
  await userEvent.selectOptions(screen.getByLabelText("目标语言"), "en-US");
  await userEvent.click(screen.getByRole("button", { name: "下一步" }));
  await userEvent.clear(screen.getByLabelText("每日单词目标"));
  await userEvent.type(screen.getByLabelText("每日单词目标"), "12");
  await userEvent.click(screen.getByRole("button", { name: "创建并进入课程" }));

  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
    title: "我的英语",
    course_type: "language",
    target_language_tag: "en-US",
    native_language_tag: "zh-CN",
    proficiency_level: "beginner",
    daily_word_goal: 12,
    pronunciation_scheme: "ipa",
    romanization_enabled: false,
    training_focus: ["reading", "listening", "speaking", "writing"],
  }));
});

test("keeps the existing course flow as the default knowledge course type", async () => {
  const onCreate = vi.fn().mockResolvedValue(undefined);
  render(<CourseWizard open onClose={vi.fn()} onCreate={onCreate} />);

  await userEvent.click(screen.getByRole("button", { name: "默认学习课程" }));
  await userEvent.click(screen.getByRole("button", { name: "下一步" }));
  await userEvent.type(screen.getByLabelText("课程名称"), "机器学习");
  await userEvent.click(screen.getByRole("button", { name: "创建并进入课程" }));

  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
    title: "机器学习",
    course_type: "knowledge",
  }));
});

test("course home is the module gateway and exposes the merged weekly workspace", async () => {
  const onOpenModule = vi.fn();
  const onContinue = vi.fn();
  render(<CourseHome
    course={{ id: 3, title: "机器学习", description: "构建完整能力图谱", progress: 0.4, goal: "完成端到端项目" }}
    summary={{ task_counts: { todo: 4, doing: 2, done: 8 }, notebook_count: 3, document_count: 6, run_count: 11, recent_items: [] }}
    onOpenModule={onOpenModule}
    onContinue={onContinue}
  />);

  await userEvent.click(screen.getByRole("button", { name: /查看本周任务/ }));
  await userEvent.click(screen.getByRole("button", { name: /知识网络/ }));
  expect(onContinue).toHaveBeenCalledOnce();
  expect(onOpenModule).toHaveBeenCalledWith("knowledge");
});
