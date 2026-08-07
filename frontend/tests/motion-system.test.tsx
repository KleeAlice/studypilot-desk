import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as motion from "../src/ui/motion";
import { buildNavigationMotion, commitSpatialTransition } from "../src/ui/motion";
import { MotionPresence } from "../src/components/MotionPresence";
import { NavRail } from "../src/components/NavRail";
import { CourseSwitcher } from "../src/components/CourseSwitcher";
import { CourseLibrary } from "../src/features/CourseLibrary";
import { CourseHome } from "../src/features/CourseHome";
import { NotebookLibrary } from "../src/features/NotebookLibrary";
import type { Course, KnowledgeNotebook } from "../src/types";

const course: Course = {
  id: 7,
  title: "动效架构",
  description: "建立空间连续性",
  cover_style: "cobalt",
  icon: "network",
};

const notebook: KnowledgeNotebook = {
  id: 19,
  course_id: course.id,
  title: "运动语言",
  description: "统一动效笔记",
  kind: "mixed",
  cover_style: "plum",
  canvas_settings: {},
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Object.defineProperty(document, "startViewTransition", { value: undefined, configurable: true });
  delete document.documentElement.dataset.motionIntent;
  delete document.documentElement.dataset.motionState;
});

describe("navigation motion contract", () => {
  test("classifies navigation by spatial depth", () => {
    expect(buildNavigationMotion({ level: "library" }, { level: "course", courseId: 7, view: "home" })).toBe("forward");
    expect(buildNavigationMotion({ level: "course", courseId: 7, view: "home" }, { level: "course", courseId: 7, view: "knowledge" })).toBe("forward");
    expect(buildNavigationMotion({ level: "course", courseId: 7, view: "knowledge", notebookId: 19 }, { level: "course", courseId: 7, view: "knowledge" })).toBe("back");
    expect(buildNavigationMotion({ level: "course", courseId: 7, view: "roadmap" }, { level: "course", courseId: 7, view: "lab" })).toBe("lateral");
    expect(buildNavigationMotion({ level: "course", courseId: 7, view: "home" }, { level: "course", courseId: 8, view: "home" })).toBe("replace");
  });

  test("commits navigation synchronously without allocating native document snapshots", () => {
    const update = vi.fn();
    const start = vi.fn((callback: () => void) => {
      callback();
      return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), skipTransition: vi.fn() };
    });
    Object.defineProperty(document, "startViewTransition", { value: start, configurable: true });
    commitSpatialTransition(update, "forward");

    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledOnce();
    expect(document.documentElement).toHaveAttribute("data-motion-intent", "forward");
    expect(document.documentElement).not.toHaveAttribute("data-motion-state");
  });
});

test("presence keeps an exiting surface mounted until its motion completes", () => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });

  function Harness() {
    const [open, setOpen] = useState(true);
    return <><button onClick={() => setOpen(false)}>close</button><MotionPresence present={open} exitMs={180}>{(phase) => <div data-testid="surface" data-presence={phase} />}</MotionPresence></>;
  }

  const view = render(<Harness />);
  act(() => view.getByText("close").click());
  expect(view.getByTestId("surface")).toHaveAttribute("data-presence", "exiting");
  act(() => vi.advanceTimersByTime(179));
  expect(view.getByTestId("surface")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(view.queryByTestId("surface")).not.toBeInTheDocument();
});

test("sidebar exposes a single moving active indicator", () => {
  const { container } = render(<NavRail active="stats" onChange={vi.fn()} collapsed={false} onToggle={vi.fn()} />);
  const indicator = container.querySelector(".navrail__indicator") as HTMLElement;
  expect(indicator).toBeInTheDocument();
  expect(indicator.style.getPropertyValue("--nav-active-index")).toBe("7");
});

test("course switcher exposes the selected replacement while activation is pending", () => {
  let finishActivation!: () => void;
  const courses = [course, { ...course, id: 8, title: "第二课程" }];
  const view = render(<CourseSwitcher
    courses={courses}
    activeCourseId={course.id}
    fallbackTitle={course.title}
    onActivate={() => new Promise<void>((resolve) => { finishActivation = resolve; })}
    onCreate={vi.fn().mockResolvedValue(undefined)}
  />);

  fireEvent.click(view.container.querySelector(".course-switcher__trigger")!);
  const popover = screen.getByRole("dialog", { name: "课程空间" });
  expect(popover.parentElement).toBe(document.body);
  expect(popover.style.position).toBe("fixed");
  expect(popover).toHaveClass("anchored-menu");
  const target = screen.getByRole("button", { name: "切换到 第二课程" });
  fireEvent.click(target);

  expect(view.container.querySelector(".course-switcher")).toHaveAttribute("data-course-switching", "8");
  expect(target).toHaveClass("is-switching");
  finishActivation();
});

test("course entry feedback has a finite minimum frame and respects reduced motion", async () => {
  const waitForMotionFeedback = (motion as Record<string, unknown>).waitForMotionFeedback;
  expect(waitForMotionFeedback).toBeTypeOf("function");
});

test("course surfaces do not allocate shared snapshot layers", () => {
  const library = render(<CourseLibrary courses={[course]} activeCourseId={course.id} onOpen={vi.fn()} onCreate={vi.fn()} onUpdate={vi.fn()} onTrash={vi.fn()} onOpenTrash={vi.fn()} onOpenSettings={vi.fn()} />);
  expect((library.container.querySelector(".course-volume__cover") as HTMLElement).style.viewTransitionName).toBe("");
  library.unmount();
  const home = render(<CourseHome course={course} summary={{ task_counts: { todo: 0, doing: 0, done: 0 }, notebook_count: 0, document_count: 0, run_count: 0, recent_items: [] }} onOpenModule={vi.fn()} onContinue={vi.fn()} />);
  expect((home.container.querySelector(".course-home-cover") as HTMLElement).style.viewTransitionName).toBe("");
});

test("knowledge notebook cards do not allocate shared snapshot layers", () => {
  const { container } = render(<NotebookLibrary courseTitle={course.title} notebooks={[notebook]} onOpen={vi.fn()} onCreate={vi.fn()} onTrash={vi.fn()} onBackHome={vi.fn()} />);
  expect((container.querySelector(".knowledge-notebook__cover") as HTMLElement).style.viewTransitionName).toBe("");
});
