import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";
import {
    getScienceGroupsController,
    createScienceGroupController,
    updateScienceGroupController,
    deleteScienceGroupController
} from "../controllers/scienceGroup.controller.js";

const router = express.Router();

router.get("/", authGuard, requireAnyRole([ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.ADMIN]), getScienceGroupsController);
router.post("/", authGuard, requireAnyRole([ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.ADMIN]), createScienceGroupController);
router.patch("/:id", authGuard, requireAnyRole([ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.ADMIN]), updateScienceGroupController);
router.delete("/:id", authGuard, requireAnyRole([ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.ADMIN]), deleteScienceGroupController);

export default router;
