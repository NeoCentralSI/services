import express from "express";
import {
    getAll,
    getById,
    create,
    update,
    remove,
    getHierarchy,
    copyTemplate,
} from "../controllers/cpmk.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import { createCpmkSchema, updateCpmkSchema } from "../validators/master-data/cpmk.validator.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

// Middleware
router.use(authGuard);
router.use(requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]));

// CPMK Routes
router.get("/", getAll);
router.get("/hierarchy", getHierarchy);
router.get("/:id", getById);

// Management Routes
router.post("/copy-template", copyTemplate);
router.post("/", validate(createCpmkSchema), create);
router.patch("/:id", validate(updateCpmkSchema), update);
router.delete("/:id", remove);

export default router;
