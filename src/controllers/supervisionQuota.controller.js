import * as service from "../services/supervisionQuota.service.js";

/** GET /supervision-quota/default/:academicYearId */
export async function getDefaultQuota(req, res, next) {
  try {
    const { academicYearId } = req.params;
    const data = await service.getDefaultQuota(academicYearId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

function auditActor(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  const ip = (typeof forwarded === "string" ? forwarded.split(",")[0] : null) || req.ip || null;
  return {
    actorUserId: req.user?.sub ?? null,
    ipAddress: ip ? String(ip).slice(0, 45) : null,
    userAgent: req.get?.("user-agent") ?? req.headers?.["user-agent"] ?? null,
  };
}

/** PUT /supervision-quota/default/:academicYearId */
export async function setDefaultQuota(req, res, next) {
  try {
    const { academicYearId } = req.params;
    const body = req.validated ?? req.body ?? {};
    const result = await service.setDefaultQuota(academicYearId, body, auditActor(req));
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

/** GET /supervision-quota/lecturers/:academicYearId */
export async function getLecturerQuotas(req, res, next) {
  try {
    const { academicYearId } = req.params;
    const search = req.query.search;
    const data = await service.getLecturerQuotas(academicYearId, search);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** GET /supervision-quota/lecturers/:lecturerId/:academicYearId */
export async function getLecturerQuotaDetail(req, res, next) {
  try {
    const { lecturerId, academicYearId } = req.params;
    const data = await service.getLecturerQuotaDetail(lecturerId, academicYearId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** PATCH /supervision-quota/lecturers/:lecturerId/:academicYearId */
export async function updateLecturerQuota(req, res, next) {
  try {
    const { lecturerId, academicYearId } = req.params;
    const body = req.validated ?? req.body ?? {};
    const data = await service.updateLecturerQuota(lecturerId, academicYearId, body, auditActor(req));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/** POST /supervision-quota/recalculate/:academicYearId */
export async function recalculateQuotas(req, res, next) {
  try {
    const { academicYearId } = req.params;
    const data = await service.recalculateAllQuotas(academicYearId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
