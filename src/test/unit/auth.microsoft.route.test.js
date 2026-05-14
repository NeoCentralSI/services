import { describe, expect, it } from "vitest";

import router from "../../routes/auth.route.js";

function collectRouteDefinitions(expressRouter) {
  return (expressRouter.stack || [])
    .filter((layer) => layer.route)
    .map((layer) => {
      const method = Object.keys(layer.route.methods || {})
        .find((name) => layer.route.methods[name])
        ?.toUpperCase();

      return `${method} ${layer.route.path}`;
    });
}

describe("auth.route", () => {
  it("registers Microsoft OAuth web-flow endpoints on the auth router", () => {
    const definitions = collectRouteDefinitions(router);

    expect(definitions).toContain("GET /microsoft/login");
    expect(definitions).toContain("GET /microsoft/callback");
    // POST /microsoft/exchange — one-shot exchange code for tokens (HTTPS body).
    // Menggantikan transport token lewat URL query.
    expect(definitions).toContain("POST /microsoft/exchange");
  });

  it("does NOT register the mobile login endpoint (out of SIMPTA scope)", () => {
    const definitions = collectRouteDefinitions(router);
    expect(definitions).not.toContain("POST /microsoft/mobile");
  });
});
