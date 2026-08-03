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

vi.mock("../../middlewares/rbac.middleware.js", () => ({
  loadUserRoles: passThrough,
  requireRoles: (...roles) => roleMiddleware(roles),
}));

vi.mock("../../middlewares/validation.middleware.js", () => ({
  validate: () => passThrough,
}));

vi.mock("../../controllers/supervisionQuota.controller.js", () => ({
  getDefaultQuota: passThrough,
  setDefaultQuota: passThrough,
  getLecturerQuotas: passThrough,
  getLecturerQuotaDetail: passThrough,
  updateLecturerQuota: passThrough,
  recalculateQuotas: passThrough,
}));

vi.mock("../../controllers/quota.controller.js", () => ({
  browseLecturers: passThrough,
  getLecturerDetail: passThrough,
  checkQuota: passThrough,
  getScienceGroups: passThrough,
  getTopics: passThrough,
  toggleAcceptingRequests: passThrough,
  getDefaultQuota: passThrough,
  setDefaultQuota: passThrough,
  setLecturerQuota: passThrough,
  deleteLecturerQuota: passThrough,
  getMonitoring: passThrough,
}));

import { ROLES } from "../../constants/roles.js";
import supervisionQuotaRouter from "../../routes/supervision-quota.route.js";
import quotaRouter from "../../routes/quota.route.js";

function getAllowedRoles(router, path, method) {
  const layer = router.stack.find(
    (candidate) => candidate.route?.path === path && candidate.route.methods?.[method],
  );
  if (!layer) {
    throw new Error(`Route ${method.toUpperCase()} ${path} tidak ditemukan`);
  }
  const roleGuard = layer.route.stack
    .map((routeLayer) => routeLayer.handle)
    .find((handle) => Array.isArray(handle.allowedRoles));
  return roleGuard?.allowedRoles ?? null;
}

describe("quota route RBAC", () => {
  const readRoles = [
    ROLES.ADMIN,
    ROLES.KETUA_DEPARTEMEN,
    ROLES.SEKRETARIS_DEPARTEMEN,
  ];

  it("allows management roles to read computed supervision quota snapshots", () => {
    expect(
      getAllowedRoles(supervisionQuotaRouter, "/default/:academicYearId", "get"),
    ).toEqual(readRoles);
    expect(
      getAllowedRoles(supervisionQuotaRouter, "/lecturers/:academicYearId", "get"),
    ).toEqual(readRoles);
    expect(
      getAllowedRoles(
        supervisionQuotaRouter,
        "/lecturers/:lecturerId/:academicYearId",
        "get",
      ),
    ).toEqual(readRoles);
  });

  it("keeps every supervision quota mutation Admin-only", () => {
    expect(
      getAllowedRoles(supervisionQuotaRouter, "/default/:academicYearId", "put"),
    ).toEqual([ROLES.ADMIN]);
    expect(
      getAllowedRoles(
        supervisionQuotaRouter,
        "/lecturers/:lecturerId/:academicYearId",
        "patch",
      ),
    ).toEqual([ROLES.ADMIN]);
    expect(
      getAllowedRoles(supervisionQuotaRouter, "/recalculate/:academicYearId", "post"),
    ).toEqual([ROLES.ADMIN]);
  });

  it("also removes KaDep write access from the legacy quota config routes", () => {
    expect(getAllowedRoles(quotaRouter, "/config/default", "get")).toEqual(readRoles);
    expect(getAllowedRoles(quotaRouter, "/config/default", "post")).toEqual([
      ROLES.ADMIN,
    ]);
    expect(
      getAllowedRoles(quotaRouter, "/config/lecturer/:lecturerId", "post"),
    ).toEqual([ROLES.ADMIN]);
    expect(
      getAllowedRoles(quotaRouter, "/config/lecturer/:quotaId", "delete"),
    ).toEqual([ROLES.ADMIN]);
  });
});
