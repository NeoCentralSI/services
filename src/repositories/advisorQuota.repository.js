import prisma from "../config/prisma.js";
import { ROLES } from "../constants/roles.js";
import {
  ADVISOR_REQUEST_ACTIVE_OFFICIAL_STATUSES,
  ADVISOR_REQUEST_BOOKING_STATUSES,
  ADVISOR_REQUEST_LEGACY_BOOKING_OR_ACTIVE_STATUSES,
  ADVISOR_REQUEST_PENDING_KADEP_STATUSES,
} from "../constants/advisorRequestStatus.js";
import { resolveOperationalAcademicYear } from "../helpers/academicYear.helper.js";

const TRACKED_REQUEST_STATUSES = [
  ...ADVISOR_REQUEST_BOOKING_STATUSES,
  ...ADVISOR_REQUEST_ACTIVE_OFFICIAL_STATUSES,
  ...ADVISOR_REQUEST_PENDING_KADEP_STATUSES,
  ...ADVISOR_REQUEST_LEGACY_BOOKING_OR_ACTIVE_STATUSES,
];

export function getQuotaRepositoryClient(client) {
  // Explicit undefined/null must fall back to the root Prisma client.
  // Default-parameter fallback only covers omitted args, not `client: undefined`
  // from `{ client }` destructuring — that previously caused
  // "Cannot read properties of undefined (reading 'findMany')".
  return client ?? prisma;
}

export async function findActiveAcademicYear(client = prisma) {
  const db = getQuotaRepositoryClient(client);
  return resolveOperationalAcademicYear(db);
}

export async function findQuotaLecturerMetadata(client, academicYearId, lecturerIds = null) {
  const db = getQuotaRepositoryClient(client);
  return db.lecturer.findMany({
    where: {
      ...(lecturerIds?.length
        ? { id: { in: lecturerIds } }
        : {
            user: {
              userHasRoles: {
                some: {
                  status: "active",
                  role: {
                    name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] },
                  },
                },
              },
            },
          }),
    },
    select: {
      id: true,
      acceptingRequests: true,
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
        select: {
          id: true,
          quotaMax: true,
          quotaSoftLimit: true,
          currentCount: true,
          notes: true,
        },
      },
    },
    orderBy: { user: { fullName: "asc" } },
  });
}

export async function findTrackedAdvisorRequests(client, academicYearId, lecturerIds = null) {
  const db = getQuotaRepositoryClient(client);
  return db.thesisAdvisorRequest.findMany({
    where: {
      ...(academicYearId ? { academicYearId } : {}),
      ...(lecturerIds?.length
        ? {
            OR: [
              { lecturerId: { in: lecturerIds } },
              { redirectedTo: { in: lecturerIds } },
            ],
          }
        : {}),
      status: { in: TRACKED_REQUEST_STATUSES },
    },
    select: {
      id: true,
      studentId: true,
      lecturerId: true,
      redirectedTo: true,
      academicYearId: true,
      thesisId: true,
      status: true,
      routeType: true,
      // BR-06 (canon §7.3): flag eksplisit untuk Overquota Sah snapshot.
      acceptedOverNormal: true,
      // BR-26 audit Path C (canon §5.2.1).
      forwardedToKadepAt: true,
      forwardedByLecturerId: true,
      lecturerOverquotaReason: true,
      proposedTitle: true,
      lecturerApprovalNote: true,
      rejectionReason: true,
      justificationText: true,
      studentJustification: true,
      kadepNotes: true,
      createdAt: true,
      updatedAt: true,
      lecturerRespondedAt: true,
      reviewedAt: true,
      student: {
        select: {
          id: true,
          user: {
            select: {
              id: true,
              fullName: true,
              identityNumber: true,
              avatarUrl: true,
            },
          },
        },
      },
      lecturer: {
        select: {
          id: true,
          user: {
            select: {
              fullName: true,
              identityNumber: true,
            },
          },
        },
      },
      forwardedByLecturer: {
        select: {
          id: true,
          user: {
            select: {
              fullName: true,
              identityNumber: true,
            },
          },
        },
      },
      topic: {
        select: { id: true, name: true, scienceGroupId: true },
      },
      thesis: {
        select: {
          id: true,
          title: true,
          academicYearId: true,
          proposalStatus: true,
          activeAcademicYearId: true,
          ta04AssignmentAcademicYearId: true,
          thesisStatus: { select: { name: true } },
          studentId: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function findTrackedSupervisorAssignments(client, academicYearId, lecturerIds = null) {
  const db = getQuotaRepositoryClient(client);
  return db.thesisSupervisors.findMany({
    where: {
      status: "active",
      lecturerId: lecturerIds?.length ? { in: lecturerIds } : undefined,
      role: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } },
      ...(academicYearId
        ? {
            thesis: {
              OR: [
                { academicYearId },
                { activeAcademicYearId: academicYearId },
              ],
            },
          }
        : {}),
    },
    select: {
      id: true,
      createdAt: true,
      updatedAt: true,
      lecturerId: true,
      role: { select: { id: true, name: true } },
      thesis: {
        select: {
          id: true,
          title: true,
          academicYearId: true,
          proposalStatus: true,
          activeAcademicYearId: true,
          ta04AssignmentAcademicYearId: true,
          thesisStatus: { select: { name: true } },
          studentId: true,
          student: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  fullName: true,
                  identityNumber: true,
                  avatarUrl: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function ensureLecturerQuotaRow(client, lecturerId, academicYearId) {
  const db = getQuotaRepositoryClient(client);
  const defaultQuota = await db.supervisionQuotaDefault.findUnique({
    where: { academicYearId },
    select: { quotaMax: true, quotaSoftLimit: true },
  });

  return db.lecturerSupervisionQuota.upsert({
    where: {
      lecturerId_academicYearId: { lecturerId, academicYearId },
    },
    update: {},
    create: {
      lecturerId,
      academicYearId,
      quotaMax: defaultQuota?.quotaMax ?? 10,
      quotaSoftLimit: defaultQuota?.quotaSoftLimit ?? 8,
      currentCount: 0,
    },
    select: { id: true },
  });
}

export async function lockLecturerQuotaRow(client, lecturerId, academicYearId) {
  const db = getQuotaRepositoryClient(client);
  const rows = await db.$queryRaw`
    SELECT id
    FROM lecturer_supervision_quotas
    WHERE lecturer_id = ${lecturerId}
      AND academic_year_id = ${academicYearId}
    FOR UPDATE
  `;

  return Array.isArray(rows) ? rows[0] ?? null : null;
}

export async function updateLecturerQuotaCurrentCount(client, lecturerId, academicYearId, currentCount) {
  const db = getQuotaRepositoryClient(client);
  return db.lecturerSupervisionQuota.update({
    where: {
      lecturerId_academicYearId: { lecturerId, academicYearId },
    },
    data: { currentCount },
    select: { id: true, lecturerId: true, academicYearId: true, currentCount: true },
  });
}
