import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { LearningMessageCard } from "../src/agent/LearningMessageCard";
import { LearningStartCard } from "../src/agent/LearningStartCard";


const learningPath = {
  subject: "Python",
  goal: "从语法基础走到能独立编写小程序",
  stages: [
    {
      title: "语法与数据",
      objective: "掌握变量、类型和基本控制流",
      concepts: ["变量", "数据类型", "条件判断"],
    },
    {
      title: "程序结构",
      objective: "使用函数和模块组织代码",
      concepts: ["函数", "模块", "异常处理"],
    },
  ],
};


test("starts a source-free learning plan from a plain topic", async () => {
  const onAutonomousStart = vi.fn();
  render(
    <LearningStartCard
      hasSelectedMaterials={false}
      onStart={vi.fn()}
      onAutonomousStart={onAutonomousStart}
    />,
  );

  await userEvent.type(
    screen.getByRole("textbox", { name: "想学习的主题" }),
    "Python",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "规划并开始学习" }),
  );

  expect(onAutonomousStart).toHaveBeenCalledWith("Python", "");
});


test("hides a legacy per-message path and submits a multiple-choice answer", async () => {
  const onAnswer = vi.fn();
  render(
    <LearningMessageCard
      card={{
        thread_title: "Python 零基础路线",
        learning_path: learningPath,
        concept: "变量",
        direct_answer: "变量是保存数据的名字。",
        explanation: "程序通过变量引用不断变化的数据。",
        example: {
          concept: "变量",
          scenario: "把用户年龄保存为 age。",
          analysis: "age 是名字，实际年龄是它当前保存的数据。",
        },
        practice: {
          concept: "变量",
          type: "multiple_choice",
          question: "下面哪一个是合法的变量赋值？",
          options: [
            { id: "A", text: "18 = age" },
            { id: "B", text: "age = 18" },
            { id: "C", text: "age == 18 =" },
            { id: "D", text: "变量 18" },
          ],
          correct_option: "B",
          reference_answer: "B。赋值时变量名写在等号左边。",
        },
      }}
      onAnswer={onAnswer}
      onFeedback={vi.fn()}
    />,
  );

  expect(screen.queryByRole("region", { name: "为你规划的学习路径" }))
    .not.toBeInTheDocument();
  await userEvent.click(screen.getByText("查看结构化内容"));
  expect(screen.getByLabelText("已校验学习内容"))
    .not.toHaveTextContent("learning_path");
  await userEvent.click(screen.getByRole("radio", { name: /B.*age = 18/ }));
  await userEvent.click(screen.getByRole("button", { name: "提交答案" }));

  expect(onAnswer).toHaveBeenCalledWith("我的答案：B. age = 18");
});


test("uses an open response on the fifth lesson", async () => {
  const onAnswer = vi.fn();
  render(
    <LearningMessageCard
      card={{
        concept: "函数",
        direct_answer: "函数把一段可复用逻辑命名。",
        explanation: "调用函数时可以提供输入并得到输出。",
        example: {
          concept: "函数",
          scenario: "把计算总价的逻辑写成 total_price。",
          analysis: "不同订单都可以复用同一段计算逻辑。",
        },
        practice: {
          concept: "函数",
          type: "open",
          question: "为什么重复逻辑适合提取成函数？",
          options: [],
          correct_option: "",
          reference_answer: "因为函数能减少重复，并让修改集中在一个位置。",
        },
      }}
      onAnswer={onAnswer}
      onFeedback={vi.fn()}
    />,
  );

  await userEvent.type(
    screen.getByRole("textbox", { name: "填写开放式回答" }),
    "可以复用，也更容易修改。",
  );
  await userEvent.click(screen.getByRole("button", { name: "提交回答" }));

  expect(onAnswer).toHaveBeenCalledWith("我的回答：可以复用，也更容易修改。");
});
