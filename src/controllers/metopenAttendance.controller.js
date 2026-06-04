import {
  getAttendanceEligibilityForThesis,
  getLatestMetopenAttendanceImport,
  uploadMetopenAttendance,
} from "../services/metopenAttendance.service.js";

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
