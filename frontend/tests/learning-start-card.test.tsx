import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { LearningStartCard } from "../src/agent/LearningStartCard";

test("renders autonomous and material learning as equal-weight options", () => {
  render(
    <LearningStartCard
      hasSelectedMaterials
      selectedMaterials={[
        { id: 11, title: "线性代数讲义", filename: "linear-algebra.pdf" },
        { id: 12, title: "矩阵习题", filename: "matrix.md" },
      ]}
      availableMaterialCount={4}
      onManageMaterials={vi.fn()}
      onStart={vi.fn()}
      onAutonomousStart={vi.fn()}
    />,
  );

  const autonomous = screen.getByRole("group", { name: "自主规划学习" });
  const materials = screen.getByRole("group", { name: "从资料开始学习" });
  expect(autonomous).toHaveClass("learning-start__option");
  expect(materials).toHaveClass("learning-start__option");
  expect(autonomous.parentElement).toBe(materials.parentElement);
  expect(autonomous.parentElement).toHaveAttribute("data-layout", "stacked");
  expect(screen.queryByRole("group", { name: "主题示例" })).not.toBeInTheDocument();
  expect(screen.getByRole("list", { name: "已选学习资料" })).toHaveTextContent("线性代数讲义");
  expect(screen.getByRole("list", { name: "已选学习资料" })).toHaveTextContent("矩阵习题");
  expect(screen.getByRole("button", { name: "管理学习资料" })).toHaveTextContent("选择资料");
  expect(screen.getByText("已选 2 / 4")).toBeInTheDocument();
});

test("opens material management and removes a selected item without starting", async () => {
  const onManageMaterials = vi.fn();
  const onRemoveMaterial = vi.fn();
  const onStart = vi.fn();
  render(
    <LearningStartCard
      hasSelectedMaterials
      selectedMaterials={[{ id: 11, title: "线性代数讲义", filename: "linear-algebra.pdf" }]}
      availableMaterialCount={1}
      onManageMaterials={onManageMaterials}
      onRemoveMaterial={onRemoveMaterial}
      onStart={onStart}
      onAutonomousStart={vi.fn()}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "管理学习资料" }));
  expect(onManageMaterials).toHaveBeenCalledOnce();
  await userEvent.click(screen.getByRole("button", { name: "移除资料 线性代数讲义" }));
  expect(onRemoveMaterial).toHaveBeenCalledWith(11);
  expect(onStart).not.toHaveBeenCalled();
});

test("lets the material goal stay empty or sends only the user's own goal", async () => {
  const onStart = vi.fn();
  const view = render(
    <LearningStartCard
      hasSelectedMaterials
      onStart={onStart}
      onAutonomousStart={vi.fn()}
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: "从这些资料开始" }));
  expect(onStart).toHaveBeenLastCalledWith("开始学习所选资料");

  view.rerender(
    <LearningStartCard
      hasSelectedMaterials
      onStart={onStart}
      onAutonomousStart={vi.fn()}
    />,
  );
  await userEvent.type(
    screen.getByLabelText("资料学习目标（可选）"),
    "学完矩阵部分并能做综合题",
  );
  await userEvent.click(screen.getByRole("button", { name: "从这些资料开始" }));
  expect(onStart).toHaveBeenLastCalledWith("学完矩阵部分并能做综合题");
  expect(onStart.mock.calls.flat().join(" ")).not.toContain("小白");
});

test("keeps the autonomous planning goal optional", async () => {
  const onAutonomousStart = vi.fn();
  render(
    <LearningStartCard
      onStart={vi.fn()}
      onAutonomousStart={onAutonomousStart}
    />,
  );
  await userEvent.type(screen.getByLabelText("想学习的主题"), "Python");
  await userEvent.click(screen.getByRole("button", { name: "规划并开始学习" }));
  expect(onAutonomousStart).toHaveBeenCalledWith("Python", "");
});
