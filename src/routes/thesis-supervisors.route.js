import express from 'express';
import { authGuard, requireAnyRole } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import * as supervisorController from '../controllers/thesisSupervisors.controller.js';
import * as supervisorValidator from '../validators/thesisSupervisors.validator.js';
import { ROLES } from '../constants/roles.js';

const router = express.Router();

router.use(authGuard);

/** POST /thesis-supervisors/supervisor-2 — KaDep/Admin assigns Pembimbing 2 (FR-CHG-02) */
router.post(
  '/supervisor-2',
  requireAnyRole([ROLES.KETUA_DEPARTEMEN, ROLES.ADMIN]),
  validate(supervisorValidator.assignSupervisor2Schema),
  supervisorController.assignSupervisor2
);

// Evaluasi Bimbingan (formulir TA-17) has its own routes: /thesis-guidance-evaluations.

export default router;
