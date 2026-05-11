import * as revisionRepo from "../repositories/thesis-seminar-revision.repository.js";
import * as coreRepo from "../repositories/thesis-seminar.repository.js";
import prisma from "../config/prisma.js";

// ============================================================
// HELPERS
// ============================================================

function throwError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
}

function isRevisionFinished(revision) {
  return Boolean(revision?.supervisorApprovedAt);
}

function resolveSupervisorMembership(supervisorRelation) {
  if (!supervisorRelation) return null;
  if (supervisorRelation.thesis?.thesisSupervisors?.length > 0) {
    return supervisorRelation.thesis.thesisSupervisors[0];
  }
  return supervisorRelation;
}

// ============================================================
// PUBLIC: Get Revisions
// ============================================================

export async function getRevisions(seminarId, user) {
  const seminar = await coreRepo.findSeminarBasicById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);

  const revisions = await revisionRepo.findRevisionsBySeminarId(seminarId);

  // Batch-fetch examiner lecturer names
  const lecturerIds = [...new Set(revisions.map((r) => r.seminarExaminer?.lecturerId).filter(Boolean))];
  const lecturerMap = new Map();
  if (lecturerIds.length > 0) {
    const lecturers = await prisma.lecturer.findMany({
      where: { id: { in: lecturerIds } },
      select: { id: true, user: { select: { fullName: true } } },
    });
    for (const l of lecturers) lecturerMap.set(l.id, l.user?.fullName || "-");
  }

  const totalRevisions = revisions.length;
  const finishedRevisions = revisions.filter((r) => isRevisionFinished(r)).length;
  const pendingApproval = revisions.filter((r) => r.studentSubmittedAt && !isRevisionFinished(r)).length;

  return {
    seminarId,
    summary: { total: totalRevisions, finished: finishedRevisions, pendingApproval },
    revisions: revisions.map((item) => ({
      id: item.id,
      examinerOrder: item.seminarExaminer?.order || null,
      examinerLecturerId: item.seminarExaminer?.lecturerId || null,
      examinerName: lecturerMap.get(item.seminarExaminer?.lecturerId) || "-",
      description: item.description,
      revisionAction: item.revisionAction,
      isFinished: isRevisionFinished(item),
      studentSubmittedAt: item.studentSubmittedAt,
      supervisorApprovedAt: item.supervisorApprovedAt,
      approvedBySupervisorName: item.supervisor?.lecturer?.user?.fullName || null,
    })),
  };
}

// ============================================================
// PUBLIC: Create Revision (Student)
// ============================================================

export async function createRevision(seminarId, body, studentId) {
  const seminar = await coreRepo.findSeminarBasicById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);
  if (seminar.status !== "passed_with_revision") throwError("Revisi hanya tersedia untuk seminar berstatus lulus dengan revisi.", 400);

  // Validate examiner belongs to this seminar
  const examiner = await prisma.thesisSeminarExaminer.findFirst({
    where: { id: body.seminarExaminerId, thesisSeminarId: seminarId },
  });
  if (!examiner) throwError("Penguji tidak ditemukan pada seminar ini.", 400);

  const revision = await revisionRepo.createRevision({
    seminarExaminerId: body.seminarExaminerId,
    description: body.description,
    revisionAction: body.revisionAction,
  });

  return { 
    id: revision.id, 
    seminarExaminerId: revision.seminarExaminerId, 
    description: revision.description,
    revisionAction: revision.revisionAction
  };
}

// ============================================================
// PUBLIC: Update Revision (multi-action)
// body.action: save_action | submit | cancel_submit | approve | unapprove
// ============================================================

export async function updateRevision(seminarId, revisionId, body, user) {
  const revision = await revisionRepo.findRevisionById(revisionId);
  if (!revision) throwError("Item revisi tidak ditemukan.", 404);

  const seminar = revision.seminarExaminer?.seminar;
  if (!seminar || revision.seminarExaminer?.thesisSeminarId !== seminarId) {
    throwError("Revisi tidak terkait dengan seminar ini.", 400);
  }

  const { action } = body;

  switch (action) {
    case "save_action":
      return saveAction(revision, body, user);
    case "submit":
      return submitRevision(revision, user);
    case "cancel_submit":
      return cancelSubmit(revision, user);
    case "approve":
      return approveRevision(seminarId, revision, user);
    case "unapprove":
      return unapproveRevision(seminarId, revision, user);
    default:
      throwError("Action tidak valid. Gunakan: save_action, submit, cancel_submit, approve, unapprove.", 400);
  }
}

// --- Sub-actions ---

async function saveAction(revision, body, user) {
  if (isRevisionFinished(revision)) throwError("Revisi ini sudah disetujui dan tidak dapat diubah.", 400);
  if (revision.studentSubmittedAt) throwError("Perbaikan sudah diajukan. Batalkan pengajuan terlebih dahulu untuk mengedit.", 400);

  const nextDescription = typeof body.description === "string" ? body.description.trim() : revision.description;
  const nextAction = typeof body.revisionAction === "string" ? body.revisionAction.trim() : revision.revisionAction;

  const updated = await revisionRepo.updateRevision(revision.id, { description: nextDescription, revisionAction: nextAction });
  return { id: updated.id, description: updated.description, revisionAction: updated.revisionAction };
}

