import express from "express";
import { authGuard, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";
import { validate } from "../../middlewares/validation.middleware.js";
import {
  listSeminars,
  getSeminarDetail,
  validateDocument,
  getSchedulingDataController,
  setSchedule,
  getSeminarResultThesisOptionsController,
  getSeminarResultLecturerOptionsController,
  getSeminarResultStudentOptionsController,
  getSeminarResultsController,
  getSeminarResultAudienceLinksController,
  assignSeminarResultAudiencesController,
  removeSeminarResultAudienceLinkController,
  getSeminarResultDetailController,
  createSeminarResultController,
  updateSeminarResultController,
  deleteSeminarResultController,
} from "../../controllers/thesisSeminar/adminSeminar.controller.js";
import { scheduleSchema } from "../../validators/adminSeminar.validator.js";
import {
  createSeminarResultSchema,
  updateSeminarResultSchema,
  assignSeminarAudienceSchema,
} from "../../validators/seminarResultMaster.validator.js";

const router = express.Router();

// Only Admin can access
router.use(authGuard, requireAnyRole([ROLES.ADMIN]));

// --- Seminar Results (Archive/Management) ---
router.get("/seminar-results/options/theses", getSeminarResultThesisOptionsController);
router.get("/seminar-results/options/lecturers", getSeminarResultLecturerOptionsController);
router.get("/seminar-results/options/students", getSeminarResultStudentOptionsController);

// Static route must be above "/seminar-results/:id"
router.get("/seminar-results/audiences", getSeminarResultAudienceLinksController);
router.post("/seminar-results/audiences/assign", validate(assignSeminarAudienceSchema), assignSeminarResultAudiencesController);
router.delete("/seminar-results/audiences/:seminarId/:studentId", removeSeminarResultAudienceLinkController);

router.get("/seminar-results", getSeminarResultsController);
router.get("/seminar-results/:id", getSeminarResultDetailController);
router.post("/seminar-results", validate(createSeminarResultSchema), createSeminarResultController);
router.patch("/seminar-results/:id", validate(updateSeminarResultSchema), updateSeminarResultController);
router.delete("/seminar-results/:id", deleteSeminarResultController);

// --- Seminar Validation (Ongoing) ---
// GET /thesisSeminar/admin
router.get("/", listSeminars);

// GET /thesisSeminar/admin/:seminarId
router.get("/:seminarId", getSeminarDetail);

// POST /thesisSeminar/admin/:seminarId/documents/:documentTypeId/validate
router.post("/:seminarId/documents/:documentTypeId/validate", validateDocument);

// GET /thesisSeminar/admin/:seminarId/scheduling-data
router.get("/:seminarId/scheduling-data", getSchedulingDataController);

// POST /thesisSeminar/admin/:seminarId/schedule
router.post("/:seminarId/schedule", validate(scheduleSchema), setSchedule);

export default router;
