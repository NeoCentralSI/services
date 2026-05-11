import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.js"],
    exclude: [
      "node_modules/**",
      "src/test/integration/topicChange.test.js",
      "src/test/unit/thesisChangeRequest.service.test.js",
      "src/test/unit/milestone.service.test.js",
      "src/test/unit/supervisor2.service.test.js",
      "src/test/student.guidance.service.test.js",
      "src/test/unit/student.guidance.service.test.js",
    ],
    testTimeout: 10000,
  },
});
