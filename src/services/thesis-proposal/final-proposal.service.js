import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";
import { THESIS_STATUS } from "../../constants/thesisStatus.js";
import { formatAcademicYearLabel, resolveOperationalAcademicYear } from "../../helpers/academicYear.helper.js";
import { uploadUrl } from "../../helpers/guidanceFile.helper.js";
import { getProposalPhaseAccess } from "../../helpers/thesis-phase-access.helper.js";
import { proposalFileDir, removeFile, storeFile } from "../../helpers/thesis-proposal-file.helper.js";
import { REPEAT_PROPOSAL_LOCK_REASON } from "../../constants/thesis-guidance-evaluation.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors.js";
import { AUDIT_ACTIONS, ENTITY_TYPES, logAudit } from "../auditLog.service.js";
import { createNotificationEventForUsers } from "../notification.service.js";
import { findStudentThesis } from "../../repositories/thesis-proposal/student-thesis.repository.js";
import { reconcileAttempt } from "../research-method/attendance.service.js";
import { minimumScoreOf } from "../research-method/assessment.service.js";

/**
 * Proposal final (plan 10.3): one file per assessment attempt (`research_method_assessments`,
 * one row per thesis per semester), so a student retaking Metode Penelitian (K2) never
 * overwrites the file of an earlier attempt. Rules kept from the old module: PDF only,
 * proposal phase, after Penetapan Pembimbing with an active supervisor, and replaceable only
 * until a score is submitted on that attempt (submitted scores are locked, R23).
 */

const ATTEMPT_SELECT = {
  id: true,
  academicYearId: true,
  proposalFilePath: true,
  proposalFileName: true,
  proposalFileSize: true,
  proposalSubmittedAt: true,
  supervisorScore: true,
  coordinatorScore: true,
  finalScore: true,
  isFinalized: true,
  result: true,
  attendanceAutoZeroedAt: true,
  academicYear: { select: { id: true, semester: true, year: true, researchMethodMinimumScore: true } },
  attendanceRecord: { select: { attendancePercentage: true, isEligible: true } },
};

function attemptDto(attempt) {
  if (!attempt) return null;
  return {
    id: attempt.id,
    academicYear: attempt.academicYear
      ? { id: attempt.academicYear.id, label: formatAcademicYearLabel(attempt.academicYear) }
      : { id: attempt.academicYearId, label: null },
    file: attempt.proposalFilePath
      ? {
          fileName: attempt.proposalFileName,
          fileSize: attempt.proposalFileSize,
          url: uploadUrl(attempt.proposalFilePath),
          submittedAt: attempt.proposalSubmittedAt,
        }
      : null,
    supervisorScored: attempt.supervisorScore != null,
    coordinatorScored: attempt.coordinatorScore != null,
    isFinalized: attempt.isFinalized,
    finalScore: attempt.isFinalized ? attempt.finalScore : null,
    result: attempt.isFinalized ? attempt.result : null,
    attendanceAutoZeroed: Boolean(attempt.attendanceAutoZeroedAt),
    minimumScore: minimumScoreOf(attempt.academicYear),
    attendance: attempt.attendanceRecord
      ? { attendancePercentage: attempt.attendanceRecord.attendancePercentage, isEligible: attempt.attendanceRecord.isEligible }
      : null,
  };
}

/** Why an attempt's file can no longer be replaced, or null. */
export function lockReasonOf(attempt) {
  if (!attempt) return null;
  if (attempt.isFinalized) return "Penilaian proposal periode ini sudah final. Proposal final tidak dapat diganti.";
  if (attempt.supervisorScore != null || attempt.coordinatorScore != null) {
    return "Penilaian proposal periode ini sudah dimulai. Proposal final tidak dapat diganti.";
  }
  return null;
}

/** Why the student cannot send a final proposal now (thesis and supervisor rules), or null. */
async function thesisBlockReason(thesis) {
  if (!thesis) return "Anda belum memiliki tugas akhir. Ajukan pembimbing terlebih dahulu.";
  if (thesis.status !== THESIS_STATUS.PROPOSAL) {
    return "Tugas akhir Anda sudah tidak berada di fase proposal. Proposal final tidak dapat diubah.";
  }
  const { open, repeating } = await getProposalPhaseAccess(thesis);
  if (repeating) return `${REPEAT_PROPOSAL_LOCK_REASON} Unggah proposal revisi di bagian Proposal Revisi; mengulang proposal tidak memerlukan proposal final maupun Penilaian Proposal.`;
  if (!open) return "Proposal final dapat diajukan setelah Ketua Departemen menerbitkan Penetapan Pembimbing.";
  const hasSupervisor = thesis.thesisSupervisors?.some((s) => s.role?.name === ROLES.PEMBIMBING_1);
  if (!hasSupervisor) return "Mahasiswa harus memiliki Pembimbing 1 aktif sebelum mengajukan proposal final.";
  return null;
}

