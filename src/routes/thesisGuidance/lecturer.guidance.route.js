import express from "express";
import { authGuard, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { feedbackSchema, rejectGuidanceSchema, approveGuidanceSchema, approveComponentsSchema, cancelGuidanceSchema, lecturerRescheduleGuidanceSchema, rejectSummarySchema } from "../../validators/lecturer.guidance.validator.js";
import { ROLES } from "../../constants/roles.js";
import {
	myStudents,
	studentDetail,
	listRequests,
	listScheduledGuidances,
	rejectGuidance,
	cancelGuidance,
	approveGuidance,
	listProgress,
	progressDetail,
	approveProgressComponents,
	postFeedback,
	finalApproval,
	guidanceHistory,
	supervisorEligibility,
	pendingApproval,
	approveSummary,
	rejectSummary,
	rescheduleGuidanceByLecturer,
	guidanceDetail,
	sendWarningNotification,
	approveThesisProposal,
} from "../../controllers/thesisGuidance/lecturer.guidance.controller.js";
import {
	getSupervisor2Requests,
	approveSupervisor2Request,
	rejectSupervisor2Request,
} from "../../controllers/thesisGuidance/supervisor2.controller.js";

const router = express.Router();

// Base path: /thesisGuidance/lecturer (will be mounted as /thesisGuidance/lecturer.guidance by auto-loader, so expose full path explicitly in parent route if needed)

// Accept Pembimbing 1 or Pembimbing 2 roles
router.use(authGuard, requireAnyRole([ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2]));

router.get("/my-students", myStudents);
router.get("/my-students/:thesisId", studentDetail);
router.post("/my-students/:thesisId/send-warning", sendWarningNotification);
router.post("/my-students/:thesisId/approve-proposal", approveThesisProposal);
router.get("/requests", listRequests);
router.get("/scheduled", listScheduledGuidances);
router.patch("/requests/:guidanceId/reject", validate(rejectGuidanceSchema), rejectGuidance);
router.patch("/requests/:guidanceId/approve", validate(approveGuidanceSchema), approveGuidance);
router.patch("/requests/:guidanceId/cancel", validate(cancelGuidanceSchema), cancelGuidance);

router.get("/progress", listProgress);
router.get("/progress/:studentId", progressDetail);
router.patch("/progress/:studentId/approve", validate(approveComponentsSchema), approveProgressComponents);
router.patch("/progress/:studentId/final-approval", finalApproval);
// A supervisor cannot stop a thesis directly. Termination by a supervisor goes through
// Evaluasi Bimbingan (/thesis-guidance-evaluations); administrative termination stays in
// the thesis data master.

router.patch("/feedback/:guidanceId", validate(feedbackSchema), postFeedback);

// Optional
router.get("/guidance-history/:studentId", guidanceHistory);
router.get("/supervisor/eligibility", supervisorEligibility);

// Session Summary Approval (1-click approve)
router.get("/pending-approval", pendingApproval);
router.put("/guidance/:guidanceId/approve-summary", approveSummary);
// K19: request a revised summary; move an accepted session
router.put("/guidance/:guidanceId/reject-summary", validate(rejectSummarySchema), rejectSummary);
router.patch("/guidance/:guidanceId/reschedule", validate(lecturerRescheduleGuidanceSchema), rescheduleGuidanceByLecturer);

// Guidance detail for session page
router.get("/guidance/:guidanceId", guidanceDetail);

// Pembimbing 2 requests
router.get("/supervisor2-requests", getSupervisor2Requests);
router.patch("/supervisor2-requests/:requestId/approve", approveSupervisor2Request);
router.patch("/supervisor2-requests/:requestId/reject", rejectSupervisor2Request);

// Handing students over to another lecturer is a thesis change request:
// POST /thesis-change-requests/transfer.

export default router;
