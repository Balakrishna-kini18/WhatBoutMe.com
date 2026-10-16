import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    root: "./",
    include: ["app/**/*.test.ts"],
  },
});
