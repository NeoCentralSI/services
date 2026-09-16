import { defineConfig } from "vitest/config";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    fileParallelism: false,
    include: ["src/test/system/**/*.test.js"],
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
});
