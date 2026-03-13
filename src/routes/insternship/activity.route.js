import express from "express";
import { getLogbooks, updateLogbook, updateInternshipDetails, downloadLogbookPdf, downloadLogbookDocx, submitReport } from "../../controllers/insternship/activity.controller.js";
import { getStudentGuidance, submitStudentGuidance, getSupervisedStudents, getSupervisedStudentTimeline, getSupervisedStudentWeekDetail, submitLecturerEvaluation } from "../../controllers/insternship/guidance.controller.js";
import { authGuard, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { LECTURER_ROLES } from "../../constants/roles.js";

const router = express.Router();

router.get("/logbook", authGuard, getLogbooks);
router.get("/logbook/download", authGuard, downloadLogbookPdf);
router.get("/logbook/download-docx", authGuard, downloadLogbookDocx);
router.put("/logbook/:id", authGuard, updateLogbook);
router.put("/update-details", authGuard, updateInternshipDetails);
router.post("/report", authGuard, submitReport);

// Guidance / Bimbingan (Student)
router.get("/guidance", authGuard, getStudentGuidance);
router.post("/guidance/submit", authGuard, submitStudentGuidance);

// Guidance / Bimbingan (Lecturer)
router.get("/guidance/lecturer/students", authGuard, requireAnyRole(LECTURER_ROLES), getSupervisedStudents);
router.get("/guidance/lecturer/students/:internshipId", authGuard, requireAnyRole(LECTURER_ROLES), getSupervisedStudentTimeline);
router.get("/guidance/lecturer/students/:internshipId/week/:weekNumber", authGuard, requireAnyRole(LECTURER_ROLES), getSupervisedStudentWeekDetail);
router.post("/guidance/lecturer/students/:internshipId/week/:weekNumber/evaluate", authGuard, requireAnyRole(LECTURER_ROLES), submitLecturerEvaluation);

export default router;
