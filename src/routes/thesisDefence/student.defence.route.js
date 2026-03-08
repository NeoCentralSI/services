import express from "express";
import { authGuard, requireAnyRole } from "../../middlewares/auth.middleware.js";
import { validate } from "../../middlewares/validation.middleware.js";
import { ROLES } from "../../constants/roles.js";
import { uploadSeminarDocFile } from "../../middlewares/file.middleware.js";
import {
  getDefenceOverviewCtrl,
  getDefenceDocumentTypesCtrl,
  getDefenceDocumentsCtrl,
  uploadDefenceDocumentCtrl,
  getStudentDefenceHistoryCtrl,
  getStudentDefenceDetailCtrl,
  getStudentDefenceAssessmentCtrl,
  getStudentDefenceRevisionCtrl,
  createStudentDefenceRevisionCtrl,
  saveStudentDefenceRevisionActionCtrl,
  submitStudentDefenceRevisionActionCtrl,
  cancelStudentDefenceRevisionActionCtrl,
} from "../../controllers/thesisDefence/studentDefence.controller.js";
import {
  createDefenceRevisionSchema,
  submitDefenceRevisionActionSchema,
  saveDefenceRevisionActionSchema,
} from "../../validators/studentDefence.validator.js";

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

// --- Student Revision routes ---
// GET /thesisDefence/student/defences/:defenceId/revisions
router.get("/defences/:defenceId/revisions", getStudentDefenceRevisionCtrl);

// POST /thesisDefence/student/defences/:defenceId/revisions
router.post(
  "/defences/:defenceId/revisions",
  validate(createDefenceRevisionSchema),
  createStudentDefenceRevisionCtrl
);

// PATCH /thesisDefence/student/revisions/:revisionId/action
router.patch(
  "/revisions/:revisionId/action",
  validate(saveDefenceRevisionActionSchema),
  saveStudentDefenceRevisionActionCtrl
);

// PUT /thesisDefence/student/revisions/:revisionId/submit (legacy)
router.put(
  "/revisions/:revisionId/submit",
  validate(submitDefenceRevisionActionSchema),
  submitStudentDefenceRevisionActionCtrl
);

// POST /thesisDefence/student/revisions/:revisionId/submit
router.post(
  "/revisions/:revisionId/submit",
  validate(submitDefenceRevisionActionSchema),
  submitStudentDefenceRevisionActionCtrl
);

// POST /thesisDefence/student/revisions/:revisionId/cancel-submit
router.post(
  "/revisions/:revisionId/cancel-submit",
  cancelStudentDefenceRevisionActionCtrl
);

// --- Student Defence History ---
// GET /thesisDefence/student/history
router.get("/history", getStudentDefenceHistoryCtrl);

// GET /thesisDefence/student/defences/:defenceId
router.get("/defences/:defenceId", getStudentDefenceDetailCtrl);

// GET /thesisDefence/student/defences/:defenceId/assessment
router.get("/defences/:defenceId/assessment", getStudentDefenceAssessmentCtrl);

export default router;
