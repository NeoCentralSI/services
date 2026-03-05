import prisma from "../../config/prisma.js";

// ============================================================
// Shared Prisma Includes
// ============================================================

const seminarWithThesisInclude = {
  thesis: {
    select: {
      id: true,
      title: true,
      student: {
        select: {
          id: true,
          user: {
            select: { fullName: true, identityNumber: true },
          },
        },
      },
      thesisSupervisors: {
        select: {
          lecturerId: true,
          lecturer: {
            select: { user: { select: { fullName: true } } },
          },
          role: { select: { name: true } },
        },
      },
    },
  },
  examiners: { orderBy: { order: "asc" } },
  room: true,
};

// ============================================================
// Helper: enrich examiners with lecturer names
// ============================================================

export async function enrichExaminers(examiners = []) {
  return Promise.all(
    examiners.map(async (e) => {
      const lecturer = await prisma.lecturer.findUnique({
        where: { id: e.lecturerId },
        select: { user: { select: { fullName: true } } },
      });
      return { ...e, lecturerName: lecturer?.user?.fullName || "-" };
    })
  );
}

// ============================================================
// KETUA DEPARTEMEN — examiner assignment queries
// ============================================================

/**
 * Find all seminars with status 'verified' (ready for examiner assignment)
 * Also includes those with status 'examiner_assigned' that kadep has already handled
 */
export async function findSeminarsForAssignment({ search } = {}) {
  const where = {
    status: { in: ["verified", "examiner_assigned"] },
  };

  if (search) {
    where.thesis = {
      OR: [
        { title: { contains: search } },
        { student: { user: { fullName: { contains: search } } } },
        { student: { user: { identityNumber: { contains: search } } } },
      ],
    };
  }

  const seminars = await prisma.thesisSeminar.findMany({
    where,
    include: seminarWithThesisInclude,
    orderBy: { createdAt: "desc" },
  });

  // Enrich examiners
  const enriched = await Promise.all(
    seminars.map(async (s) => ({
      ...s,
      examiners: await enrichExaminers(s.examiners),
    }))
  );

  return enriched;
}

/**
 * Get all lecturers eligible to be examiners for a specific seminar.
 * Excludes lecturers who are already supervisors of the same thesis.
 */
export async function findEligibleExaminers(seminarId) {
  // 1) Get the seminar's thesis and its supervisors
  const seminar = await prisma.thesisSeminar.findUnique({
    where: { id: seminarId },
    select: {
      thesis: {
        select: {
          thesisSupervisors: { select: { lecturerId: true } },
        },
      },
    },
  });

  if (!seminar) return [];

  const supervisorIds = (seminar.thesis?.thesisSupervisors || []).map(
    (ts) => ts.lecturerId
  );

  // 2) Get all lecturers excluding those who are supervisors
  const lecturers = await prisma.lecturer.findMany({
    where: {
      id: { notIn: supervisorIds },
    },
    select: {
      id: true,
      user: { select: { fullName: true, identityNumber: true } },
      scienceGroup: { select: { name: true } },
    },
    orderBy: { user: { fullName: "asc" } },
  });

  return lecturers;
}

/**
 * Assign examiners to a seminar.
 * Creates ThesisSeminarExaminer records.
 * Each examiner item can specify its own availabilityStatus (defaults to 'pending').
 */
export async function createExaminers(
  seminarId,
  examiners,
  assignedBy
) {
  // examiners = [{ lecturerId, order, availabilityStatus? }]
  const now = new Date();
  const data = examiners.map((e) => ({
    thesisSeminarId: seminarId,
    lecturerId: e.lecturerId,
    order: e.order,
    assignedBy,
    assignedAt: now,
    availabilityStatus: e.availabilityStatus || "pending",
    // If auto-approved, set respondedAt
    respondedAt: e.availabilityStatus === "available" ? now : null,
  }));

  return prisma.thesisSeminarExaminer.createMany({ data });
}

/**
 * Delete only PENDING examiners for a seminar (for reassignment).
 * Rejected (unavailable) examiners are kept as historical log.
 */
export async function deletePendingExaminers(seminarId) {
  return prisma.thesisSeminarExaminer.deleteMany({
    where: {
      thesisSeminarId: seminarId,
      availabilityStatus: "pending",
    },
  });
}

/**
 * Get ALL examiners for a seminar (including rejected history)
 */
export async function findExaminersBySeminar(seminarId) {
  const examiners = await prisma.thesisSeminarExaminer.findMany({
    where: { thesisSeminarId: seminarId },
    orderBy: [{ order: "asc" }, { assignedAt: "desc" }],
  });
  return enrichExaminers(examiners);
}

/**
 * Get only ACTIVE examiners (pending/available) for a seminar.
 * Excludes rejected (unavailable) examiners that are kept as log.
 */
export async function findActiveExaminersBySeminar(seminarId) {
  const examiners = await prisma.thesisSeminarExaminer.findMany({
    where: {
      thesisSeminarId: seminarId,
      availabilityStatus: { in: ["pending", "available"] },
    },
    orderBy: { order: "asc" },
  });
  return enrichExaminers(examiners);
}

