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
import { createCplSchema, updateCplSchema } from "../validators/master-data/cpl.validator.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

router.use(authGuard);
const adminOnly = requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]);
const allStaff = requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN, ROLES.GKM]);

router.get("/", allStaff, getAll);
router.get("/:id", allStaff, getById);
router.post("/", adminOnly, validate(createCplSchema), create);
router.patch("/:id", adminOnly, validate(updateCplSchema), update);
router.patch("/:id/toggle", allStaff, toggle);
router.delete("/:id", adminOnly, remove);

export default router;
