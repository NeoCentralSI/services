import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import * as controller from "../controllers/advisorRequest.controller.js";
import * as validator from "../validators/advisorRequest.validator.js";
import { ROLES, LECTURER_ROLES } from "../constants/roles.js";

const router = express.Router();

// All routes require authentication
router.use(authGuard);

// ============================================
// Student Routes (Mahasiswa)
// ============================================

/** GET /advisor-requests/catalog — Browse lecturers with traffic light quota */
router.get(
  "/catalog",
  requireAnyRole([ROLES.MAHASISWA]),
  controller.getLecturerCatalog
);

/** POST /advisor-requests — Submit new advisor request */
router.post(
  "/",
  requireAnyRole([ROLES.MAHASISWA]),
  validate(validator.submitRequestSchema),
  controller.submitRequest
);

/** GET /advisor-requests/my — Get student's request history */
router.get(
  "/my",
  requireAnyRole([ROLES.MAHASISWA]),
  controller.getMyRequests
);

/** GET /advisor-requests/access-state — Get canonical advisor access state */
router.get(
  "/access-state",
  requireAnyRole([ROLES.MAHASISWA]),
  controller.getMyAccessState
);

/** POST /advisor-requests/:id/withdraw — Withdraw a pending request */
router.post(
  "/:id/withdraw",
  requireAnyRole([ROLES.MAHASISWA]),
  controller.withdrawRequest
);

// ============================================
// Dosen Routes (Pembimbing)
// ============================================

/** GET /advisor-requests/inbox — Get pending requests for this lecturer */
router.get(
  "/inbox",
  requireAnyRole(LECTURER_ROLES),
  controller.getDosenInbox
);

/** GET /advisor-requests/inbox/history — Get responded requests history for this lecturer */
router.get(
  "/inbox/history",
  requireAnyRole(LECTURER_ROLES),
  controller.getDosenInboxHistory
);

/** POST /advisor-requests/:id/respond — Accept or reject a request */
router.post(
  "/:id/respond",
  requireAnyRole(LECTURER_ROLES),
  validate(validator.respondSchema),
  controller.respondByLecturer
);

// ============================================
// KaDep Routes (Kepala Departemen)
// ============================================

/** GET /advisor-requests/kadep-queue — Get escalated + pending assignment requests */
router.get(
  "/kadep-queue",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  controller.getKadepQueue
);

/** GET /advisor-requests/:id/recommendations — Get top 3 alternative lecturers */
router.get(
  "/:id/recommendations",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  controller.getRecommendations
);

/** POST /advisor-requests/:id/decide — Override or redirect an escalated request */
router.post(
  "/:id/decide",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  validate(validator.kadepDecideSchema),
  controller.decideByKadep
);

/** POST /advisor-requests/:id/assign — Assign advisor (creates ThesisSupervisors) */
router.post(
  "/:id/assign",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  controller.assignAdvisor
);

/** GET /advisor-requests/:id — Get request detail */
router.get(
  "/:id",
  controller.getRequestDetail
);

export default router;
