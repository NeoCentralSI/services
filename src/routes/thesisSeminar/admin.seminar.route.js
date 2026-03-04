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
} from "../../controllers/thesisSeminar/adminSeminar.controller.js";
import { scheduleSchema } from "../../validators/adminSeminar.validator.js";

const router = express.Router();

// Only Admin can access
router.use(authGuard, requireAnyRole([ROLES.ADMIN]));

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
