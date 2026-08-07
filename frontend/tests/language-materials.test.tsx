import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { LanguageMaterials } from "../src/language/LanguageMaterials";

const baseLesson = {
  id: "en-survival-food",
  unit_id: "en-survival-food",
  order: 8,
  stage_id: "survival",
  level: "A1",
  title: "点餐与偏好",
  scenario: "food",
  lesson_type: "discover",
  support_level: "full",
  mastery_threshold: 80,
  can_do: "能点一份餐、表达偏好并礼貌致谢。",
  estimated_minutes: 12,
  phrases: [
    {
      term: "Could I have it without sugar?",
      pronunciation: "/wɪˈðaʊt ˈʃʊɡər/",
      meaning: "可以不加糖吗？",
      example: "Could I have it without sugar?",
    },
  ],
  dialogue: [
    { speaker: "A", text: "I'd like a coffee, please.", translation: "我想要一杯咖啡。" },
    { speaker: "B", text: "Anything else?", translation: "还要别的吗？" },
  ],
  passage: {
    title: "At the café",
    text: "Lin orders a coffee without sugar.",
    translation: "Lin 点了一杯不加糖的咖啡。",
  },
  listening: {
    prompt: "选择表达",
    text: "Could I have it without sugar?",
    answer: "Could I have it without sugar?",
    choices: ["Could I have it without sugar?"],
  },
  shadowing: {
    text: "I'd like a coffee without sugar, please.",
    translation: "我想要一杯不加糖的咖啡。",
  },
  output: { prompt: "完成点餐", scaffold: ["I'd like"] },
  culture_note: "使用 please 和 thank you 保持礼貌。",
};

test("the built-in library searches and expands real lesson content", async () => {
  const api = {
    get: vi.fn().mockResolvedValue({
      course_id: 7,
      language_tag: "en-US",
      language_name: "英语完整起步",
      total_lessons: 42,
      query: "",
      items: [
        baseLesson,
        {
          ...baseLesson,
          id: "en-foundation-greeting",
          title: "问候与声音",
          scenario: "greeting",
          phrases: [{
            term: "Hi, how are you?",
            pronunciation: "/haɪ/",
            meaning: "嗨，你好吗？",
            example: "Hi, how are you today?",
          }],
          dialogue: [{ speaker: "A", text: "Hello!", translation: "你好！" }],
          passage: { title: "Hello", text: "Maya says hello.", translation: "Maya 向人问好。" },
          shadowing: { text: "Hi, how are you?", translation: "嗨，你好吗？" },
        },
      ],
    }),
  } as any;

  render(
    <LanguageMaterials api={api} courseId={7} onStart={vi.fn()}>
      <div>个人资料区域</div>
    </LanguageMaterials>,
  );

  expect(await screen.findByText("42 节内置课程")).toBeVisible();
  expect(screen.getByText("个人资料区域")).toBeVisible();
  await userEvent.type(screen.getByLabelText("搜索内置课程"), "咖啡");
  expect(screen.getByRole("heading", { name: "点餐与偏好" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "问候与声音" })).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "展开材料：点餐与偏好" }));
  expect(screen.getAllByText("Could I have it without sugar?")[0]).toBeVisible();
  expect(screen.getByRole("heading", { name: "At the café" })).toBeVisible();
  expect(screen.getByText("Lin 点了一杯不加糖的咖啡。")).toBeVisible();
  expect(screen.getByText("使用 please 和 thank you 保持礼貌。")).toBeVisible();
  expect(api.get).toHaveBeenCalledWith("/api/courses/7/language/materials");
});


test("the built-in library has a retryable error state", async () => {
  const api = {
    get: vi.fn().mockRejectedValue(new Error("课程包不可用")),
  } as any;

  render(<LanguageMaterials api={api} courseId={7} onStart={vi.fn()} />);

  expect(await screen.findByRole("alert")).toHaveTextContent("课程包不可用");
  expect(screen.getByRole("button", { name: "重新加载资料" })).toBeVisible();
});
