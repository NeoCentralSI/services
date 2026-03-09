import prisma from "../config/prisma.js";

// Active statuses that block new requests (exclusive lock)
const ACTIVE_STATUSES = ["pending", "escalated"];
const BLOCKING_STATUSES = [
  "pending",
  "escalated",
  "approved",
  "override_approved",
  "redirected",
  "assigned",
];
const CLOSED_THESIS_STATUS_NAMES = ["Selesai", "Gagal"];

/**
 * Find student record by authenticated user id.
 * In this schema, Student.id maps to user_id, so the JWT subject can be used directly.
 */
export const findStudentByUserId = async (userId) => {
  return prisma.student.findUnique({
    where: { id: userId },
    select: {
      id: true,
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          identityNumber: true,
        },
      },
    },
  });
};

/**
 * Resolve the latest thesis + gate milestones + supervisors for advisor access checks.
 */
export const findStudentAdvisorAccessContext = async (userId) => {
  return prisma.student.findUnique({
    where: { id: userId },
    select: {
      id: true,
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          identityNumber: true,
        },
      },
      thesis: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          thesisStatus: {
            select: { id: true, name: true },
          },
          thesisSupervisors: {
            select: {
              id: true,
              lecturerId: true,
              role: {
                select: { id: true, name: true },
              },
              lecturer: {
                select: {
                  id: true,
                  user: {
                    select: {
                      id: true,
                      fullName: true,
                      email: true,
                      avatarUrl: true,
                    },
                  },
                },
              },
            },
          },
          thesisMilestones: {
            where: {
              milestoneTemplate: {
                phase: "metopen",
                isGateToAdvisorSearch: true,
              },
            },
            select: {
              id: true,
              title: true,
              status: true,
              milestoneTemplate: {
                select: {
                  id: true,
                  name: true,
                  isGateToAdvisorSearch: true,
                },
              },
            },
            orderBy: { orderIndex: "asc" },
          },
        },
      },
    },
  });
};

/**
 * Find student's active (pending/escalated) advisor request
 */
export const findActiveByStudent = async (studentId) => {
  return prisma.thesisAdvisorRequest.findFirst({
    where: {
      studentId,
      status: { in: ACTIVE_STATUSES },
    },
    include: {
      lecturer: {
        include: {
          user: { select: { id: true, fullName: true, identityNumber: true } },
          scienceGroup: { select: { id: true, name: true } },
        },
      },
      topic: true,
    },
  });
};

/**
 * Find the latest request that should still block advisor browsing/submission.
 */
