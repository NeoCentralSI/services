import express from "express";
import * as kadepController from "../../controllers/insternship/kadep.controller.js";
import { authGuard, requireRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";

const router = express.Router();

// All routes require Kadep role
router.use(authGuard);
router.use(requireRole(ROLES.KETUA_DEPARTEMEN));

router.get("/pending-letters", kadepController.getPendingLetters);
router.post("/approve-letter", kadepController.approveLetter);
router.get("/companies/stats", kadepController.getCompaniesWithStats);
router.post("/companies", kadepController.createCompany);
router.put("/companies/:id", kadepController.updateCompany);
router.delete("/companies/:id", kadepController.deleteCompany);

export default router;
