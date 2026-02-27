import express from "express";
import { getAllTheses, createThesis, updateThesis, syncSia, getAllThesisStatuses } from "../controllers/masterDataTa.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import { createThesisSchema, updateThesisSchema } from "../validators/masterDataTa.validator.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

router.use(authGuard);
router.use(requireAnyRole([ROLES.ADMIN, ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN]));

router.get("/", getAllTheses);
router.get("/statuses", getAllThesisStatuses);
router.post("/sync-sia", syncSia);
router.post("/", validate(createThesisSchema), createThesis);
router.patch("/:id", validate(updateThesisSchema), updateThesis);

export default router;
