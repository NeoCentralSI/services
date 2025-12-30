import express from "express";
import { triggerSiaSync, siaSyncStatus, getCachedStudents } from "../controllers/sia.controller.js";
import { authGuard } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Protect with authGuard; adjust roles if needed.
router.post("/sync", authGuard, triggerSiaSync);
router.get("/sync/status", authGuard, siaSyncStatus);
router.get("/cached", authGuard, getCachedStudents);

export default router;
