import { describe, expect, it } from "vitest";

import metopenRouter from "../../routes/metopen.route.js";

function getRouteMap(router) {
  return router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).sort(),
    }));
}

describe("metopen.route", () => {
  it("registers the active proposal and KaDep title-review endpoints", () => {
    const routes = getRouteMap(metopenRouter);

    expect(routes).toEqual(
      expect.arrayContaining([
        { path: "/eligibility", methods: ["get"] },
        { path: "/progress/:thesisId", methods: ["get"] },
        { path: "/me/proposal-approval", methods: ["get"] },
        { path: "/me/seminar-eligibility", methods: ["get"] },
        { path: "/me/proposal-queue/sync", methods: ["post"] },
        { path: "/kadep/title-reports/pending", methods: ["get"] },
        { path: "/kadep/thesis/:thesisId/title-report/review", methods: ["post"] },
      ]),
    );
  });
});
