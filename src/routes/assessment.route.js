/**
 * COMPATIBILITY WRAPPER — /assessment/*
 *
 * Temporary bridge for legacy frontend clients that still call /assessment/...
 * All logic delegates to the canonical metopen grading service.
 * Target: migrate frontend to /metopen/grading/* then remove this file.
 */
import { Router } from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import { ROLES, SUPERVISOR_ROLES } from "../constants/roles.js";
import * as gradingService from "../services/metopen.grading.service.js";
import { findMetopenAssessmentCriteria } from "../repositories/metopen.grading.repository.js";

const router = Router();

router.use(authGuard);

/**
 * GET /assessment/criteria/:formCode
 * Maps TA-03A → role=supervisor, TA-03B → role=default
 */
router.get(
  "/criteria/:formCode",
  requireAnyRole([...SUPERVISOR_ROLES, ROLES.DOSEN_METOPEN]),
  async (req, res, next) => {
    try {
      const { formCode } = req.params;
      const role = formCode === "TA-03A" ? "supervisor" : "default";
      const criteria = await findMetopenAssessmentCriteria(role);

      const mapped = criteria.map((c) => ({
        id: c.id,
        code: c.cpmk?.code ?? "",
        name: c.name ?? c.cpmk?.description ?? "",
        maxWeight: c.maxScore ?? 100,
        description: c.cpmk?.description ?? null,
      }));

      res.json({ success: true, data: mapped });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /assessment/supervisor/:thesisId/score
 * Delegates to canonical metopen grading supervisor-score endpoint
 */
router.post(
  "/supervisor/:thesisId/score",
  requireAnyRole([...SUPERVISOR_ROLES]),
  async (req, res, next) => {
    try {
      const { thesisId } = req.params;
      const supervisorId = req.user.sub;
      const body = req.body;

      const criteriaScores = body.scores?.map((s) => ({
        criteriaId: s.criteriaId,
        score: s.score,
      })) ?? [];

      const result = await gradingService.inputSupervisorScore(
        thesisId,
        supervisorId,
        { criteriaScores }
      );

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /assessment/metopen/:thesisId/score
 * Delegates to canonical metopen grading lecturer-score endpoint
 */
router.post(
  "/metopen/:thesisId/score",
  requireAnyRole([ROLES.DOSEN_METOPEN]),
  async (req, res, next) => {
    try {
      const { thesisId } = req.params;
      const lecturerId = req.user.sub;
      const body = req.body;

      const criteriaScores = body.scores?.map((s) => ({
        criteriaId: s.criteriaId,
        score: s.score,
      })) ?? [];

      const result = await gradingService.inputLecturerScore(
        thesisId,
        lecturerId,
        { criteriaScores }
      );

      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
