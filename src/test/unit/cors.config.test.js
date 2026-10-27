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
  it("allows the frontend from FRONTEND_URL and no deployed domain by default", async () => {
    const options = createCorsOptions({
      FRONTEND_URL: "https://frontend.example.test",
    });

    await expect(resolveCorsOrigin(options, "https://frontend.example.test")).resolves.toBe("https://frontend.example.test");
    await expect(resolveCorsOrigin(options, "https://neocentral.dev")).resolves.toBe(false);
  });

  it("keeps configured origins and normalizes trailing slashes", () => {
    const origins = buildAllowedCorsOrigins({
      FRONTEND_URL: "https://frontend.example.test/",
      CORS_ALLOWED_ORIGINS: "https://admin.example.test/, http://localhost:5173",
    });

    expect(origins).toEqual(
      expect.arrayContaining([
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
