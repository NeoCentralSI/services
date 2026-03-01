import express from "express";
import {
    getAll,
    getById,
    create,
    update,
    toggle,
    moveTop,
    moveBottom,
    remove,
} from "../controllers/yudisiumRequirement.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import {
    createYudisiumRequirementSchema,
    updateYudisiumRequirementSchema,
} from "../validators/yudisiumRequirement.validator.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

router.use(authGuard);
router.use(requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]));

router.get("/", getAll);
router.get("/:id", getById);
router.post("/", validate(createYudisiumRequirementSchema), create);
router.patch("/:id", validate(updateYudisiumRequirementSchema), update);
router.patch("/:id/toggle", toggle);
router.patch("/:id/move-top", moveTop);
router.patch("/:id/move-bottom", moveBottom);
router.delete("/:id", remove);

export default router;
