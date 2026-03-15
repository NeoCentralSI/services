import express from "express";
import * as activityController from "../../controllers/insternship/activity.controller.js";
import { getStudentGuidance, submitStudentGuidance, getSupervisedStudents, getSupervisedStudentTimeline, getSupervisedStudentWeekDetail, submitLecturerEvaluation, verifyFinalReport } from "../../controllers/insternship/guidance.controller.js";
import { authGuard, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { LECTURER_ROLES } from "../../constants/roles.js";
import { uploadThesisFile } from "../../middlewares/file.middleware.js";

const router = express.Router();

router.get("/logbook", authGuard, activityController.getLogbooks);
router.get("/logbook/download", authGuard, activityController.downloadLogbookPdf);
router.get("/download-docx", authGuard, activityController.downloadLogbookDocx);
router.put("/logbook/:id", authGuard, activityController.updateLogbook);
router.put("/details", authGuard, activityController.updateInternshipDetails);
router.post("/report", authGuard, activityController.submitReport);
router.post("/certificate", authGuard, activityController.updateCompletionCertificate);
router.post("/receipt", authGuard, activityController.updateCompanyReceipt);
router.post("/logbook-doc", authGuard, activityController.submitLogbook);

// Guidance / Bimbingan (Student)
router.get("/guidance", authGuard, getStudentGuidance);
router.post("/guidance/submit", authGuard, submitStudentGuidance);

// Guidance / Bimbingan (Lecturer)
router.get("/guidance/lecturer/students", authGuard, requireAnyRole(LECTURER_ROLES), getSupervisedStudents);
router.get("/guidance/lecturer/students/:internshipId", authGuard, requireAnyRole(LECTURER_ROLES), getSupervisedStudentTimeline);
router.get("/guidance/lecturer/students/:internshipId/week/:weekNumber", authGuard, requireAnyRole(LECTURER_ROLES), getSupervisedStudentWeekDetail);
router.post("/guidance/lecturer/students/:internshipId/week/:weekNumber/evaluate", authGuard, requireAnyRole(LECTURER_ROLES), submitLecturerEvaluation);
router.put("/guidance/lecturer/students/:internshipId/verify-report", authGuard, requireAnyRole(LECTURER_ROLES), uploadThesisFile, verifyFinalReport);
router.post("/register-seminar", authGuard, activityController.registerSeminar);

export default router;
