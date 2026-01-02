import express from "express";
import { publicSupervisorAvailability } from "../../controllers/thesisGuidance/public.guidance.controller.js";

const router = express.Router();

// No auth - read-only busy slots for a supervisor
router.get("/supervisors/:supervisorId/availability", publicSupervisorAvailability);

export default router;
