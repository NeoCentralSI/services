import express from "express";
import { authGuard, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";
import { uploadYudisiumDocFile } from "../../middlewares/file.middleware.js";
import {
    getEvents,
    getParticipants,
    getParticipantDetail,
} from "../../controllers/yudisium/adminYudisium.controller.js";
import {
    getCplScores,
    verifyCpl,
    createRecommendation,
    updateRecommendationStatus,
    generateDraft,
    uploadSk,
} from "../../controllers/yudisium/lecturerYudisium.controller.js";

const router = express.Router();

const ALL_LECTURER_ROLES = [
    ROLES.ADMIN,
    ROLES.PEMBIMBING_1,
    ROLES.PEMBIMBING_2,
    ROLES.PENGUJI,
    ROLES.KETUA_DEPARTEMEN,
    ROLES.SEKRETARIS_DEPARTEMEN,
    ROLES.GKM,
    ROLES.KOORDINATOR_YUDISIUM,
    ROLES.TIM_PENGELOLA_CPL,
];

const CPL_VALIDATOR_ROLES = [ROLES.ADMIN, ROLES.GKM, ROLES.TIM_PENGELOLA_CPL];

const SK_MANAGER_ROLES = [
    ROLES.ADMIN,
    ROLES.KETUA_DEPARTEMEN,
    ROLES.SEKRETARIS_DEPARTEMEN,
    ROLES.KOORDINATOR_YUDISIUM,
];

router.use(authGuard);

// Read-only endpoints – all lecturer roles
router.get("/events", requireAnyRole(ALL_LECTURER_ROLES), getEvents);
router.get("/:yudisiumId/participants", requireAnyRole(ALL_LECTURER_ROLES), getParticipants);
router.get("/participants/:participantId", requireAnyRole(ALL_LECTURER_ROLES), getParticipantDetail);

// CPL validation – GKM / Tim Pengelola CPL
router.get("/participants/:participantId/cpl-scores", requireAnyRole(CPL_VALIDATOR_ROLES), getCplScores);
router.post("/participants/:participantId/cpl/:cplId/verify", requireAnyRole(CPL_VALIDATOR_ROLES), verifyCpl);
router.post("/participants/:participantId/cpl-recommendation", requireAnyRole(CPL_VALIDATOR_ROLES), createRecommendation);
router.patch("/cpl-recommendation/:recommendationId/status", requireAnyRole(CPL_VALIDATOR_ROLES), updateRecommendationStatus);

// SK management – Kadep / Sekdep / Koordinator Yudisium
router.get("/:yudisiumId/draft-sk", requireAnyRole(SK_MANAGER_ROLES), generateDraft);
router.post("/:yudisiumId/upload-sk", requireAnyRole(SK_MANAGER_ROLES), uploadYudisiumDocFile, uploadSk);

export default router;
