import express from "express";
import {
    getAll,
    getById,
    create,
    update,
    remove,
} from "../../controllers/yudisium/yudisium.controller.js";
import { validate } from "../../middlewares/validation.middleware.js";
import {
    createYudisiumSchema,
    updateYudisiumSchema,
} from "../../validators/yudisium.validator.js";
import { authGuard, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";

const router = express.Router();

router.use(authGuard);

// GET endpoints accessible to all lecturers
router.get("/", getAll);
router.get("/:id", getById);

// Write operations restricted to Sekdep & Koordinator Yudisium
router.post(
    "/",
    requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KOORDINATOR_YUDISIUM]),
    validate(createYudisiumSchema),
    create
);

router.patch(
    "/:id",
    requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KOORDINATOR_YUDISIUM]),
    validate(updateYudisiumSchema),
    update
);

router.delete(
    "/:id",
    requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KOORDINATOR_YUDISIUM]),
    remove
);

export default router;
