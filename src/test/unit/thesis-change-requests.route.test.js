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
vi.mock("../../controllers/thesis-change-request.controller.js", () => ({
  getContext: passThrough,
  listInbox: passThrough,
  getSupervisorOptions: passThrough,
  submitRequest: passThrough,
  submitTransfer: passThrough,
  decideAsLecturer: passThrough,
  cancelRequest: passThrough,
  decideAsKadep: passThrough,
  decideBatchAsKadep: passThrough,
}));

const { default: router } = await import("../../routes/thesis-change-requests.route.js");
const validator = await import("../../validators/thesis-change-request.validator.js");

function allowedRoles(path, method) {
  const layer = router.stack.find((candidate) => candidate.route?.path === path && candidate.route.methods?.[method]);
  if (!layer) throw new Error(`Route ${method.toUpperCase()} ${path} tidak ditemukan`);
  return layer.route.stack.map((routeLayer) => routeLayer.handle).find((handle) => Array.isArray(handle.allowedRoles))?.allowedRoles;
}

const STUDENT_AND_SUPERVISORS = ["Mahasiswa", "Pembimbing 1", "Pembimbing 2"];
const SUPERVISORS = ["Pembimbing 1", "Pembimbing 2"];
const KADEP = ["Ketua Departemen"];

describe("thesis change request routes", () => {
  it("lets students and supervisors submit, follow and cancel requests", () => {
    expect(allowedRoles("/context", "get")).toEqual(STUDENT_AND_SUPERVISORS);
    expect(allowedRoles("/", "post")).toEqual(STUDENT_AND_SUPERVISORS);
    expect(allowedRoles("/:id/cancel", "post")).toEqual(STUDENT_AND_SUPERVISORS);
  });

  it("keeps lecturer steps and student handover to supervisors", () => {
    expect(allowedRoles("/transfer", "post")).toEqual(SUPERVISORS);
    expect(allowedRoles("/:id/lecturer-decision", "post")).toEqual(SUPERVISORS);
  });

  it("keeps the department queue and the final decision to the Ketua Departemen", () => {
    expect(allowedRoles("/:id/decision", "post")).toEqual(KADEP);
    expect(allowedRoles("/batch/:batchId/decision", "post")).toEqual(KADEP);
  });

  it("The Perubahan page is the Ketua Departemen's; a lecturer's steps are in Permohonan", () => {
    expect(allowedRoles("/inbox", "get")).toEqual(KADEP);
  });

  it("The old lecturer and department lists are gone (Permohonan and the Kadep inbox replace them)", () => {
    const paths = router.stack.filter((layer) => layer.route).map((layer) => layer.route.path);
    expect(paths).not.toContain("/lecturer");
    expect(paths).not.toContain("/department");
  });

  it("registers the batch route before the :id routes", () => {
    const paths = router.stack.filter((layer) => layer.route).map((layer) => layer.route.path);
    expect(paths.indexOf("/batch/:batchId/decision")).toBeLessThan(paths.indexOf("/:id/decision"));
  });
});

describe("thesis change request validators", () => {
  const uuid = "3f0c2d5e-8f2a-4c56-9f0b-1c2d3e4f5a6b";
  const reason = "Alasan yang cukup panjang.";

  it("requires the fields of each request type", () => {
    const parse = (input) => validator.submitChangeRequestSchema.safeParse(input);
    expect(parse({ requestType: "title", reason, newTitle: "Judul Baru" }).success).toBe(true);
    expect(parse({ requestType: "title", reason }).success).toBe(false);
    expect(parse({ requestType: "supervisor", reason, supervisorRole: "pembimbing_2", newSupervisorId: uuid }).success).toBe(true);
    expect(parse({ requestType: "supervisor", reason, newSupervisorId: uuid }).success).toBe(false);
    expect(parse({ requestType: "both", reason, newTitle: "Judul Baru", supervisorRole: "pembimbing_1" }).success).toBe(false);
    expect(parse({ requestType: "topic", reason, newTitle: "Judul Baru" }).success).toBe(false);
    expect(parse({ requestType: "title", reason: "pendek", newTitle: "Judul Baru" }).success).toBe(false);
  });

  it("requires at least one student, a target lecturer and a reason to hand students over", () => {
    const parse = (input) => validator.submitTransferSchema.safeParse(input);
    expect(parse({ thesisIds: [uuid], newSupervisorId: uuid, reason }).success).toBe(true);
    expect(parse({ thesisIds: [], newSupervisorId: uuid, reason }).success).toBe(false);
    expect(parse({ thesisIds: [uuid], newSupervisorId: uuid }).success).toBe(false);
  });

  it("requires notes to reject", () => {
    const parse = (input) => validator.decisionSchema.safeParse(input);
    expect(parse({ approve: true }).success).toBe(true);
    expect(parse({ approve: false }).success).toBe(false);
    expect(parse({ approve: false, notes: "   " }).success).toBe(false);
    expect(parse({ approve: false, notes: "Tidak sesuai" }).success).toBe(true);
    expect(parse({ notes: "tanpa keputusan" }).success).toBe(false);
  });
});
