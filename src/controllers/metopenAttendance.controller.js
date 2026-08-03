import {
  getAttendanceEligibilityForThesis,
  getLatestMetopenAttendanceImport,
  uploadMetopenAttendance,
  previewMetopenAttendance,
} from "../services/metopenAttendance.service.js";

/**
 * Collect multipart Excel files from legacy `file` and/or `files` fields.
 */
function collectAttendanceFiles(req) {
  const collected = [];

  if (req.files?.files) {
    const filesField = Array.isArray(req.files.files) ? req.files.files : [req.files.files];
    collected.push(...filesField);
  }
  if (req.files?.file) {
    const fileField = Array.isArray(req.files.file) ? req.files.file : [req.files.file];
    collected.push(...fileField);
  }
  if (req.file) {
    collected.push(req.file);
  }

  return collected;
}

/**
 * POST /assessment/metopen/attendance/preview
 * F-4.2: pratinjau dampak auto-zero (PERMANEN) sebelum commit. Tidak menulis DB.
 * Accepts 1–2 xlsx via `files` and/or legacy single `file`.
 */
export async function previewAttendance(req, res, next) {
  try {
    const data = await previewMetopenAttendance(
      collectAttendanceFiles(req),
      req.body?.academicYearId,
    );
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function uploadAttendance(req, res, next) {
  try {
    const data = await uploadMetopenAttendance(
      collectAttendanceFiles(req),
      req.user.sub,
      req.body ?? {},
    );
    res.status(201).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getLatestAttendanceImport(req, res, next) {
  try {
    const data = await getLatestMetopenAttendanceImport(req.query?.academicYearId);
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