// ============================================================
// LECTURER — seminar overview queries
// ============================================================

/**
 * Find seminars where the lecturer is assigned as examiner.
 * (Permintaan Menguji tab)
 */
export async function findExaminerRequestsByLecturerId(lecturerId, { search } = {}) {
  const where = {
    status: { notIn: ["cancelled"] },
    examiners: { some: { lecturerId } },
  };

  if (search) {
    where.thesis = {
      OR: [
        { title: { contains: search } },
        { student: { user: { fullName: { contains: search } } } },
        { student: { user: { identityNumber: { contains: search } } } },
      ],
    };
  }

  const seminars = await prisma.thesisSeminar.findMany({
    where,
    include: seminarWithThesisInclude,
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    seminars.map(async (s) => ({
      ...s,
      examiners: await enrichExaminers(s.examiners),
    }))
  );
}

/**
 * Find seminars where the lecturer is a thesis supervisor.
 * (Mahasiswa Bimbingan tab)
 */
export async function findSupervisedStudentSeminars(lecturerId, { search } = {}) {
  const where = {
    status: { notIn: ["cancelled"] },
    thesis: {
      thesisSupervisors: { some: { lecturerId } },
    },
  };

  if (search) {
    where.thesis = {
      ...where.thesis,
      OR: [
        { title: { contains: search } },
        { student: { user: { fullName: { contains: search } } } },
        { student: { user: { identityNumber: { contains: search } } } },
      ],
    };
  }

  const seminars = await prisma.thesisSeminar.findMany({
    where,
    include: seminarWithThesisInclude,
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    seminars.map(async (s) => ({
      ...s,
      examiners: await enrichExaminers(s.examiners),
    }))
  );
}

/**
 * Get a single seminar detail (for lecturer view)
 */
export async function findSeminarDetailById(seminarId) {
  const seminar = await prisma.thesisSeminar.findUnique({
    where: { id: seminarId },
    include: {
      ...seminarWithThesisInclude,
      documents: {
        include: {
          verifier: { select: { fullName: true } },
        },
      },
    },
  });

  if (!seminar) return null;

  return {
    ...seminar,
    examiners: await enrichExaminers(seminar.examiners),
  };
}

/**
 * Update examiner availability status (approve/reject)
 */
export async function updateExaminerAvailability(
  examinerId,
  status
) {
  return prisma.thesisSeminarExaminer.update({
    where: { id: examinerId },
    data: {
      availabilityStatus: status,
      respondedAt: new Date(),
    },
  });
}

/**
 * Find a specific examiner record by id
 */
export async function findExaminerById(examinerId) {
  return prisma.thesisSeminarExaminer.findUnique({
    where: { id: examinerId },
  });
}

/**
 * Count examiners by availability status for a seminar
 */
export async function countExaminersByStatus(seminarId) {
  return prisma.thesisSeminarExaminer.findMany({
    where: { thesisSeminarId: seminarId },
    select: { availabilityStatus: true },
  });
}

/**
 * Update seminar status
 */
export async function updateSeminarStatus(seminarId, status) {
  return prisma.thesisSeminar.update({
    where: { id: seminarId },
    data: { status },
  });
}

// ============================================================
// LECTURER — ongoing seminar assessment & finalization
// ============================================================

/**
 * Get active seminar assessment criteria (seminar/default role) grouped by CPMK.
 */
export async function findSeminarAssessmentCpmks() {
  return prisma.cpmk.findMany({
    where: {
      type: "thesis",
      isActive: true,
      assessmentCriterias: {
        some: {
          appliesTo: "seminar",
          role: "default",
          isActive: true,
        },
      },
    },
    include: {
      assessmentCriterias: {
        where: {
          appliesTo: "seminar",
          role: "default",
          isActive: true,
        },
        include: {
          assessmentRubrics: {
            orderBy: { displayOrder: "asc" },
          },
        },
        orderBy: { displayOrder: "asc" },
      },
    },
    orderBy: { code: "asc" },
  });
}

/**
 * Get latest examiner record for lecturer in a seminar.
 */
export async function findLatestExaminerBySeminarAndLecturer(seminarId, lecturerId) {
  return prisma.thesisSeminarExaminer.findFirst({
    where: {
      thesisSeminarId: seminarId,
      lecturerId,
    },
    orderBy: { assignedAt: "desc" },
    include: {
      thesisSeminarExaminerAssessmentDetails: true,
    },
  });
}

/**
 * Persist examiner assessment details and total score in one transaction.
 */
export async function saveExaminerAssessment({ examinerId, scores, revisionNotes }) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.thesisSeminarExaminerAssessmentDetail.deleteMany({
      where: { thesisSeminarExaminerId: examinerId },
    });

    if (scores.length > 0) {
      await tx.thesisSeminarExaminerAssessmentDetail.createMany({
        data: scores.map((item) => ({
          thesisSeminarExaminerId: examinerId,
          assessmentCriteriaId: item.assessmentCriteriaId,
          score: item.score,
        })),
      });
    }

    const totalScore = scores.reduce((sum, item) => sum + item.score, 0);

    const updatedExaminer = await tx.thesisSeminarExaminer.update({
      where: { id: examinerId },
      data: {
        assessmentScore: totalScore,
        revisionNotes: revisionNotes || null,
        assessmentSubmittedAt: now,
      },
    });

    return updatedExaminer;
  });
}

