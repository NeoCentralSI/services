import express from "express";
import { authGuard, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";
import {
    getEvents,
    getParticipants,
    getParticipantDetail,
    validateDocument,
} from "../../controllers/yudisium/adminYudisium.controller.js";

const router = express.Router();

router.use(authGuard);
router.use(requireAnyRole([ROLES.ADMIN]));

router.get("/events", getEvents);
router.get("/:yudisiumId/participants", getParticipants);
router.get("/participants/:participantId", getParticipantDetail);
router.post("/participants/:participantId/requirements/:requirementId/validate", validateDocument);

export default router;
