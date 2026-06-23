import express from "express";
import { authGuard, requireAnyRole, requireRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";
import {
  getMonitoringDashboard,
  getThesesList,
  getFilterOptions,
  getAtRiskStudents,
  getSlowStudents,
  getStudentsReadyForSeminar,
  getThesisDetail,
  sendWarningNotification,
  sendBatchWarnings,
  getProgressReport,
  downloadProgressReport,
} from "../../controllers/thesisGuidance/monitoring.controller.js";

const router = express.Router();

// Base path: /thesis-guidance/monitoring
// Akses Monitoring TA: HANYA KaDep + Sekdep (keputusan audit pass 2 F2-7 /
// OQ-2.4 2026-06-10 — GKM dicabut agar konsisten sidebar/route/backend).

router.use(authGuard, requireAnyRole([ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN]));

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

// Thesis detail by ID
router.get("/theses/:thesisId", getThesisDetail);

// Send warning notification to student
router.post("/theses/:thesisId/send-warning", sendWarningNotification);

// Send batch warning notifications
router.post("/batch-warning", sendBatchWarnings);



export default router;
