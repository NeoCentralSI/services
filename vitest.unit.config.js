import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/test/unit/**/*.test.js"],
    exclude: [
      "node_modules/**",
      "src/test/unit/thesisChangeRequest.service.test.js",
      "src/test/unit/milestone.service.test.js",
      "src/test/unit/supervisor2.service.test.js",
      "src/test/unit/student.guidance.service.test.js",
    ],
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/services/**/*.js"],
      exclude: ["src/test/**", "node_modules/**"],
    },
  },
});
