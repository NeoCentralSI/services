import express from "express";
import { authGuard, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";
import {
  getSeminarOverview,
  getAttendanceHistory,
} from "../../controllers/thesisGuidance/studentSeminar.controller.js";

const router = express.Router();

// Only Mahasiswa can access
router.use(authGuard, requireAnyRole([ROLES.MAHASISWA]));

// GET /thesisSeminar/student/overview
router.get("/overview", getSeminarOverview);

// GET /thesisSeminar/student/attendance
router.get("/attendance", getAttendanceHistory);

export default router;
