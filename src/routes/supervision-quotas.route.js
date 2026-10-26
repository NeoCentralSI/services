/**
 * Batas bimbingan dosen (plan 10.1) — mounted at /supervision-quotas.
 * Kadep and Sekdep set the general limits (Kelola → Batas Bimbingan); only Kadep sets or clears the
 * limits of a semester (Penetapan → Beban Dosen; Sekdep reads that panel like the
 * rest of Penetapan); Admin and the Research Method coordinator read the load screen; a lecturer
 * reads their own load and opens or closes intake of new supervisor requests.
 */
import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { ROLES, LECTURER_ROLES } from "../constants/roles.js";
import * as controller from "../controllers/supervision-quota.controller.js";
import * as validator from "../validators/supervision-quota.validator.js";

const router = express.Router();
router.use(authGuard);

const MANAGERS = [ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN];
const KADEP = [ROLES.KETUA_DEPARTEMEN];
const READERS = [...MANAGERS, ROLES.ADMIN, ROLES.KOORDINATOR_METODE_PENELITIAN];

router.get("/", requireAnyRole(READERS), controller.getOverview);
router.put("/general", requireAnyRole(MANAGERS), validate(validator.limitsSchema), controller.setGeneral);
router.put("/periods/:academicYearId", requireAnyRole(KADEP), validate(validator.periodQuotaSchema), controller.setPeriod);
router.delete("/periods/:academicYearId", requireAnyRole(KADEP), controller.clearPeriod);
router.get("/me", requireAnyRole(LECTURER_ROLES), controller.getMine);
router.patch("/me/accepting-requests", requireAnyRole(LECTURER_ROLES), validate(validator.acceptingRequestsSchema), controller.setAcceptingRequests);

export default router;
