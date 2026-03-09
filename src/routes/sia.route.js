import express from "express";
import { triggerSiaSync, siaSyncStatus, getCachedStudents } from "../controllers/sia.controller.js";
import { authGuard, requireRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

// Sync SIA: Admin only (Dosen Pengampu must not trigger sync; they only view list).
router.post("/sync", authGuard, requireRole(ROLES.ADMIN), triggerSiaSync);
router.get("/sync/status", authGuard, siaSyncStatus);
router.get("/cached", authGuard, getCachedStudents);

export default router;
