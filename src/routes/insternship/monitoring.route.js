import express from 'express';
import * as monitoringController from '../../controllers/insternship/monitoring.controller.js';
import { authGuard, requireAnyRole } from '../../middlewares/auth.middleware.js';
import { ROLES } from '../../constants/roles.js';

const router = express.Router();

router.use(authGuard);
router.use(requireAnyRole([ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KETUA_DEPARTEMEN]));

router.get('/stats', monitoringController.getMonitoringStats);
router.get('/list', monitoringController.getMonitoringList);

export default router;
