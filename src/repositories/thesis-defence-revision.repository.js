import prisma from "../config/prisma.js";

// ============================================================
// REVISION QUERIES
// ============================================================

export async function findRevisionsByDefenceId(defenceId) {
  return prisma.thesisDefenceRevision.findMany({
    where: { defenceExaminer: { thesisDefenceId: defenceId } },
    include: {
      defenceExaminer: {
        select: { id: true, order: true, lecturerId: true },
      },
      supervisor: {
        select: {
          id: true,
          role: { select: { name: true } },
          lecturer: {
            select: { id: true, user: { select: { fullName: true } } },
          },
        },
      },
    },
    orderBy: [{ supervisorApprovedAt: "asc" }, { studentSubmittedAt: "desc" }, { id: "asc" }],
  });
}

export async function findRevisionById(revisionId) {
  return prisma.thesisDefenceRevision.findUnique({
    where: { id: revisionId },
    include: {
      defenceExaminer: {
        select: {
          id: true,
          thesisDefenceId: true,
          lecturerId: true,
          order: true,
          defence: {
            select: {
              id: true,
              status: true,
              thesis: { select: { id: true, studentId: true } },
            },
          },
        },
      },
      supervisor: {
        select: {
          lecturer: { select: { user: { select: { fullName: true } } } },
        },
      },
    },
  });
}

// ============================================================
// REVISION CRUD
// ============================================================

export async function createRevision({ defenceExaminerId, description, revisionAction }) {
  return prisma.thesisDefenceRevision.create({
    data: { 
      defenceExaminerId, 
      description,
      revisionAction
    },
  });
}

export async function updateRevision(revisionId, data) {
  return prisma.thesisDefenceRevision.update({
    where: { id: revisionId },
    data,
  });
}

export async function deleteRevision(revisionId) {
  return prisma.thesisDefenceRevision.delete({ where: { id: revisionId } });
}

// ============================================================
// REVISION APPROVAL (Supervisor)
// ============================================================

export async function approveRevision(revisionId, supervisorId) {
  return prisma.thesisDefenceRevision.update({
    where: { id: revisionId },
    data: {
      approvedBy: supervisorId,
      supervisorApprovedAt: new Date(),
    },
  });
}

export async function unapproveRevision(revisionId) {
  return prisma.thesisDefenceRevision.update({
    where: { id: revisionId },
    data: {
      approvedBy: null,
      supervisorApprovedAt: null,
    },
  });
}

// ============================================================
// EXAMINER LOOKUP (for revision creation validation)
// ============================================================

export async function findExaminerByIdAndDefence(examinerId, defenceId) {
  return prisma.thesisDefenceExaminer.findFirst({
    where: { id: examinerId, thesisDefenceId: defenceId },
  });
}