/** Section 3 of Tugas Akhir > Proposal: the current attempt, its file, and earlier attempts. */
export async function getFinalProposalState(thesis) {
  const year = await resolveOperationalAcademicYear();
  const attempts = thesis
    ? await prisma.researchMethodAssessment.findMany({
        where: { thesisId: thesis.id },
        select: ATTEMPT_SELECT,
        orderBy: { createdAt: "desc" },
      })
    : [];
  const current = year ? attempts.find((a) => a.academicYearId === year.id) ?? null : null;
  const blockReason = !year
    ? "Periode akademik berjalan belum ditetapkan. Hubungi Admin."
    : (await thesisBlockReason(thesis)) ?? lockReasonOf(current);
  return {
    academicYear: year ? { id: year.id, label: formatAcademicYearLabel(year) } : null,
    current: attemptDto(current),
    canSubmit: blockReason === null,
    blockReason,
    history: attempts.filter((a) => a !== current).map(attemptDto),
  };
}

function assertPdf(file) {
  if (!file?.buffer?.length) throw new BadRequestError("Berkas proposal final (PDF) wajib diunggah.");
  if (file.buffer.subarray(0, 5).toString("utf8") !== "%PDF-") {
    throw new BadRequestError("Berkas proposal final harus berupa PDF yang valid.");
  }
}

/**
 * Send or replace the final proposal of the current period's attempt. The attempt row is created
 * on the first upload; the previous file of the same attempt is removed after the row is saved.
 */
export async function submitFinalProposal(userId, file) {
  const student = await prisma.student.findUnique({ where: { id: userId }, select: { id: true } });
  if (!student) throw new NotFoundError("Data mahasiswa tidak ditemukan.");
  const thesis = await findStudentThesis(student.id);
  const reason = await thesisBlockReason(thesis);
  if (reason) throw new ForbiddenError(reason);
  const year = await resolveOperationalAcademicYear();
  if (!year) throw new BadRequestError("Periode akademik berjalan belum ditetapkan. Hubungi Admin.");
  assertPdf(file);

  const attempt = await prisma.researchMethodAssessment.upsert({
    where: { thesisId_academicYearId: { thesisId: thesis.id, academicYearId: year.id } },
    create: { thesisId: thesis.id, academicYearId: year.id },
    update: {},
    select: ATTEMPT_SELECT,
  });
  const locked = lockReasonOf(attempt);
  if (locked) throw new BadRequestError(locked);

  const now = new Date();
  const stored = await storeFile({
    relDir: proposalFileDir(thesis.id, attempt.id),
    file: { ...file, mimetype: "application/pdf" },
    now,
  });
  let saved;
  try {
    // Re-checked inside the update so a score sent meanwhile still locks the file.
    const updated = await prisma.researchMethodAssessment.updateMany({
      where: { id: attempt.id, isFinalized: false, supervisorScore: null, coordinatorScore: null },
      data: {
        proposalFilePath: stored.filePath,
        proposalFileName: stored.fileName,
        proposalMimeType: stored.mimeType,
        proposalFileSize: stored.fileSize,
        proposalFileHash: stored.fileHash,
        proposalSubmittedAt: now,
      },
    });
    if (updated.count === 0) throw new BadRequestError("Penilaian proposal periode ini sudah dimulai. Proposal final tidak dapat diganti.");
    saved = await prisma.researchMethodAssessment.findUnique({ where: { id: attempt.id }, select: ATTEMPT_SELECT });
  } catch (error) {
    await removeFile(stored.filePath);
    throw error;
  }
  if (attempt.proposalFilePath && attempt.proposalFilePath !== stored.filePath) {
    await removeFile(attempt.proposalFilePath);
  }
  // R19 catch-up (rule kept): attendance already uploaded for the period decides at once.
  let attendance = null;
  try {
    attendance = await reconcileAttempt(attempt.id, userId);
    if (attendance?.applied) saved = await prisma.researchMethodAssessment.findUnique({ where: { id: attempt.id }, select: ATTEMPT_SELECT });
  } catch (error) {
    console.error("[final-proposal] rekonsiliasi presensi gagal:", error?.message ?? error);
  }

  await logAudit({
    actorUserId: userId,
    action: AUDIT_ACTIONS.FINAL_PROPOSAL_SUBMITTED,
    entityType: ENTITY_TYPES.RESEARCH_METHOD_ASSESSMENT,
    entityId: attempt.id,
    newValues: { thesisId: thesis.id, academicYearId: year.id, fileName: stored.fileName, fileHash: stored.fileHash },
    metadata: { replaced: Boolean(attempt.proposalFilePath) },
  });

  const supervisorIds = (thesis.thesisSupervisors ?? [])
    .filter((s) => s.role?.name === ROLES.PEMBIMBING_1 || s.role?.name === ROLES.PEMBIMBING_2)
    .map((s) => s.lecturerId);
  try {
    await createNotificationEventForUsers(
      supervisorIds,
      {
        title: attempt.proposalFilePath ? "Proposal Final Diganti" : "Proposal Final Diajukan",
        message: `${thesis.title || "Mahasiswa bimbingan Anda"}: proposal final ${formatAcademicYearLabel(year)} ${attempt.proposalFilePath ? "diganti" : "diunggah"}.`,
        type: "final_proposal_submitted",
        data: { thesisId: thesis.id, assessmentId: attempt.id, route: `/tugas-akhir/bimbingan/lecturer/my-students/${thesis.id}` },
      },
      { push: true },
    );
  } catch (error) {
    console.error("[final-proposal] notifikasi gagal dikirim:", error?.message ?? error);
  }

  return { attempt: attemptDto(saved), replaced: Boolean(attempt.proposalFilePath), attendance };
}
