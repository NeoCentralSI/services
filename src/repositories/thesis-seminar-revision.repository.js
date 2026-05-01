import prisma from "../config/prisma.js";

// ============================================================
// REVISION LIST
// ============================================================

/**
 * Get all revisions for a seminar.
 * Joins through ThesisSeminarExaminer to filter by seminarId.
 * Includes examiner info and supervisor approval info.
 */
export async function findRevisionsBySeminarId(seminarId) {
  return prisma.thesisSeminarRevision.findMany({
    where: {
      seminarExaminer: {
        thesisSeminarId: seminarId,
      },
    },
    include: {
      seminarExaminer: {
        select: {
          id: true,
          order: true,
          lecturerId: true,
        },
      },
      supervisor: {
        select: {
          id: true,
          role: { select: { name: true } },
          lecturer: {
            select: {
              id: true,
              user: { select: { fullName: true } },
            },
          },
        },
      },
    },
    orderBy: [
      { supervisorApprovedAt: "asc" },
      { studentSubmittedAt: "desc" },
      { id: "asc" },
    ],
  });
}

// ============================================================
// REVISION DETAIL
// ============================================================

/**
 * Find a revision by ID with full relations (for ownership/status checks).
 */
export async function findRevisionById(revisionId) {
  return prisma.thesisSeminarRevision.findUnique({
    where: { id: revisionId },
    include: {
      seminarExaminer: {
        select: {
          id: true,
          thesisSeminarId: true,
          lecturerId: true,
          order: true,
          seminar: {
            select: {
              id: true,
              status: true,
              thesis: {
                select: {
                  id: true,
                  studentId: true,
                },
              },
            },
          },
        },
      },
    },
  });
}

// ============================================================
// REVISION CRUD
// ============================================================

/**
 * Create a new revision item.
 */
export async function createRevision({ seminarExaminerId, description, revisionAction }) {
  return prisma.thesisSeminarRevision.create({
    data: {
      seminarExaminerId,
      description,
      revisionAction,
    },
  });
}

/**
 * Generic update for a revision (description, revisionAction, etc.)
 */
export async function updateRevision(revisionId, data) {
  return prisma.thesisSeminarRevision.update({
    where: { id: revisionId },
    data,
  });
}

/**
 * Delete a revision record.
 */
export async function deleteRevision(revisionId) {
  return prisma.thesisSeminarRevision.delete({
    where: { id: revisionId },
  });
}

// ============================================================
// REVISION APPROVAL (Supervisor)
// ============================================================

/**
 * Approve a revision item by supervisor.
 */
export async function approveRevision(revisionId, supervisorId) {
  return prisma.thesisSeminarRevision.update({
    where: { id: revisionId },
    data: {
      approvedBy: supervisorId,
      supervisorApprovedAt: new Date(),
    },
  });
}

/**
 * Unapprove a revision item (reset approval).
 */
export async function unapproveRevision(revisionId) {
  return prisma.thesisSeminarRevision.update({
    where: { id: revisionId },
    data: {
      approvedBy: null,
      supervisorApprovedAt: null,
    },
  });
}
