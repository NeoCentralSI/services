/**
 * DEV TOOLS ROUTES — Seminar Hasil, Sidang TA and Yudisium.
 * ⚠️ DELETE THIS FILE together with devtools.route.js and services/devtools/.
 *
 * Mounted inside devtools.route.js, behind its guard: Admin only, and only outside production
 * unless ENABLE_DEVTOOLS is on. It sits in a subfolder on purpose: app.js mounts every
 * `routes/*.route.js` by itself, which would expose these routes without the guard.
 */
import express from "express";

import * as finalStages from "../../services/devtools/devtools-final-stages.service.js";
import * as yudisium from "../../services/devtools/devtools-yudisium.service.js";

const router = express.Router();

const actorOf = (req) => req.user?.sub ?? req.user?.id ?? null;
const handle = (fn) => async (req, res, next) => {
  try {
    const { data, message } = await fn(req);
    res.json({ success: true, data, ...(message ? { message } : {}) });
  } catch (err) {
    next(err);
  }
};

// ─── Seminar Hasil and Sidang TA ───────────────────────────────────────────────────────────

router.get("/final-stages/:studentId", handle(async (req) => ({ data: await finalStages.getFinalStagesOverview(req.params.studentId) })));

// body: { target, mode: "change" | "create" | "delete" | "approve-revisions" }
router.post("/final-stages/:studentId/:kind/preview", handle(async (req) => {
  const { kind, studentId } = req.params;
  const { target, mode = "change" } = req.body ?? {};
  finalStages.kindConfig(kind);
  if (mode === "delete") return { data: await finalStages.previewDeleteEvent({ kind, studentId }) };
  if (mode === "approve-revisions") return { data: await finalStages.previewApproveRevisions({ kind, studentId }) };
  return { data: await finalStages.previewEventStatus({ kind, studentId, target, mode }) };
}));

router.post("/final-stages/:studentId/:kind/status", handle(async (req) => {
  const { kind, studentId } = req.params;
  const { target, mode = "change" } = req.body ?? {};
  finalStages.kindConfig(kind);
  const data = await finalStages.applyEventStatus({ kind, studentId, target, mode, actorUserId: actorOf(req) });
  return { data, message: `Status diubah ke ${finalStages.EVENT_STATUS_LABELS[target]}` };
}));

router.post("/final-stages/:studentId/:kind/approve-revisions", handle(async (req) => {
  const { kind, studentId } = req.params;
  finalStages.kindConfig(kind);
  return { data: await finalStages.approveAllRevisions({ kind, studentId, actorUserId: actorOf(req) }), message: "Semua revisi disetujui dan difinalkan" };
}));

router.delete("/final-stages/:studentId/:kind", handle(async (req) => {
  const { kind, studentId } = req.params;
  finalStages.kindConfig(kind);
  const data = await finalStages.deleteEvent({ kind, studentId, actorUserId: actorOf(req) });
  return { data, message: kind === "seminar" ? "Seminar dihapus" : "Sidang dihapus" };
}));

// body: { date, startTime, endTime } or { preset: "now" | "past" | "tomorrow" }
router.patch("/final-stages/:kind/:eventId/schedule", handle(async (req) => {
  const { kind, eventId } = req.params;
  finalStages.kindConfig(kind);
  return { data: await finalStages.updateEventSchedule({ kind, eventId, body: req.body, actorUserId: actorOf(req) }), message: "Jadwal diubah" };
}));

// ─── Yudisium ──────────────────────────────────────────────────────────────────────────────

router.get("/yudisium/periods", handle(async () => ({ data: await yudisium.listPeriods() })));

router.patch("/yudisium/periods/:yudisiumId", handle(async (req) => ({
  data: await yudisium.updatePeriodDates({ yudisiumId: req.params.yudisiumId, body: req.body, actorUserId: actorOf(req) }),
  message: "Tanggal periode diubah",
})));

router.get("/yudisium/students/:studentId", handle(async (req) => ({ data: await yudisium.getStudentYudisium(req.params.studentId) })));

router.post("/yudisium/students/:studentId/register/preview", handle(async (req) => ({
  data: await yudisium.previewRegister({ studentId: req.params.studentId, yudisiumId: req.body?.yudisiumId }),
})));

router.post("/yudisium/students/:studentId/register", handle(async (req) => ({
  data: await yudisium.registerParticipant({ studentId: req.params.studentId, yudisiumId: req.body?.yudisiumId, actorUserId: actorOf(req) }),
  message: "Mahasiswa didaftarkan ke periode yudisium",
})));

router.post("/yudisium/participants/:participantId/remove/preview", handle(async (req) => ({
  data: await yudisium.previewRemoveParticipant({ participantId: req.params.participantId }),
})));

router.delete("/yudisium/participants/:participantId", handle(async (req) => ({
  data: await yudisium.removeParticipant({ participantId: req.params.participantId, actorUserId: actorOf(req) }),
  message: "Mahasiswa dihapus dari periode yudisium",
})));

router.post("/yudisium/participants/:participantId/status/preview", handle(async (req) => ({
  data: await yudisium.previewParticipantStatus({ participantId: req.params.participantId, target: req.body?.target }),
})));

router.post("/yudisium/participants/:participantId/status", handle(async (req) => ({
  data: await yudisium.applyParticipantStatus({ participantId: req.params.participantId, target: req.body?.target, actorUserId: actorOf(req) }),
  message: `Status peserta diubah ke ${yudisium.PARTICIPANT_STATUS_LABELS[req.body?.target] ?? "-"}`,
})));

// body: { action: "approve" | "decline", itemId? } — without itemId: every item
router.post("/yudisium/participants/:participantId/requirements", handle(async (req) => ({
  data: await yudisium.setRequirementItems({ participantId: req.params.participantId, itemId: req.body?.itemId ?? null, action: req.body?.action, actorUserId: actorOf(req) }),
  message: "Item persyaratan diperbarui",
})));

// body: { action: "fill" | "clear" }
router.post("/yudisium/participants/:participantId/exit-survey", handle(async (req) => ({
  data: await yudisium.setExitSurvey({ participantId: req.params.participantId, action: req.body?.action, actorUserId: actorOf(req) }),
  message: req.body?.action === "clear" ? "Exit survey dikosongkan" : "Exit survey diisi",
})));

router.patch("/yudisium/students/:studentId/cpl/:cplId", handle(async (req) => ({
  data: await yudisium.setCplScore({ studentId: req.params.studentId, cplId: req.params.cplId, score: req.body?.score, actorUserId: actorOf(req) }),
  message: "Nilai CPL diubah",
})));

router.post("/yudisium/students/:studentId/cpl/all-pass", handle(async (req) => ({
  data: await yudisium.setAllCplPassing({ studentId: req.params.studentId, actorUserId: actorOf(req) }),
  message: "Semua CPL memenuhi nilai minimal",
})));

router.post("/yudisium/students/:studentId/cpl/one-fail", handle(async (req) => ({
  data: await yudisium.setOneCplFailing({ studentId: req.params.studentId, actorUserId: actorOf(req) }),
  message: "Satu CPL dibuat tidak memenuhi",
})));

// body: { action: "create" | "resolve" | "delete" }
router.post("/yudisium/students/:studentId/cpl/:cplId/recommendation", handle(async (req) => ({
  data: await yudisium.setCplRecommendation({ studentId: req.params.studentId, cplId: req.params.cplId, action: req.body?.action, actorUserId: actorOf(req) }),
  message: "Rekomendasi CPL diperbarui",
})));

export default router;
