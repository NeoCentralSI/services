import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import * as controller from "../controllers/supervisionQuota.controller.js";
import * as validator from "../validators/supervisionQuota.validator.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

const quotaRoles = [ROLES.ADMIN, ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN];

router.use(authGuard);

/** GET /supervision-quota/default/:academicYearId */
router.get(
  "/default/:academicYearId",
  requireAnyRole(quotaRoles),
  controller.getDefaultQuota
);

/** PUT /supervision-quota/default/:academicYearId */
router.put(
  "/default/:academicYearId",
  requireAnyRole(quotaRoles),
  validate(validator.setDefaultQuotaBodySchema),
  controller.setDefaultQuota
);

/** GET /supervision-quota/lecturers/:academicYearId */
router.get(
  "/lecturers/:academicYearId",
  requireAnyRole(quotaRoles),
  controller.getLecturerQuotas
);

/** PATCH /supervision-quota/lecturers/:lecturerId/:academicYearId */
router.patch(
  "/lecturers/:lecturerId/:academicYearId",
  requireAnyRole(quotaRoles),
  validate(validator.updateLecturerQuotaBodySchema),
  controller.updateLecturerQuota
);

/** POST /supervision-quota/recalculate/:academicYearId */
router.post(
  "/recalculate/:academicYearId",
  requireAnyRole(quotaRoles),
  controller.recalculateQuotas
);

export default router;
