import express from "express";
import * as controller from "../controllers/metopen.controller.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { ROLES } from "../constants/roles.js";
import { titleReportReviewSchema, approveRevisionAfterKadepSchema } from "../validators/metopen.validator.js";

const router = express.Router();

router.use(authGuard);

// Eligibility hanya berarti untuk Mahasiswa (canonical: KONTEKS_KANONIS_SIMPTA.md
// §5.1 — source of truth akses awal Metopen). Dosen/Admin yang perlu lihat
// status mahasiswa lain memakai endpoint khusus (`/adminfeatures/students/:id`).
router.get(
  "/eligibility",
  requireAnyRole([ROLES.MAHASISWA]),
  controller.getEligibility,
);

router.get(
  "/progress/:thesisId",
  requireAnyRole([
    ROLES.MAHASISWA,
    ROLES.PEMBIMBING_1,
    ROLES.PEMBIMBING_2,
    ROLES.KOORDINATOR_METOPEN,
    ROLES.SEKRETARIS_DEPARTEMEN,
    ROLES.KETUA_DEPARTEMEN,
    ROLES.ADMIN,
    ROLES.GKM,
  ]),
  controller.getProgressByThesisId,
);

// Mahasiswa: transparansi & sinkron antre
router.get(
  "/me/proposal-approval",
  requireAnyRole([ROLES.MAHASISWA]),
  controller.getMyProposalApproval,
);
router.get(
  "/me/seminar-eligibility",
  requireAnyRole([ROLES.MAHASISWA]),
  controller.getMySeminarEligibility,
);
router.post(
  "/me/proposal-queue/sync",
  requireAnyRole([ROLES.MAHASISWA]),
  controller.postMyProposalQueueSync,
);
// BR-23 (canon §5.13): Arsip Metopel mahasiswa pasca TA-04 — read-only.
router.get(
  "/me/archive",
  requireAnyRole([ROLES.MAHASISWA]),
  controller.getMyArchive,
);
// FR-ARC-05: Mahasiswa mengunduh Formulir TA-04 PDF miliknya (stream terautentikasi).
router.get(
  "/me/archive/title-approval-document",
  requireAnyRole([ROLES.MAHASISWA]),
  controller.getMyTitleApprovalDocument,
);
router.get(
  "/me/assessment-history",
  requireAnyRole([ROLES.MAHASISWA]),
  controller.getMyAssessmentHistory,
);

// KaDep: antre pengesahan judul
router.get(
  "/kadep/title-reports/pending",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  controller.getKadepPendingTitleReports,
);
router.post(
  "/kadep/thesis/:thesisId/title-report/review",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  validate(titleReportReviewSchema),
  controller.postKadepTitleReportReview,
);

// Legacy compatibility: KaDep dapat melihat thesis accepted yang belum terhubung
// ke Formulir TA-04 batch resmi.
router.get(
  "/kadep/title-reports/missing-document",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  controller.getKadepMissingTitleDocuments,
);
// Riwayat keputusan TA-04 (accepted/rejected) antar-periode untuk dashboard KaDep.
router.get(
  "/kadep/title-reports/history",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  controller.getKadepTitleReportHistory,
);
router.post(
  "/kadep/thesis/:thesisId/title-report/regenerate",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  controller.postKadepRegenerateTitleReport,
);
// KaDep mengunduh Formulir TA-04 PDF untuk thesis yang sudah terhubung ke batch.
router.get(
  "/kadep/thesis/:thesisId/title-report/document",
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  controller.getKadepTitleApprovalDocument,
);

// Revision loop pasca-KaDep reject judul (BPMN: Task_RevisiAfterKadep → Task_ReviewRevisionAfterKadep)
router.post(
  "/thesis/:thesisId/revision-after-kadep/submit",
  requireAnyRole([ROLES.MAHASISWA]),
  controller.postSubmitRevisionAfterKadep,
);
router.post(
  "/thesis/:thesisId/revision-after-kadep/approve",
  requireAnyRole([ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2]),
  validate(approveRevisionAfterKadepSchema),
  controller.postApproveRevisionAfterKadep,
);

export default router;
