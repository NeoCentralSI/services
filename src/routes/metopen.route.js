import express from "express";
import * as controller from "../controllers/metopen.controller.js";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { ROLES } from "../constants/roles.js";
import { titleReportReviewSchema } from "../validators/metopen.validator.js";

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

export default router;
