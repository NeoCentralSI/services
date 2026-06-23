import {
  getAttendanceEligibilityForThesis,
  getLatestMetopenAttendanceImport,
  uploadMetopenAttendance,
  previewMetopenAttendance,
} from "../services/metopenAttendance.service.js";

/**
 * POST /assessment/metopen/attendance/preview
 * F-4.2: pratinjau dampak auto-zero (PERMANEN) sebelum commit. Tidak menulis DB.
 */
export async function previewAttendance(req, res, next) {
  try {
    const data = await previewMetopenAttendance(req.file);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function uploadAttendance(req, res, next) {
  try {
    const data = await uploadMetopenAttendance(req.file, req.user.sub, req.body ?? {});
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getLatestAttendanceImport(req, res, next) {
  try {
    const data = await getLatestMetopenAttendanceImport();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getAttendanceEligibility(req, res, next) {
  try {
    const data = await getAttendanceEligibilityForThesis(req.params.thesisId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
