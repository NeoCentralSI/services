import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";
import { OPEN_THESIS_STATUSES } from "../../constants/thesisStatus.js";
import {
  ACCEPTED_STATUSES,
  ASSIGNMENT_BATCH_STATUS,
  SUPERVISOR_REQUEST_STATUS,
} from "../../constants/thesis-proposal.js";

const THESIS_FOR_COHORT = {
  id: true,
  title: true,
  status: true,
  supervisorAssignedAt: true,
  student: { select: { id: true, user: { select: { id: true, fullName: true, identityNumber: true } } } },
  thesisSupervisors: {
    where: { status: "active" },
    select: {
      status: true,
      lecturerId: true,
      role: { select: { name: true } },
      lecturer: { select: { user: { select: { fullName: true } } } },
    },
  },
};

/**
 * Theses of one period's Penetapan Pembimbing (R17): a request of that period accepted (or
 * redirected, or already assigned), on a thesis that is still open and has an active
 * Pembimbing 1.
 */
export async function findCohortTheses(academicYearId, client = prisma) {
  const requests = await client.thesisSupervisorRequest.findMany({
    where: {
      academicYearId,
      status: { in: [...ACCEPTED_STATUSES, SUPERVISOR_REQUEST_STATUS.ASSIGNED] },
      thesisId: { not: null },
      thesis: {
        status: { in: OPEN_THESIS_STATUSES },
        thesisSupervisors: { some: { status: "active", role: { name: ROLES.PEMBIMBING_1 } } },
      },
    },
    select: { id: true, status: true, thesis: { select: THESIS_FOR_COHORT } },
    orderBy: { createdAt: "asc" },
  });
  const seen = new Set();
  return requests
    .filter((request) => {
      if (seen.has(request.thesis.id)) return false;
      seen.add(request.thesis.id);
      return true;
    })
    .map((request) => ({ ...request.thesis, requestId: request.id, requestStatus: request.status }));
}

export function findCurrentBatch(academicYearId, client = prisma) {
  return client.thesisSupervisorAssignmentBatch.findFirst({
    where: { academicYearId, status: ASSIGNMENT_BATCH_STATUS.CURRENT },
    include: {
      members: { select: { thesisId: true } },
      generatedBy: { select: { id: true, fullName: true } },
    },
    orderBy: { version: "desc" },
  });
}

export function findBatches(academicYearId, client = prisma) {
  return client.thesisSupervisorAssignmentBatch.findMany({
    where: { academicYearId },
    include: {
      generatedBy: { select: { id: true, fullName: true } },
      _count: { select: { members: true } },
    },
    orderBy: { version: "desc" },
  });
}

export function findBatchById(id, client = prisma) {
  return client.thesisSupervisorAssignmentBatch.findUnique({
    where: { id },
    include: { members: { select: { thesisId: true } } },
  });
}

/** The latest batch that lists a thesis (for the student's status). */
export function findLatestBatchOfThesis(thesisId, client = prisma) {
  return client.thesisSupervisorAssignmentBatch.findFirst({
    where: { members: { some: { thesisId } } },
    select: { id: true, version: true, status: true, generatedAt: true, academicYear: { select: { id: true, semester: true, year: true } } },
    orderBy: { generatedAt: "desc" },
  });
}

export function findActiveUserByRole(roleName, client = prisma) {
  return client.user.findFirst({
    where: { userHasRoles: { some: { status: "active", role: { name: roleName } } } },
    select: { id: true, fullName: true, identityNumber: true },
  });
}
