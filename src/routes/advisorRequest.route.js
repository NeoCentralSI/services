import express from "express";
import * as controller from "../controllers/advisorRequest.controller.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { ROLES, SUPERVISOR_ROLES } from "../constants/roles.js";
import {
  submitRequestSchema,
  saveDraftSchema,
  respondSchema,
  kadepDecideSchema,
} from "../validators/advisorRequest.validator.js";

const router = express.Router();

router.use(authGuard);
const STUDENT_ROLES = [ROLES.MAHASISWA];

// ── Student endpoints ──────────────────────────────────
router.get("/access-state", requireAnyRole(STUDENT_ROLES), controller.getMyAccessState);
router.get("/draft", requireAnyRole(STUDENT_ROLES), controller.getMyDraft);
router.put("/draft", requireAnyRole(STUDENT_ROLES), validate(saveDraftSchema), controller.saveMyDraft);
router.get("/catalog", requireAnyRole(STUDENT_ROLES), controller.getLecturerCatalog);
router.get("/my", requireAnyRole(STUDENT_ROLES), controller.getMyRequests);
router.post("/", requireAnyRole(STUDENT_ROLES), validate(submitRequestSchema), controller.submitRequest);
router.post("/:id/withdraw", requireAnyRole(STUDENT_ROLES), controller.withdrawRequest);

// ── Dosen endpoints ────────────────────────────────────
router.get("/inbox", requireAnyRole(SUPERVISOR_ROLES), controller.getDosenInbox);
router.get("/inbox/history", requireAnyRole(SUPERVISOR_ROLES), controller.getDosenInboxHistory);
router.post("/:id/mark-review", requireAnyRole(SUPERVISOR_ROLES), controller.markUnderReview);
router.post(
  "/:id/respond",
  requireAnyRole(SUPERVISOR_ROLES),
  validate(respondSchema),
  controller.respondByLecturer,
);

// ── KaDep endpoints ────────────────────────────────────
router.get(
  "/kadep-queue",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  controller.getKadepQueue,
);
router.get(
  "/:id/recommendations",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  controller.getRecommendations,
);
router.post(
  "/:id/decide",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  validate(kadepDecideSchema),
  controller.decideByKadep,
);
router.post(
  "/:id/assign",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  controller.assignAdvisor,
);

// ── Batch TA-04 export ─────────────────────────────────
router.get(
  "/batch-ta04/:academicYearId",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.ADMIN]),
  controller.getBatchTA04,
);
router.post(
  "/batch-ta04/:academicYearId/finalize",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  controller.finalizeBatchTA04,
);

// ── Detail (multi-role) ────────────────────────────────
router.get("/:id", controller.getRequestDetail);

export default router;
