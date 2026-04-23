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
import { createCpmkSchema, updateCpmkSchema } from "../validators/cpmk.validator.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

router.use(authGuard);
router.use(requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]));

router.get("/", getAll);
router.get("/hierarchy", getHierarchy);
router.get("/:id", getById);
router.post("/copy-template", copyTemplate);
router.post("/", validate(createCpmkSchema), create);
router.patch("/:id", validate(updateCpmkSchema), update);
router.delete("/:id", remove);

export default router;
