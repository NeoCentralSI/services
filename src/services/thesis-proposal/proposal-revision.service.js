import { randomUUID } from "crypto";
import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";
import { THESIS_STATUS } from "../../constants/thesisStatus.js";
import { uploadUrl } from "../../helpers/guidanceFile.helper.js";
import { proposalRevisionDir, removeFile, storeFile } from "../../helpers/thesis-proposal-file.helper.js";
import { findRepeatProposalEvaluation } from "../../repositories/thesis-guidance-evaluation.repository.js";
import { findStudentThesis } from "../../repositories/thesis-proposal/student-thesis.repository.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors.js";
import { AUDIT_ACTIONS, ENTITY_TYPES, logAudit } from "../auditLog.service.js";
import { createNotificationEventForUsers } from "../notification.service.js";
import { changeThesisStatus } from "../thesisLifecycle.service.js";

/**
 * Proposal revisi: the way back to research for a thesis that a guidance
 * evaluation sent back to the proposal ("Mengulang Proposal"). No class or
 * Penilaian Proposal: the student uploads a revised proposal and the Pembimbing 1 approves it
 * (the thesis returns to research and the supervision clock starts again) or asks for a
 * revision with notes. The Head of Department is not involved.
 *
 * One row per upload in `thesis_proposal_revisions`, tied to the approved evaluation (the
 * cycle). The file of a row waiting for review may be replaced; after "Minta Revisi" the next
 * upload is a new row, so earlier notes stay visible.
 */

export const REVISION_STATUS = Object.freeze({
  SUBMITTED: "submitted",
  REVISION_REQUESTED: "revision_requested",
  APPROVED: "approved",
});

export const REVIEW_ACTION = Object.freeze({ APPROVE: "approve", REQUEST_REVISION: "request_revision" });

export const NOT_REPEATING_REASON =
  "Proposal revisi hanya untuk tugas akhir yang mengulang proposal berdasarkan evaluasi bimbingan.";
const MIN_NOTES = 10;
const READER_ROLES = [ROLES.KETUA_DEPARTEMEN, ROLES.SEKRETARIS_DEPARTEMEN, ROLES.ADMIN];

const REVISION_SELECT = {
  id: true,
  thesisId: true,
  evaluationId: true,
  filePath: true,
  fileName: true,
  fileSize: true,
  submittedAt: true,
  status: true,
  reviewNotes: true,
  reviewedAt: true,
  reviewer: { select: { fullName: true } },
};

const THESIS_SELECT = {
  id: true,
  title: true,
  status: true,
  startDate: true,
  studentId: true,
  thesisSupervisors: {
    where: { status: "active" },
    select: { lecturerId: true, role: { select: { name: true } } },
  },
};

function revisionDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    file: { fileName: row.fileName, fileSize: row.fileSize, url: uploadUrl(row.filePath), submittedAt: row.submittedAt },
    reviewNotes: row.reviewNotes ?? null,
    reviewedAt: row.reviewedAt ?? null,
    reviewerName: row.reviewer?.fullName ?? null,
  };
}

const supervisorOf = (thesis, roleName) => thesis?.thesisSupervisors?.find((s) => s.role?.name === roleName)?.lecturerId ?? null;

/** The cycle of a thesis (approved "Mengulang Proposal" evaluation) and its uploads, newest first. */
async function loadCycle(thesis, client = prisma) {
  if (!thesis || thesis.status !== THESIS_STATUS.PROPOSAL) return { evaluation: null, rows: [] };
  const evaluation = await findRepeatProposalEvaluation(thesis.id, client);
  if (!evaluation) return { evaluation: null, rows: [] };
  const rows = await client.thesisProposalRevision.findMany({
    where: { thesisId: thesis.id, evaluationId: evaluation.id },
    select: REVISION_SELECT,
    orderBy: { createdAt: "desc" },
  });
  return { evaluation, rows };
}

