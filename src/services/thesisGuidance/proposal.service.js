import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { BadRequestError, NotFoundError, ForbiddenError } from "../../utils/errors.js";
import {
  getStudentByUserId,
  getActiveThesisForStudent,
} from "../../repositories/thesisGuidance/student.guidance.repository.js";
import * as proposalRepo from "../../repositories/thesisGuidance/proposal.repository.js";
import {
  assertTa04GuidanceAuthorized,
  getTa04GuidanceAuthorization,
} from "../ta04Authorization.service.js";
import { reconcileAttendanceForThesis } from "../metopenAttendance.service.js";

function sanitizePdfFileName(originalName) {
  const base = path.basename(String(originalName || "proposal.pdf"));
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe}.pdf`;
}

function assertPdfBuffer(file) {
  const header = file?.buffer?.subarray?.(0, 5)?.toString("utf8");
  if (header !== "%PDF-") {
    throw new BadRequestError("File proposal harus berupa PDF valid");
  }
}

async function unlinkIfExists(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function mapProposalVersion(versionRow) {
  return {
    id: versionRow.id,
    version: versionRow.version,
    isLatest: versionRow.isLatest,
    fileName: versionRow.document?.fileName ?? null,
    fileSize: versionRow.document?.fileSize ?? null,
    mimeType: versionRow.document?.mimeType ?? null,
    description: versionRow.description ?? null,
    submittedAsFinalAt: versionRow.submittedAsFinalAt ?? null,
    createdAt: versionRow.createdAt,
    url: versionRow.document?.filePath ? `/${versionRow.document.filePath}` : null,
  };
}

function isScoreProgressStarted(scoreProgress) {
  return Boolean(
    scoreProgress &&
      (scoreProgress.isFinalized ||
        scoreProgress.supervisorScore != null ||
        scoreProgress.lecturerScore != null)
  );
}

function getUploadLockedReason({ isAccepted, scoreProgress }) {
  if (isAccepted) {
    return "Mahasiswa sudah promosi ke beban aktif Tugas Akhir.";
  }

  if (scoreProgress?.isFinalized) {
    return "Penilaian TA-03 sudah final. Proposal final dikunci permanen dan tidak dapat diganti.";
  }

  if (isScoreProgressStarted(scoreProgress)) {
    return "Penilaian TA-03 sedang berlangsung.";
  }

  return null;
}

async function getStudentAndThesis(userId) {
  const student = await getStudentByUserId(userId);
  if (!student) throw new NotFoundError("Data mahasiswa tidak ditemukan");

  const thesis = await getActiveThesisForStudent(student.id);
  if (!thesis) throw new NotFoundError("Tidak ada tugas akhir aktif");

  return { student, thesis };
}

export async function uploadProposalVersion(userId, file, description) {
  if (!file) throw new BadRequestError("File proposal (PDF) wajib diunggah");
  assertPdfBuffer(file);

  const { thesis } = await getStudentAndThesis(userId);

  if (thesis.proposalStatus === "accepted") {
    throw new BadRequestError(
      "Mahasiswa sudah promosi ke beban aktif Tugas Akhir. Tidak dapat mengunggah versi proposal Metopel baru."
    );
  }

  const scoreProgress = await proposalRepo.findResearchMethodScoreProgress(thesis.id);
  if (isScoreProgressStarted(scoreProgress)) {
    throw new BadRequestError(
      scoreProgress?.isFinalized
        ? "Penilaian TA-03 sudah final. Tidak dapat mengunggah versi proposal baru."
        : "Penilaian TA-03 sudah dimulai. Tidak dapat mengunggah versi proposal baru sampai siklus penilaian selesai/di-reset."
    );
  }

  const uploadsDir = path.join(process.cwd(), "uploads", "thesis", thesis.id, "proposal");
  await fs.mkdir(uploadsDir, { recursive: true });

  const uniqueId = randomUUID();
  const safeOriginal = sanitizePdfFileName(file.originalname);
  const diskName = `${uniqueId}-${safeOriginal}`;
  const relativeFilePath = `uploads/thesis/${thesis.id}/proposal/${diskName}`;
  const absolutePath = path.join(uploadsDir, diskName);

  await fs.writeFile(absolutePath, file.buffer, { flag: "wx" });
  let versionDoc;
  try {
    versionDoc = await proposalRepo.createProposalVersionWithDocument({
      thesisId: thesis.id,
      userId,
      filePath: relativeFilePath,
      fileName: safeOriginal,
      fileSize: file.size,
      mimeType: "application/pdf",
      description,
    });
  } catch (error) {
    await unlinkIfExists(absolutePath);
    throw error;
  }

  return {
    id: versionDoc.id,
    version: versionDoc.version,
    fileName: versionDoc.document.fileName,
    fileSize: versionDoc.document.fileSize,
    mimeType: versionDoc.document.mimeType,
    description: versionDoc.description,
    submittedAsFinalAt: versionDoc.submittedAsFinalAt ?? null,
    createdAt: versionDoc.createdAt,
    url: `/${relativeFilePath}`,
  };
}

export async function getProposalVersions(userId) {
  const { thesis } = await getStudentAndThesis(userId);
  const versions = await proposalRepo.getProposalVersions(thesis.id);

  return {
    thesisId: thesis.id,
    versions: versions.map(mapProposalVersion),
  };
}

export async function getProposalSubmissionStatus(userId) {
  const { thesis } = await getStudentAndThesis(userId);
  const [latestVersion, submissionStatus, supervisorCount, scoreProgress, guidanceAuthorization] = await Promise.all([
    proposalRepo.findLatestProposalVersion(thesis.id),
    proposalRepo.getProposalSubmissionStatus(thesis.id),
    proposalRepo.countActiveSupervisors(thesis.id),
    proposalRepo.findResearchMethodScoreProgress(thesis.id),
    getTa04GuidanceAuthorization(thesis.id),
  ]);

  const isAccepted = submissionStatus?.proposalStatus === "accepted";
  const isScoringStarted = isScoreProgressStarted(scoreProgress);
  const uploadLocked = isAccepted || isScoringStarted;
  const uploadLockedReason = getUploadLockedReason({ isAccepted, scoreProgress });

  return {
    thesisId: thesis.id,
    hasSupervisor: supervisorCount > 0,
    hasBookedSupervisor: guidanceAuthorization.hasBookedSupervisor,
    hasOfficialSupervisor: guidanceAuthorization.hasOfficialSupervisor,
    canSubmitFinalProposal: guidanceAuthorization.guidanceGateOpen && !isAccepted && !isScoringStarted,
    guidanceGateOpen: guidanceAuthorization.guidanceGateOpen,
    guidanceGateReason: guidanceAuthorization.guidanceGateReason,
    proposalStatus: submissionStatus?.proposalStatus ?? null,
    uploadLocked,
    uploadLockedReason,
    latestVersion: latestVersion ? mapProposalVersion(latestVersion) : null,
    finalProposalVersion: submissionStatus?.finalProposalVersion
      ? {
          id: submissionStatus.finalProposalVersion.id,
          version: submissionStatus.finalProposalVersion.version,
          submittedAsFinalAt: submissionStatus.finalProposalVersion.submittedAsFinalAt,
          fileName: submissionStatus.finalProposalVersion.document?.fileName ?? null,
          fileSize: submissionStatus.finalProposalVersion.document?.fileSize ?? null,
          mimeType: submissionStatus.finalProposalVersion.document?.mimeType ?? null,
          url: submissionStatus.finalProposalVersion.document?.filePath
            ? `/${submissionStatus.finalProposalVersion.document.filePath}`
            : null,
        }
      : null,
  };
}

export async function submitFinalProposal(userId) {
  const { thesis } = await getStudentAndThesis(userId);

  if (thesis.proposalStatus === "accepted") {
    throw new BadRequestError(
      "Mahasiswa sudah promosi ke beban aktif Tugas Akhir. Versi final proposal Metopel tidak dapat diubah dari alur mahasiswa."
    );
  }

  await assertTa04GuidanceAuthorized(thesis.id);

  const [latestVersion, supervisorCount] = await Promise.all([
    proposalRepo.findLatestProposalVersion(thesis.id),
    proposalRepo.countActiveSupervisors(thesis.id),
  ]);

  if (!latestVersion) {
    throw new BadRequestError("Unggah dokumen proposal terlebih dahulu sebelum submit proposal final.");
  }

  if (supervisorCount === 0) {
    throw new BadRequestError("Mahasiswa harus memiliki dosen pembimbing sebelum submit proposal final.");
  }

  if (
    thesis.finalProposalVersionId &&
    thesis.finalProposalVersionId === latestVersion.id &&
    latestVersion.submittedAsFinalAt
  ) {
    return {
      thesisId: thesis.id,
      finalProposalVersion: mapProposalVersion(latestVersion),
      alreadySubmitted: true,
    };
  }

  // F-4.3: lock integritas — bila penilaian TA-03 sudah dimulai/terkunci untuk
  // proposal final aktif, jangan biarkan mahasiswa menukar versi yang sedang
  // (atau sudah) dinilai. Idempotent re-submit versi yang sama tetap lolos di atas.
  const scoreProgress = await proposalRepo.findResearchMethodScoreProgress(thesis.id);
  if (isScoreProgressStarted(scoreProgress)) {
    throw new BadRequestError(
      scoreProgress?.isFinalized
        ? "Penilaian TA-03 sudah final untuk proposal final saat ini. Versi final tidak dapat diganti."
        : "Penilaian TA-03 sudah dimulai untuk proposal final saat ini. Versi final tidak dapat diganti sampai siklus penilaian selesai/di-reset.",
    );
  }

  const submittedVersion = await proposalRepo.submitFinalProposalVersion(
    thesis.id,
    latestVersion.id,
    userId,
  );

  // BR-28 catch-up: upload-first then submit-final must still resolve attendance
  // (NIM match + deferred auto-zero / clear). Only on submitFinalProposal — not TA-04.
  let attendanceReconcile = null;
  try {
    attendanceReconcile = await reconcileAttendanceForThesis(thesis.id, userId);
  } catch (err) {
    console.error(
      "[submitFinalProposal] attendance reconcile failed",
      { thesisId: thesis.id, message: err?.message },
    );
    attendanceReconcile = {
      status: "error",
      applied: null,
      message: err?.message ?? "Attendance reconcile failed",
    };
  }

  return {
    thesisId: thesis.id,
    finalProposalVersion: mapProposalVersion(submittedVersion),
    alreadySubmitted: false,
    attendanceReconcile,
  };
}

export async function getProposalVersionsForLecturer(lecturerUserId, thesisId) {
  const thesis = await proposalRepo.findThesisById(thesisId);
  if (!thesis) throw new NotFoundError("Tugas akhir tidak ditemukan");

  const isSupervisor = await proposalRepo.findThesisSupervisor(thesisId, lecturerUserId);
  const isMetopenLecturer = await proposalRepo.findMetopenLecturerRole(lecturerUserId);

  if (!isSupervisor && !isMetopenLecturer) {
    throw new ForbiddenError("Anda tidak memiliki akses untuk melihat proposal mahasiswa ini");
  }

  await assertTa04GuidanceAuthorized(thesisId);

  const versions = await proposalRepo.getProposalVersions(thesisId);

  return {
    thesisId,
    versions: versions.map(mapProposalVersion),
  };
}
