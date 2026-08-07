import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { RoadmapGeneratorDialog } from "../src/features/RoadmapGeneratorDialog";

const provider = {
  id: "deepseek",
  label: "DeepSeek",
  icon: "deepseek",
  protocol: "openai_compatible",
  base_url: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  max_output_tokens: 100000,
  has_api_key: true,
  enabled: true,
};

test("uses a custom duration, primary planning goal, and select-all materials", async () => {
  const generated = {
    roadmap: { title: "路线", summary: "", goal: "", phases: [], weeks: [] },
    trace: { model: "deepseek-chat", schema: "studypilot-roadmap/v1", fields: [] },
  };
  const api = {
    get: vi.fn((path: string) => Promise.resolve(
      path === "/api/agent/providers" ? [provider]
        : path === "/api/courses/7/documents" ? [
          { id: 11, title: "矩阵讲义", filename: "matrix.pdf", course_id: 7 },
          { id: 12, title: "习题集", filename: "exercises.md", course_id: 7 },
        ]
          : path === "/api/agent/threads?course_id=7" ? []
            : [],
    )),
    post: vi.fn().mockResolvedValue(generated),
  } as any;

  render(
    <RoadmapGeneratorDialog
      api={api}
      courseId={7}
      courseTitle="线性代数"
      open
      onClose={vi.fn()}
      onGenerated={vi.fn()}
    />,
  );

  await screen.findByRole("button", { name: /DeepSeek/ });
  await userEvent.click(screen.getByRole("button", { name: "下一步" }));

  expect(screen.getByRole("button", { name: "自定义" })).toBeInTheDocument();
  expect(screen.queryByLabelText("自定义学习周数")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "自定义" }));
  await userEvent.clear(screen.getByLabelText("自定义学习周数"));
  await userEvent.type(screen.getByLabelText("自定义学习周数"), "10");
  await userEvent.type(
    screen.getByLabelText("计划目标或完成范围"),
    "完成考研线性代数全部范围，并能独立解综合题",
  );
  await userEvent.click(screen.getByRole("button", { name: "下一步" }));

  await userEvent.click(screen.getByRole("button", { name: "全选全部资料" }));
  expect(screen.getByText("2 / 2")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "生成学习计划" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    "/api/courses/7/roadmap/generate",
    expect.objectContaining({
      provider_id: "deepseek",
      target_weeks: 10,
      planning_goal: "完成考研线性代数全部范围，并能独立解综合题",
      document_ids: [11, 12],
    }),
    { timeoutMs: 360_000 },
  ));
});