/** Why the student cannot upload now, or null. */
function submitBlockReason(thesis, evaluation, latest) {
  if (!thesis) return "Anda belum memiliki tugas akhir.";
  if (!evaluation) return NOT_REPEATING_REASON;
  if (!supervisorOf(thesis, ROLES.PEMBIMBING_1)) return "Tugas akhir harus memiliki Pembimbing 1 aktif untuk meninjau proposal revisi.";
  if (latest?.status === REVISION_STATUS.APPROVED) return "Proposal revisi sudah disetujui.";
  return null;
}

/** Why `userId` cannot review the latest upload now, or null. */
function reviewBlockReason(thesis, evaluation, latest, userId) {
  if (!evaluation) return NOT_REPEATING_REASON;
  if (supervisorOf(thesis, ROLES.PEMBIMBING_1) !== userId) return "Hanya Pembimbing 1 yang meninjau proposal revisi.";
  if (!latest) return "Mahasiswa belum mengunggah proposal revisi.";
  if (latest.status !== REVISION_STATUS.SUBMITTED) return "Belum ada proposal revisi baru yang menunggu tinjauan.";
  return null;
}

function stateOf(thesis, { evaluation, rows }) {
  const [latest, ...earlier] = rows;
  return {
    applicable: Boolean(evaluation),
    evaluation: evaluation ? { id: evaluation.id, approvedAt: evaluation.kadepApprovedAt ?? null } : null,
    current: revisionDto(latest),
    history: earlier.map(revisionDto),
  };
}

/** Section "Proposal Revisi" of Tugas Akhir > Proposal for the student. */
export async function getProposalRevisionState(thesis) {
  const cycle = await loadCycle(thesis);
  const blockReason = submitBlockReason(thesis, cycle.evaluation, cycle.rows[0]);
  return {
    ...stateOf(thesis, cycle),
    canSubmit: blockReason === null,
    blockReason,
    replacesCurrent: cycle.rows[0]?.status === REVISION_STATUS.SUBMITTED,
  };
}

function assertPdf(file) {
  if (Math.max(file?.size ?? 0, file?.buffer?.length ?? 0) > 10 * 1024 * 1024) throw new BadRequestError("Ukuran berkas maksimal 10 MB.");
  if (!file?.buffer?.length) throw new BadRequestError("Berkas proposal revisi (PDF) wajib diunggah.");
  if (file.buffer.subarray(0, 5).toString("utf8") !== "%PDF-") {
    throw new BadRequestError("Berkas proposal revisi harus berupa PDF yang valid.");
  }
}

/**
 * Upload a revised proposal. A row waiting for review gets its file replaced; otherwise (first
 * upload, or after "Minta Revisi") a new row is created.
 */
