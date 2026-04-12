import express from "express";
import * as activityController from "../../controllers/insternship/activity.controller.js";
import { getStudentGuidance, submitStudentGuidance, getSupervisedStudents, getSupervisedStudentTimeline, getSupervisedStudentWeekDetail, submitLecturerEvaluation, verifyFinalReport } from "../../controllers/insternship/guidance.controller.js";
import { getAssessment, submitAssessment } from "../../controllers/insternship/assessment.controller.js";
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
router.post("/company-report", authGuard, activityController.submitCompanyReport);
router.post("/logbook-doc", authGuard, activityController.submitLogbook);

// Seminar (Student)
router.get("/seminars", authGuard, activityController.getUpcomingSeminars);
router.get("/seminars/:id", authGuard, activityController.getSeminarDetail);
router.post("/seminars/:id/audience", authGuard, activityController.registerSeminarAudience);
router.delete("/seminars/:id/audience", authGuard, activityController.unregisterSeminarAudience);
router.post("/register-seminar", authGuard, activityController.registerSeminar);
router.put("/seminar/:id", authGuard, activityController.updateSeminarProposal);

// Seminar (Lecturer approval)
router.post("/guidance/lecturer/seminar/:id/approve", authGuard, requireAnyRole(LECTURER_ROLES), activityController.approveSeminar);
router.post("/guidance/lecturer/seminar/:id/reject", authGuard, requireAnyRole(LECTURER_ROLES), activityController.rejectSeminar);
router.post("/guidance/lecturer/seminar/:id/complete", authGuard, requireAnyRole(LECTURER_ROLES), activityController.completeSeminar);
router.post("/guidance/lecturer/seminar/bulk-approve", authGuard, requireAnyRole(LECTURER_ROLES), activityController.bulkApproveSeminars);
router.post("/guidance/lecturer/seminar/:id/audience/:studentId/validate", authGuard, requireAnyRole(LECTURER_ROLES), activityController.validateSeminarAudience);
router.post("/guidance/lecturer/seminar/:id/audience/:studentId/unvalidate", authGuard, requireAnyRole(LECTURER_ROLES), activityController.unvalidateSeminarAudience);
router.post("/guidance/lecturer/seminar/:id/audience/bulk-validate", authGuard, requireAnyRole(LECTURER_ROLES), activityController.bulkValidateSeminarAudience);
router.patch("/guidance/lecturer/seminar/:id/notes", authGuard, requireAnyRole(LECTURER_ROLES), activityController.updateSeminarNotes);

// Guidance / Bimbingan (Student)
router.get("/guidance", authGuard, getStudentGuidance);
router.post("/guidance/submit", authGuard, submitStudentGuidance);

// Guidance / Bimbingan (Lecturer)
router.get("/guidance/lecturer/students", authGuard, requireAnyRole(LECTURER_ROLES), getSupervisedStudents);
router.get("/guidance/lecturer/students/:internshipId", authGuard, requireAnyRole(LECTURER_ROLES), getSupervisedStudentTimeline);
router.get("/guidance/lecturer/students/:internshipId/week/:weekNumber", authGuard, requireAnyRole(LECTURER_ROLES), getSupervisedStudentWeekDetail);
router.post("/guidance/lecturer/students/:internshipId/week/:weekNumber/evaluate", authGuard, requireAnyRole(LECTURER_ROLES), submitLecturerEvaluation);
router.put("/guidance/lecturer/students/:internshipId/verify-report", authGuard, requireAnyRole(LECTURER_ROLES), uploadThesisFile, verifyFinalReport);

// Assessment / Penilaian (Lecturer)
router.get("/guidance/lecturer/assessment/:internshipId", authGuard, requireAnyRole(LECTURER_ROLES), getAssessment);
router.post("/guidance/lecturer/assessment/:internshipId", authGuard, requireAnyRole(LECTURER_ROLES), submitAssessment);


export default router;

