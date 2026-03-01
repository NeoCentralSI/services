import express from "express";
import {
    getAll,
    getById,
    create,
    update,
    toggle,
    remove,
} from "../controllers/cpmk.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import { createCpmkSchema, updateCpmkSchema } from "../validators/cpmk.validator.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

router.use(authGuard);
router.use(requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN]));

router.get("/", getAll);
router.get("/:id", getById);
router.post("/", validate(createCpmkSchema), create);
router.patch("/:id", validate(updateCpmkSchema), update);
router.patch("/:id/toggle", toggle);
router.delete("/:id", remove);

export default router;
