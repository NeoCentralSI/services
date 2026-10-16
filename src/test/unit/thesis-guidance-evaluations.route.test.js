import { describe, expect, it, vi } from "vitest";

const { passThrough, roleMiddleware } = vi.hoisted(() => ({
  passThrough: (_req, _res, next) => next(),
  roleMiddleware: (roles) => {
    const middleware = (_req, _res, next) => next();
    middleware.allowedRoles = roles;
    return middleware;
  },
}));

vi.mock("../../middlewares/auth.middleware.js", () => ({
  authGuard: passThrough,
  requireAnyRole: (roles) => roleMiddleware(roles),
}));
vi.mock("../../controllers/thesis-guidance-evaluation.controller.js", () => ({
  getContext: passThrough,
  submitEvaluation: passThrough,
  listForDepartment: passThrough,
  listForSupervisor: passThrough,
  listInbox: passThrough,
  decideAsKadep: passThrough,
}));
vi.mock("../../controllers/thesisGuidance/lecturer.guidance.controller.js", async (importOriginal) => {
  const names = Object.keys(await importOriginal());
  return Object.fromEntries(names.map((name) => [name, passThrough]));
});
vi.mock("../../controllers/thesisGuidance/supervisor2.controller.js", async (importOriginal) => {
  const names = Object.keys(await importOriginal());
  return Object.fromEntries(names.map((name) => [name, passThrough]));
});

const { default: router } = await import("../../routes/thesis-guidance-evaluations.route.js");
const { default: lecturerRouter } = await import("../../routes/thesisGuidance/lecturer.guidance.route.js");
const validator = await import("../../validators/thesis-guidance-evaluation.validator.js");

function allowedRoles(path, method) {
  const layer = router.stack.find((candidate) => candidate.route?.path === path && candidate.route.methods?.[method]);
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} tidak ditemukan`);
  return layer.route.stack.map((routeLayer) => routeLayer.handle).find((handle) => Array.isArray(handle.allowedRoles))?.allowedRoles;
}
const paths = (target) => target.stack.filter((layer) => layer.route).map((layer) => layer.route.path);

describe("thesis guidance evaluation routes", () => {
  it("lets Pembimbing 1 fill, the Ketua Departemen decide, and the others read", () => {
    expect(allowedRoles("/", "post")).toEqual(["Pembimbing 1"]);
    expect(allowedRoles("/:id/decision", "post")).toEqual(["Ketua Departemen"]);
    expect(allowedRoles("/department", "get")).toEqual(["Ketua Departemen"]);
    expect(allowedRoles("/lecturer", "get")).toEqual(["Pembimbing 1", "Pembimbing 2"]);
    // Paket E5 (3.4): the Evaluasi page is the Ketua Departemen's decision table only.
    expect(allowedRoles("/inbox", "get")).toEqual(["Ketua Departemen"]);
    expect(allowedRoles("/context", "get")).toEqual(["Mahasiswa", "Pembimbing 1", "Pembimbing 2", "Ketua Departemen"]);
  });

  it("the old evaluation routes and the direct fail route are gone", async () => {
    // The whole /thesis-supervisors router (old evaluations, then Pembimbing 2 by Kadep) is removed.
    await expect(import("../../routes/thesis-supervisors.route.js")).rejects.toThrow();
    expect(paths(lecturerRouter).filter((path) => path.includes("/fail"))).toEqual([]);
  });
});

describe("thesis guidance evaluation validators", () => {
  const thesisId = "3f0c2d5e-8f2a-4c56-9f0b-1c2d3e4f5a6b";

  it("accepts the four decisions and the four observations", () => {
    const parse = (input) => validator.submitEvaluationSchema.safeParse(input);
    for (const recommendation of ["continue", "extend_1_month", "revise_proposal", "terminate_supervision"]) {
      expect(parse({ thesisId, recommendation }).success).toBe(true);
    }
    expect(parse({ thesisId, recommendation: "continue", observations: { noGuidance: true, noProgress: false, noResponse: true, noRevision: true }, notes: "catatan" }).success).toBe(true);
    expect(parse({ thesisId, recommendation: "pause" }).success).toBe(false);
    expect(parse({ recommendation: "continue" }).success).toBe(false);
    expect(parse({ thesisId, recommendation: "continue", stage: "two_year" }).success).toBe(false);
  });

  it("requires notes to reject", () => {
    const parse = (input) => validator.decisionSchema.safeParse(input);
    expect(parse({ approve: true }).success).toBe(true);
    expect(parse({ approve: false }).success).toBe(false);
    expect(parse({ approve: false, notes: "Belum cukup dasar" }).success).toBe(true);
  });
});
