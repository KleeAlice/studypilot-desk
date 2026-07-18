import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./frontend/tests/setup.ts"],
    include: ["frontend/tests/**/*.test.ts?(x)", "tests/unit/**/*.test.ts?(x)"],
  },
});

