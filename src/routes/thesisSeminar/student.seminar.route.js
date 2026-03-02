import express from "express";
import { authGuard, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";
import { uploadSeminarDocFile } from "../../middlewares/file.middleware.js";
import {
  getSeminarOverview,
  getAttendanceHistory,
} from "../../controllers/thesisSeminar/studentSeminar.controller.js";
import {
  getDocumentTypes,
  getDocuments,
  uploadDocument,
  viewDocument,
} from "../../controllers/thesisSeminar/seminarDocument.controller.js";

const router = express.Router();

// Only Mahasiswa can access
router.use(authGuard, requireAnyRole([ROLES.MAHASISWA]));

// GET /thesisSeminar/student/overview
router.get("/overview", getSeminarOverview);

// GET /thesisSeminar/student/attendance
router.get("/attendance", getAttendanceHistory);

// --- Seminar Document routes ---
// GET /thesisSeminar/student/documents/types
router.get("/documents/types", getDocumentTypes);

// GET /thesisSeminar/student/documents
router.get("/documents", getDocuments);

// POST /thesisSeminar/student/documents/upload
router.post("/documents/upload", uploadSeminarDocFile, uploadDocument);

// GET /thesisSeminar/student/documents/:documentTypeId
router.get("/documents/:documentTypeId", viewDocument);

export default router;
