import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { MobileApp } from "../src/mobile/MobileApp";
import { createDemoDataSource } from "../src/mobile/demo-data-source";

test("shows course progress as named, numeric values", async () => {
  render(<MobileApp source={createDemoDataSource()} />);
  await screen.findByRole("heading", { name: "今天，继续向前" });
  await userEvent.click(screen.getByRole("button", { name: "课程" }));

  expect(await screen.findByText("算法与工程进阶")).toBeInTheDocument();
  expect(screen.getByRole("progressbar", { name: "算法与工程进阶课程进度" })).toHaveAttribute("aria-valuenow", "64");
  expect(screen.getByRole("progressbar", { name: "机器学习系统课程进度" })).toHaveAttribute("aria-valuenow", "37");
});

test("opens an accessible knowledge node detail from the graph preview", async () => {
  render(<MobileApp source={createDemoDataSource()} />);
  await screen.findByRole("heading", { name: "今天，继续向前" });
  await userEvent.click(screen.getByRole("button", { name: "笔记" }));

  expect(await screen.findByRole("img", { name: "图与搜索知识图谱" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "知识节点：BFS" }));

  const detail = screen.getByRole("dialog", { name: "BFS" });
  expect(within(detail).getByText("等权图上的层序扩张。")).toBeInTheDocument();
  expect(within(detail).getByText("掌握度 88%" )).toBeInTheDocument();
  await userEvent.click(within(detail).getByRole("button", { name: "关闭节点详情" }));
  expect(screen.queryByRole("dialog", { name: "BFS" })).not.toBeInTheDocument();
});

test("renders fourteen labeled activity days and summary metrics", async () => {
  render(<MobileApp source={createDemoDataSource()} />);
  await screen.findByRole("heading", { name: "今天，继续向前" });
  await userEvent.click(screen.getByRole("button", { name: "统计" }));

  expect(await screen.findByText("本周 184 分钟")).toBeInTheDocument();
  expect(screen.getAllByTestId("activity-day")).toHaveLength(14);
  expect(screen.getByText("78%" )).toBeInTheDocument();
  expect(screen.getByText("86 个知识节点")).toBeInTheDocument();
});
