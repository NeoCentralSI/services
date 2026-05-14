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

/** PUT /supervision-quota/default/:academicYearId */
export async function setDefaultQuota(req, res, next) {
  try {
    const { academicYearId } = req.params;
    const body = req.validated ?? req.body ?? {};
    const result = await service.setDefaultQuota(academicYearId, body);
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

/** PATCH /supervision-quota/lecturers/:lecturerId/:academicYearId */
export async function updateLecturerQuota(req, res, next) {
  try {
    const { lecturerId, academicYearId } = req.params;
    const body = req.validated ?? req.body ?? {};
    const data = await service.updateLecturerQuota(lecturerId, academicYearId, body);
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
