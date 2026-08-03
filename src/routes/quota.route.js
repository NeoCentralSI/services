/**
 * Quota Routes — Supervision Quotas & Browse Dosen
 *
 * Mounted at: /quota
 *
 * Endpoints:
 *   GET    /quota/browse                  — Browse lecturers (non-mahasiswa: dosen/management/Admin — canon §7.3, F-1.4)
 *   GET    /quota/browse/:lecturerId      — Lecturer detail (non-mahasiswa)
 *   GET    /quota/check/:lecturerId       — Check quota availability (non-mahasiswa)
 *   GET    /quota/science-groups          — List science groups
 *   GET    /quota/topics                  — List thesis topics
 *
 *   GET    /quota/config/default          — Get default quota (KaDep/Sekdep/Admin)
 *   POST   /quota/config/default          — Set default quota (Admin only)
 *   POST   /quota/config/lecturer/:lecturerId — Set per-lecturer quota (Admin only)
 *   DELETE /quota/config/lecturer/:quotaId    — Delete per-lecturer quota (Admin only)
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

// ── Browse — angka kuota sensitif (Booking/Pending KaDep/Overquota) hanya untuk
//    role non-mahasiswa (canon §7.3 / audit F-1.4). Mahasiswa memakai jalur bersih
//    GET /advisor-requests/catalog yang sudah menyembunyikan field sensitif.
const quotaBrowseRoles = [...LECTURER_ROLES, ROLES.ADMIN];

router.get('/browse', requireRoles(...quotaBrowseRoles), controller.browseLecturers);
router.get('/browse/:lecturerId', requireRoles(...quotaBrowseRoles), controller.getLecturerDetail);
router.get('/check/:lecturerId', requireRoles(...quotaBrowseRoles), controller.checkQuota);

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

// ── Quota config: management read, Admin mutation ───────────────────

const quotaConfigReadRoles = [
  ROLES.ADMIN,
  ROLES.KETUA_DEPARTEMEN,
  ROLES.SEKRETARIS_DEPARTEMEN,
];

router.get(
  '/config/default',
  requireRoles(...quotaConfigReadRoles),
  controller.getDefaultQuota,
);

router.post(
  '/config/default',
  requireRoles(ROLES.ADMIN),
  validate(validator.setDefaultQuotaSchema),
  controller.setDefaultQuota,
);

router.post(
  '/config/lecturer/:lecturerId',
  requireRoles(ROLES.ADMIN),
  validate(validator.setLecturerQuotaSchema),
  controller.setLecturerQuota,
);

router.delete(
  '/config/lecturer/:quotaId',
  requireRoles(ROLES.ADMIN),
  controller.deleteLecturerQuota,
);

// ── Monitoring (Kadep/Admin/GKM) ────────────────────────────────────

router.get(
  '/monitoring',
  requireRoles(ROLES.ADMIN, ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.GKM),
  controller.getMonitoring,
);

export default router;
