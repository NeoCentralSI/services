import express from "express";
import { getProposals, getProposalDetail, listCompanies, listEligibleStudents, submitProposal, respondToInvitation } from "../../controllers/insternship/registration.controller.js";
import { authGuard } from "../../middlewares/auth.middleware.js";
import { loadUserRoles, requireRoles } from "../../middlewares/rbac.middleware.js";
import { ROLES } from "../../constants/roles.js";

const router = express.Router();

// All routes require auth + roles loaded
router.use(authGuard, loadUserRoles);

// Student-facing registration endpoints
router.get("/proposals", requireRoles(ROLES.MAHASISWA), getProposals);
router.get("/proposals/:id", requireRoles(ROLES.MAHASISWA), getProposalDetail);
router.post("/proposals/:id/respond", requireRoles(ROLES.MAHASISWA), respondToInvitation);
router.get("/companies", requireRoles(ROLES.MAHASISWA, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.ADMIN), listCompanies);
router.get("/eligible-students", requireRoles(ROLES.MAHASISWA), listEligibleStudents);
router.post("/submit", requireRoles(ROLES.MAHASISWA), submitProposal);

export default router;
