import express from "express";
import exitSurveyRoute from "./yudisium/exit-survey.route.js";
import yudisiumRequirementsRoute from "./yudisium/yudisium-requirements.route.js";

const router = express.Router();

router.use("/exit-survey", exitSurveyRoute);
router.use("/yudisium-requirements", yudisiumRequirementsRoute);

export default router;
