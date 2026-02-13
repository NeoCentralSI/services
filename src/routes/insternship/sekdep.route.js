import express from "express";
import * as sekdepController from "../../controllers/insternship/sekdep.controller.js";
import { authGuard, requireRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";

const router = express.Router();

// All routes here require Secretary of Department role
router.use(authGuard, requireRole(ROLES.SEKRETARIS_DEPARTEMEN));

/**
 * @route GET /insternship/sekdep/proposals
 * @desc Get all internship proposals ready for Sekdep review
 */
router.get("/proposals", sekdepController.getProposals);

/**
 * @route GET /insternship/sekdep/proposals/:id
 * @desc Get full detail of a specific internship proposal
 */
router.get("/proposals/:id", sekdepController.getProposalDetail);

/**
 * @route GET /insternship/sekdep/companies/stats
 * @desc Get all companies with their stats
 */
router.get("/companies/stats", sekdepController.getCompaniesWithStats);

/**
 * @route POST /insternship/sekdep/companies
 * @desc Create a new company
 */
router.post("/companies", sekdepController.createCompany);

/**
 * @route PUT /insternship/sekdep/companies/:id
 * @desc Update a company
 */
router.put("/companies/:id", sekdepController.updateCompany);

/**
 * @route DELETE /insternship/sekdep/companies/:id
 * @desc Delete a company
 */
router.delete("/companies/:id", sekdepController.deleteCompany);

/**
 * @route POST /insternship/sekdep/proposals/:id/respond
 * @desc Respond to an internship proposal
 */
router.post("/proposals/:id/respond", sekdepController.respondToProposal);

export default router;
