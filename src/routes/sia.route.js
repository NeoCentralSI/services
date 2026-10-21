import express from "express";
import {
  triggerSiaSync,
  siaSyncStatus,
  getCachedStudents,
  periodFlagCoverage,
} from "../controllers/sia.controller.js";
import { authGuard } from "../middlewares/auth.middleware.js";
import { loadUserRoles, requireRoles } from "../middlewares/rbac.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

// SIA is read only (plan 10.6). Sync is an admin-level operation.
router.post("/sync", authGuard, loadUserRoles, requireRoles(ROLES.ADMIN), triggerSiaSync);
router.get("/sync/status", authGuard, loadUserRoles, requireRoles(ROLES.ADMIN), siaSyncStatus);
router.get(
  "/snapshots/coverage",
  authGuard,
  loadUserRoles,
  requireRoles(ROLES.ADMIN),
  periodFlagCoverage,
);
router.get(
  "/cached",
  authGuard,
  loadUserRoles,
  requireRoles(ROLES.ADMIN),
  getCachedStudents,
);

export default router;
