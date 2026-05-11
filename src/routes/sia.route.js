import express from "express";
import { triggerSiaSync, siaSyncStatus, getCachedStudents } from "../controllers/sia.controller.js";
import { authGuard } from "../middlewares/auth.middleware.js";
import { loadUserRoles, requireRoles } from "../middlewares/rbac.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

// SIA sync is an admin-level operation
router.post("/sync", authGuard, loadUserRoles, requireRoles(ROLES.ADMIN), triggerSiaSync);
router.get("/sync/status", authGuard, loadUserRoles, requireRoles(ROLES.ADMIN), siaSyncStatus);
router.get("/cached", authGuard, getCachedStudents);

export default router;
