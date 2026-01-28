import express from "express";
import { authGuard, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { DEPARTMENT_ROLES } from "../../constants/roles.js";
import {
  getMonitoringDashboard,
  getThesesList,
  getFilterOptions,
  getAtRiskStudents,
  getStudentsReadyForSeminar,
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

// At-risk students list
router.get("/at-risk", getAtRiskStudents);

// Students ready for seminar
router.get("/ready-seminar", getStudentsReadyForSeminar);

export default router;
