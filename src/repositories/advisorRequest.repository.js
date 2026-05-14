import prisma from "../config/prisma.js";
import { CLOSED_THESIS_STATUSES } from "../constants/thesisStatus.js";
import {
  ADVISOR_REQUEST_BLOCKING_STATUSES,
  ADVISOR_REQUEST_HISTORY_RESPONDED_STATUSES,
  ADVISOR_REQUEST_PENDING_KADEP_STATUSES,
  ADVISOR_REQUEST_PENDING_REVIEW_STATUSES,
  ADVISOR_REQUEST_STATUS,
} from "../constants/advisorRequestStatus.js";
import { ROLES } from "../constants/roles.js";
import { createSupervisorAssignments } from "../utils/supervisorIntegrity.js";

const ACTIVE_STATUSES = ADVISOR_REQUEST_BLOCKING_STATUSES;
const BLOCKING_STATUSES = ADVISOR_REQUEST_BLOCKING_STATUSES;
const HISTORY_STATUSES = ADVISOR_REQUEST_HISTORY_RESPONDED_STATUSES;
const CLOSED_THESIS_STATUS_NAMES = CLOSED_THESIS_STATUSES;

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
 * Resolve the latest thesis context + official supervisors for advisor access checks.
 */
export const findStudentAdvisorAccessContext = async (userId) => {
  return prisma.student.findUnique({
    where: { id: userId },
    select: {
      id: true,
      eligibleMetopen: true,
      metopenEligibilitySource: true,
      metopenEligibilityUpdatedAt: true,
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
          proposalStatus: true,
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

export const findLatestByStudent = async (studentId) => {
  return prisma.thesisAdvisorRequest.findFirst({
    where: { studentId },
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
      thesis: {
        select: {
          id: true,
          title: true,
          proposalStatus: true,
          thesisStatus: { select: { name: true } },
          academicYearId: true,
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
      thesis: {
        select: {
          id: true,
          title: true,
          proposalStatus: true,
          thesisStatus: { select: { name: true } },
          studentId: true,
          academicYearId: true,
        },
      },
    },
  });
};

export const createWithClient = async (client, data) => {
  return client.thesisAdvisorRequest.create({
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
      thesis: {
        select: {
          id: true,
          title: true,
          proposalStatus: true,
          thesisStatus: { select: { name: true } },
          studentId: true,
          academicYearId: true,
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
      thesis: {
        select: {
          id: true,
          title: true,
          proposalStatus: true,
          academicYearId: true,
          thesisTopicId: true,
          studentId: true,
          thesisStatus: { select: { id: true, name: true } },
          thesisSupervisors: {
            select: {
              id: true,
              lecturerId: true,
              status: true,
              role: { select: { id: true, name: true } },
            },
          },
        },
      },
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
 * Active requests for a specific lecturer (inbox).
 * Includes normal TA-01 and Path C escalated TA-01 while still pending lecturer
 * decision. TA-02 has no lecturer target and therefore never appears here.
 */
export const findByLecturerId = async (lecturerId) => {
  return prisma.thesisAdvisorRequest.findMany({
    where: {
      lecturerId,
      status: { in: ADVISOR_REQUEST_PENDING_REVIEW_STATUSES },
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
      OR: [
        { lecturerId },
        { redirectedTo: lecturerId },
      ],
      status: { in: HISTORY_STATUSES },
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
      status: { in: ADVISOR_REQUEST_PENDING_KADEP_STATUSES },
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
      status: {
        in: [
          ADVISOR_REQUEST_STATUS.APPROVED,
          ADVISOR_REQUEST_STATUS.OVERRIDE_APPROVED,
          ADVISOR_REQUEST_STATUS.REDIRECTED,
        ],
      },
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
      thesis: {
        select: {
          id: true,
          title: true,
          proposalStatus: true,
          thesisStatus: { select: { name: true } },
          academicYearId: true,
        },
      },
      redirectTarget: {
        include: {
          user: { select: { id: true, fullName: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
};

export const findDraftByStudent = async (studentId) => {
  return prisma.thesisAdvisorRequestDraft.findUnique({
    where: { studentId },
    include: {
      lecturer: {
        include: {
          user: { select: { id: true, fullName: true, identityNumber: true, email: true, avatarUrl: true } },
          scienceGroup: { select: { id: true, name: true } },
        },
      },
      topic: true,
      attachment: {
        select: {
          id: true,
          fileName: true,
          filePath: true,
          fileSize: true,
          mimeType: true,
          createdAt: true,
        },
      },
    },
  });
};

export const upsertDraftByStudent = async (studentId, data) => {
  return prisma.thesisAdvisorRequestDraft.upsert({
    where: { studentId },
    create: {
      studentId,
      ...data,
    },
    update: data,
    include: {
      lecturer: {
        include: {
          user: { select: { id: true, fullName: true, identityNumber: true, email: true, avatarUrl: true } },
          scienceGroup: { select: { id: true, name: true } },
        },
      },
      topic: true,
      attachment: {
        select: {
          id: true,
          fileName: true,
          filePath: true,
          fileSize: true,
          mimeType: true,
          createdAt: true,
        },
      },
    },
  });
};

export const findDraftByStudentWithClient = async (client, studentId) => {
  return client.thesisAdvisorRequestDraft.findUnique({
    where: { studentId },
    include: {
      lecturer: {
        include: {
          user: { select: { id: true, fullName: true, identityNumber: true, email: true, avatarUrl: true } },
          scienceGroup: { select: { id: true, name: true } },
        },
      },
      topic: true,
      attachment: {
        select: {
          id: true,
          fileName: true,
          filePath: true,
          fileSize: true,
          mimeType: true,
          createdAt: true,
        },
      },
    },
  });
};

export const upsertDraftByStudentWithClient = async (client, studentId, data) => {
  return client.thesisAdvisorRequestDraft.upsert({
    where: { studentId },
    create: {
      studentId,
      ...data,
    },
    update: data,
    include: {
      lecturer: {
        include: {
          user: { select: { id: true, fullName: true, identityNumber: true, email: true, avatarUrl: true } },
          scienceGroup: { select: { id: true, name: true } },
        },
      },
      topic: true,
      attachment: {
        select: {
          id: true,
          fileName: true,
          filePath: true,
          fileSize: true,
          mimeType: true,
          createdAt: true,
        },
      },
    },
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
      thesis: {
        select: {
          id: true,
          title: true,
          proposalStatus: true,
          thesisStatus: { select: { name: true } },
          academicYearId: true,
        },
      },
    },
  });
};

/**
 * Get lecturer catalog with quota info for advisor browsing.
 *
 * CRITICAL: Query starts from Lecturer, not LecturerSupervisionQuota.
 * Lecturers without a quota record are still shown with default values.
 * This prevents the "invisible lecturer" bug where admin assigns a role
 * but the lecturer doesn't appear because no quota record exists yet.
 */
export const getLecturerCatalog = async (academicYearId) => {
  const lecturers = await prisma.lecturer.findMany({
    where: {
      acceptingRequests: true,
      user: {
        userHasRoles: {
          some: {
            status: "active",
            role: {
              name: { in: ["Pembimbing 1", "Pembimbing 2"] },
            },
          },
        },
      },
    },
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
      supervisionQuotas: {
        where: { academicYearId },
        take: 1,
      },
      thesisSupervisors: {
        where: {
          status: "active",
          thesis: {
            academicYearId,
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
    orderBy: { user: { fullName: "asc" } },
  });

  const DEFAULT_QUOTA_MAX = 8;
  const DEFAULT_SOFT_LIMIT = 6;

  return lecturers.map((lecturer) => {
    const quota = lecturer.supervisionQuotas?.[0];
    return {
      lecturerId: lecturer.id,
      academicYearId,
      quotaMax: quota?.quotaMax ?? DEFAULT_QUOTA_MAX,
      quotaSoftLimit: quota?.quotaSoftLimit ?? DEFAULT_SOFT_LIMIT,
      currentCount: quota?.currentCount ?? 0,
      lecturer,
    };
  });
};

/**
 * Find alternative lecturers in the same science group with available quota.
 * Like getLecturerCatalog, queries from Lecturer to include those without quota records.
 */
export const findAlternativeLecturers = async (scienceGroupId, academicYearId, excludeLecturerId) => {
  const DEFAULT_QUOTA_MAX = 8;
  const DEFAULT_SOFT_LIMIT = 6;

  const lecturers = await prisma.lecturer.findMany({
    where: {
      ...(excludeLecturerId ? { id: { not: excludeLecturerId } } : {}),
      scienceGroupId,
      acceptingRequests: true,
    },
    include: {
      user: {
        select: { id: true, fullName: true, identityNumber: true, avatarUrl: true },
      },
      scienceGroup: { select: { id: true, name: true } },
      supervisionQuotas: {
        where: { academicYearId },
        take: 1,
      },
      thesisSupervisors: {
        where: {
          status: "active",
          thesis: {
            academicYearId,
            OR: [
              { thesisStatus: { is: null } },
              {
                thesisStatus: {
                  is: { name: { notIn: CLOSED_THESIS_STATUS_NAMES } },
                },
              },
            ],
          },
        },
        select: {
          thesis: {
            select: { id: true, thesisTopicId: true },
          },
        },
      },
    },
  });

  return lecturers
    .map((lecturer) => {
      const quota = lecturer.supervisionQuotas?.[0];
      return {
        lecturerId: lecturer.id,
        academicYearId,
        quotaMax: quota?.quotaMax ?? DEFAULT_QUOTA_MAX,
        quotaSoftLimit: quota?.quotaSoftLimit ?? DEFAULT_SOFT_LIMIT,
        currentCount: quota?.currentCount ?? 0,
        lecturer,
      };
    })
    .sort(
      (a, b) =>
        (a.lecturer.thesisSupervisors?.length ?? 0) - (b.lecturer.thesisSupervisors?.length ?? 0),
    );
};


/**
 * Find the currently active academic year.
 */
export const findActiveAcademicYear = async () => {
  return prisma.academicYear.findFirst({ where: { isActive: true } });
};

/**
 * Find a thesis topic by ID.
 */
export const findTopicById = async (id) => {
  return prisma.thesisTopic.findUnique({ where: { id } });
};

export const findTopicByIdWithClient = async (client, id) => {
  return client.thesisTopic.findUnique({ where: { id } });
};

/**
 * Find a lecturer with acceptingRequests flag.
 */
export const findLecturerForValidation = async (lecturerId) => {
  return prisma.lecturer.findUnique({
    where: { id: lecturerId },
    select: { id: true, acceptingRequests: true },
  });
};

export const findLecturerForValidationWithClient = async (client, lecturerId) => {
  return client.lecturer.findUnique({
    where: { id: lecturerId },
    select: { id: true, acceptingRequests: true },
  });
};

/**
 * Find a lecturer's supervision quota for a given academic year.
 */
export const findLecturerQuota = async (lecturerId, academicYearId) => {
  return prisma.lecturerSupervisionQuota.findUnique({
    where: {
      lecturerId_academicYearId: { lecturerId, academicYearId },
    },
  });
};

/**
 * Look up a UserRole by its name.
 */
export const findRoleByName = async (name) => {
  return prisma.userRole.findFirst({
    where: { name },
    select: { id: true, name: true },
  });
};

/**
 * Look up a ThesisStatus by its name.
 */
export const findThesisStatusByName = async (name) => {
  return prisma.thesisStatus.findFirst({
    where: { name },
    select: { id: true, name: true },
  });
};

/**
 * Find a thesis by its ID.
 */
export const findThesisById = async (thesisId) => {
  return prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      title: true,
      thesisTopicId: true,
      academicYearId: true,
    },
  });
};

/**
 * Find the most recent thesis for a student.
 */
export const findThesisByStudent = async (studentId) => {
  return prisma.thesis.findFirst({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      thesisTopicId: true,
      academicYearId: true,
    },
  });
};

/**
 * Find a lecturer by ID with user fullName (for assignment verification).
 */
export const findLecturerForAssignment = async (lecturerId) => {
  return prisma.lecturer.findUnique({
    where: { id: lecturerId },
    select: { id: true, user: { select: { fullName: true } } },
  });
};

/**
 * Check if user has any of the given role names (active).
 */
export const hasAnyActiveRole = async (userId, roleNames) => {
  return prisma.userHasRole.findFirst({
    where: {
      userId,
      status: "active",
      role: { name: { in: roleNames } },
    },
    select: { id: true },
  });
};

/**
 * Execute the advisor assignment transaction (atomic multi-step write).
 */
export const executeAssignmentTransaction = async (txCallback, options = undefined) => {
  return prisma.$transaction(txCallback, options);
};

export const executeTransaction = async (txCallback, options = undefined) => {
  return prisma.$transaction(txCallback, options);
};

export const lockAdvisorRequestRow = async (client, requestId) => {
  const rows = await client.$queryRaw`
    SELECT id
    FROM thesis_advisor_request
    WHERE id = ${requestId}
    FOR UPDATE
  `;

  return Array.isArray(rows) ? rows[0] ?? null : null;
};

export const lockStudentRow = async (client, studentId) => {
  const rows = await client.$queryRaw`
    SELECT user_id AS id
    FROM students
    WHERE user_id = ${studentId}
    FOR UPDATE
  `;

  return Array.isArray(rows) ? rows[0] ?? null : null;
};

export const findByIdWithClient = async (client, id) => {
  return client.thesisAdvisorRequest.findUnique({
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
      thesis: {
        select: {
          id: true,
          title: true,
          proposalStatus: true,
          academicYearId: true,
          thesisTopicId: true,
          studentId: true,
          thesisStatus: { select: { id: true, name: true } },
          thesisSupervisors: {
            select: {
              id: true,
              lecturerId: true,
              status: true,
              role: { select: { id: true, name: true } },
            },
          },
        },
      },
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

export const findBlockingConflictByStudent = async (client, studentId, excludeRequestId = null) => {
  return client.thesisAdvisorRequest.findFirst({
    where: {
      studentId,
      ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
      status: { in: BLOCKING_STATUSES },
    },
    select: {
      id: true,
      status: true,
      lecturer: {
        select: {
          user: { select: { fullName: true } },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
};

export const findRoleByNameWithClient = async (client, name) => {
  return client.userRole.findFirst({
    where: { name },
    select: { id: true, name: true },
  });
};

export const findThesisByIdWithClient = async (client, thesisId) => {
  return client.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      title: true,
      thesisTopicId: true,
      academicYearId: true,
      proposalStatus: true,
      studentId: true,
      thesisStatus: { select: { id: true, name: true } },
    },
  });
};

export const findThesisByStudentWithClient = async (client, studentId) => {
  return client.thesis.findFirst({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      thesisTopicId: true,
      academicYearId: true,
      proposalStatus: true,
      studentId: true,
      thesisStatus: { select: { id: true, name: true } },
    },
  });
};

export const createThesisWithClient = async (client, data) => {
  return client.thesis.create({
    data,
    select: {
      id: true,
      title: true,
      thesisTopicId: true,
      academicYearId: true,
      proposalStatus: true,
      studentId: true,
    },
  });
};

export const updateThesisWithClient = async (client, thesisId, data) => {
  return client.thesis.update({
    where: { id: thesisId },
    data,
    select: {
      id: true,
      title: true,
      thesisTopicId: true,
      academicYearId: true,
      proposalStatus: true,
      studentId: true,
      thesisStatus: { select: { id: true, name: true } },
    },
  });
};

export const findSupervisorAssignmentByLecturerAndThesis = async (
  client,
  thesisId,
  lecturerId,
) => {
  return client.thesisParticipant.findFirst({
    where: {
      thesisId,
      lecturerId,
      status: "active",
    },
    select: {
      id: true,
      lecturerId: true,
      roleId: true,
      status: true,
      role: { select: { id: true, name: true } },
    },
  });
};

export const createSupervisorAssignmentWithClient = async (client, data) => {
  const result = await createSupervisorAssignments(client, data.thesisId, [data], { requireP1: false });
  return result.created[0] ?? null;
};

export const terminateSupervisorAssignmentByLecturerAndThesis = async (
  client,
  thesisId,
  lecturerId,
) => {
  return client.thesisParticipant.updateMany({
    where: {
      thesisId,
      lecturerId,
      status: "active",
    },
    data: { status: "terminated" },
  });
};

export const findThesisProcessLockState = async (client, thesisId) => {
  return client.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      proposalStatus: true,
      finalProposalVersionId: true,
      _count: {
        select: {
          thesisGuidances: {
            where: { status: { notIn: ["cancelled", "deleted"] } },
          },
          researchMethodScores: true,
        },
      },
    },
  });
};

export const updateStatusWithClient = async (client, id, data) => {
  return client.thesisAdvisorRequest.update({
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
      thesis: {
        select: {
          id: true,
          title: true,
          proposalStatus: true,
          thesisStatus: { select: { name: true } },
          academicYearId: true,
        },
      },
    },
  });
};

export const createAuditLogWithClient = async (client, data) => {
  return client.auditLog.create({
    data,
    select: { id: true, action: true, entity: true, entityId: true, createdAt: true },
  });
};

/**
 * Fetch data needed to generate TA-04 letter.
 */
export const findTA04LetterData = async (thesisId, lecturerId, studentId) => {
  return Promise.all([
    prisma.thesis.findUnique({
      where: { id: thesisId },
      select: { title: true, academicYear: { select: { year: true, semester: true } } },
    }),
    prisma.lecturer.findUnique({
      where: { id: lecturerId },
      include: { user: { select: { fullName: true, identityNumber: true } } },
    }),
    prisma.student.findUnique({
      where: { id: studentId },
      include: { user: { select: { fullName: true, identityNumber: true } } },
    }),
  ]);
};

/**
 * Create a document record.
 */
export const createDocument = async (data) => {
  return prisma.document.create({ data });
};

export const findDocumentById = async (documentId) => {
  if (!documentId) return null;
  return prisma.document.findUnique({
    where: { id: documentId },
    select: {
      id: true,
      fileName: true,
      filePath: true,
      fileSize: true,
      mimeType: true,
      createdAt: true,
    },
  });
};

/**
 * Link a generated document to a Thesis record as the title approval document (TA-04).
 */
export const updateThesisDocument = async (thesisId, documentId) => {
  return prisma.thesis.update({
    where: { id: thesisId },
    data: { titleApprovalDocumentId: documentId },
  });
};

/**
 * Link the same generated TA-04 batch document to many theses at once.
 */
export const updateThesisDocuments = async (thesisIds, documentId) => {
  if (!thesisIds?.length) return { count: 0 };
  return prisma.thesis.updateMany({
    where: { id: { in: thesisIds } },
    data: { titleApprovalDocumentId: documentId },
  });
};

/**
 * Find an academic year by ID.
 */
export const findAcademicYearById = async (id) => {
  return prisma.academicYear.findUnique({ where: { id } });
};

/**
 * Find all assigned supervisors for an academic year (batch TA-04).
 */
export const findSupervisorsByAcademicYear = async (academicYearId) => {
  return prisma.thesisParticipant.findMany({
    where: {
      thesis: { academicYearId },
    },
    include: {
      thesis: {
        select: {
          title: true,
          student: {
            select: {
              user: { select: { fullName: true, identityNumber: true } },
            },
          },
        },
      },
      lecturer: {
        select: {
          user: { select: { fullName: true, identityNumber: true } },
        },
      },
      role: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });
};

/**
 * Find the currently active Ketua Departemen (user + NIP).
 * Returns null if no active KaDep is found.
 */
export const findActiveKaDep = async () => {
  const kadepRole = await prisma.userRole.findFirst({
    where: { name: "Ketua Departemen" },
    select: { id: true },
  });
  if (!kadepRole) return null;

  const assignment = await prisma.userHasRole.findFirst({
    where: { roleId: kadepRole.id, status: "active" },
    include: {
      user: { select: { fullName: true, identityNumber: true } },
    },
  });
  return assignment?.user ?? null;
};

/**
 * Find theses eligible for official TA-04 batch (Panduan Langkah 6): TA-03A/TA-03B
 * complete, enrolled in TA course, final proposal selected, and Pembimbing 1 active.
 */
export const findThesesWithSupervisors = async (academicYearId) => {
  return prisma.thesis.findMany({
    where: {
      academicYearId,
      proposalStatus: "accepted",
      finalProposalVersionId: { not: null },
      student: { takingThesisCourse: true },
      researchMethodScores: {
        some: {
          supervisorScore: { not: null },
          lecturerScore: { not: null },
        },
      },
      thesisSupervisors: {
        some: {
          status: "active",
          role: { name: ROLES.PEMBIMBING_1 },
        },
      },
    },
    select: {
      id: true,
      title: true,
      titleApprovalDocumentId: true,
      student: {
        select: {
          user: { select: { fullName: true, identityNumber: true } },
        },
      },
      thesisSupervisors: {
        select: {
          lecturer: {
            select: {
              user: { select: { fullName: true } },
            },
          },
          role: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
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