async function submitRevision(revision, user) {
  if (isRevisionFinished(revision)) throwError("Revisi ini sudah disetujui.", 400);
  if (revision.studentSubmittedAt) throwError("Revisi ini sudah diajukan.", 400);
  if (!revision.revisionAction) throwError("Isi perbaikan terlebih dahulu sebelum mengajukan.", 400);

  const updated = await revisionRepo.updateRevision(revision.id, { studentSubmittedAt: new Date() });
  return { id: updated.id, studentSubmittedAt: updated.studentSubmittedAt };
}

async function cancelSubmit(revision, user) {
  if (isRevisionFinished(revision)) throwError("Revisi yang sudah disetujui tidak dapat dibatalkan.", 400);
  if (!revision.studentSubmittedAt) throwError("Revisi ini belum diajukan.", 400);

  const updated = await revisionRepo.updateRevision(revision.id, { studentSubmittedAt: null });
  return { id: updated.id, studentSubmittedAt: updated.studentSubmittedAt };
}

async function approveRevision(seminarId, revision, user) {
  const supervisorRelation = await coreRepo.findSeminarSupervisorRole(seminarId, user.lecturerId);
  const mySupervisor = resolveSupervisorMembership(supervisorRelation);
  if (!mySupervisor) throwError("Anda bukan dosen pembimbing pada seminar ini.", 403);

  if (isRevisionFinished(revision)) throwError("Revisi ini sudah disetujui.", 400);
  if (!revision.studentSubmittedAt) throwError("Mahasiswa belum mengisi perbaikan untuk revisi ini.", 400);

  const approved = await revisionRepo.approveRevision(revision.id, mySupervisor.id);
  return { id: approved.id, supervisorApprovedAt: approved.supervisorApprovedAt };
}

async function unapproveRevision(seminarId, revision, user) {
  const supervisorRelation = await coreRepo.findSeminarSupervisorRole(seminarId, user.lecturerId);
  if (!resolveSupervisorMembership(supervisorRelation)) throwError("Anda bukan dosen pembimbing pada seminar ini.", 403);

  if (!isRevisionFinished(revision)) throwError("Revisi ini belum disetujui.", 400);

  const unapproved = await revisionRepo.unapproveRevision(revision.id);
  return { id: unapproved.id, supervisorApprovedAt: null };
}

// ============================================================
// PUBLIC: Delete Revision (Student, before submit)
// ============================================================

export async function deleteRevision(seminarId, revisionId, studentId) {
  const revision = await revisionRepo.findRevisionById(revisionId);
  if (!revision) throwError("Item revisi tidak ditemukan.", 404);

  const seminar = revision.seminarExaminer?.seminar;
  if (!seminar || seminar.thesis?.studentId !== studentId) throwError("Anda tidak memiliki akses ke revisi ini.", 403);
  if (seminar.status !== "passed_with_revision") throwError("Revisi hanya tersedia untuk seminar berstatus lulus dengan revisi.", 400);
  if (isRevisionFinished(revision)) throwError("Revisi yang sudah disetujui tidak dapat dihapus.", 400);
  if (revision.studentSubmittedAt) throwError("Revisi yang sudah diajukan tidak dapat dihapus.", 400);

  await revisionRepo.deleteRevision(revisionId);
  return { id: revisionId };
}

// ============================================================
// PUBLIC: Finalize Revisions (Supervisor)
// ============================================================

export async function finalizeRevisions(seminarId, lecturerId) {
  const seminar = await coreRepo.findSeminarBasicById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);

  const supervisorRelation = await coreRepo.findSeminarSupervisorRole(seminarId, lecturerId);
  const supervisorRole = resolveSupervisorMembership(supervisorRelation);
  if (!supervisorRole) throwError("Anda bukan dosen pembimbing pada seminar ini.", 403);

  if (seminar.revisionFinalizedBy) throwError("Revisi seminar sudah difinalisasi sebelumnya.", 400);

  const revisions = await revisionRepo.findRevisionsBySeminarId(seminarId);
  const relevantRevisions = revisions.filter((item) => item.studentSubmittedAt || isRevisionFinished(item));
  if (relevantRevisions.length === 0) throwError("Tidak ada item revisi yang diajukan mahasiswa untuk difinalisasi.", 400);

  const unfinished = relevantRevisions.filter((item) => !isRevisionFinished(item));
  if (unfinished.length > 0) throwError("Masih ada item revisi yang belum disetujui.", 400);

  const finalized = await coreRepo.updateSeminar(seminarId, {
    revisionFinalizedAt: new Date(),
    revisionFinalizedBy: supervisorRole.id,
  });

  return { seminarId: finalized.id, revisionFinalizedAt: finalized.revisionFinalizedAt, revisionFinalizedBy: finalized.revisionFinalizedBy };
}

// ============================================================
// PUBLIC: Unfinalize Revisions (Supervisor)
// ============================================================

export async function unfinalizeRevisions(seminarId, lecturerId) {
  const seminar = await coreRepo.findSeminarBasicById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);

  const supervisorRelation = await coreRepo.findSeminarSupervisorRole(seminarId, lecturerId);
  if (!resolveSupervisorMembership(supervisorRelation)) throwError("Anda bukan dosen pembimbing pada seminar ini.", 403);

  if (!seminar.revisionFinalizedBy) throwError("Revisi seminar belum difinalisasi.", 400);

  const updated = await coreRepo.updateSeminar(seminarId, {
    revisionFinalizedAt: null,
    revisionFinalizedBy: null,
  });

  return { seminarId: updated.id, revisionFinalizedAt: null, revisionFinalizedBy: null };
}
