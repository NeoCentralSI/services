import prisma from "../config/prisma.js";

// ============================================================
// HELPER: Enrich examiners with lecturer names
// (Re-exported for convenience; also available from thesis-seminar.repository.js)
// ============================================================

async function enrichExaminers(examiners = []) {
  if (examiners.length === 0) return [];

  const lecturerIds = [...new Set(examiners.map((e) => e.lecturerId))];
  const lecturers = await prisma.lecturer.findMany({
    where: { id: { in: lecturerIds } },
    select: { id: true, user: { select: { fullName: true } } },
  });
  const lecturerMap = new Map(lecturers.map((l) => [l.id, l.user?.fullName || "-"]));

  return examiners.map((e) => ({
    ...e,
    lecturerName: lecturerMap.get(e.lecturerId) || "-",
  }));
}

// ============================================================
// ELIGIBLE EXAMINERS
// ============================================================

/**
 * Get all lecturers eligible to be examiners for a specific seminar.
 * Excludes lecturers who are already supervisors of the same thesis.
 */
export async function findEligibleExaminers(seminarId) {
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

  return prisma.lecturer.findMany({
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
}

// ============================================================
// EXAMINER ASSIGNMENT
// ============================================================

/**
 * Assign examiners to a seminar (Kadep action).
 * @param {string} seminarId
 * @param {Array<{lecturerId: string, order: number, availabilityStatus?: string}>} examiners
 * @param {string} assignedBy - User ID of the assigner
 */
export async function createExaminers(seminarId, examiners, assignedBy) {
  const now = new Date();
  const data = examiners.map((e) => ({
    thesisSeminarId: seminarId,
    lecturerId: e.lecturerId,
    order: e.order,
    assignedBy,
    assignedAt: now,
    availabilityStatus: e.availabilityStatus || "pending",
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

// ============================================================
// EXAMINER QUERIES
// ============================================================

/**
 * Get ALL examiners for a seminar (including rejected history), enriched with names.
 */
export async function findExaminersBySeminar(seminarId) {
  const examiners = await prisma.thesisSeminarExaminer.findMany({
    where: { thesisSeminarId: seminarId },
    orderBy: [{ order: "asc" }, { assignedAt: "desc" }],
  });
  return enrichExaminers(examiners);
}

/**
 * Get only ACTIVE examiners (pending/available) for a seminar, enriched with names.
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

/**
 * Find a specific examiner record by id.
 */
export async function findExaminerById(examinerId) {
  return prisma.thesisSeminarExaminer.findUnique({
    where: { id: examinerId },
  });
}

/**
 * Update examiner availability status (accept/reject assignment).
 */
export async function updateExaminerAvailability(examinerId, status) {
  return prisma.thesisSeminarExaminer.update({
    where: { id: examinerId },
    data: {
      availabilityStatus: status,
      respondedAt: new Date(),
    },
  });
}

/**
 * Get latest examiner record for a lecturer in a seminar.
 * Used to find the current examiner entry when there may be reassignment history.
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

// ============================================================
// ASSESSMENTS
// ============================================================

/**
 * Persist examiner assessment scores and total in one transaction.
 * Replaces any existing scores (upsert pattern via delete + create).
 */
export async function saveExaminerAssessment({ examinerId, scores, revisionNotes }) {
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    // Clear existing detail scores
    await tx.thesisSeminarExaminerAssessmentDetail.deleteMany({
      where: { thesisSeminarExaminerId: examinerId },
    });

    // Insert new scores
    if (scores.length > 0) {
      await tx.thesisSeminarExaminerAssessmentDetail.createMany({
        data: scores.map((item) => ({
          thesisSeminarExaminerId: examinerId,
          assessmentCriteriaId: item.assessmentCriteriaId,
          score: item.score,
        })),
      });
    }

    // Update examiner total score
    const totalScore = scores.reduce((sum, item) => sum + item.score, 0);

    return tx.thesisSeminarExaminer.update({
      where: { id: examinerId },
      data: {
        assessmentScore: totalScore,
        revisionNotes: revisionNotes || null,
        assessmentSubmittedAt: now,
      },
    });
  });
}

/**
 * Get active examiners with their assessment details for finalization view.
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
 * Get seminar assessment criteria (CPMK + criteria + rubrics) for the grading form.
 */
export async function findSeminarAssessmentCpmks() {
  return prisma.cpmk.findMany({
    where: {
      type: "thesis",
      assessmentCriterias: {
        some: {
          appliesTo: "seminar",
          role: "default",
        },
      },
    },
    include: {
      assessmentCriterias: {
        where: {
          appliesTo: "seminar",
          role: "default",
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
