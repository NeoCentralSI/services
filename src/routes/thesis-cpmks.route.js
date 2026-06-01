import express from "express";
import {
    getAll,
    getById,
    create,
    update,
    remove,
} from "../controllers/thesis-cpmk.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import { createThesisCpmkSchema, updateThesisCpmkSchema } from "../validators/master-data/thesis-cpmk.validator.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

// Middleware
router.use(authGuard);
router.use(requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]));

// Routes
router.get("/", getAll);
router.get("/:id", getById);
router.post("/", validate(createThesisCpmkSchema), create);
router.patch("/:id", validate(updateThesisCpmkSchema), update);
router.delete("/:id", remove);

export default router;
