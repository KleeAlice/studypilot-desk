import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { BootScreen } from "../src/app/BootScreen";


beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("keeps the window responsive while startup data loads in stages", () => {
  render(<BootScreen />);

  const status = screen.getByRole("status");
  expect(status).toHaveTextContent("窗口已就绪，学习数据正在后台装载");
  expect(status).toHaveTextContent("正在启动本地服务");

  act(() => vi.advanceTimersByTime(950));
  expect(status).toHaveTextContent("正在连接学习数据库");

  act(() => vi.advanceTimersByTime(950));
  expect(status).toHaveTextContent("正在恢复课程与对话");
});
