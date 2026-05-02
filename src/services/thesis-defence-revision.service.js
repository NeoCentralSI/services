import * as revisionRepo from "../repositories/thesis-defence-revision.repository.js";
import * as coreRepo from "../repositories/thesis-defence.repository.js";
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
  if (revision?.isFinished !== undefined && revision?.isFinished !== null) {
    return Boolean(revision.isFinished);
  }
  return Boolean(revision?.supervisorApprovedAt);
}

function resolveSupervisorMembership(supervisorRelation) {
  if (!supervisorRelation) return null;
  if (supervisorRelation.thesis?.thesisSupervisors?.length > 0) {
    return supervisorRelation.thesis.thesisSupervisors[0];
  }
  return supervisorRelation;
}

function checkRevisionAccessibility(defence, user) {
  if (!defence) throwError("Sidang tidak ditemukan.", 404);
  
  // 1. State check: Only 'passed_with_revision'
  if (defence.status !== "passed_with_revision") {
    throwError("Revisi hanya tersedia untuk sidang berstatus lulus dengan revisi.", 403);
  }

  // 2. Role check: Only student of the thesis or supervisor
  const isStudent = user.studentId && defence.thesis?.studentId === user.studentId;
  const isSupervisor = user.lecturerId && defence.thesis?.thesisSupervisors?.some(s => s.lecturerId === user.lecturerId);

  if (!isStudent && !isSupervisor) {
    throwError("Anda tidak memiliki akses ke revisi sidang ini.", 403);
  }

  return { isStudent, isSupervisor };
}

// ============================================================
// PUBLIC: Get Revisions
// ============================================================

