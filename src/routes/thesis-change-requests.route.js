/**
 * Pengajuan Perubahan Tugas Akhir — mounted at /thesis-change-requests.
 *
 * Students and supervisors submit and follow requests; lecturers approve their own step;
 * the Ketua Departemen decides. Who may do what on a given thesis is checked in the
 * service (ownership and the active supervisor relation), not only by role.
 */
import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { ROLES, SUPERVISOR_ROLES } from "../constants/roles.js";
import * as controller from "../controllers/thesis-change-request.controller.js";
import * as validator from "../validators/thesis-change-request.validator.js";

const router = express.Router();

router.use(authGuard);

const REQUESTERS = [ROLES.MAHASISWA, ...SUPERVISOR_ROLES];
const KADEP = [ROLES.KETUA_DEPARTEMEN];

router.get("/context", requireAnyRole(REQUESTERS), controller.getContext);
router.get("/supervisor-options", requireAnyRole([...REQUESTERS, ...KADEP]), controller.getSupervisorOptions);

router.post("/", requireAnyRole(REQUESTERS), validate(validator.submitChangeRequestSchema), controller.submitRequest);
router.post("/transfer", requireAnyRole(SUPERVISOR_ROLES), validate(validator.submitTransferSchema), controller.submitTransfer);

// Tugas Akhir > Perubahan (Ketua Departemen, Paket E5): status priority, filters, search and paging
// on the server. A lecturer's own steps are in Tugas Akhir > Permohonan (/thesis-proposals/lecturer-inbox).
router.get("/inbox", requireAnyRole(KADEP), controller.listInbox);

router.post("/batch/:batchId/decision", requireAnyRole(KADEP), validate(validator.decisionSchema), controller.decideBatchAsKadep);
router.post("/:id/lecturer-decision", requireAnyRole(SUPERVISOR_ROLES), validate(validator.decisionSchema), controller.decideAsLecturer);
router.post("/:id/cancel", requireAnyRole(REQUESTERS), controller.cancelRequest);
router.post("/:id/decision", requireAnyRole(KADEP), validate(validator.decisionSchema), controller.decideAsKadep);

export default router;
