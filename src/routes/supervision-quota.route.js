import express from "express";
import {
	getDefaultQuotaController,
	setDefaultQuotaController,
	getLecturerQuotasController,
	updateLecturerQuotaController,
} from "../controllers/supervisionQuota.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import {
	setDefaultQuotaSchema,
	updateLecturerQuotaSchema,
} from "../validators/supervisionQuota.validator.js";
import { authGuard, requireRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

router.use(authGuard);
router.use(requireRole(ROLES.ADMIN));

// Default quota endpoints
router.get("/default/:academicYearId", getDefaultQuotaController);
router.put("/default/:academicYearId", validate(setDefaultQuotaSchema), setDefaultQuotaController);

// Lecturer-specific quota endpoints
router.get("/lecturers/:academicYearId", getLecturerQuotasController);
router.patch("/lecturers/:lecturerId/:academicYearId", validate(updateLecturerQuotaSchema), updateLecturerQuotaController);

export default router;
