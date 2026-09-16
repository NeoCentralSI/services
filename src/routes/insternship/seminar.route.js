import express from "express";
import * as seminarController from "../../controllers/insternship/seminar.controller.js";
import { authGuard, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { LECTURER_ROLES } from "../../constants/roles.js";

const router = express.Router();
const activityRouter = express.Router();

// ==================== Seminar (Student) ====================
activityRouter.get("/seminars", authGuard, seminarController.getUpcomingSeminars);
activityRouter.get("/seminars/:id", authGuard, seminarController.getSeminarDetail);
activityRouter.post("/seminars/:id/audience", authGuard, seminarController.registerSeminarAudience);
activityRouter.delete("/seminars/:id/audience", authGuard, seminarController.unregisterSeminarAudience);
activityRouter.post("/register-seminar", authGuard, seminarController.registerSeminar);
activityRouter.put("/seminar/:id", authGuard, seminarController.updateSeminarProposal);

// ==================== Seminar (Lecturer) ====================
activityRouter.post("/guidance/lecturer/seminar/:id/approve", authGuard, requireAnyRole(LECTURER_ROLES), seminarController.approveSeminar);
activityRouter.post("/guidance/lecturer/seminar/:id/reject", authGuard, requireAnyRole(LECTURER_ROLES), seminarController.rejectSeminar);
activityRouter.post("/guidance/lecturer/seminar/bulk-approve", authGuard, requireAnyRole(LECTURER_ROLES), seminarController.bulkApproveSeminars);
activityRouter.post("/guidance/lecturer/seminar/:id/audience/:studentId/validate", authGuard, requireAnyRole(LECTURER_ROLES), seminarController.validateSeminarAudience);
activityRouter.post("/guidance/lecturer/seminar/:id/audience/:studentId/unvalidate", authGuard, requireAnyRole(LECTURER_ROLES), seminarController.unvalidateSeminarAudience);
activityRouter.post("/guidance/lecturer/seminar/:id/audience/bulk-validate", authGuard, requireAnyRole(LECTURER_ROLES), seminarController.bulkValidateSeminarAudience);
activityRouter.patch("/guidance/lecturer/seminar/:id/notes", authGuard, requireAnyRole(LECTURER_ROLES), seminarController.updateSeminarNotes);
activityRouter.post("/guidance/lecturer/seminar/:id/complete", authGuard, requireAnyRole(LECTURER_ROLES), seminarController.completeSeminar);
activityRouter.post("/guidance/lecturer/seminar/:id/fail", authGuard, requireAnyRole(LECTURER_ROLES), seminarController.failSeminar);

router.use("/activity", activityRouter);

export default router;
