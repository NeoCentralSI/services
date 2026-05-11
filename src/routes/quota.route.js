/**
 * Quota Routes — Supervision Quotas & Browse Dosen
 *
 * Mounted at: /quota
 *
 * Endpoints:
 *   GET    /quota/browse                  — Browse lecturers (any authenticated)
 *   GET    /quota/browse/:lecturerId      — Lecturer detail (any authenticated)
 *   GET    /quota/check/:lecturerId       — Check quota availability (any authenticated)
 *   GET    /quota/science-groups          — List science groups
 *   GET    /quota/topics                  — List thesis topics
 *
 *   GET    /quota/config/default          — Get default quota (Kadep/Admin)
 *   POST   /quota/config/default          — Set default quota (Kadep/Admin)
 *   POST   /quota/config/lecturer/:lecturerId — Set per-lecturer quota (Kadep/Admin)
 *   DELETE /quota/config/lecturer/:quotaId    — Delete per-lecturer quota (Kadep/Admin)
 *
 *   PATCH  /quota/accepting-requests      — Toggle accepting requests (Lecturer own)
 *
 *   GET    /quota/monitoring              — Monitoring dashboard (Kadep/Admin/GKM)
 */

import { Router } from 'express';
import { authGuard } from '../middlewares/auth.middleware.js';
import { loadUserRoles, requireRoles } from '../middlewares/rbac.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import * as controller from '../controllers/quota.controller.js';
import * as validator from '../validators/quota.validator.js';
import { ROLES, LECTURER_ROLES } from '../constants/roles.js';

const router = Router();

// All routes require authentication
router.use(authGuard, loadUserRoles);

// ── Browse (any authenticated user) ─────────────────────────────────

router.get('/browse', controller.browseLecturers);
router.get('/browse/:lecturerId', controller.getLecturerDetail);
router.get('/check/:lecturerId', controller.checkQuota);

// ── Reference data ──────────────────────────────────────────────────

router.get('/science-groups', controller.getScienceGroups);
router.get('/topics', controller.getTopics);

// ── Lecturer own toggle ─────────────────────────────────────────────

router.patch(
  '/accepting-requests',
  requireRoles(...LECTURER_ROLES),
  validate(validator.toggleAcceptingSchema),
  controller.toggleAcceptingRequests,
);

// ── Admin/Kadep config ──────────────────────────────────────────────

const adminRoles = [ROLES.ADMIN, ROLES.KETUA_DEPARTEMEN];

router.get(
  '/config/default',
  requireRoles(...adminRoles),
  controller.getDefaultQuota,
);

router.post(
  '/config/default',
  requireRoles(...adminRoles),
  validate(validator.setDefaultQuotaSchema),
  controller.setDefaultQuota,
);

router.post(
  '/config/lecturer/:lecturerId',
  requireRoles(...adminRoles),
  validate(validator.setLecturerQuotaSchema),
  controller.setLecturerQuota,
);

router.delete(
  '/config/lecturer/:quotaId',
  requireRoles(...adminRoles),
  controller.deleteLecturerQuota,
);

// ── Monitoring (Kadep/Admin/GKM) ────────────────────────────────────

router.get(
  '/monitoring',
  requireRoles(ROLES.ADMIN, ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.GKM),
  controller.getMonitoring,
);

export default router;
