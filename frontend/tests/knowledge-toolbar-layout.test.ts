import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("knowledge toolbar responsive layout", () => {
  test("responds to the knowledge panel width and avoids nested horizontal scrollers", () => {
    const stylesheet = readFileSync(
      resolve(process.cwd(), "frontend/src/styles/refinement.css"),
      "utf8",
    );

    expect(stylesheet).toMatch(/\.knowledge-studio\s*\{[^}]*container-type:\s*inline-size/s);
    expect(stylesheet).toMatch(/@container\s+knowledge-workspace\s*\(max-width:\s*1180px\)/);
    expect(stylesheet).toMatch(/\.canvas-toolbar\s*\{[^}]*grid-template-areas/s);
    expect(stylesheet).not.toMatch(/\.tool-group--canvas-nav\s*\{[^}]*overflow-x:\s*auto/s);
  });
});
