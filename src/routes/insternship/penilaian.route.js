import express from "express";
import * as penilaianController from "../../controllers/insternship/penilaian.controller.js";
import { authGuard, requireRole, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { ROLES, LECTURER_ROLES } from "../../constants/roles.js";

const router = express.Router();

// ==================== Lecturer Assessment ====================
const activityRouter = express.Router();
activityRouter.get("/guidance/lecturer/assessment/:internshipId", authGuard, requireAnyRole(LECTURER_ROLES), penilaianController.getAssessment);
activityRouter.post("/guidance/lecturer/assessment/:internshipId", authGuard, requireAnyRole(LECTURER_ROLES), penilaianController.submitAssessment);
router.use("/activity", activityRouter);

// ==================== Field Assessment (Public - No Auth) ====================
const fieldAssessmentRouter = express.Router();
fieldAssessmentRouter.get("/validate/:token", penilaianController.validateToken);
fieldAssessmentRouter.post("/verify-pin/:token", penilaianController.verifyPin);
fieldAssessmentRouter.post("/submit/:token", penilaianController.submitFieldAssessment);
router.use("/field-assessment", fieldAssessmentRouter);

// ==================== CPMK Master Data (Sekdep) ====================
const sekdepRouter = express.Router();
sekdepRouter.use(authGuard, requireRole(ROLES.SEKRETARIS_DEPARTEMEN));

sekdepRouter.get("/cpmk", penilaianController.getAllCpmks);
sekdepRouter.get("/cpmk/:id", penilaianController.getCpmkById);
sekdepRouter.post("/cpmk", penilaianController.createCpmk);
sekdepRouter.post("/cpmk/copy", penilaianController.duplicateCpmks);
sekdepRouter.put("/cpmk/:id", penilaianController.updateCpmk);
sekdepRouter.delete("/cpmk/:id", penilaianController.deleteCpmk);

sekdepRouter.post("/rubrics", penilaianController.createRubric);
sekdepRouter.post("/cpmk/:cpmkId/rubrics/bulk", penilaianController.bulkUpdateRubrics);
sekdepRouter.put("/rubrics/:id", penilaianController.updateRubric);
sekdepRouter.delete("/rubrics/:id", penilaianController.deleteRubric);

router.use("/sekdep", sekdepRouter);

export default router;
