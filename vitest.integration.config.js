import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    fileParallelism: false,
    include: ["src/test/integration/**/*.test.js"],
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/services/**/*.js"],
      exclude: ["src/test/**", "node_modules/**"],
    },
  },
});