export async function submitProposalRevision(userId, file) {
  const student = await prisma.student.findUnique({ where: { id: userId }, select: { id: true } });
  if (!student) throw new NotFoundError("Data mahasiswa tidak ditemukan.");
  const thesis = await findStudentThesis(student.id);
  const cycle = await loadCycle(thesis);
  const latest = cycle.rows[0] ?? null;
  const reason = submitBlockReason(thesis, cycle.evaluation, latest);
  if (reason) throw new ForbiddenError(reason);
  assertPdf(file);

  const replacing = latest?.status === REVISION_STATUS.SUBMITTED ? latest : null;
  const rowId = replacing?.id ?? randomUUID();
  const now = new Date();
  const stored = await storeFile({ relDir: proposalRevisionDir(thesis.id, rowId), file: { ...file, mimetype: "application/pdf" }, now });
  const columns = {
    filePath: stored.filePath,
    fileName: stored.fileName,
    mimeType: stored.mimeType,
    fileSize: stored.fileSize,
    fileHash: stored.fileHash,
    submittedAt: now,
  };
  let saved;
  try {
    if (replacing) {
      // Re-checked inside the update so a review sent meanwhile still wins.
      const updated = await prisma.thesisProposalRevision.updateMany({
        where: { id: replacing.id, status: REVISION_STATUS.SUBMITTED },
        data: columns,
      });
      if (updated.count === 0) throw new BadRequestError("Proposal revisi ini baru saja ditinjau. Muat ulang halaman.");
    } else {
      await prisma.thesisProposalRevision.create({
        data: { id: rowId, thesisId: thesis.id, evaluationId: cycle.evaluation.id, ...columns },
      });
    }
    saved = await prisma.thesisProposalRevision.findUnique({ where: { id: rowId }, select: REVISION_SELECT });
  } catch (error) {
    await removeFile(stored.filePath);
    throw error;
  }
  if (replacing?.filePath && replacing.filePath !== stored.filePath) await removeFile(replacing.filePath);

  await logAudit({
    actorUserId: userId,
    action: AUDIT_ACTIONS.PROPOSAL_REVISION_SUBMITTED,
    entityType: ENTITY_TYPES.THESIS_PROPOSAL_REVISION,
    entityId: rowId,
    newValues: { thesisId: thesis.id, evaluationId: cycle.evaluation.id, fileName: stored.fileName, fileHash: stored.fileHash },
    metadata: { replaced: Boolean(replacing) },
  });

  const supervisorIds = [supervisorOf(thesis, ROLES.PEMBIMBING_1), supervisorOf(thesis, ROLES.PEMBIMBING_2)].filter(Boolean);
  try {
    await createNotificationEventForUsers(
      supervisorIds,
      {
        title: replacing ? "Proposal Revisi Diganti" : "Proposal Revisi Diajukan",
        message: `${thesis.title || "Mahasiswa bimbingan Anda"}: proposal revisi ${replacing ? "diganti" : "diunggah"} dan menunggu tinjauan Pembimbing 1.`,
        type: "proposal_revision_submitted",
        data: { thesisId: thesis.id, revisionId: rowId, route: `/tugas-akhir/bimbingan/lecturer/my-students/${thesis.id}` },
      },
      { push: true },
    );
  } catch (error) {
    console.error("[proposal-revision] notifikasi gagal dikirim:", error?.message ?? error);
  }

  return { revision: revisionDto(saved), replaced: Boolean(replacing) };
}

/** The lecturer's view on the student detail: the cycle, its uploads, and whether this user may review. */
export async function getProposalRevisionForLecturer(userId, thesisId) {
  const thesis = await prisma.thesis.findUnique({ where: { id: thesisId }, select: THESIS_SELECT });
  if (!thesis) throw new NotFoundError("Tugas akhir tidak ditemukan.");
  const isSupervisor = thesis.thesisSupervisors.some((s) => s.lecturerId === userId);
  if (!isSupervisor) {
    const reader = await prisma.userHasRole.findFirst({
      where: { userId, status: "active", role: { name: { in: READER_ROLES } } },
      select: { userId: true },
    });
    if (!reader) throw new ForbiddenError("Anda bukan pembimbing tugas akhir ini.");
  }
  const cycle = await loadCycle(thesis);
  const reason = reviewBlockReason(thesis, cycle.evaluation, cycle.rows[0], userId);
  return { ...stateOf(thesis, cycle), canReview: reason === null, reviewBlockReason: reason };
}

/**
 * Pembimbing 1 decides on the latest upload. "Setujui" returns the thesis to research with a new
 * start date (the supervision clock starts again); "Minta Revisi" needs notes.
 */
