import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": import.meta.dirname },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["dotenv/config"],
    globalSetup: ["tests/global-setup.ts"],
    // Integration tests share one database; keep files sequential.
    fileParallelism: false,
  },
});
