import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { MobileApp } from "../src/mobile/MobileApp";
import { createDemoDataSource } from "../src/mobile/demo-data-source";

test("completes a task locally and advances the visible daily progress", async () => {
  render(<MobileApp source={createDemoDataSource()} />);
  const progress = await screen.findByRole("progressbar", { name: "今日进度" });
  const before = Number(progress.getAttribute("aria-valuenow"));
  const action = screen.getAllByRole("button", { name: /完成任务/ })[0];
  expect(action.closest("article")).not.toHaveAttribute("data-celebrate");

  await userEvent.click(action);

  expect(Number(progress.getAttribute("aria-valuenow"))).toBeGreaterThan(before);
  expect(screen.getByRole("status")).toHaveTextContent("完成得漂亮");
  expect(action.closest("article")).toHaveAttribute("data-celebrate", "true");
});

test("shows streak, continuation context, and honest read-only task actions", async () => {
  render(<MobileApp source={createDemoDataSource()} />);

  expect(await screen.findByLabelText("12 天连续学习")).toBeInTheDocument();
  expect(screen.getByText("最短路径的状态设计")).toBeInTheDocument();
  expect(screen.getByText("手机预览完成状态，不会改动电脑数据")).toBeInTheDocument();
});
