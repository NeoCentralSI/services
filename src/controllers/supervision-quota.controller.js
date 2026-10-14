import * as service from "../services/thesis-proposal/supervision-quota.service.js";

const ok = (res, data, message = undefined) => res.json({ success: true, ...(message ? { message } : {}), data });
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

/** GET /supervision-quotas[?academicYearId=] — limits and every lecturer's load */
export const getOverview = handle(async (req, res) => {
  const academicYearId = typeof req.query.academicYearId === "string" && req.query.academicYearId ? req.query.academicYearId : null;
  ok(res, await service.getLoadOverview(academicYearId));
});
/** PUT /supervision-quotas/general */
export const setGeneral = handle(async (req, res) =>
  ok(res, await service.setGeneralLimits(req.validated, req.user.sub), "Batas bimbingan umum disimpan"));
/** PUT /supervision-quotas/periods/:academicYearId */
export const setPeriod = handle(async (req, res) =>
  ok(res, await service.setPeriodLimits(req.params.academicYearId, req.validated, req.user.sub), "Batas bimbingan periode disimpan"));
/** DELETE /supervision-quotas/periods/:academicYearId */
export const clearPeriod = handle(async (req, res) =>
  ok(res, await service.clearPeriodLimits(req.params.academicYearId, req.user.sub), "Batas periode dihapus; batas umum berlaku"));
/** GET /supervision-quotas/me — the lecturer's own load */
export const getMine = handle(async (req, res) => {
  const overview = await service.getLoadOverview();
  ok(res, { ...overview, lecturers: undefined, me: overview.lecturers.find((l) => l.lecturerId === req.user.sub) ?? null });
});
/** PATCH /supervision-quotas/me/accepting-requests */
export const setAcceptingRequests = handle(async (req, res) => {
  const data = await service.setAcceptingRequests(req.user.sub, req.validated.acceptingRequests);
  ok(res, data, data.acceptingRequests ? "Anda kembali menerima pengajuan pembimbing" : "Anda tidak menerima pengajuan pembimbing baru");
});
