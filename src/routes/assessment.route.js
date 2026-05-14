import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES, SUPERVISOR_ROLES } from "../constants/roles.js";
import {
  getCriteriaByFormCode,
  getSupervisorScoringQueue,
  submitSupervisorScore,
  coSignSupervisorScoreAndSync,
  getMetopenScoringQueue,
  submitMetopenScore,
  publishFinalScore,
  getScoresByThesisForSupervisor,
  getScoresByThesisForMetopenLecturer,
  getSupervisorContextForThesis,
} from "../services/assessment.service.js";

const router = express.Router();
router.use(authGuard);

// Hanya 1 role/orang berhak mengisi TA-03B (Canon §5.7), walaupun di lapangan
// pengampu mata kuliah Metopen bisa lebih dari 1.
const KOORDINATOR_METOPEN_ROLES = [ROLES.KOORDINATOR_METOPEN];

// ============================================
// Criteria
// ============================================

/**
 * GET /assessment/criteria/:formCode
 * Get AssessmentCriteria for TA-03A (formCode=TA-03A) or TA-03B (formCode=TA-03B).
 */
router.get("/criteria/:formCode", async (req, res, next) => {
  try {
    const data = await getCriteriaByFormCode(req.params.formCode);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ============================================
// TA-03A — Supervisor Scoring
// ============================================

/**
 * GET /assessment/supervisor/queue
 * Theses awaiting TA-03A scoring by the authenticated supervisor.
 */
router.get(
  "/supervisor/queue",
  requireAnyRole(SUPERVISOR_ROLES),
  async (req, res, next) => {
    try {
      const data = await getSupervisorScoringQueue(req.user.sub);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /assessment/supervisor/:thesisId/score
 * Get TA-03A score details for a specific thesis (for the scoring form).
 */
router.get(
  "/supervisor/:thesisId/score",
  requireAnyRole(SUPERVISOR_ROLES),
  async (req, res, next) => {
    try {
      const data = await getScoresByThesisForSupervisor(req.params.thesisId, req.user.sub);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /assessment/supervisor/:thesisId/score
 * Submit TA-03A scores (Dosen Pembimbing 1 master, max total 75).
 * Body: { scores: [{ criteriaId, rubricId?, score }] }
 *
 * BR-20: Hanya Pembimbing 1 yang berhak (filter di service).
 * BR-21: Setelah finalized, endpoint menolak modifikasi (403).
 */
router.post(
  "/supervisor/:thesisId/score",
  requireAnyRole(SUPERVISOR_ROLES),
  async (req, res, next) => {
    try {
      const data = await submitSupervisorScore(req.params.thesisId, req.user.sub, req.body);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /assessment/supervisor/:thesisId/co-sign
 * BR-20 (canon §5.7.1): Pembimbing 2 melakukan co-sign atas penilaian
 * TA-03A yang sudah diisi Pembimbing 1. Co-sign tidak mengubah skor —
 * hanya menambah audit trail (siapa, kapan, catatan opsional).
 *
 * Body: { note?: string }
 *
 * Constraint:
 * - Hanya akun dengan role Pembimbing 2 aktif yang berhak.
 * - Skor TA-03A oleh P1 harus sudah ada.
 * - Tidak boleh setelah finalized (BR-21).
 */
router.post(
  "/supervisor/:thesisId/co-sign",
  requireAnyRole(SUPERVISOR_ROLES),
  async (req, res, next) => {
    try {
      const data = await coSignSupervisorScoreAndSync(req.params.thesisId, req.user.sub, req.body ?? {});
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /assessment/supervisor/:thesisId/context
 * Mengembalikan klasifikasi role pembimbing yang sedang request:
 *   { role: "P1" | "P2" | null, hasP2: boolean }
 * UI memakai ini untuk memutuskan: form full edit (P1), read+cosign (P2),
 * atau read-only summary (other lecturer roles).
 */
router.get(
  "/supervisor/:thesisId/context",
  requireAnyRole(SUPERVISOR_ROLES),
  async (req, res, next) => {
    try {
      const data = await getSupervisorContextForThesis(req.params.thesisId, req.user.sub);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================
// TA-03B — Metopen Lecturer Scoring
// ============================================

/**
 * GET /assessment/metopen/queue
 * Theses awaiting TA-03B scoring after final proposal submission.
 * TA-03A and TA-03B are scored in parallel in the active flow.
 */
router.get(
  "/metopen/queue",
  requireAnyRole(KOORDINATOR_METOPEN_ROLES),
  async (req, res, next) => {
    try {
      const data = await getMetopenScoringQueue(req.user.sub);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /assessment/metopen/:thesisId/score
 * Get current TA-03B score details for a specific thesis.
 */
router.get(
  "/metopen/:thesisId/score",
  requireAnyRole(KOORDINATOR_METOPEN_ROLES),
  async (req, res, next) => {
    try {
      const data = await getScoresByThesisForMetopenLecturer(req.params.thesisId, req.user.sub);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /assessment/metopen/:thesisId/score
 * Submit TA-03B scores (Koordinator Matkul Metopen, max total 25).
 * Runs in parallel with TA-03A after final proposal submission.
 * Body: { scores: [{ criteriaId, rubricId?, score }] }
 */
router.post(
  "/metopen/:thesisId/score",
  requireAnyRole(KOORDINATOR_METOPEN_ROLES),
  async (req, res, next) => {
    try {
      const data = await submitMetopenScore(req.params.thesisId, req.user.sub, req.body);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /assessment/metopen/:thesisId/publish
 * Publish/finalize the combined TA-03A + TA-03B score.
 * Both scores must be present.
 */
router.post(
  "/metopen/:thesisId/publish",
  requireAnyRole(KOORDINATOR_METOPEN_ROLES),
  async (req, res, next) => {
    try {
      const data = await publishFinalScore(req.params.thesisId, req.user.sub);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
