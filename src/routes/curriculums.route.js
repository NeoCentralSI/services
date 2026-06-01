import express from "express";
import {
    getAll,
    getById,
    create,
    update,
    remove,
} from "../controllers/curriculum.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import {
    createCurriculumSchema,
    updateCurriculumSchema,
} from "../validators/master-data/curriculum.validator.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

router.use(authGuard);

router.get("/", requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN, ROLES.GKM, ROLES.ADMIN]), getAll);
router.get("/:id", requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN, ROLES.GKM, ROLES.ADMIN]), getById);

// Management routes restricted to GKM only
router.use(requireAnyRole([ROLES.GKM]));

router.post("/", validate(createCurriculumSchema), create);
router.patch("/:id", validate(updateCurriculumSchema), update);
router.delete("/:id", remove);

export default router;
