import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { populateProfile } from "../middlewares/yudisium.middleware.js";
import { ROLES } from "../constants/roles.js";
import * as ctrl from "../controllers/yudisium.controller.js";

import {
  createYudisiumRequirementSchema,
  updateYudisiumRequirementSchema,
} from "../validators/yudisium.validator.js";

const router = express.Router();

const REQUIREMENT_MANAGER_ROLES = [
  ROLES.ADMIN,
  ROLES.SEKRETARIS_DEPARTEMEN,
  ROLES.KETUA_DEPARTEMEN,
  ROLES.KOORDINATOR_YUDISIUM,
];

router.use(authGuard);
router.use(populateProfile);
router.use(requireAnyRole(REQUIREMENT_MANAGER_ROLES));

router.get("/", ctrl.getAllRequirements);
router.get("/:id", ctrl.getRequirementById);
router.post("/", validate(createYudisiumRequirementSchema), ctrl.createRequirement);
router.patch("/:id", validate(updateYudisiumRequirementSchema), ctrl.updateRequirement);
router.patch("/:id/toggle", ctrl.toggleRequirement);
router.delete("/:id", ctrl.removeRequirement);

export default router;