/**
 * Get active examiners and their assessment payload for a seminar.
 */
export async function findActiveExaminersWithAssessments(seminarId) {
  return prisma.thesisSeminarExaminer.findMany({
    where: {
      thesisSeminarId: seminarId,
      availabilityStatus: "available",
    },
    include: {
      thesisSeminarExaminerAssessmentDetails: {
        include: {
          criteria: {
            select: {
              id: true,
              name: true,
              maxScore: true,
              displayOrder: true,
              cpmk: {
                select: {
                  id: true,
                  code: true,
                  description: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { order: "asc" },
  });
}

/**
 * Find supervisor role relation in seminar's thesis.
 */
export async function findSeminarSupervisorRole(seminarId, lecturerId) {
  return prisma.thesisSeminar.findFirst({
    where: {
      id: seminarId,
      thesis: {
        thesisSupervisors: {
          some: { lecturerId },
        },
      },
    },
    select: {
      id: true,
      thesis: {
        select: {
          thesisSupervisors: {
            where: { lecturerId },
            select: {
              id: true,
              role: { select: { name: true } },
            },
            take: 1,
          },
        },
      },
    },
  });
}

/**
 * Finalize seminar result (status + final score metadata).
 */
export async function finalizeSeminarResult({ seminarId, status, finalScore, grade }) {
  return prisma.thesisSeminar.update({
    where: { id: seminarId },
    data: {
      status,
      finalScore,
      grade,
      resultFinalizedAt: new Date(),
    },
  });
}

/**
 * Finalize seminar revisions metadata.
 */
export async function finalizeSeminarRevisions({ seminarId, supervisorId }) {
  return prisma.thesisSeminar.update({
    where: { id: seminarId },
    data: {
      revisionFinalizedAt: new Date(),
      revisionFinalizedBy: supervisorId,
    },
    select: {
      id: true,
      revisionFinalizedAt: true,
      revisionFinalizedBy: true,
    },
  });
}

/**
 * Get seminar revisions list (for supervisor revision monitoring).
 */
export async function findSeminarRevisionsBySeminarId(seminarId) {
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
      { isFinished: "asc" },
      { studentSubmittedAt: "desc" },
      { id: "asc" },
    ],
  });
}

/**
 * Approve a revision item by supervisor.
 */
export async function approveRevisionItem(revisionId, supervisorId) {
  return prisma.thesisSeminarRevision.update({
    where: { id: revisionId },
    data: {
      isFinished: true,
      approvedBy: supervisorId,
      supervisorApprovedAt: new Date(),
    },
  });
}

/**
 * Unapprove a revision item (reset approval).
 */
export async function unapproveRevisionItem(revisionId) {
  return prisma.thesisSeminarRevision.update({
    where: { id: revisionId },
    data: {
      isFinished: false,
      approvedBy: null,
      supervisorApprovedAt: null,
    },
  });
}

/**
 * Find a revision by ID with full relations.
 */
export async function findRevisionByIdFull(revisionId) {
  return prisma.thesisSeminarRevision.findUnique({
    where: { id: revisionId },
    include: {
      seminarExaminer: {
        select: {
          id: true,
          thesisSeminarId: true,
          seminar: {
            select: {
              id: true,
              status: true,
              thesis: {
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });
}

// ============================================================
// Audience / Attendance
// ============================================================

/**
 * Get all audience registrations for a seminar.
 */
export async function findSeminarAudiences(seminarId) {
  return prisma.thesisSeminarAudience.findMany({
    where: { thesisSeminarId: seminarId },
    select: {
      thesisSeminarId: true,
      studentId: true,
      registeredAt: true,
      isPresent: true,
      approvedAt: true,
      approvedBy: true,
      student: {
        select: {
          user: { select: { fullName: true, identityNumber: true } },
        },
      },
      supervisor: {
        select: {
          lecturer: {
            select: {
              user: { select: { fullName: true } },
            },
          },
        },
      },
    },
    orderBy: { registeredAt: "asc" },
  });
}

/**
 * Approve an audience registration (supervisor sets approvedBy + approvedAt).
 */
export async function approveAudienceRegistration(seminarId, studentId, supervisorId) {
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
 * Reset approval data so audience goes back to initial registration state.
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
      isPresent: false,
    },
  });
}

/**
 * Toggle audience presence status by supervisor.
 */
export async function toggleAudiencePresence(seminarId, studentId, isPresent) {
  return prisma.thesisSeminarAudience.update({
    where: {
      thesisSeminarId_studentId: {
        thesisSeminarId: seminarId,
        studentId,
      },
    },
    data: { isPresent },
  });
}
