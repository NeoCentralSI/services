/**
 * Proposal Tugas Akhir — mounted at /thesis-proposals (Paket P).
 * Pengajuan Pembimbing (P2), Penetapan Pembimbing (P3) and the final proposal (P4).
 * Who may act on a given request is checked again in the service.
 */
import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { uploadThesisFile } from "../middlewares/file.middleware.js";
import { ROLES, SUPERVISOR_ROLES } from "../constants/roles.js";
import * as controller from "../controllers/thesis-proposal.controller.js";
import * as validator from "../validators/thesis-proposal.validator.js";

const router = express.Router();
router.use(authGuard);

const STUDENT = [ROLES.MAHASISWA];
const KADEP = [ROLES.KETUA_DEPARTEMEN];

// Student
router.get("/me", requireAnyRole(STUDENT), controller.getMyOverview);
router.post("/me/final-proposal", requireAnyRole(STUDENT), uploadThesisFile, controller.submitFinalProposal);
router.get("/me/supervisor-requests", requireAnyRole(STUDENT), controller.getMySupervisorRequests);
router.put("/me/supervisor-request-draft", requireAnyRole(STUDENT), validate(validator.saveDraftSchema), controller.saveMyDraft);
router.get("/catalog", requireAnyRole(STUDENT), controller.getCatalog);
router.post("/supervisor-requests", requireAnyRole(STUDENT), validate(validator.submitRequestSchema), controller.submitRequest);
router.post("/supervisor-requests/:id/withdraw", requireAnyRole(STUDENT), controller.withdrawRequest);

// Lecturer
router.get("/supervisor-requests/inbox", requireAnyRole(SUPERVISOR_ROLES), controller.getLecturerInbox);
router.post("/supervisor-requests/:id/review", requireAnyRole(SUPERVISOR_ROLES), controller.markUnderReview);
router.post("/supervisor-requests/:id/respond", requireAnyRole(SUPERVISOR_ROLES), validate(validator.lecturerResponseSchema), controller.respondAsLecturer);

// Head of Department
router.get("/supervisor-requests/kadep-queue", requireAnyRole(KADEP), controller.getKadepQueue);
router.get("/supervisor-requests/:id/recommendations", requireAnyRole(KADEP), controller.getRecommendations);
router.get("/supervisor-requests/:id/assignable-lecturers", requireAnyRole(KADEP), controller.getAssignableLecturers);
router.post("/supervisor-requests/:id/decision", requireAnyRole(KADEP), validate(validator.kadepDecisionSchema), controller.decideAsKadep);

// Penetapan Pembimbing: Kadep issues; Sekdep and Admin read (Sekdep downloads a complete batch only)
const ASSIGNMENT_READERS = [ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.ADMIN];
router.get("/supervisor-assignments", requireAnyRole(ASSIGNMENT_READERS), controller.getAssignmentOverview);
router.get("/supervisor-assignments/preview", requireAnyRole([ROLES.KETUA_DEPARTEMEN, ROLES.ADMIN]), controller.previewAssignment);
router.post("/supervisor-assignments", requireAnyRole(KADEP), validate(validator.issueAssignmentSchema), controller.issueAssignment);
router.get("/supervisor-assignments/batches/:id/file", requireAnyRole(ASSIGNMENT_READERS), controller.getBatchFile);

// Any party of the request (checked in the service)
router.get("/supervisor-requests/:id", controller.getRequestDetail);

export default router;
