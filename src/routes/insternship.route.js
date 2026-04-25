import express from "express";
import registrationRouter from "./insternship/registration.route.js";
import sekdepRouter from "./insternship/sekdep.route.js";
import adminRouter from "./insternship/admin.route.js";
import templateRouter from "./insternship/template.route.js";
import kadepRouter from "./insternship/kadep.route.js";
import activityRouter from "./insternship/activity.route.js";
import publicRouter from "./insternship/public.route.js";
import overviewRouter from "./insternship/overview.route.js";
import fieldAssessmentRouter from "./insternship/field-assessment.route.js";
import holidayRouter from "./insternship/holiday.route.js";

const router = express.Router();

router.use("/registration", registrationRouter);
router.use("/sekdep", sekdepRouter);
router.use("/admin", adminRouter);
router.use("/templates", templateRouter);
router.use("/kadep", kadepRouter);
router.use("/activity", activityRouter);
router.use("/public", publicRouter);
router.use("/overview", overviewRouter);
router.use("/field-assessment", fieldAssessmentRouter);
router.use("/holidays", holidayRouter);

export default router;