export const findBlockingByStudent = async (studentId) => {
  return prisma.thesisAdvisorRequest.findFirst({
    where: {
      studentId,
      status: { in: BLOCKING_STATUSES },
    },
    include: {
      lecturer: {
        include: {
          user: { select: { id: true, fullName: true, identityNumber: true, email: true, avatarUrl: true } },
          scienceGroup: { select: { id: true, name: true } },
        },
      },
      topic: true,
      redirectTarget: {
        include: {
          user: { select: { id: true, fullName: true, identityNumber: true, email: true, avatarUrl: true } },
          scienceGroup: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
};

/**
 * Create a new advisor request
 */
export const create = async (data) => {
  return prisma.thesisAdvisorRequest.create({
    data,
    include: {
      lecturer: {
        include: {
          user: { select: { id: true, fullName: true } },
          scienceGroup: { select: { id: true, name: true } },
        },
      },
      topic: true,
      student: {
        include: {
          user: { select: { id: true, fullName: true, identityNumber: true } },
        },
      },
    },
  });
};

/**
 * Find advisor request by ID with full includes
 */
export const findById = async (id) => {
  return prisma.thesisAdvisorRequest.findUnique({
    where: { id },
    include: {
      student: {
        include: {
          user: { select: { id: true, fullName: true, identityNumber: true, email: true, avatarUrl: true } },
          thesis: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: { id: true, thesisTopicId: true },
          },
        },
      },
      lecturer: {
        include: {
          user: { select: { id: true, fullName: true, identityNumber: true, avatarUrl: true } },
          scienceGroup: { select: { id: true, name: true } },
          supervisionQuotas: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: { quotaMax: true, quotaSoftLimit: true, currentCount: true },
          },
        },
      },
      topic: true,
      academicYear: true,
      reviewer: { select: { id: true, fullName: true } },
      redirectTarget: {
        include: {
          user: { select: { id: true, fullName: true } },
          scienceGroup: { select: { id: true, name: true } },
        },
      },
    },
  });
};

/**
 * Pending requests for a specific lecturer (inbox)
 */
export const findByLecturerId = async (lecturerId) => {
  return prisma.thesisAdvisorRequest.findMany({
    where: {
      lecturerId,
      status: "pending",
      routeType: "normal",
    },
    include: {
      student: {
        include: {
          user: { select: { id: true, fullName: true, identityNumber: true, avatarUrl: true } },
        },
      },
      topic: true,
    },
    orderBy: { createdAt: "asc" },
  });
};

/**
 * Responded/historical requests for a specific lecturer (inbox history)
 */
export const findRespondedByLecturerId = async (lecturerId) => {
  return prisma.thesisAdvisorRequest.findMany({
    where: {
      lecturerId,
      status: { in: ["approved", "rejected", "override_approved", "redirected", "assigned", "withdrawn"] },
    },
    include: {
      student: {
        include: {
          user: { select: { id: true, fullName: true, identityNumber: true, avatarUrl: true } },
        },
      },
      topic: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
};

/**
 * Escalated requests for KaDep queue
 */
export const findEscalated = async () => {
  return prisma.thesisAdvisorRequest.findMany({
    where: {
      status: "escalated",
    },
    include: {
      student: {
        include: {
          user: { select: { id: true, fullName: true, identityNumber: true, avatarUrl: true } },
        },
      },
      lecturer: {
        include: {
          user: { select: { id: true, fullName: true, identityNumber: true } },
          scienceGroup: { select: { id: true, name: true } },
          supervisionQuotas: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: { quotaMax: true, quotaSoftLimit: true, currentCount: true },
          },
        },
      },
      topic: true,
    },
    orderBy: { createdAt: "asc" },
  });
};

/**
 * Approved requests waiting for KaDep assignment
 */
export const findPendingAssignment = async () => {
  return prisma.thesisAdvisorRequest.findMany({
    where: {
      status: { in: ["approved", "override_approved", "redirected"] },
    },
    include: {
      student: {
        include: {
          user: { select: { id: true, fullName: true, identityNumber: true } },
        },
      },
      lecturer: {
        include: {
          user: { select: { id: true, fullName: true } },
          scienceGroup: { select: { id: true, name: true } },
        },
      },
      topic: true,
      redirectTarget: {
        include: {
          user: { select: { id: true, fullName: true } },
          scienceGroup: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
};

/**
 * All requests by a student (history)
 */
export const findByStudent = async (studentId) => {
  return prisma.thesisAdvisorRequest.findMany({
    where: { studentId },
    include: {
      lecturer: {
        include: {
          user: { select: { id: true, fullName: true } },
          scienceGroup: { select: { id: true, name: true } },
        },
      },
      topic: true,
      redirectTarget: {
        include: {
          user: { select: { id: true, fullName: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

/**
 * Update request status and related fields
 */
export const updateStatus = async (id, data) => {
  return prisma.thesisAdvisorRequest.update({
    where: { id },
    data,
    include: {
      student: {
        include: {
          user: { select: { id: true, fullName: true, identityNumber: true } },
        },
      },
      lecturer: {
        include: {
          user: { select: { id: true, fullName: true } },
        },
      },
      topic: true,
    },
  });
};

/**
 * Get lecturer catalog with quota info for advisor browsing
 */
export const getLecturerCatalog = async (academicYearId) => {
  return prisma.lecturerSupervisionQuota.findMany({
    where: {
      academicYearId,
      lecturer: {
        acceptingRequests: true,
      },
    },
    include: {
      lecturer: {
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              identityNumber: true,
              email: true,
              avatarUrl: true,
            },
          },
          scienceGroup: { select: { id: true, name: true } },
          offeredTopics: { select: { id: true, name: true } },
          thesisSupervisors: {
            where: {
              thesis: {
                OR: [
                  { thesisStatus: { is: null } },
                  {
                    thesisStatus: {
                      is: {
                        name: { notIn: CLOSED_THESIS_STATUS_NAMES },
                      },
                    },
                  },
                ],
              },
            },
            select: {
              thesis: {
                select: {
                  id: true,
                  thesisTopicId: true,
                  thesisTopic: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { lecturer: { user: { fullName: "asc" } } },
  });
};

/**
 * Find alternative lecturers in the same science group with available quota
 */
export const findAlternativeLecturers = async (scienceGroupId, academicYearId, excludeLecturerId) => {
  return prisma.lecturerSupervisionQuota.findMany({
    where: {
      academicYearId,
      lecturerId: { not: excludeLecturerId },
      lecturer: {
        scienceGroupId,
        acceptingRequests: true,
      },
    },
    include: {
      lecturer: {
        include: {
          user: {
            select: { id: true, fullName: true, identityNumber: true, avatarUrl: true },
          },
          scienceGroup: { select: { id: true, name: true } },
          thesisSupervisors: {
            where: {
              thesis: {
                OR: [
                  { thesisStatus: { is: null } },
                  {
                    thesisStatus: {
                      is: {
                        name: { notIn: CLOSED_THESIS_STATUS_NAMES },
                      },
                    },
                  },
                ],
              },
            },
            select: {
              thesis: {
                select: {
                  id: true,
                  thesisTopicId: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { currentCount: "asc" },
  });
};

/**
 * Increment lecturer's current supervision count
 */
export const incrementQuotaCount = async (lecturerId, academicYearId) => {
  return prisma.lecturerSupervisionQuota.update({
    where: {
      lecturerId_academicYearId: { lecturerId, academicYearId },
    },
    data: {
      currentCount: { increment: 1 },
    },
  });
};

/**
 * Find rejected requests by a specific dosen (for KaDep monitoring)
 */
export const findRejectedByLecturer = async (lecturerId) => {
  return prisma.thesisAdvisorRequest.findMany({
    where: {
      lecturerId,
      status: "rejected",
    },
    include: {
      student: {
        include: {
          user: { select: { id: true, fullName: true } },
        },
      },
      topic: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });
};
