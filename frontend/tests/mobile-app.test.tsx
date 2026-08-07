import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { MobileApp } from "../src/mobile/MobileApp";
import { createDemoDataSource } from "../src/mobile/demo-data-source";

test("moves between primary destinations and keeps source context visible", async () => {
  render(<MobileApp source={createDemoDataSource()} />);
  expect(await screen.findByRole("heading", { name: "今天，继续向前" })).toBeInTheDocument();
  expect(screen.getByText("离线快照")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "课程" }));
  const coursesHeading = await screen.findByRole("heading", { name: "我的课程" });
  expect(screen.getByRole("button", { name: "课程" })).toHaveAttribute("aria-current", "page");
  await waitFor(() => expect(coursesHeading).toHaveFocus());

  await userEvent.click(screen.getByRole("button", { name: "统计" }));
  expect(await screen.findByRole("heading", { name: "学习节奏" })).toBeInTheDocument();
  expect(screen.getByText("离线快照")).toBeInTheDocument();
});

test("labels all four compact primary destinations", async () => {
  render(<MobileApp source={createDemoDataSource()} />);
  await screen.findByRole("heading", { name: "今天，继续向前" });

  expect(screen.getByRole("navigation", { name: "主要导航" })).toBeInTheDocument();
  for (const label of ["首页", "课程", "笔记", "统计"]) {
    expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
  }
});
