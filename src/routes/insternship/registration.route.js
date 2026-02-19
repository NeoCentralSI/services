import express from "express";
import { getProposals, getProposalDetail, listCompanies, listEligibleStudents, submitProposal, respondToInvitation, submitCompanyResponse } from "../../controllers/insternship/registration.controller.js";
import { authGuard } from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/proposals", authGuard, getProposals);
router.get("/proposals/:id", authGuard, getProposalDetail);
router.post("/proposals/:id/respond", authGuard, respondToInvitation);
router.post("/proposals/:id/company-response", authGuard, submitCompanyResponse);
router.get("/companies", authGuard, listCompanies);
router.get("/eligible-students", authGuard, listEligibleStudents);
router.post("/submit", authGuard, submitProposal);

export default router;
