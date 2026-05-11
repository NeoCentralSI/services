import express from "express";
import { authGuard, requireRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";
import {
  getKadepPendingTransfers,
  getKadepAllTransfers,
  downloadTransferReport,
  kadepApproveTransfer,
  kadepRejectTransfer,
} from "../controllers/thesisGuidance/monitoring.controller.js";

const router = express.Router();

// Semua route di sini memerlukan login dan peran Ketua Departemen
router.use(authGuard, requireRole(ROLES.KETUA_DEPARTEMEN));

// GET /kadep-transfers/pending
router.get("/pending", getKadepPendingTransfers);

// GET /kadep-transfers/all (history)
router.get("/all", getKadepAllTransfers);

// GET /kadep-transfers/report/download
router.get("/report/download", downloadTransferReport);

// PATCH /kadep-transfers/:notificationId/approve
router.patch("/:notificationId/approve", kadepApproveTransfer);

// PATCH /kadep-transfers/:notificationId/reject
router.patch("/:notificationId/reject", kadepRejectTransfer);

export default router;
