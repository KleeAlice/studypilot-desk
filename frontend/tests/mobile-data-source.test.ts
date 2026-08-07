import { expect, test } from "vitest";
import { createDemoDataSource } from "../src/mobile/demo-data-source";

test("exposes a coherent read-only learning snapshot", async () => {
  const source = createDemoDataSource();
  const courses = await source.listCourses();
  const today = await source.getToday(courses[0].id);
  const stats = await source.getStats(courses[0].id);
  const notebooks = await source.listNotebooks(courses[0].id);
  const graph = await source.getKnowledgeGraph(notebooks[0].id);

  expect(source.mode).toBe("snapshot");
  expect(courses).toHaveLength(2);
  expect(courses[0].progress).toBeGreaterThan(0);
  expect(today.tasks.some((task) => !task.completed)).toBe(true);
  expect(stats.activeDays).toHaveLength(14);
  expect(graph.nodes.length).toBeGreaterThan(2);
});

test("returns fresh collections so the read-only fixture cannot be mutated", async () => {
  const source = createDemoDataSource();
  const first = await source.listCourses();
  first.pop();
  const second = await source.listCourses();

  expect(second).toHaveLength(2);
});
