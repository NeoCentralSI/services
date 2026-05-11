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
      approvedAt: { not: null },
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
 * Get all announced (scheduled/past) seminars for the announcement board,
 * including the current student's audience registration status.
 */
export async function getAllAnnouncedSeminars(studentId) {
  return prisma.thesisSeminar.findMany({
    where: {
      status: { in: ["scheduled", "passed", "passed_with_revision", "failed"] },
      date: { not: null },
    },
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      status: true,
      meetingLink: true,
      room: { select: { id: true, name: true } },
      thesis: {
        select: {
          id: true,
          title: true,
          student: {
            select: {
              id: true,
              user: { select: { fullName: true } },
            },
          },
          thesisSupervisors: {
            select: {
              role: { select: { name: true } },
              lecturer: {
                select: { user: { select: { fullName: true } } },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
      examiners: {
        where: { availabilityStatus: "available" },
        select: {
          order: true,
          lecturerId: true,
        },
        orderBy: { order: "asc" },
      },
      audiences: {
        where: { studentId },
        select: { studentId: true, approvedAt: true, registeredAt: true },
      },
    },
    orderBy: { date: "desc" },
  });
}

/**
 * Find a single audience record for a student in a seminar
 */
export async function findAudienceRegistration(seminarId, studentId) {
  return prisma.thesisSeminarAudience.findUnique({
    where: { thesisSeminarId_studentId: { thesisSeminarId: seminarId, studentId } },
  });
}

/**
 * Register a student as an audience for a seminar
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
 * Remove a student's audience registration from a seminar
 */
export async function deleteAudienceRegistration(seminarId, studentId) {
  return prisma.thesisSeminarAudience.delete({
    where: { thesisSeminarId_studentId: { thesisSeminarId: seminarId, studentId } },
  });
}

/**
 * Check supervisor seminar readiness for a thesis
 */
export async function getSupervisorSeminarReadiness(thesisId) {
  return prisma.thesisParticipant.findMany({
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

// ============================================================
// Student Revision CRUD
// ============================================================

/**
 * Get student's seminar revisions for a specific seminar.
 */
export async function getStudentSeminarRevisions(seminarId) {
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

/**
 * Create a new revision item for a student.
 */
export async function createStudentRevision({ seminarExaminerId, description }) {
  return prisma.thesisSeminarRevision.create({
    data: {
      seminarExaminerId,
      description,
    },
  });
}

/**
 * Find a revision by ID.
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

/**
 * Submit revision action by student.
 */
export async function submitRevisionAction(revisionId, revisionAction) {
  return prisma.thesisSeminarRevision.update({
    where: { id: revisionId },
    data: {
      revisionAction,
      studentSubmittedAt: new Date(),
    },
  });
}

/**
 * Get all seminars for a student's thesis (for history).
 */
export async function getAllStudentSeminars(studentId) {
  return prisma.thesisSeminar.findMany({
    where: {
      thesis: { studentId },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      registeredAt: true,
      date: true,
      startTime: true,
      endTime: true,
      finalScore: true,
      resultFinalizedAt: true,
      cancelledReason: true,
      meetingLink: true,
      room: { select: { id: true, name: true } },
      examiners: {
        where: { availabilityStatus: "available" },
        select: {
          id: true,
          lecturerId: true,
          order: true,
          assessmentScore: true,
          assessmentSubmittedAt: true,
        },
        orderBy: { order: "asc" },
      },
    },
  });
}

/**
 * Find a specific seminar by ID with full detail for student view.
 */
export async function findStudentSeminarDetail(seminarId) {
  return prisma.thesisSeminar.findUnique({
    where: { id: seminarId },
    select: {
      id: true,
      thesisId: true,
      status: true,
      registeredAt: true,
      date: true,
      startTime: true,
      endTime: true,
      meetingLink: true,
      finalScore: true,
      resultFinalizedAt: true,
      cancelledReason: true,
      room: { select: { id: true, name: true } },
      thesis: {
        select: {
          id: true,
          studentId: true,
          title: true,
          thesisSupervisors: {
            select: {
              role: { select: { name: true } },
              lecturer: {
                select: {
                  user: { select: { fullName: true } },
                },
              },
            },
          },
        },
      },
      examiners: {
        where: { availabilityStatus: "available" },
        select: {
          id: true,
          lecturerId: true,
          order: true,
          assessmentScore: true,
          assessmentSubmittedAt: true,
          revisionNotes: true,
        },
        orderBy: { order: "asc" },
      },
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
      audiences: {
        select: {
          studentId: true,
          registeredAt: true,
          approvedAt: true,
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
      },
    },
  });
}

/**
 * Get audience list for a seminar.
 */
export async function getSeminarAudiences(seminarId) {
  return prisma.thesisSeminarAudience.findMany({
    where: { thesisSeminarId: seminarId },
    select: {
      studentId: true,
      registeredAt: true,
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
