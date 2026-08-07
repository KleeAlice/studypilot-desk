import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { VocabularyLibrary } from "../src/language/VocabularyLibrary";


const course = {
  id: 9,
  title: "我的英语",
  description: "",
  course_type: "language" as const,
  target_language_tag: "en-US",
  pronunciation_scheme: "ipa",
  daily_word_goal: 10,
};

const words = [
  {
    id: 1,
    course_id: 9,
    language_tag: "en-US",
    term: "curious",
    pronunciation: "/ˈkjʊəriəs/",
    meaning: "好奇的",
    example: "She is curious.",
    source_kind: "document",
    source_id: "3",
    document_id: 3,
    block_key: "paragraph-2",
    locator: { paragraph: 2 },
    interval_days: 0,
    repetitions: 0,
    next_review_at: null,
    last_rating: "",
  },
  {
    id: 2,
    course_id: 9,
    language_tag: "en-US",
    term: "patient",
    pronunciation: "/ˈpeɪʃnt/",
    meaning: "耐心的",
    example: "Please be patient.",
    source_kind: "",
    source_id: "",
    document_id: null,
    block_key: "",
    locator: {},
    interval_days: 3,
    repetitions: 1,
    next_review_at: "2099-01-01T00:00:00Z",
    last_rating: "good",
  },
];

test("vocabulary library searches, adds and opens a persisted source", async () => {
  const onOpenSource = vi.fn();
  const api = {
    get: vi.fn().mockResolvedValue(words),
    post: vi.fn().mockImplementation(async (_path: string, payload: any) => ({
      id: 3,
      course_id: 9,
      interval_days: 0,
      repetitions: 0,
      next_review_at: null,
      last_rating: "",
      source_kind: "",
      source_id: "",
      document_id: null,
      block_key: "",
      locator: {},
      ...payload,
    })),
  } as any;

  render(<VocabularyLibrary api={api} course={course} onOpenSource={onOpenSource} />);
  await waitFor(() => expect(api.get).toHaveBeenCalledWith("/api/vocabulary?course_id=9&limit=200"));
  expect(screen.getByText("/ˈkjʊəriəs/")).toBeVisible();

  await userEvent.type(screen.getByLabelText("搜索词汇"), "cur");
  expect(screen.getByRole("heading", { name: "curious" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "patient" })).not.toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "查看 curious 的来源" }));
  expect(onOpenSource).toHaveBeenCalledWith(expect.objectContaining({
    document_id: 3,
    block_key: "paragraph-2",
  }));

  await userEvent.clear(screen.getByLabelText("搜索词汇"));
  await userEvent.click(screen.getByRole("button", { name: "添加词汇" }));
  await userEvent.type(screen.getByLabelText("原词"), "thoughtful");
  await userEvent.type(screen.getByLabelText("读音"), "/ˈθɔːtfl/");
  await userEvent.type(screen.getByLabelText("释义"), "体贴的");
  await userEvent.type(screen.getByLabelText("例句"), "That was thoughtful.");
  await userEvent.click(screen.getByRole("button", { name: "保存词汇" }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/vocabulary", expect.objectContaining({
    course_id: 9,
    language_tag: "en-US",
    term: "thoughtful",
    pronunciation: "/ˈθɔːtfl/",
    meaning: "体贴的",
    example: "That was thoughtful.",
  })));
  expect(screen.getByRole("heading", { name: "thoughtful" })).toBeVisible();
});
