import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { ROLES } from "../constants/roles.js";
import * as ctrl from "../controllers/defence-requirement.controller.js";
import { createRequirementSchema, updateRequirementSchema,
    reorderRequirementsSchema, copyTemplateSchema } from "../validators/master-data/thesis-requirement.validator.js";

const router = express.Router();

router.use(authGuard);
router.use(requireAnyRole([ROLES.ADMIN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]));

router.get("/", ctrl.getAll);
router.post("/copy-template", validate(copyTemplateSchema), ctrl.copyTemplate);
router.patch("/reorder", validate(reorderRequirementsSchema), ctrl.reorder);
router.get("/:id", ctrl.getById);
router.post("/", validate(createRequirementSchema), ctrl.create);
router.patch("/:id", validate(updateRequirementSchema), ctrl.update);
router.delete("/:id", ctrl.remove);

export default router;
