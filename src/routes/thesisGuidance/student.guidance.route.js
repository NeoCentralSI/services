import express from "express";
import { authGuard, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validation.middleware.js";
import {
	requestGuidanceSchema,
	rescheduleGuidanceSchema,
	studentNotesSchema,
	completeComponentsSchema,
} from "../../validators/student.guidance.validator.js";
import {
	listMyGuidances,
	guidanceDetail,
	requestGuidance,
	rescheduleGuidance,
	cancelGuidance,
	updateStudentNotes,
	myProgress,
	completeProgressComponents,
	guidanceHistory,
	listSupervisors,
	supervisorAvailability,
	needsSummary,
	submitSummary,
	completedHistory,
	exportGuidance,
	markSessionComplete,
	getMyThesis,
	updateMyThesisTitle,
} from "../../controllers/thesisGuidance/student.guidance.controller.js";
import { uploadThesisFile } from "../../middlewares/file.middleware.js";
import { ROLES } from "../../constants/roles.js";

const router = express.Router();

// Accept only Mahasiswa role
router.use(authGuard, requireAnyRole([ROLES.MAHASISWA]));

// Guidance list/detail
router.get("/guidance", listMyGuidances);
router.get("/guidance/:guidanceId", guidanceDetail);

// Create / reschedule / cancel guidance
// Accept multipart/form-data with optional thesis file (field name: "file").
// The upload middleware is placed before validation so multer parses multipart bodies.
router.post("/guidance/request", uploadThesisFile, validate(requestGuidanceSchema), requestGuidance);
router.patch("/guidance/:guidanceId/reschedule", validate(rescheduleGuidanceSchema), rescheduleGuidance);
router.patch("/guidance/:guidanceId/cancel", cancelGuidance);

// Update student notes
router.patch("/guidance/:guidanceId/notes", validate(studentNotesSchema), updateStudentNotes);

// Progress
router.get("/progress", myProgress);
router.patch("/progress/complete", validate(completeComponentsSchema), completeProgressComponents);

// History
router.get("/history", guidanceHistory);

// Session Summary (after guidance)
router.get("/needs-summary", needsSummary);
router.post("/guidance/:guidanceId/submit-summary", submitSummary);
router.post("/guidance/:guidanceId/complete", markSessionComplete); // Quick complete without lecturer approval
router.get("/completed-history", completedHistory);
router.get("/guidance/:guidanceId/export", exportGuidance);

// Supervisors info
router.get("/supervisors", listSupervisors);
router.get("/supervisors/:supervisorId/availability", supervisorAvailability);

// My Thesis (get detail & update title)
router.get("/my-thesis", getMyThesis);
router.patch("/my-thesis/title", updateMyThesisTitle);

export default router;

