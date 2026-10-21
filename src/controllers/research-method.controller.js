import { ASSESSOR } from "../constants/research-method.js";
import * as assessments from "../services/research-method/assessment.service.js";
import * as exportsService from "../services/research-method/export.service.js";
import * as monitoring from "../services/research-method/monitoring.service.js";

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    next(error);
  }
};
const ok = (res, data, message) => res.json({ success: true, ...(message ? { message } : {}), data });
const yearOf = (req) => (typeof req.query.academicYearId === "string" && req.query.academicYearId ? req.query.academicYearId : null);
const sendXlsx = (res, { buffer, fileName }) => {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
  res.send(buffer);
};

const submitted = (party, isDraft) => (isDraft
  ? "Draf penilaian disimpan"
  : `Nilai ${party === ASSESSOR.SUPERVISOR ? "pembimbing" : "koordinator"} dikirim`);

// ── Penilaian Proposal ────────────────────────────────────────────────────────────
export const getForm = handle(async (req, res) => ok(res, await assessments.getAssessmentForm(req.query.party, yearOf(req))));
export const getSupervisorQueue = handle(async (req, res) => ok(res, await assessments.getSupervisorQueue(req.user.sub, yearOf(req))));
export const getCoordinatorQueue = handle(async (req, res) => ok(res, await assessments.getCoordinatorQueue(yearOf(req))));
export const getAssessment = handle(async (req, res) => ok(res, await assessments.getAttemptForUser(req.params.id, req.user.sub, req.userRoles ?? [])));
export const getSupervisorScoreForm = handle(async (req, res) =>
  ok(res, await assessments.getScoreForm(req.params.id, ASSESSOR.SUPERVISOR, req.user.sub)));
export const getCoordinatorScoreForm = handle(async (req, res) =>
  ok(res, await assessments.getScoreForm(req.params.id, ASSESSOR.COORDINATOR, req.user.sub)));
export const submitSupervisorScore = handle(async (req, res) => {
  const { scores, isDraft = false } = req.validated;
  ok(res, await assessments.submitScore(req.params.id, ASSESSOR.SUPERVISOR, req.user.sub, scores, { isDraft }), submitted(ASSESSOR.SUPERVISOR, isDraft));
});
export const submitCoordinatorScore = handle(async (req, res) => {
  const { scores, isDraft = false } = req.validated;
  ok(res, await assessments.submitScore(req.params.id, ASSESSOR.COORDINATOR, req.user.sub, scores, { isDraft }), submitted(ASSESSOR.COORDINATOR, isDraft));
});
export const setMinimumScore = handle(async (req, res) =>
  ok(res, await assessments.setMinimumScore(req.params.id, req.validated.minimumScore, req.user.sub), "Nilai minimum lulus disimpan"));

// ── Exports and monitoring ────────────────────────────────────────────────────────
export const exportScores = handle(async (req, res) => sendXlsx(res, await exportsService.exportScoreRecap(yearOf(req))));
export const exportPassedTitles = handle(async (req, res) => sendXlsx(res, await exportsService.exportPassedTitles(yearOf(req))));
export const getMonitoring = handle(async (req, res) => ok(res, await monitoring.getClassMonitoring(yearOf(req))));
