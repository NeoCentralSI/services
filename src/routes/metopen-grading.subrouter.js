import { Router } from "express";
import * as controller from "../controllers/metopen.grading.controller.js";
import * as validator from "../validators/metopen.grading.validator.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { ROLES, SUPERVISOR_ROLES } from "../constants/roles.js";

const router = Router();

router.use(authGuard);

router.get(
  "/class/:classId",
  requireAnyRole([ROLES.DOSEN_METOPEN, ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN]),
  controller.getClassGradingSummary
);

router.get(
  "/rubric-criteria",
  requireAnyRole([...SUPERVISOR_ROLES, ROLES.DOSEN_METOPEN]),
  controller.getRubricCriteria
);

router.post(
  "/supervisor-score",
  requireAnyRole([...SUPERVISOR_ROLES, ROLES.DOSEN_METOPEN]),
  controller.inputSupervisorScore
);

router.post(
  "/lecturer-score",
  requireAnyRole([ROLES.DOSEN_METOPEN]),
  validate(validator.lecturerScoreSchema),
  controller.inputLecturerScore
);

router.post(
  "/class/:classId/lock",
  requireAnyRole([ROLES.DOSEN_METOPEN]),
  controller.lockClassGrades
);

export default router;
