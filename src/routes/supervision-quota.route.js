import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import * as controller from "../controllers/supervisionQuota.controller.js";
import * as validator from "../validators/supervisionQuota.validator.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

const quotaReadRoles = [
  ROLES.ADMIN,
  ROLES.KETUA_DEPARTEMEN,
  ROLES.SEKRETARIS_DEPARTEMEN,
];
const quotaWriteRoles = [ROLES.ADMIN];

router.use(authGuard);

/** GET /supervision-quota/default/:academicYearId */
router.get(
  "/default/:academicYearId",
  requireAnyRole(quotaReadRoles),
  controller.getDefaultQuota
);

/** PUT /supervision-quota/default/:academicYearId */
router.put(
  "/default/:academicYearId",
  requireAnyRole(quotaWriteRoles),
  validate(validator.setDefaultQuotaBodySchema),
  controller.setDefaultQuota
);

/** GET /supervision-quota/lecturers/:academicYearId */
router.get(
  "/lecturers/:academicYearId",
  requireAnyRole(quotaReadRoles),
  controller.getLecturerQuotas
);

/** GET /supervision-quota/lecturers/:lecturerId/:academicYearId */
router.get(
  "/lecturers/:lecturerId/:academicYearId",
  requireAnyRole(quotaReadRoles),
  controller.getLecturerQuotaDetail
);

/** PATCH /supervision-quota/lecturers/:lecturerId/:academicYearId */
router.patch(
  "/lecturers/:lecturerId/:academicYearId",
  requireAnyRole(quotaWriteRoles),
  validate(validator.updateLecturerQuotaBodySchema),
  controller.updateLecturerQuota
);

/** POST /supervision-quota/recalculate/:academicYearId */
router.post(
  "/recalculate/:academicYearId",
  requireAnyRole(quotaWriteRoles),
  controller.recalculateQuotas
);

export default router;
