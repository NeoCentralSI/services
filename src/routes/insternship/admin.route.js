import express from "express";
import * as adminController from "../../controllers/insternship/admin.controller.js";
import { authGuard, requireRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";

const router = express.Router();

// All routes here require Admin role
router.use(authGuard, requireRole(ROLES.ADMIN));

router.get("/companies/stats", adminController.getCompaniesWithStats);

/**
 * @route GET /insternship/admin/proposals/assignments
 * @desc Get all internship proposals that have an approved company response
 */
router.get("/proposals/assignments", adminController.getAssignmentProposals);

/**
 * @route GET /insternship/admin/proposals/approved
 * @desc Get all internship proposals that have been approved by Sekdep
 */
router.get("/proposals/approved", adminController.getApprovedInternshipProposals);

/**
 * @route GET /insternship/admin/proposals/:id/assignment
 * @desc Get detail for single assignment letter management
 */
router.get("/proposals/:id/assignment", adminController.getAssignmentLetterDetail);

/**
 * @route PATCH /insternship/admin/proposals/:id/assignment-letter
 * @desc Update assignment letter details
 */
router.patch("/proposals/:id/assignment-letter", adminController.updateAssignmentLetter);

/**
 * @route GET /insternship/admin/proposals/:id
 * @desc Get detail for single proposal letter management
 */
router.get("/proposals/:id", adminController.getProposalLetterDetail);

/**
 * @route PATCH /insternship/admin/proposals/:id/letter
 * @desc Update application letter details
 */
router.patch("/proposals/:id/letter", adminController.updateProposalLetter);

export default router;
