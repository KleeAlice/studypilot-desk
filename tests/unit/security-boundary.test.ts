import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";


test("production CSP permits images served by the local backend", () => {
  const html = readFileSync(resolve("frontend/index.html"), "utf8");
  const policy = html.match(/Content-Security-Policy" content="([^"]+)"/)?.[1] || "";
  const imageDirective = policy.match(/img-src\s+([^;]+)/)?.[1] || "";
  const sources = imageDirective.trim().split(/\s+/);

  expect(sources).toContain("http://127.0.0.1:*");
  expect(sources).not.toContain("http:");
});
