import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

test("defines a standalone mobile entry and build output", () => {
  const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
  const html = readFileSync("frontend/mobile.html", "utf8");
  const bootstrap = readFileSync("frontend/src/mobile/main.tsx", "utf8");
  const config = readFileSync("vite.mobile.config.ts", "utf8");

  expect(packageJson.scripts["mobile:build"]).toContain("vite.mobile.config.ts");
  expect(html).toContain("/src/mobile/main.tsx");
  expect(html).toContain("viewport-fit=cover");
  expect(bootstrap).toContain("createDemoDataSource");
  expect(bootstrap).toContain("./styles.css");
  expect(config).toContain("dist-mobile");
});
