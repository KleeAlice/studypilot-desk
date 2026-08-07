import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { LearningMessageCard } from "../src/agent/LearningMessageCard";


test("renders one coherent model-authored lesson without an automatic vocabulary section", async () => {
  const onFeedback = vi.fn();
  render(
    <LearningMessageCard
      card={{
        concept: "人工卡片",
        direct_answer: "人工卡片把机器无法可靠处理的判断交给人。",
        explanation: "系统负责整理问题、证据和候选答案，人负责最后裁决。",
        example: {
          concept: "人工卡片",
          scenario: "账务系统发现余额差异，但无法判断责任归属。",
          analysis: "它生成一张人工卡片，列出差异与凭证，让审核员裁决。",
        },
        practice: {
          concept: "人工卡片",
          question: "人工卡片为什么不是让系统继续自动决定？",
          reference_answer: "因为系统只整理上下文，最终判断明确交给人。",
        },
      }}
      onFeedback={onFeedback}
    />,
  );

  expect(screen.getByText("先给结论")).toBeInTheDocument();
  expect(screen.getByText("展开讲清楚")).toBeInTheDocument();
  expect(screen.getByText("与本题对齐的例子")).toBeInTheDocument();
  expect(screen.getByText("人工卡片为什么不是让系统继续自动决定？")).toBeInTheDocument();
  expect(screen.queryByText("词语拆开看")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "加入生词本" })).not.toBeInTheDocument();

  await userEvent.click(screen.getByText("查看参考答案"));
  expect(screen.getByText("因为系统只整理上下文，最终判断明确交给人。")).toBeVisible();
});



test("renders model-authored markdown as formatted learning content", async () => {
  render(
    <LearningMessageCard
      card={{
        concept: "双管线",
        direct_answer: "**渠道只给先验，内容决定去向。**",
        explanation: "## 五、必须记住的衍生规则\n\n流水使用 **流水指纹库** 去重。<br><br>第二条规则。",
        example: {
          concept: "双管线",
          scenario: "上传一份 **N43** 对账单。",
          analysis: "应当进入资金管线。",
        },
        practice: {
          concept: "双管线",
          type: "multiple_choice",
          question: "哪一项符合 **渠道 ≠ 内容**？",
          options: [
            { id: "A", text: "只看渠道" },
            { id: "B", text: "按 **内容性质** 纠偏" },
            { id: "C", text: "随机分流" },
            { id: "D", text: "一律转人工" },
          ],
          correct_option: "B",
          reference_answer: "选择 **B**。",
        },
      }}
      onFeedback={() => undefined}
    />,
  );

  expect(
    screen.getByRole("heading", {
      level: 2,
      name: "五、必须记住的衍生规则",
    }),
  ).toBeInTheDocument();
  expect(screen.getByText("流水指纹库").tagName).toBe("STRONG");
  expect(screen.getByText("第二条规则。")).toBeInTheDocument();
  expect(screen.getByText("内容性质").tagName).toBe("STRONG");
  await userEvent.click(screen.getByText("查看参考答案"));
  expect(
    screen.getAllByText("B").some((element) => element.tagName === "STRONG"),
  ).toBe(true);
});
