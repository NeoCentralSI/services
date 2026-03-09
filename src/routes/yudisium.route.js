import express from "express";
import yudisiumEventRoute from "./yudisium/yudisium-event.route.js";
import exitSurveyRoute from "./yudisium/exit-survey.route.js";
import yudisiumRequirementsRoute from "./yudisium/yudisium-requirements.route.js";
import studentYudisiumRoute from "./yudisium/student-yudisium.route.js";

const router = express.Router();

router.use("/event", yudisiumEventRoute);
router.use("/exit-survey", exitSurveyRoute);
router.use("/yudisium-requirements", yudisiumRequirementsRoute);
router.use("/student", studentYudisiumRoute);

export default router;
