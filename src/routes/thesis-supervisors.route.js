import express from 'express';
import { authGuard, requireAnyRole } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import * as supervisorController from '../controllers/thesisSupervisors.controller.js';
import * as evaluationController from '../controllers/thesisGuidanceEvaluation.controller.js';
import * as supervisorValidator from '../validators/thesisSupervisors.validator.js';
import * as evaluationValidator from '../validators/thesisGuidanceEvaluation.validator.js';
import { ROLES, SUPERVISOR_ROLES } from '../constants/roles.js';

const router = express.Router();

router.use(authGuard);

/** POST /thesis-supervisors/co-advisor — KaDep/Admin assigns Pembimbing 2 (FR-CHG-02) */
router.post(
  '/co-advisor',
  requireAnyRole([ROLES.KETUA_DEPARTEMEN, ROLES.ADMIN]),
  validate(supervisorValidator.assignCoAdvisorSchema),
  supervisorController.assignCoAdvisor
);

/** TA-17: Evaluasi Bimbingan Berkala */
router.post(
  '/evaluations',
  requireAnyRole(SUPERVISOR_ROLES),
  validate(evaluationValidator.submitEvaluationSchema),
  evaluationController.submitEvaluation
);
router.get(
  '/evaluations/pending',
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  evaluationController.getPendingEvaluations
);
router.post(
  '/evaluations/:id/review',
  requireAnyRole([ROLES.KETUA_DEPARTEMEN]),
  validate(evaluationValidator.kadepReviewSchema),
  evaluationController.kadepReviewEvaluation
);
router.get(
  '/evaluations/thesis/:thesisId',
  requireAnyRole(SUPERVISOR_ROLES),
  evaluationController.getEvaluationsForThesis
);

export default router;
