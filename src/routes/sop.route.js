import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";
import {
    sopReadMiddleware,
    sopUploadMiddleware,
    sopDeleteMiddleware,
    listSop,
    listSopPublic,
    uploadSop,
    downloadSop,
    patchSop,
    deleteSop
} from "../controllers/sop.controller.js";

const router = express.Router();

// GET /sop?category=SOP|TEMPLATE
router.get("/", authGuard, listSop);

// GET /sop/public (only main SOPs for landing page)
router.get("/public", sopReadMiddleware, listSopPublic);

// GET /sop/download?path=/uploads/sop/sop-ta.pdf
router.get("/download", sopReadMiddleware, downloadSop);

// POST /sop (multipart/form-data with field "file" and body "type" = TA|KP)
router.post("/", sopUploadMiddleware, uploadSop);

// PATCH /sop/:id
router.patch("/:id", authGuard, requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN]), patchSop);

// DELETE /sop/:id
router.delete("/:id", sopDeleteMiddleware, deleteSop);

export default router;
