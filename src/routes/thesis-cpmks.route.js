import express from "express";
import {
    getAll,
    getById,
    create,
    update,
    remove,
    copyTemplate,
} from "../controllers/thesis-cpmk.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import {
    copyThesisCpmkTemplateSchema,
    createThesisCpmkSchema,
    updateThesisCpmkSchema,
} from "../validators/master-data/thesis-cpmk.validator.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

// Middleware
router.use(authGuard);
// Master Thesis CPMK: eksklusif Sekretaris Departemen (selaras KC-20260717-01).
router.use(requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN]));

// Routes
router.get("/", getAll);
router.post("/copy-template", validate(copyThesisCpmkTemplateSchema), copyTemplate);
router.get("/:id", getById);
router.post("/", validate(createThesisCpmkSchema), create);
router.patch("/:id", validate(updateThesisCpmkSchema), update);
router.delete("/:id", remove);

export default router;