export async function getRevisions(defenceId, user) {
  const defence = await coreRepo.findDefenceBasicById(defenceId);
  checkRevisionAccessibility(defence, user);

  const revisions = await revisionRepo.findRevisionsByDefenceId(defenceId);

  const lecturerIds = [
    ...new Set(revisions.map((r) => r.defenceExaminer?.lecturerId).filter(Boolean)),
  ];
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
  const pendingApproval = revisions.filter(
    (r) => r.studentSubmittedAt && !isRevisionFinished(r)
  ).length;

  return {
    defenceId,
    summary: { total: totalRevisions, finished: finishedRevisions, pendingApproval },
    isFinalized: !!defence.revisionFinalizedAt,
    revisions: revisions.map((item) => ({
      id: item.id,
      examinerOrder: item.defenceExaminer?.order || null,
      examinerId: item.defenceExaminer?.id || null, // UI uses examinerId
      examinerLecturerId: item.defenceExaminer?.lecturerId || null,
      examinerName: lecturerMap.get(item.defenceExaminer?.lecturerId) || "-",
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

export async function createRevision(defenceId, body, studentId, user) {
  const defence = await coreRepo.findDefenceBasicById(defenceId);
  const { isStudent } = checkRevisionAccessibility(defence, user);
  
  if (!isStudent) {
    throwError("Hanya mahasiswa bersangkutan yang dapat menambahkan item revisi.", 403);
  }

  if (defence.revisionFinalizedAt) {
    throwError("Revisi sudah difinalisasi dan tidak dapat diubah lagi.", 400);
  }

  const examinerId = String(body?.defenceExaminerId || "").trim();
  const examiner = await revisionRepo.findExaminerByIdAndDefence(examinerId, defenceId);
  if (!examiner) throwError("Penguji tidak ditemukan pada sidang ini.", 400);

  const description = String(body?.description || "").trim();
  if (!description) throwError("Deskripsi revisi wajib diisi.", 400);

  const revisionAction = body?.revisionAction ? String(body.revisionAction).trim() : undefined;

  const created = await revisionRepo.createRevision({
    defenceExaminerId: examinerId,
    description,
    revisionAction
  });

  return { 
    id: created.id, 
    defenceExaminerId: created.defenceExaminerId, 
    description: created.description,
    revisionAction: created.revisionAction
  };
}

// ============================================================
// PUBLIC: Update Revision (multi-action)
// body.action: save_action | submit | cancel_submit | approve | unapprove
// ============================================================

export async function updateRevision(defenceId, revisionId, body, user) {
  const defence = await coreRepo.findDefenceBasicById(defenceId);
  const { isStudent, isSupervisor } = checkRevisionAccessibility(defence, user);

  const revision = await revisionRepo.findRevisionById(revisionId);
  if (!revision) throwError("Item revisi tidak ditemukan.", 404);

  if (revision.defenceExaminer?.thesisDefenceId !== defenceId) {
    throwError("Revisi tidak terkait dengan sidang ini.", 400);
  }

  if (defence.revisionFinalizedAt && body.action !== 'unapprove') {
    throwError("Revisi sudah difinalisasi.", 400);
  }

  const { action } = body;
  switch (action) {
    case "save_action":
      if (!isStudent) throwError("Aksi ini hanya untuk mahasiswa.", 403);
      return saveAction(revision, body, user);
    case "submit":
      if (!isStudent) throwError("Aksi ini hanya untuk mahasiswa.", 403);
      return submitRevision(revision, body, user);
    case "cancel_submit":
      if (!isStudent) throwError("Aksi ini hanya untuk mahasiswa.", 403);
      return cancelSubmit(revision, user);
    case "approve":
      if (!isSupervisor) throwError("Aksi ini hanya untuk dosen pembimbing.", 403);
      return approveRevision(defenceId, revision, user);
    case "unapprove":
      if (!isSupervisor) throwError("Aksi ini hanya untuk dosen pembimbing.", 403);
      return unapproveRevision(defenceId, revision, user);
    default:
      throwError(
        "Action tidak valid. Gunakan: save_action, submit, cancel_submit, approve, unapprove.",
        400
      );
  }
}

async function saveAction(revision, body, user) {
  if (isRevisionFinished(revision)) throwError("Revisi ini sudah disetujui dan tidak dapat diubah.", 400);
  if (revision.studentSubmittedAt) {
    throwError("Perbaikan sudah diajukan. Batalkan pengajuan terlebih dahulu untuk mengedit.", 400);
  }

  const nextDescription =
    typeof body.description === "string" ? body.description.trim() : revision.description;
  const nextAction =
    typeof body.revisionAction === "string" ? body.revisionAction.trim() : revision.revisionAction;

  const updated = await revisionRepo.updateRevision(revision.id, {
    description: nextDescription,
    revisionAction: nextAction,
  });
  return { id: updated.id, description: updated.description, revisionAction: updated.revisionAction };
}

async function submitRevision(revision, body, user) {
  if (isRevisionFinished(revision)) throwError("Revisi ini sudah disetujui.", 400);
  if (revision.studentSubmittedAt) throwError("Revisi ini sudah diajukan.", 400);

  const incomingAction =
    typeof body.revisionAction === "string" ? body.revisionAction.trim() : null;
  const nextRevisionAction = incomingAction || revision.revisionAction;
  if (!nextRevisionAction) throwError("Isi perbaikan terlebih dahulu sebelum mengajukan.", 400);

  const updated = await revisionRepo.updateRevision(revision.id, {
    revisionAction: nextRevisionAction,
    studentSubmittedAt: new Date(),
  });
  return { id: updated.id, studentSubmittedAt: updated.studentSubmittedAt };
}

async function cancelSubmit(revision, user) {
  if (isRevisionFinished(revision)) throwError("Revisi yang sudah disetujui tidak dapat dibatalkan.", 400);
  if (!revision.studentSubmittedAt) throwError("Revisi ini belum diajukan.", 400);

  const updated = await revisionRepo.updateRevision(revision.id, {
    studentSubmittedAt: null,
  });
  return { id: updated.id, studentSubmittedAt: updated.studentSubmittedAt };
}

async function approveRevision(defenceId, revision, user) {
  const supervisorRelation = await coreRepo.findDefenceSupervisorRole(defenceId, user.lecturerId);
  const mySupervisor = resolveSupervisorMembership(supervisorRelation);
  if (!mySupervisor) throwError("Anda bukan dosen pembimbing pada sidang ini.", 403);

  if (isRevisionFinished(revision)) throwError("Revisi ini sudah disetujui.", 400);
  if (!revision.studentSubmittedAt) {
    throwError("Mahasiswa belum mengisi perbaikan untuk revisi ini.", 400);
  }

  const approved = await revisionRepo.approveRevision(revision.id, mySupervisor.id);
  return {
    id: approved.id,
    supervisorApprovedAt: approved.supervisorApprovedAt,
  };
}

async function unapproveRevision(defenceId, revision, user) {
  const supervisorRelation = await coreRepo.findDefenceSupervisorRole(defenceId, user.lecturerId);
  if (!resolveSupervisorMembership(supervisorRelation)) {
    throwError("Anda bukan dosen pembimbing pada sidang ini.", 403);
  }

  if (!isRevisionFinished(revision)) throwError("Revisi ini belum disetujui.", 400);

  const unapproved = await revisionRepo.unapproveRevision(revision.id);
  return { id: unapproved.id, supervisorApprovedAt: null };
}

// ============================================================
// PUBLIC: Delete Revision (Student, before submit)
// ============================================================

export async function deleteRevision(defenceId, revisionId, studentId, user) {
  const defence = await coreRepo.findDefenceBasicById(defenceId);
  const { isStudent } = checkRevisionAccessibility(defence, user);

  if (!isStudent) {
    throwError("Hanya mahasiswa bersangkutan yang dapat menghapus item revisi.", 403);
  }

  const revision = await revisionRepo.findRevisionById(revisionId);
  if (!revision) throwError("Item revisi tidak ditemukan.", 404);

  if (revision.defenceExaminer?.thesisDefenceId !== defenceId) {
    throwError("Revisi tidak terkait dengan sidang ini.", 400);
  }

  if (defence.revisionFinalizedAt) throwError("Revisi sudah difinalisasi.", 400);
  if (isRevisionFinished(revision)) throwError("Revisi yang sudah disetujui tidak dapat dihapus.", 400);
  if (revision.studentSubmittedAt) throwError("Revisi yang sudah diajukan tidak dapat dihapus.", 400);

  await revisionRepo.deleteRevision(revisionId);
  return { id: revisionId };
}

// ============================================================
// PUBLIC: Finalize Revisions (Supervisor)
// ============================================================

export async function finalizeRevisions(defenceId, lecturerId, user) {
  const defence = await coreRepo.findDefenceBasicById(defenceId);
  const { isSupervisor } = checkRevisionAccessibility(defence, user);

  if (!isSupervisor) {
    throwError("Hanya dosen pembimbing yang dapat memfinalisasi revisi.", 403);
  }

  if (defence.revisionFinalizedAt) throwError("Revisi sidang sudah difinalisasi sebelumnya.", 400);

  const revisions = await revisionRepo.findRevisionsByDefenceId(defenceId);
  const relevantRevisions = revisions.filter((item) => item.studentSubmittedAt || isRevisionFinished(item));
  if (relevantRevisions.length === 0) {
    throwError("Tidak ada item revisi yang diajukan mahasiswa untuk difinalisasi.", 400);
  }

  const unfinished = relevantRevisions.filter((item) => !isRevisionFinished(item));
  if (unfinished.length > 0) throwError("Masih ada item revisi yang belum disetujui.", 400);

  const supervisorRelation = await coreRepo.findDefenceSupervisorRole(defenceId, lecturerId);
  const supervisorRole = resolveSupervisorMembership(supervisorRelation);

  const finalized = await coreRepo.updateDefence(defenceId, {
    revisionFinalizedAt: new Date(),
    revisionFinalizedBy: supervisorRole.id,
  });

  return {
    defenceId: finalized.id,
    revisionFinalizedAt: finalized.revisionFinalizedAt,
    revisionFinalizedBy: finalized.revisionFinalizedBy,
  };
}

// ============================================================
// PUBLIC: Unfinalize Revisions (Supervisor)
// ============================================================

export async function unfinalizeRevisions(defenceId, lecturerId, user) {
  const defence = await coreRepo.findDefenceBasicById(defenceId);
  const { isSupervisor } = checkRevisionAccessibility(defence, user);

  if (!isSupervisor) {
    throwError("Hanya dosen pembimbing yang dapat membatalkan finalisasi revisi.", 403);
  }

  if (!defence.revisionFinalizedBy) throwError("Revisi sidang belum difinalisasi.", 400);

  const updated = await coreRepo.updateDefence(defenceId, {
    revisionFinalizedAt: null,
    revisionFinalizedBy: null,
  });

  return {
    defenceId: updated.id,
    revisionFinalizedAt: null,
    revisionFinalizedBy: null,
  };
}
