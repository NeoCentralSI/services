import fs from "fs/promises";
import path from "path";

import { ASSESSOR } from "../constants/research-method.js";
import * as assessments from "../services/research-method/assessment.service.js";
import * as attendance from "../services/research-method/attendance.service.js";
import * as exportsService from "../services/research-method/export.service.js";
import * as monitoring from "../services/research-method/monitoring.service.js";
import * as promotion from "../services/research-method/promotion.service.js";
import { NotFoundError } from "../utils/errors.js";

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
const ok = (res, data, message) => res.json({ success: true, ...(message ? { message } : {}), data });
const yearOf = (req) => (typeof req.query.academicYearId === "string" && req.query.academicYearId ? req.query.academicYearId : null);
const filesOf = (req) => [...(req.files?.file ?? []), ...(req.files?.files ?? [])];
const sendXlsx = (res, { buffer, fileName }) => {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
  res.send(buffer);
};

// ── Presensi ──────────────────────────────────────────────────────────────────────
export const getAttendance = handle(async (req, res) => ok(res, await attendance.getAttendanceOverview(yearOf(req))));
export const previewAttendance = handle(async (req, res) => ok(res, await attendance.previewAttendance(filesOf(req), req.body?.academicYearId)));
export const uploadAttendance = handle(async (req, res) => {
  const data = await attendance.uploadAttendance(filesOf(req), req.body?.academicYearId, req.user.sub);
  ok(res, data, "Presensi diunggah");
});
export const getAttendanceFile = handle(async (req, res) => {
  const file = await attendance.getSourceFile(req.params.id, req.params.index);
  const buffer = await fs.readFile(path.resolve(process.cwd(), file.filePath)).catch(() => {
    throw new NotFoundError("Berkas presensi tidak ditemukan di server.");
  });
  res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file.originalName || "presensi.xlsx")}"`);
  res.send(buffer);
});

// ── Penilaian Proposal ────────────────────────────────────────────────────────────
export const getForm = handle(async (req, res) => ok(res, await assessments.getAssessmentForm(req.query.party, yearOf(req))));
export const getSupervisorQueue = handle(async (req, res) => ok(res, await assessments.getSupervisorQueue(req.user.sub, yearOf(req))));
export const getCoordinatorQueue = handle(async (req, res) => ok(res, await assessments.getCoordinatorQueue(yearOf(req))));
export const getAssessment = handle(async (req, res) => ok(res, await assessments.getAttemptForUser(req.params.id, req.user.sub, req.userRoles ?? [])));
export const submitSupervisorScore = handle(async (req, res) =>
  ok(res, await assessments.submitScore(req.params.id, ASSESSOR.SUPERVISOR, req.user.sub, req.validated.scores), "Nilai pembimbing dikirim"));
export const submitCoordinatorScore = handle(async (req, res) =>
  ok(res, await assessments.submitScore(req.params.id, ASSESSOR.COORDINATOR, req.user.sub, req.validated.scores), "Nilai koordinator dikirim"));
export const setMinimumScore = handle(async (req, res) =>
  ok(res, await assessments.setMinimumScore(req.params.id, req.validated.minimumScore, req.user.sub), "Nilai minimum lulus disimpan"));

// ── Kelulusan, ekspor, monitoring ─────────────────────────────────────────────────
export const previewPromotion = handle(async (_req, res) => ok(res, await promotion.previewPromotion()));
export const runPromotion = handle(async (req, res) => ok(res, await promotion.runPromotion({ actorUserId: req.user.sub }), "Proses kelulusan dijalankan"));
export const exportScores = handle(async (req, res) => sendXlsx(res, await exportsService.exportScoreRecap(yearOf(req))));
export const exportPassedTitles = handle(async (req, res) => sendXlsx(res, await exportsService.exportPassedTitles(yearOf(req))));
export const getMonitoring = handle(async (req, res) => ok(res, await monitoring.getClassMonitoring(yearOf(req))));
