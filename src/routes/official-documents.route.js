import express from "express";
import * as controller from "../controllers/official-document.controller.js";
import { uploadOfficialDocumentFile } from "../middlewares/file.middleware.js";

const router = express.Router();

router.get("/:token", controller.verifyDocument);
router.post("/:token/check-hash", uploadOfficialDocumentFile, controller.checkDocumentHash);

export default router;
