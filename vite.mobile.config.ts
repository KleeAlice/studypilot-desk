import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: "frontend",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../dist-mobile",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(projectRoot, "frontend/mobile.html"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true,
  },
});
