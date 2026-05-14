import { describe, expect, it } from "vitest";

import { buildAllowedCorsOrigins, createCorsOptions } from "../../config/cors.js";

function resolveCorsOrigin(options, origin) {
  return new Promise((resolve, reject) => {
    options.origin(origin, (error, allowedOrigin) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(allowedOrigin);
    });
  });
}

describe("cors config", () => {
  it("allows the production frontend origin by default", async () => {
    const options = createCorsOptions({
      CORS_ALLOWED_ORIGINS: "http://localhost:5173",
    });

    await expect(resolveCorsOrigin(options, "https://neocentral.dev")).resolves.toBe("https://neocentral.dev");
  });

  it("keeps configured origins and normalizes trailing slashes", () => {
    const origins = buildAllowedCorsOrigins({
      FRONTEND_URL: "https://frontend.example.test/",
      CORS_ALLOWED_ORIGINS: "https://admin.example.test/, http://localhost:5173",
    });

    expect(origins).toEqual(
      expect.arrayContaining([
        "https://neocentral.dev",
        "https://frontend.example.test",
        "https://admin.example.test",
        "http://localhost:5173",
      ])
    );
  });

  it("does not allow unrelated browser origins", async () => {
    const options = createCorsOptions({});

    await expect(resolveCorsOrigin(options, "https://unknown.example.test")).resolves.toBe(false);
  });
});
