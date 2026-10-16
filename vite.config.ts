import { defineConfig } from "vitest/config";
export default defineConfig({
  base: "./",
  esbuild: { jsx: "automatic" },
  test: { environment: "jsdom", include: ["tests/**/*.test.{ts,tsx}"] },
  build: {
    rollupOptions: {
      output: { manualChunks: { math: ["katex"], flow: ["@xyflow/react"] } },
    },
  },
});
