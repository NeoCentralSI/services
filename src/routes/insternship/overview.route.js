import express from "express";
import { authGuard } from "../../middlewares/auth.middleware.js";
import { getOverviewCompanies, getOverviewReports, getOverviewStats } from "../../controllers/insternship/overview.controller.js";

const router = express.Router();

// Semua endpoint overview bisa diakses public (tetap butuh login)
router.use(authGuard);

router.get("/companies", getOverviewCompanies);
router.get("/reports", getOverviewReports);
router.get("/stats", getOverviewStats);

export default router;
