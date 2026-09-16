import express from "express";
import {
  triggerSiaSync,
  siaSyncStatus,
  getCachedStudents,
  periodSnapshotCoverage,
  triggerPeriodSnapshotBackfill,
  getMetopenOperations,
  releaseWaitingKrs,
} from "../controllers/sia.controller.js";
import { authGuard } from "../middlewares/auth.middleware.js";
import { loadUserRoles, requireRoles } from "../middlewares/rbac.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { backfillPeriodSnapshotsSchema } from "../validators/studentPeriodSnapshot.validator.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

// SIA sync is an admin-level operation
router.post("/sync", authGuard, loadUserRoles, requireRoles(ROLES.ADMIN), triggerSiaSync);
router.get("/sync/status", authGuard, loadUserRoles, requireRoles(ROLES.ADMIN), siaSyncStatus);
router.get(
  "/snapshots/coverage",
  authGuard,
  loadUserRoles,
  requireRoles(ROLES.ADMIN),
  periodSnapshotCoverage,
);
router.post(
  "/snapshots/backfill",
  authGuard,
  loadUserRoles,
  requireRoles(ROLES.ADMIN),
  validate(backfillPeriodSnapshotsSchema),
  triggerPeriodSnapshotBackfill,
);
router.get(
  "/cached",
  authGuard,
  loadUserRoles,
  requireRoles(ROLES.ADMIN),
  getCachedStudents,
);
router.get(
  "/metopen-operations",
  authGuard,
  loadUserRoles,
  requireRoles(ROLES.ADMIN, ROLES.KOORDINATOR_METOPEN),
  getMetopenOperations,
);
router.post(
  "/waiting-krs/:requestId/release",
  authGuard,
  loadUserRoles,
  requireRoles(ROLES.ADMIN),
  releaseWaitingKrs,
);

export default router;
