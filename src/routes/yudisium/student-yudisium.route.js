import express from "express";
import { authGuard, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";
import {
	getOverview,
	getExitSurvey,
	submitExitSurvey,
} from "../../controllers/yudisium/studentYudisium.controller.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { submitStudentExitSurveySchema } from "../../validators/studentExitSurvey.validator.js";

const router = express.Router();

router.use(authGuard);
router.use(requireAnyRole([ROLES.MAHASISWA]));

router.get("/overview", getOverview);
router.get("/exit-survey", getExitSurvey);
router.post("/exit-survey/submit", validate(submitStudentExitSurveySchema), submitExitSurvey);

export default router;
