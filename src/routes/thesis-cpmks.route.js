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
import { logMasterDataChange } from "../middlewares/activity-log.middleware.js";
import { ENTITY_TYPES } from "../services/auditLog.service.js";

const router = express.Router();

// Middleware
router.use(authGuard);
// Master Thesis CPMK: eksklusif Sekretaris Departemen (selaras KC-20260717-01).
router.use(requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN]));

// Activity log of the TA CPMK master data.
const logTa = (options = {}) => logMasterDataChange({ entity: ENTITY_TYPES.CPMK, scope: "thesis", ...options });

// Routes
router.get("/", getAll);
router.post("/copy-template", logTa({ operation: "copy" }), validate(copyThesisCpmkTemplateSchema), copyTemplate);
router.get("/:id", getById);
router.post("/", logTa(), validate(createThesisCpmkSchema), create);
router.patch("/:id", logTa({ idParam: "id" }), validate(updateThesisCpmkSchema), update);
router.delete("/:id", logTa({ idParam: "id" }), remove);

export default router;
