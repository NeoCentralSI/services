import express from 'express';
import { authGuard, requireAnyRole } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import * as supervisorController from '../controllers/thesisSupervisors.controller.js';
import * as supervisorValidator from '../validators/thesisSupervisors.validator.js';
import { ROLES } from '../constants/roles.js';

const router = express.Router();

router.use(authGuard);

/** POST /thesis-supervisors/co-advisor — KaDep/Admin assigns Pembimbing 2 (FR-CHG-02) */
router.post(
  '/co-advisor',
  requireAnyRole([ROLES.KETUA_DEPARTEMEN, ROLES.ADMIN]),
  validate(supervisorValidator.assignCoAdvisorSchema),
  supervisorController.assignCoAdvisor
);

// Evaluasi Bimbingan (formulir TA-17) has its own routes: /thesis-guidance-evaluations.

export default router;
