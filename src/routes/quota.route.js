import express from "express";
import { authGuard, requireAnyRole } from "../middlewares/auth.middleware.js";
import { ROLES } from "../constants/roles.js";
import {
  browseLecturerQuotas,
  getLecturerQuotaDetail,
  checkLecturerQuota,
  getScienceGroups,
  getTopics,
  getDefaultQuotaConfig,
  setDefaultQuotaConfig,
  setLecturerQuotaConfig,
  deleteLecturerQuotaConfig,
  getAcceptingLecturers,
  getQuotaMonitoring,
} from "../services/quota.service.js";

const router = express.Router();
router.use(authGuard);

const ADMIN_ROLES = [ROLES.ADMIN];
const MANAGEMENT_ROLES = [ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.ADMIN];
const ALL_AUTHENTICATED = null; // no role restriction — just auth

// ============================================
// Browse & Check
// ============================================

/**
 * GET /quota/browse
 * Browse all lecturers with their quota traffic-light status.
 */
router.get("/browse", async (req, res, next) => {
  try {
    const data = await browseLecturerQuotas(req.query.academicYearId || null);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /quota/browse/:lecturerId
 * Get quota detail for a specific lecturer.
 */
router.get("/browse/:lecturerId", async (req, res, next) => {
  try {
    const data = await getLecturerQuotaDetail(req.params.lecturerId, req.query.academicYearId || null);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /quota/check/:lecturerId
 * Quick traffic-light check for a specific lecturer.
 */
router.get("/check/:lecturerId", async (req, res, next) => {
  try {
    const data = await checkLecturerQuota(req.params.lecturerId, req.query.academicYearId || null);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ============================================
// Filter Helpers
// ============================================

/**
 * GET /quota/science-groups
 * List all science groups (KBK) for catalog filtering.
 */
router.get("/science-groups", async (req, res, next) => {
  try {
    const data = await getScienceGroups();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /quota/topics
 * List all thesis topics for catalog filtering.
 */
router.get("/topics", async (req, res, next) => {
  try {
    const data = await getTopics();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /quota/accepting-requests
 * List lecturers currently accepting advisor requests.
 */
router.get("/accepting-requests", async (req, res, next) => {
  try {
    const data = await getAcceptingLecturers();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ============================================
// Default Quota Config (Admin)
// ============================================

/**
 * GET /quota/config/default
 * Get global default quota config for the current academic year.
 */
router.get(
  "/config/default",
  requireAnyRole(MANAGEMENT_ROLES),
  async (req, res, next) => {
    try {
      const data = await getDefaultQuotaConfig(req.query.academicYearId || null);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /quota/config/default
 * Set/update the global default quota config.
 */
router.put(
  "/config/default",
  requireAnyRole(ADMIN_ROLES),
  async (req, res, next) => {
    try {
      const { academicYearId, quotaMax, quotaSoftLimit } = req.body;
      const data = await setDefaultQuotaConfig(academicYearId, { quotaMax, quotaSoftLimit });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================
// Per-Lecturer Quota Config (Admin)
// ============================================

/**
 * PUT /quota/config/lecturer/:lecturerId
 * Set/update quota for a specific lecturer.
 */
router.put(
  "/config/lecturer/:lecturerId",
  requireAnyRole(ADMIN_ROLES),
  async (req, res, next) => {
    try {
      const { academicYearId, quotaMax, quotaSoftLimit } = req.body;
      const data = await setLecturerQuotaConfig(req.params.lecturerId, academicYearId, { quotaMax, quotaSoftLimit });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /quota/config/lecturer/:quotaId
 * Delete a per-lecturer quota config record.
 */
router.delete(
  "/config/lecturer/:quotaId",
  requireAnyRole(ADMIN_ROLES),
  async (req, res, next) => {
    try {
      await deleteLecturerQuotaConfig(req.params.quotaId);
      res.json({ success: true, message: "Konfigurasi kuota dosen dihapus" });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================
// Monitoring (KaDep / Admin)
// ============================================

/**
 * GET /quota/monitoring
 * Quota monitoring summary for all lecturers in an academic year.
 */
router.get(
  "/monitoring",
  requireAnyRole(MANAGEMENT_ROLES),
  async (req, res, next) => {
    try {
      const data = await getQuotaMonitoring(req.query.academicYearId || null);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
