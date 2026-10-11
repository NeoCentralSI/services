import express from "express";
import lecturerRouter from "./thesisGuidance/lecturer.guidance.route.js";
import studentRouter from "./thesisGuidance/student.guidance.route.js";
import monitoringRouter from "./thesisGuidance/monitoring.route.js";
import metopelRouter from "./thesisGuidance/metopel.route.js";

const router = express.Router();

// Guidance revival: Metopel/Proposal and KaDep Pembimbing 2 endpoints that the active
// app still consumes. Mounted first so the baseline role guards of the sub-routers
// below do not intercept them.
router.use("/", metopelRouter);

// Mount under a stable path: /thesis-guidance/lecturer
router.use("/lecturer", lecturerRouter);
router.use("/student", studentRouter);
// Guidance revival decision (e7): the baseline "/public" router served supervisor busy
// slots (including student names) without authentication. The active app did not
// mount it and no frontend calls it, so it stays unmounted.
router.use("/monitoring", monitoringRouter);

export default router;
