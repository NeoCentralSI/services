import * as service from "../services/metopen.service.js";

/**
 * GET /metopen/progress/:thesisId
 */
export async function getProgressByThesisId(req, res, next) {
  try {
    const { thesisId } = req.params;
    const data = await service.getProgressWithAccess(thesisId, req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /metopen/eligibility
 * Akses permukaan Metode Penelitian/proposal + flag read-only pasca-pengesahan proposal.
 * Mahasiswa: data nyata. User lain: nilai aman (tanpa akses) — dipakai guard sisi klien.
 */
export async function getEligibility(req, res, next) {
  try {
    const data = await service.checkEligibility(req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /metopen/me/proposal-approval
 * Baca status pengesahan judul — tanpa side effect DB (selain read).
 */
export async function getMyProposalApproval(req, res, next) {
  try {
    const data = await service.getStudentProposalApprovalStatus(req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /metopen/me/archive
 * BR-23 (canon §5.13): Detail arsip Metopel mahasiswa pasca TA-04. Read-only.
 * 4 kategori: substansi TA-01/02, detail rubrik TA-03A & TA-03B, dokumen SK TA-04.
 */
export async function getMyArchive(req, res, next) {
  try {
    const data = await service.getStudentArchiveDetail(req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /metopen/me/seminar-eligibility
 * Snapshot FR-SYS-01 tanpa sync antre KaDep (REST-safe).
 */
export async function getMySeminarEligibility(req, res, next) {
  try {
    const data = await service.getSeminarEligibilitySnapshot(req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /metopen/me/proposal-queue/sync
 * Jalankan sync antre KaDep + kembalikan ringkasan (disarankan dipanggil setelah nilai TA-03 / ACC tugas).
 */
export async function postMyProposalQueueSync(req, res, next) {
  try {
    const data = await service.syncProposalQueueAndSummarizeForStudent(req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /metopen/kadep/title-reports/pending?academicYearId=
 */
export async function getKadepPendingTitleReports(req, res, next) {
  try {
    const academicYearId = req.query.academicYearId
      ? String(req.query.academicYearId)
      : undefined;
    const data = await service.getPendingTitleReports({ academicYearId });
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /metopen/kadep/thesis/:thesisId/title-report/review
 */
export async function postKadepTitleReportReview(req, res, next) {
  try {
    const { thesisId } = req.params;
    const body = req.validated ?? req.body ?? {};
    const data = await service.reviewTitleReport(
      thesisId,
      body.action,
      body.notes ?? null,
      req.user.sub,
    );
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
