import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { NotebookLibrary } from "../src/features/NotebookLibrary";
import type { KnowledgeNotebook } from "../src/types";

const notebooks: KnowledgeNotebook[] = [
  { id: 1, course_id: 4, title: "核心概念", description: "课程主图谱", kind: "mixed", cover_style: "cobalt", canvas_settings: {}, node_count: 8, edge_count: 5 },
  { id: 2, course_id: 4, title: "公式推导", description: "线性代数", kind: "mindmap", cover_style: "moss", canvas_settings: {}, node_count: 3, edge_count: 2 },
];

test("lists course-local notebooks and opens a selected canvas", async () => {
  const onOpen = vi.fn();
  render(<NotebookLibrary courseTitle="机器学习" notebooks={notebooks} onOpen={onOpen} onCreate={vi.fn()} onTrash={vi.fn()} onBackHome={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "知识笔记" })).toBeInTheDocument();
  expect(screen.getByText("2 本笔记 · 11 个节点")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "打开知识笔记：公式推导" }));
  expect(onOpen).toHaveBeenCalledWith(notebooks[1]);
});

test("creates a mind map from the notebook library", async () => {
  const onCreate = vi.fn().mockResolvedValue(undefined);
  render(<NotebookLibrary courseTitle="机器学习" notebooks={notebooks} onOpen={vi.fn()} onCreate={onCreate} onTrash={vi.fn()} onBackHome={vi.fn()} />);
  await userEvent.click(screen.getByRole("button", { name: "新建知识笔记" }));
  await userEvent.type(screen.getByLabelText("知识笔记名称"), "模型族谱");
  await userEvent.click(screen.getByRole("button", { name: "思维导图" }));
  await userEvent.click(screen.getByRole("button", { name: "创建知识笔记" }));
  expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ title: "模型族谱", kind: "mindmap" }));
});

test("three-dot notebook control never deletes until the named notebook is confirmed", async () => {
  const onTrash = vi.fn().mockResolvedValue(undefined);
  render(<NotebookLibrary courseTitle="机器学习" notebooks={notebooks} onOpen={vi.fn()} onCreate={vi.fn()} onTrash={onTrash} onBackHome={vi.fn()} />);

  await userEvent.click(screen.getByRole("button", { name: "更多知识笔记操作：核心概念" }));
  expect(onTrash).not.toHaveBeenCalled();
  expect(screen.getByRole("menu", { name: "核心概念的知识笔记操作" })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("menuitem", { name: "移入回收站" }));
  expect(screen.getByRole("alertdialog", { name: "将知识笔记移入回收站？" })).toHaveTextContent("核心概念");
  expect(onTrash).not.toHaveBeenCalled();

  await userEvent.click(screen.getByRole("button", { name: "确认移入回收站" }));
  expect(onTrash).toHaveBeenCalledWith(notebooks[0]);
});
