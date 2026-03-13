import express from "express";
import * as sekdepController from "../../controllers/insternship/sekdep.controller.js";
import * as guidanceController from "../../controllers/insternship/guidance.controller.js";
import * as cpmkController from "../../controllers/insternship/cpmk.controller.js";
import { authGuard, requireRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";

const router = express.Router();

// All routes here require Secretary of Department role
router.use(authGuard, requireRole(ROLES.SEKRETARIS_DEPARTEMEN));

/**
 * @route GET /insternship/sekdep/proposals
 * @desc Get all internship proposals for Sekdep review and assignment
 */
router.get("/proposals", sekdepController.getAllProposals);
router.get("/proposals/pending", sekdepController.getPendingProposals);
router.get("/proposals/responses", sekdepController.getPendingResponses);


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



/**
 * @route POST /insternship/sekdep/company-responses/:id/verify
 * @desc Verify a company response
 */
router.post("/company-responses/:id/verify", sekdepController.verifyCompanyResponse);

/**
 * @route GET /insternship/sekdep/internships
 * @desc Get all internships (Ongoing/Completed) for Sekdep
 */
router.get("/internships", sekdepController.getInternshipList);

/**
 * @route GET /insternship/sekdep/internships/:id
 * @desc Get full detail of an internship
 */
router.get("/internships/:id", sekdepController.getInternshipDetail);

/**
 * @route PATCH /insternship/sekdep/internships/bulk-assign
 * @desc Assign supervisor to multiple internships in bulk
 */
router.patch("/internships/bulk-assign", sekdepController.bulkAssignSupervisor);

/**
 * @route GET /insternship/sekdep/lecturers/workload
 * @desc Get all lecturers with their active internship workload
 */
router.get("/lecturers/workload", sekdepController.getLecturersWorkload);
router.get("/lecturers/workload/export", sekdepController.exportLecturersWorkloadPdf);

// ==================== Guidance Master Data ====================
router.get("/guidance/questions", guidanceController.getQuestions);
router.post("/guidance/questions", guidanceController.createQuestion);
router.put("/guidance/questions/:id", guidanceController.updateQuestion);
router.delete("/guidance/questions/:id", guidanceController.deleteQuestion);

router.get("/guidance/criteria", guidanceController.getCriteria);
router.post("/guidance/criteria", guidanceController.createCriteria);
router.put("/guidance/criteria/:id", guidanceController.updateCriteria);
router.delete("/guidance/criteria/:id", guidanceController.deleteCriteria);
router.post("/guidance/copy", guidanceController.duplicateGuidance);

// ==================== CPMK Master Data ====================
router.get("/cpmk", cpmkController.getAllCpmks);
router.get("/cpmk/:id", cpmkController.getCpmkById);
router.post("/cpmk", cpmkController.createCpmk);
router.post("/cpmk/copy", cpmkController.duplicateCpmks);
router.put("/cpmk/:id", cpmkController.updateCpmk);
router.delete("/cpmk/:id", cpmkController.deleteCpmk);

router.post("/rubrics", cpmkController.createRubric);
router.post("/cpmk/:cpmkId/rubrics/bulk", cpmkController.bulkUpdateRubrics);
router.put("/rubrics/:id", cpmkController.updateRubric);
router.delete("/rubrics/:id", cpmkController.deleteRubric);

export default router;
