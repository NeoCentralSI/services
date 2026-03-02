import prisma from "../../config/prisma.js";

/**
 * Get the student's thesis with supervisor seminar readiness
 */
export async function getStudentThesisWithSeminarInfo(studentId) {
  return prisma.thesis.findFirst({
    where: { studentId },
    select: {
      id: true,
      title: true,
      rating: true,
      thesisSupervisors: {
        select: {
          id: true,
          lecturerId: true,
          seminarReady: true,
          role: { select: { id: true, name: true } },
          lecturer: {
            select: {
              id: true,
              user: { select: { id: true, fullName: true } },
            },
          },
        },
      },
      thesisGuidances: {
        where: { status: "completed" },
        select: { id: true },
      },
      thesisSeminars: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          registeredAt: true,
          date: true,
          startTime: true,
          endTime: true,
          meetingLink: true,
          finalScore: true,
          grade: true,
          resultFinalizedAt: true,
          cancelledReason: true,
          room: { select: { id: true, name: true } },
          documents: {
            select: {
              thesisSeminarId: true,
              documentTypeId: true,
              documentId: true,
              status: true,
              submittedAt: true,
              verifiedAt: true,
              notes: true,
            },
          },
          examiners: {
            select: {
              id: true,
              lecturerId: true,
              order: true,
              availabilityStatus: true,
              assessmentScore: true,
              assessmentSubmittedAt: true,
              revisionNotes: true,
              seminar: { select: { id: true } },
            },
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });
}

/**
 * Count completed guidances for a thesis
 */
export async function countCompletedGuidances(thesisId) {
  return prisma.thesisGuidance.count({
    where: {
      thesisId,
      status: "completed",
    },
  });
}

/**
 * Count attended seminars by student (as audience)
 */
export async function countSeminarAttendance(studentId) {
  return prisma.thesisSeminarAudience.count({
    where: {
      studentId,
      isPresent: true,
    },
  });
}

/**
 * Get seminar attendance history for a student
 */
export async function getSeminarAttendanceHistory(studentId) {
  return prisma.thesisSeminarAudience.findMany({
    where: { studentId },
    select: {
      thesisSeminarId: true,
      isPresent: true,
      approvedAt: true,
      registeredAt: true,
      supervisor: {
        select: {
          lecturer: {
            select: {
              user: { select: { fullName: true } },
            },
          },
        },
      },
      seminar: {
        select: {
          id: true,
          date: true,
          status: true,
          thesis: {
            select: {
              title: true,
              student: {
                select: {
                  user: { select: { fullName: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: {
      seminar: { date: "desc" },
    },
  });
}

/**
 * Check supervisor seminar readiness for a thesis
 */
export async function getSupervisorSeminarReadiness(thesisId) {
  return prisma.thesisSupervisors.findMany({
    where: { thesisId },
    select: {
      id: true,
      seminarReady: true,
      lecturer: {
        select: {
          user: { select: { fullName: true } },
        },
      },
      role: { select: { name: true } },
    },
  });
}
