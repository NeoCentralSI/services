import express from "express";
import * as bimbinganController from "../../controllers/insternship/bimbingan.controller.js";
import { authGuard, requireRole, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { ROLES, LECTURER_ROLES } from "../../constants/roles.js";
import { uploadThesisFile } from "../../middlewares/file.middleware.js";

const router = express.Router();

// ==================== Student Guidance ====================
const activityRouter = express.Router();

activityRouter.get("/guidance", authGuard, bimbinganController.getStudentGuidance);
activityRouter.post("/guidance/submit", authGuard, bimbinganController.submitStudentGuidance);

// ==================== Lecturer Guidance ====================
activityRouter.get("/guidance/lecturer/students", authGuard, requireAnyRole(LECTURER_ROLES), bimbinganController.getSupervisedStudents);
activityRouter.get("/guidance/lecturer/students/:internshipId", authGuard, requireAnyRole(LECTURER_ROLES), bimbinganController.getSupervisedStudentTimeline);
activityRouter.get("/guidance/lecturer/students/:internshipId/week/:weekNumber", authGuard, requireAnyRole(LECTURER_ROLES), bimbinganController.getSupervisedStudentWeekDetail);
activityRouter.post("/guidance/lecturer/students/:internshipId/week/:weekNumber/evaluate", authGuard, requireAnyRole(LECTURER_ROLES), bimbinganController.submitLecturerEvaluation);
activityRouter.put("/guidance/lecturer/students/:internshipId/verify-report", authGuard, requireAnyRole(LECTURER_ROLES), uploadThesisFile, bimbinganController.verifyFinalReport);
activityRouter.get("/guidance/lecturer/supervisor-letter", authGuard, requireAnyRole(LECTURER_ROLES), bimbinganController.getSupervisorLetter);

router.use("/activity", activityRouter);

// ==================== Sekdep Guidance Master Data ====================
const sekdepRouter = express.Router();
sekdepRouter.use(authGuard, requireRole(ROLES.SEKRETARIS_DEPARTEMEN));

sekdepRouter.get("/guidance/questions", bimbinganController.getQuestions);
sekdepRouter.post("/guidance/questions", bimbinganController.createQuestion);
sekdepRouter.put("/guidance/questions/:id", bimbinganController.updateQuestion);
sekdepRouter.delete("/guidance/questions/:id", bimbinganController.deleteQuestion);

sekdepRouter.get("/guidance/criteria", bimbinganController.getCriteria);
sekdepRouter.post("/guidance/criteria", bimbinganController.createCriteria);
sekdepRouter.put("/guidance/criteria/:id", bimbinganController.updateCriteria);
sekdepRouter.delete("/guidance/criteria/:id", bimbinganController.deleteCriteria);
sekdepRouter.post("/guidance/copy", bimbinganController.duplicateGuidance);

router.use("/sekdep", sekdepRouter);

export default router;
