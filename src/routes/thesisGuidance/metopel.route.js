import express from "express";
import { authGuard, requireAnyRole, requireRole } from "../../middlewares/auth.middleware.js";
import { ROLES, LECTURER_ROLES } from "../../constants/roles.js";
import { uploadThesisFile, uploadGuideFile } from "../../middlewares/file.middleware.js";
import * as proposalService from "../../services/thesisGuidance/proposal.service.js";
import * as informalLogService from "../../services/thesisGuidance/informalLog.service.js";
import * as supervisor2Service from "../../services/thesisGuidance/supervisor2.service.js";

/**
 * Non-guidance endpoints that historically lived under /thesisGuidance.
 *
 * Guidance revival: the guidance router was restored to the baseline
 * (student/lecturer/public/monitoring sub-routers). These Metopel/Proposal and
 * KaDep Pembimbing 2 endpoints are still consumed by the active app, so they are
 * kept here with unchanged paths and handlers instead of being mixed into the
 * formal TA guidance flow. They are candidates for the Proposal/Metopen rebuild.
 */
const router = express.Router();

// Student proposal versioning (Metopel)
router.post("/student/proposal/upload", authGuard, requireAnyRole([ROLES.MAHASISWA]), uploadThesisFile, async (req, res, next) => {
  try {
    const result = await proposalService.uploadProposalVersion(req.user.sub, req.file, req.body.description);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.get("/student/proposal/versions", authGuard, requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const result = await proposalService.getProposalVersions(req.user.sub);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

router.get("/student/proposal/status", authGuard, requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const result = await proposalService.getProposalSubmissionStatus(req.user.sub);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post("/student/proposal/submit-final", authGuard, requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const result = await proposalService.submitFinalProposal(req.user.sub);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// Metopen-only: catatan bimbingan informal (mahasiswa, tanpa workflow dosen)
router.get("/student/metopen/informal-logs", authGuard, requireAnyRole([ROLES.MAHASISWA]), async (req, res, next) => {
  try {
    const result = await informalLogService.listInformalLogsForStudent(req.user.sub);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

router.post("/student/metopen/informal-logs", authGuard, requireAnyRole([ROLES.MAHASISWA]), (req, res, next) => {
  const ct = req.get("content-type") || "";
  if (ct.includes("multipart/form-data")) {
    return uploadGuideFile(req, res, next);
  }
  return next();
}, async (req, res, next) => {
  try {
    const result = await informalLogService.createInformalLogForStudent(req.user.sub, { content: req.body.content }, req.file);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// Lecturer read-only views of a student's proposal versions and informal logs
router.get("/lecturer/students/:thesisId/proposal/versions", authGuard, requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const result = await proposalService.getProposalVersionsForLecturer(req.user.sub, req.params.thesisId);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// FR-LOG-08: P1/P2 aktif read-only catatan informal Metopel (tanpa bypass Koordinator)
router.get("/lecturer/students/:thesisId/metopen/informal-logs", authGuard, requireAnyRole(LECTURER_ROLES), async (req, res, next) => {
  try {
    const result = await informalLogService.listInformalLogsForLecturer(req.user.sub, req.params.thesisId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// Persetujuan akhir Pembimbing 2 oleh KaDep (alur aktif dipertahankan, lihat GUIDANCE_REVIVAL_PLAN e2)
router.get("/kadep/supervisor2-requests", authGuard, requireRole(ROLES.KETUA_DEPARTEMEN), async (req, res, next) => {
  try {
    const data = await supervisor2Service.getSupervisor2KadepQueueService(req.user.sub);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post("/kadep/supervisor2-requests/:id/approve", authGuard, requireRole(ROLES.KETUA_DEPARTEMEN), async (req, res, next) => {
  try {
    const data = await supervisor2Service.decideSupervisor2ByKadepService(req.user.sub, req.params.id, { approve: true });
    res.json({ success: true, data, message: "Pembimbing 2 disetujui. Perbarui Formulir TA-04 batch periode jika sudah pernah difinalisasi." });
  } catch (err) { next(err); }
});

router.post("/kadep/supervisor2-requests/:id/reject", authGuard, requireRole(ROLES.KETUA_DEPARTEMEN), async (req, res, next) => {
  try {
    const data = await supervisor2Service.decideSupervisor2ByKadepService(req.user.sub, req.params.id, { approve: false, reason: req.body.reason });
    res.json({ success: true, data, message: "Permintaan Pembimbing 2 tidak disetujui." });
  } catch (err) { next(err); }
});

export default router;
