import express from "express";
import * as penunjukanPembimbingController from "../../controllers/insternship/penunjukan-pembimbing.controller.js";
import { authGuard, requireRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";

const router = express.Router();
const sekdepRouter = express.Router();

// All routes require Secretary of Department role
sekdepRouter.use(authGuard, requireRole(ROLES.SEKRETARIS_DEPARTEMEN));

/**
 * @route PATCH /insternship/sekdep/internships/bulk-assign
 * @desc Assign supervisor to multiple internships in bulk
 */
sekdepRouter.patch("/internships/bulk-assign", penunjukanPembimbingController.bulkAssignSupervisor);

/**
 * @route GET /insternship/sekdep/lecturers/workload
 * @desc Get all lecturers with their active internship workload
 */
sekdepRouter.get("/lecturers/workload", penunjukanPembimbingController.getLecturersWorkload);
sekdepRouter.get("/lecturers/workload/export", penunjukanPembimbingController.exportLecturersWorkloadPdf);

/**
 * @route GET /insternship/sekdep/lecturers/:supervisorId/supervisor-letter
 * @desc Get supervisor letter details for a lecturer
 */
sekdepRouter.get("/lecturers/:supervisorId/supervisor-letter", penunjukanPembimbingController.getSupervisorLetter);

/**
 * @route POST /insternship/sekdep/lecturers/:supervisorId/supervisor-letter
 * @desc Save and generate supervisor letter for a lecturer
 */
sekdepRouter.post("/lecturers/:supervisorId/supervisor-letter", penunjukanPembimbingController.updateSupervisorLetter);



/**
 * @route POST /insternship/sekdep/internships/replacement-request
 * @desc Request supervisor replacement (needs Kadep approval)
 */
sekdepRouter.post("/internships/replacement-request", penunjukanPembimbingController.requestReplacement);

router.use("/sekdep", sekdepRouter);


export default router;
