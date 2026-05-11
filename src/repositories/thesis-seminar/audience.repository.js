import prisma from "../../config/prisma.js";

// ============================================================
// AUDIENCE LIST
// ============================================================

/**
 * Get all audience registrations for a seminar.
 * Includes student info and supervisor (approver) info.
 */
export async function findAudiencesBySeminarId(seminarId) {
  return prisma.thesisSeminarAudience.findMany({
    where: { thesisSeminarId: seminarId },
    select: {
      thesisSeminarId: true,
      studentId: true,
      registeredAt: true,
      approvedAt: true,
      approvedBy: true,
      createdAt: true,
      student: {
        select: {
          id: true,
          user: { select: { fullName: true, identityNumber: true } },
        },
      },
      supervisor: {
        select: {
          id: true,
          lecturer: {
            select: { user: { select: { fullName: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

// ============================================================
// AUDIENCE LOOKUP
// ============================================================

/**
 * Find a single audience record by composite key.
 */
export async function findAudienceByKey(seminarId, studentId) {
  return prisma.thesisSeminarAudience.findUnique({
    where: {
      thesisSeminarId_studentId: {
        thesisSeminarId: seminarId,
        studentId,
      },
    },
    select: { thesisSeminarId: true, studentId: true, approvedAt: true },
  });
}

// ============================================================
// AUDIENCE CRUD
// ============================================================

/**
 * Create a single audience record (admin adds audience to archive).
 */
export async function createAudience({ seminarId, studentId, supervisorId, seminarDate }) {
  return prisma.thesisSeminarAudience.create({
    data: {
      thesisSeminarId: seminarId,
      studentId,
      approvedBy: supervisorId,
      registeredAt: seminarDate,
      approvedAt: seminarDate,
    },
  });
}

/**
 * Bulk-create audience records (import from Excel).
 * Uses skipDuplicates to avoid errors on re-import.
 */
export async function createAudiencesMany(records) {
  return prisma.thesisSeminarAudience.createMany({
    data: records,
    skipDuplicates: true,
  });
}

/**
 * Delete an audience record.
 */
export async function deleteAudience(seminarId, studentId) {
  return prisma.thesisSeminarAudience.delete({
    where: {
      thesisSeminarId_studentId: {
        thesisSeminarId: seminarId,
        studentId,
      },
    },
  });
}

// ============================================================
// STUDENT SELF-REGISTRATION (from announcement board)
// ============================================================

/**
 * Find a student's audience registration for a specific seminar.
 */
export async function findAudienceRegistration(seminarId, studentId) {
  return prisma.thesisSeminarAudience.findUnique({
    where: {
      thesisSeminarId_studentId: {
        thesisSeminarId: seminarId,
        studentId,
      },
    },
  });
}

/**
 * Register a student as audience (self-registration, no approval yet).
 */
export async function createAudienceRegistration(seminarId, studentId) {
  return prisma.thesisSeminarAudience.create({
    data: {
      thesisSeminarId: seminarId,
      studentId,
      registeredAt: new Date(),
    },
  });
}

/**
 * Cancel a student's audience registration.
 */
export async function deleteAudienceRegistration(seminarId, studentId) {
  return prisma.thesisSeminarAudience.delete({
    where: {
      thesisSeminarId_studentId: {
        thesisSeminarId: seminarId,
        studentId,
      },
    },
  });
}

// ============================================================
// AUDIENCE APPROVAL & PRESENCE (Supervisor / Admin)
// ============================================================

/**
 * Approve an audience registration (supervisor sets approvedBy + approvedAt).
 */
export async function approveAudience(seminarId, studentId, supervisorId) {
  return prisma.thesisSeminarAudience.update({
    where: {
      thesisSeminarId_studentId: {
        thesisSeminarId: seminarId,
        studentId,
      },
    },
    data: {
      approvedBy: supervisorId,
      approvedAt: new Date(),
    },
  });
}

/**
 * Reset audience approval (unapprove).
 */
export async function resetAudienceApproval(seminarId, studentId) {
  return prisma.thesisSeminarAudience.update({
    where: {
      thesisSeminarId_studentId: {
        thesisSeminarId: seminarId,
        studentId,
      },
    },
    data: {
      approvedBy: null,
      approvedAt: null,
    },
  });
}

/**
 * Toggle audience presence status.
 */
export async function toggleAudiencePresence(seminarId, studentId, isPresent) {
  return prisma.thesisSeminarAudience.update({
    where: {
      thesisSeminarId_studentId: {
        thesisSeminarId: seminarId,
        studentId,
      },
    },
    data: {
      approvedAt: isPresent ? new Date() : null,
    },
  });
}

// ============================================================
// OPTIONS
// ============================================================

/**
 * Students not yet registered as audience for a specific seminar.
 * Only includes students who have a thesis.
 */
export async function findStudentOptionsForAudience(seminarId) {
  return prisma.student.findMany({
    where: {
      NOT: {
        thesisSeminarAudiences: { some: { thesisSeminarId: seminarId } },
      },
      thesis: { some: {} },
    },
    select: {
      id: true,
      user: { select: { fullName: true, identityNumber: true } },
    },
    orderBy: { user: { fullName: "asc" } },
  });
}
