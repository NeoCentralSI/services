import express from "express";
import { sopReadMiddleware, sopUploadMiddleware, listSop, uploadSop, downloadSop } from "../controllers/sop.controller.js";

const router = express.Router();

// GET /sop?type=TA|KP
router.get("/", sopReadMiddleware, listSop);

// GET /sop/download?path=/uploads/sop/sop-ta.pdf
router.get("/download", downloadSop);

// POST /sop (multipart/form-data with field "file" and body "type" = TA|KP)
router.post("/", sopUploadMiddleware, uploadSop);

export default router;