export async function reviewProposalRevision(userId, revisionId, { action, notes } = {}) {
  const row = await prisma.thesisProposalRevision.findUnique({ where: { id: revisionId }, select: { id: true, thesisId: true, evaluationId: true } });
  if (!row) throw new NotFoundError("Proposal revisi tidak ditemukan.");
  const thesis = await prisma.thesis.findUnique({ where: { id: row.thesisId }, select: THESIS_SELECT });
  const cycle = await loadCycle(thesis);
  const latest = cycle.rows[0] ?? null;
  if (!cycle.evaluation) throw new ForbiddenError(NOT_REPEATING_REASON);
  if (supervisorOf(thesis, ROLES.PEMBIMBING_1) !== userId) throw new ForbiddenError("Hanya Pembimbing 1 yang meninjau proposal revisi.");
  if (latest?.id !== row.id || latest.status !== REVISION_STATUS.SUBMITTED) {
    throw new BadRequestError("Proposal revisi ini sudah ditinjau atau sudah diganti unggahan yang lebih baru.");
  }

  if (![REVIEW_ACTION.APPROVE, REVIEW_ACTION.REQUEST_REVISION].includes(action)) {
    throw new BadRequestError("Pilih setujui atau minta revisi.");
  }
  const cleanNotes = String(notes ?? "").trim() || null;
  if (action === REVIEW_ACTION.REQUEST_REVISION && (cleanNotes?.length ?? 0) < MIN_NOTES) {
    throw new BadRequestError(`Catatan revisi wajib diisi minimal ${MIN_NOTES} karakter.`);
  }
  const approve = action === REVIEW_ACTION.APPROVE;
  const now = new Date();

  const updatedThesis = await prisma.$transaction(async (tx) => {
    const decided = await tx.thesisProposalRevision.updateMany({
      where: { id: row.id, status: REVISION_STATUS.SUBMITTED },
      data: {
        status: approve ? REVISION_STATUS.APPROVED : REVISION_STATUS.REVISION_REQUESTED,
        reviewNotes: cleanNotes,
        reviewedBy: userId,
        reviewedAt: now,
      },
    });
    if (decided.count === 0) throw new BadRequestError("Proposal revisi ini sudah ditinjau. Muat ulang halaman.");
    if (!approve) return null;
    const { thesis: moved } = await changeThesisStatus(tx, thesis, THESIS_STATUS.RESEARCH, { actorUserId: userId, now });
    // The supervision clock starts again from the approval (the lifecycle already does this for a
    // thesis whose start date was cleared when it went back to the proposal).
    if (!moved.startDate || moved.startDate.getTime() !== now.getTime()) {
      return tx.thesis.update({ where: { id: thesis.id }, data: { startDate: now, totalLeaveDays: 0 } });
    }
    return moved;
  });

  await logAudit({
    actorUserId: userId,
    action: approve ? AUDIT_ACTIONS.PROPOSAL_REVISION_APPROVED : AUDIT_ACTIONS.PROPOSAL_REVISION_REVISION_REQUESTED,
    entityType: ENTITY_TYPES.THESIS_PROPOSAL_REVISION,
    entityId: row.id,
    oldValues: { status: REVISION_STATUS.SUBMITTED },
    newValues: { status: approve ? REVISION_STATUS.APPROVED : REVISION_STATUS.REVISION_REQUESTED, reviewNotes: cleanNotes },
    metadata: { thesisId: thesis.id, evaluationId: row.evaluationId, ...(approve ? { thesisStatus: THESIS_STATUS.RESEARCH, startDate: updatedThesis?.startDate ?? now } : {}) },
  });

  const recipients = approve ? [thesis.studentId, supervisorOf(thesis, ROLES.PEMBIMBING_2)].filter(Boolean) : [thesis.studentId];
  try {
    await createNotificationEventForUsers(
      recipients,
      approve
        ? {
            title: "Proposal Revisi Disetujui",
            message: `${thesis.title || "Tugas akhir"}: Pembimbing 1 menyetujui proposal revisi. Tugas akhir kembali ke fase Penelitian dan masa bimbingan dihitung ulang mulai hari ini.`,
            type: "proposal_revision_approved",
            data: { thesisId: thesis.id, revisionId: row.id, route: "/tugas-akhir/bimbingan" },
          }
        : {
            title: "Proposal Revisi Perlu Diperbaiki",
            message: `Pembimbing 1 meminta revisi proposal: ${cleanNotes}`,
            type: "proposal_revision_revision_requested",
            data: { thesisId: thesis.id, revisionId: row.id, route: "/tugas-akhir/proposal" },
          },
      { push: true },
    );
  } catch (error) {
    console.error("[proposal-revision] notifikasi gagal dikirim:", error?.message ?? error);
  }

  const after = await prisma.thesisProposalRevision.findUnique({ where: { id: row.id }, select: REVISION_SELECT });
  return {
    revision: revisionDto(after),
    thesis: updatedThesis ? { id: updatedThesis.id, status: updatedThesis.status, startDate: updatedThesis.startDate } : null,
  };
}
