import express from "express";
import * as templateController from "../../controllers/insternship/template.controller.js";
import { authGuard, requireRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";
import multer from "multer";
import path from "path";
import fs from "fs";

// Configure multer for template uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = "uploads/internship/templates";
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, `template-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
            cb(null, true);
        } else {
            cb(new Error("Hanya file .docx yang diizinkan"), false);
        }
    }
});

const router = express.Router();

// Only admin can manage templates
router.use(authGuard, requireRole(ROLES.ADMIN));

router.get("/:name", templateController.getTemplate);
router.get("/:name/preview", templateController.previewTemplate);
router.post("/", upload.single("file"), templateController.saveTemplate);

export default router;
