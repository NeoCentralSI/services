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
