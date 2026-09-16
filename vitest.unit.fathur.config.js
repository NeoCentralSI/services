import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/test/unit/fathur/**/*.test.js"],
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "src/services/adminfeatures.service.js",
        "src/services/curriculum.service.js",
        "src/services/cpl.service.js",
        "src/services/cpmk.service.js",
        "src/services/thesis-cpmk.service.js",
        "src/services/lecturer-availability.service.js",
        "src/services/defence-requirement.service.js",
        "src/services/defence-rubric.service.js",
        "src/services/seminar-requirement.service.js",
        "src/services/seminar-rubric.service.js",
        "src/services/thesis-seminar/**/*.js",
        "src/services/thesis-defence/**/*.js",
        "src/services/yudisium/**/*.js",
      ],
      exclude: ["src/test/**", "node_modules/**"],
    },
  },
});
