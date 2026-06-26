import express from "express";
import { authGuard, requireAnyRole, requireRole } from "../../middlewares/auth.middleware.js";
import { DEPARTMENT_ROLES, ROLES } from "../../constants/roles.js";
import {
  getMonitoringDashboard,
  getThesesList,
  getFilterOptions,
  getAtRiskStudents,
  getSlowStudents,
  getStudentsReadyForSeminar,
  getSupervisorWorkloads,
  getThesisDetail,
  sendWarningNotification,
  sendBatchWarnings,
  getProgressReport,
  downloadProgressReport,
} from "../../controllers/thesisGuidance/monitoring.controller.js";

const router = express.Router();

// Base path: /thesis-guidance/monitoring
// Only Kadep, Sekdep, GKM can access

router.use(authGuard, requireAnyRole(DEPARTMENT_ROLES));

// Dashboard summary
router.get("/dashboard", getMonitoringDashboard);

// Thesis list with filters
router.get("/theses", getThesesList);

// Filter options (for dropdowns)
router.get("/filters", getFilterOptions);

// Progress report for PDF generation
router.get("/report", getProgressReport);

// Download progress report as PDF (server-side Gotenberg)
router.get("/report/download", downloadProgressReport);

// At-risk students list
router.get("/at-risk", getAtRiskStudents);

// Slow students list
router.get("/slow", getSlowStudents);

// Students ready for seminar
router.get("/ready-seminar", getStudentsReadyForSeminar);

// Lecturer supervision workload
router.get("/supervisor-loads", getSupervisorWorkloads);

// Thesis detail by ID
router.get("/theses/:thesisId", getThesisDetail);

// Send warning notification to student
router.post("/theses/:thesisId/send-warning", sendWarningNotification);

// Send batch warning notifications
router.post("/batch-warning", sendBatchWarnings);



export default router;
