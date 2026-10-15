/**
 * Evaluasi Bimbingan (formulir TA-17) — mounted at /thesis-guidance-evaluations.
 *
 * Pembimbing 1 fills an evaluation; Pembimbing 2 and the student only read; the Ketua
 * Departemen decides the recommendations that need a decision. Who may do what on a given
 * thesis is checked in the service.
 */
import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { ROLES, SUPERVISOR_ROLES } from "../constants/roles.js";
import * as controller from "../controllers/thesis-guidance-evaluation.controller.js";
import * as validator from "../validators/thesis-guidance-evaluation.validator.js";

const router = express.Router();

router.use(authGuard);

const READERS = [ROLES.MAHASISWA, ...SUPERVISOR_ROLES, ROLES.KETUA_DEPARTEMEN];
const KADEP = [ROLES.KETUA_DEPARTEMEN];

router.get("/context", requireAnyRole(READERS), controller.getContext);
router.get("/department", requireAnyRole(KADEP), controller.listForDepartment);
// Paket E4 (4.3): the "Evaluasi" page of a supervisor (only their own students).
router.get("/lecturer", requireAnyRole(SUPERVISOR_ROLES), controller.listForSupervisor);
// Pembimbing 1 of the thesis only; the service rejects every other supervisor.
router.post("/", requireAnyRole([ROLES.PEMBIMBING_1]), validate(validator.submitEvaluationSchema), controller.submitEvaluation);
router.post("/:id/decision", requireAnyRole(KADEP), validate(validator.decisionSchema), controller.decideAsKadep);

export default router;
