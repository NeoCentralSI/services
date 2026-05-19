import express from "express";
import * as monitoringController from "../../controllers/insternship/monitoring.controller.js";
import { getOverviewCompanies, getOverviewReports, getOverviewStats } from "../../controllers/insternship/overview.controller.js";
import { authGuard, requireRole, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";

const router = express.Router();

// ==================== Sekdep Monitoring (internship list, detail, document verification) ====================
const sekdepRouter = express.Router();
sekdepRouter.use(authGuard, requireRole(ROLES.SEKRETARIS_DEPARTEMEN));

sekdepRouter.get("/internships", monitoringController.getInternshipList);
sekdepRouter.get("/internships/:id", monitoringController.getInternshipDetail);
sekdepRouter.put("/internships/:id/verify-document", monitoringController.verifyDocument);
sekdepRouter.put("/internships/:id/verify-documents-bulk", monitoringController.bulkVerifyDocuments);
sekdepRouter.post("/internships/:id/send-field-assessment", monitoringController.sendFieldAssessment);
sekdepRouter.put("/internships/:id/reject-final-report", monitoringController.rejectFinalReport);

router.use("/sekdep", sekdepRouter);

// ==================== Overview (Public, requires login) ====================
const overviewRouter = express.Router();
overviewRouter.use(authGuard);
overviewRouter.get("/companies", getOverviewCompanies);
overviewRouter.get("/reports", getOverviewReports);
overviewRouter.get("/stats", getOverviewStats);

router.use("/overview", overviewRouter);

// ==================== Monitoring Stats (Department roles) ====================
const monitoringRouter = express.Router();
monitoringRouter.use(authGuard, requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]));
monitoringRouter.get("/stats", monitoringController.getMonitoringStats);
monitoringRouter.get("/list", monitoringController.getMonitoringList);

router.use("/monitoring", monitoringRouter);

export default router;
