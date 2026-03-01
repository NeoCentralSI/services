import express from "express";
import {
    getAll,
    getById,
    create,
    update,
    toggle,
    remove,
} from "../controllers/cpl.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import { createCplSchema, updateCplSchema } from "../validators/cpl.validator.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

router.use(authGuard);
router.use(requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]));

router.get("/", getAll);
router.get("/:id", getById);
router.post("/", validate(createCplSchema), create);
router.patch("/:id", validate(updateCplSchema), update);
router.patch("/:id/toggle", toggle);
router.delete("/:id", remove);

export default router;
