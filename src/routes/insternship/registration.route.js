import express from "express";
import { getProposals, listCompanies, listEligibleStudents, submitProposal, updateProposal, deleteProposal, respondToInvitation, submitCompanyResponse, getWorkingDays } from "../../controllers/insternship/registration.controller.js";
import { authGuard } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/proposals", authGuard, getProposals);

router.put("/proposals/:id", authGuard, updateProposal);
router.delete("/proposals/:id", authGuard, deleteProposal);
router.post("/proposals/:id/respond", authGuard, respondToInvitation);
router.post("/proposals/:id/company-response", authGuard, submitCompanyResponse);
router.get("/companies", authGuard, listCompanies);
router.get("/eligible-students", authGuard, listEligibleStudents);
router.get("/working-days", authGuard, getWorkingDays);
router.post("/submit", authGuard, submitProposal);

export default router;
