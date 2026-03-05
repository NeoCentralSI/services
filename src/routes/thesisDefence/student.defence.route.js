import express from "express";
import { authGuard, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";
import { uploadSeminarDocFile } from "../../middlewares/file.middleware.js";
import {
  getDefenceOverviewCtrl,
  getDefenceDocumentTypesCtrl,
  getDefenceDocumentsCtrl,
  uploadDefenceDocumentCtrl,
} from "../../controllers/thesisDefence/studentDefence.controller.js";

const router = express.Router();

// All routes require auth + student role
router.use(authGuard, requireAnyRole([ROLES.MAHASISWA]));

// GET /thesisDefence/student/overview
router.get("/overview", getDefenceOverviewCtrl);

// GET /thesisDefence/student/documents/types
router.get("/documents/types", getDefenceDocumentTypesCtrl);

// GET /thesisDefence/student/documents
router.get("/documents", getDefenceDocumentsCtrl);

// POST /thesisDefence/student/documents/upload
router.post("/documents/upload", uploadSeminarDocFile, uploadDefenceDocumentCtrl);

export default router;
