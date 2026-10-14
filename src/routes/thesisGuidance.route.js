import express from "express";
import lecturerRouter from "./thesisGuidance/lecturer.guidance.route.js";
import studentRouter from "./thesisGuidance/student.guidance.route.js";
import monitoringRouter from "./thesisGuidance/monitoring.route.js";
import kadepRouter from "./thesisGuidance/kadep.guidance.route.js";

const router = express.Router();

// Pembimbing 2 requests in the proposal phase, decided by the Head of Department.
router.use("/kadep", kadepRouter);

// Mount under a stable path: /thesis-guidance/lecturer
router.use("/lecturer", lecturerRouter);
router.use("/student", studentRouter);
// Guidance revival decision (e7): the baseline "/public" router served supervisor busy
// slots (including student names) without authentication. The active app did not
// mount it and no frontend calls it, so it stays unmounted.
router.use("/monitoring", monitoringRouter);

export default router;
