import express from "express";
import { authGuard, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";
import { validate } from "../../middlewares/validation.middleware.js";
import {
  listDefences,
  getDefenceDetail,
  validateDocument,
  getSchedulingDataController,
  setSchedule,
} from "../../controllers/thesisDefence/adminDefence.controller.js";
import { scheduleSchema } from "../../validators/adminDefence.validator.js";

const router = express.Router();

router.use(authGuard, requireAnyRole([ROLES.ADMIN]));

router.get("/", listDefences);
router.get("/:defenceId", getDefenceDetail);
router.post("/:defenceId/documents/:documentTypeId/validate", validateDocument);
router.get("/:defenceId/scheduling-data", getSchedulingDataController);
router.post("/:defenceId/schedule", validate(scheduleSchema), setSchedule);

export default router;
