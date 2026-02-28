import express from 'express';
import { authGuard, requireRole } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validation.middleware.js';
import * as controller from '../controllers/thesisChangeRequest.controller.js';
import * as validator from '../validators/thesisChangeRequest.validator.js';
import { ROLES } from '../constants/roles.js';

const router = express.Router();

// Student routes
router.post(
  '/submit',
  authGuard,
  requireRole(ROLES.MAHASISWA),
  validate(validator.submitRequestSchema),
  controller.submitRequest
);

router.get(
  '/my-requests',
  authGuard,
  requireRole(ROLES.MAHASISWA),
  controller.getMyRequests
);

// Check if student has approved change request where thesis was deleted
router.get(
  '/check-approved',
  authGuard,
  requireRole(ROLES.MAHASISWA),
  controller.checkApprovedWithDeletedThesis
);

// Kadep routes
router.get(
  '/pending',
  authGuard,
  requireRole(ROLES.KETUA_DEPARTEMEN),
  controller.getPendingRequests
);

router.get(
  '/all',
  authGuard,
  requireRole(ROLES.KETUA_DEPARTEMEN),
  controller.getAllRequests
);

router.get(
  '/pending-count',
  authGuard,
  requireRole(ROLES.KETUA_DEPARTEMEN),
  controller.getPendingCount
);

// Lecturer routes - HARUS sebelum /:id routes
router.get(
  '/thesis/:thesisId/pending',
  authGuard,
  controller.getPendingRequestForThesis
);

router.get(
  '/lecturer/pending',
  authGuard,
  controller.getPendingRequestsForLecturer
);

router.get(
  '/:id',
  authGuard,
  requireRole(ROLES.KETUA_DEPARTEMEN, ROLES.MAHASISWA),
  controller.getRequestById
);

router.post(
  '/:id/approve',
  authGuard,
  requireRole(ROLES.KETUA_DEPARTEMEN),
  validate(validator.reviewRequestSchema),
  controller.approveRequest
);

router.post(
  '/:id/reject',
  authGuard,
  requireRole(ROLES.KETUA_DEPARTEMEN),
  validate(validator.rejectRequestSchema),
  controller.rejectRequest
);

router.post(
  '/:id/review',
  authGuard,
  validate(validator.lecturerReviewSchema),
  controller.reviewRequestByLecturer
);

export default router;
