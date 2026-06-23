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
 * 4 kategori: substansi TA-01/02, detail rubrik TA-03A & TA-03B, Formulir TA-04.
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
 * GET /metopen/me/assessment-history
 * Read-only detail TA-03 untuk mahasiswa sejak penilaian tersedia, termasuk
 * fase menunggu TA-04. Setelah TA-04, payload sama dengan arsip.
 */
export async function getMyAssessmentHistory(req, res, next) {
  try {
    const data = await service.getStudentAssessmentHistory(req.user.sub);
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

/**
 * GET /metopen/kadep/title-reports/missing-document?academicYearId=
 * Legacy compatibility: thesis accepted yang belum terhubung ke Formulir TA-04 batch resmi.
 */
export async function getKadepMissingTitleDocuments(req, res, next) {
  try {
    const academicYearId = req.query.academicYearId
      ? String(req.query.academicYearId)
      : undefined;
    const data = await service.getAcceptedThesesMissingApprovalDocument({ academicYearId });
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /metopen/kadep/title-reports/history?academicYearId=
 * Riwayat keputusan TA-04 (accepted/rejected) antar-periode untuk dashboard KaDep.
 */
export async function getKadepTitleReportHistory(req, res, next) {
  try {
    const academicYearId = req.query.academicYearId
      ? String(req.query.academicYearId)
      : undefined;
    const data = await service.getKadepTitleReportHistory({ academicYearId });
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /metopen/me/archive/title-approval-document
 * FR-ARC-05: Mahasiswa mengunduh Formulir TA-04 PDF miliknya.
 * Stream PDF dengan Content-Disposition attachment.
 */
export async function getMyTitleApprovalDocument(req, res, next) {
  try {
    const { absolutePath, fileName } = await service.getTitleApprovalDocumentForStudent(req.user.sub);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    res.sendFile(absolutePath, (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /metopen/kadep/thesis/:thesisId/title-report/document
 * KaDep mengunduh Formulir TA-04 PDF untuk thesis yang sudah terhubung ke batch.
 */
export async function getKadepTitleApprovalDocument(req, res, next) {
  try {
    const { thesisId } = req.params;
    const { absolutePath, fileName } = await service.getTitleApprovalDocumentForKadep(thesisId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(fileName)}"`,
    );
    res.sendFile(absolutePath, (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /metopen/kadep/thesis/:thesisId/title-report/regenerate
 * Legacy compatibility: endpoint per-thesis tidak lagi menerbitkan dokumen resmi.
 */
export async function postKadepRegenerateTitleReport(req, res, next) {
  try {
    const { thesisId } = req.params;
    const data = await service.regenerateTitleApprovalLetter(thesisId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /metopen/thesis/:thesisId/revision-after-kadep/submit
 * Mahasiswa menandai revisi proposal telah selesai sesuai catatan KaDep.
 */
export async function postSubmitRevisionAfterKadep(req, res, next) {
  try {
    const { thesisId } = req.params;
    const data = await service.submitRevisionAfterKadepReject(thesisId, req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /metopen/thesis/:thesisId/revision-after-kadep/approve
 * Pembimbing menelaah dan menyetujui revisi pasca-KaDep reject → re-queue ke KaDep.
 */
export async function postApproveRevisionAfterKadep(req, res, next) {
  try {
    const { thesisId } = req.params;
    const body = req.validated ?? req.body ?? {};
    const data = await service.approveRevisionAfterKadepReject(
      thesisId,
      req.user.sub,
      body.notes ?? null,
    );
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
