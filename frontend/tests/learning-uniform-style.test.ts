import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";


test("learning cards use one strict content size for output, questions, answers and controls", () => {
  const agentStyles = readFileSync(resolve(process.cwd(), "frontend/src/styles/agent.css"), "utf8");
  expect(agentStyles).toContain("--learning-content-font-size: var(--ui-body-font-size)");
  expect(agentStyles).toMatch(/\.learning-card\s*,\s*\.learning-card\s+:where\([\s\S]*font-size:\s*var\(--learning-content-font-size\)\s*!important/);
});
