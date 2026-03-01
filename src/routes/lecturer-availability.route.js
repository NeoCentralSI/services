import express from "express";
import {
    getMyAvailabilities,
    createAvailability,
    updateAvailability,
    toggleAvailability,
    deleteAvailability
} from "../controllers/lecturerAvailability.controller.js";
import { validate } from "../middlewares/validation.middleware.js";
import { createAvailabilitySchema, updateAvailabilitySchema } from "../validators/lecturerAvailability.validator.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { LECTURER_ROLES } from "../constants/roles.js";

const router = express.Router();

router.use(authGuard);
router.use(requireAnyRole(LECTURER_ROLES));

router.get("/", getMyAvailabilities);
router.post("/", validate(createAvailabilitySchema), createAvailability);
router.patch("/:id", validate(updateAvailabilitySchema), updateAvailability);
router.patch("/:id/toggle", toggleAvailability);
router.delete("/:id", deleteAvailability);

export default router;
