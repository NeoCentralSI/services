import prisma from "../../config/prisma.js";
import { ASSESSOR } from "../../constants/research-method.js";
import { ROLES, SUPERVISOR_ROLES } from "../../constants/roles.js";
import { THESIS_STATUS } from "../../constants/thesisStatus.js";

const criteriaDelegate = (party, client) =>
  party === ASSESSOR.SUPERVISOR ? client.researchMethodSupervisorAssessmentCriteria : client.researchMethodCoordinatorAssessmentCriteria;
const detailDelegate = (party, client) =>
  party === ASSESSOR.SUPERVISOR ? client.researchMethodSupervisorAssessmentDetail : client.researchMethodCoordinatorAssessmentDetail;

/** Criteria of one assessor for a period, CPMK by code then display order, with rubrics. */
export async function findCriteria(party, academicYearId, client = prisma) {
  const rows = await criteriaDelegate(party, client).findMany({
    where: { researchMethodCpmk: { academicYearId } },
    select: {
      id: true,
      name: true,
      maxScore: true,
      displayOrder: true,
      researchMethodCpmk: { select: { id: true, code: true, description: true } },
      assessmentRubrics: { select: { id: true, minScore: true, maxScore: true, description: true }, orderBy: { displayOrder: "asc" } },
    },
  });
  return rows.sort(
    (a, b) => a.researchMethodCpmk.code.localeCompare(b.researchMethodCpmk.code, "en", { numeric: true }) || a.displayOrder - b.displayOrder,
  );
}

const THESIS_SELECT = {
  id: true,
  title: true,
  status: true,
  supervisorAssignedAt: true,
  student: { select: { id: true, status: true, user: { select: { fullName: true, identityNumber: true } } } },
  thesisSupervisors: {
    where: { status: "active", role: { name: { in: SUPERVISOR_ROLES } } },
    select: { lecturerId: true, role: { select: { name: true } }, lecturer: { select: { user: { select: { fullName: true } } } } },
  },
};

const ATTEMPT_INCLUDE = {
  thesis: { select: THESIS_SELECT },
  academicYear: { select: { id: true, semester: true, year: true, researchMethodMinimumScore: true } },
  supervisor: { select: { user: { select: { fullName: true } } } },
  coordinator: { select: { user: { select: { fullName: true } } } },
  attendanceRecord: { select: { id: true, attendancePercentage: true, isEligible: true, presentCount: true, totalMeetings: true } },
  supervisorDetails: { select: { assessmentCriteriaId: true, assessmentRubricId: true, score: true } },
  coordinatorDetails: { select: { assessmentCriteriaId: true, assessmentRubricId: true, score: true } },
};

export function findAttempt(id, client = prisma) {
  return client.researchMethodAssessment.findUnique({ where: { id }, include: ATTEMPT_INCLUDE });
}

/** Attempts of a period whose thesis this lecturer supervises (active P1/P2), any thesis status. */
export function findAttemptsForSupervisor(lecturerId, academicYearId, client = prisma) {
  return client.researchMethodAssessment.findMany({
    where: {
      academicYearId,
      thesis: { thesisSupervisors: { some: { lecturerId, status: "active", role: { name: { in: SUPERVISOR_ROLES } } } } },
    },
    include: ATTEMPT_INCLUDE,
  });
}

/** Proposal-phase theses this lecturer supervises (they may not have an attempt yet). */
export function findProposalThesesForSupervisor(lecturerId, client = prisma) {
  return client.thesis.findMany({
    where: {
      status: THESIS_STATUS.PROPOSAL,
      thesisSupervisors: { some: { lecturerId, status: "active", role: { name: { in: SUPERVISOR_ROLES } } } },
    },
    select: THESIS_SELECT,
  });
}

/** Every attempt of a period (coordinator queue, monitoring, exports). */
export function findAttemptsForPeriod(academicYearId, client = prisma) {
  return client.researchMethodAssessment.findMany({ where: { academicYearId }, include: ATTEMPT_INCLUDE });
}

export function lockAttempt(tx, id) {
  return tx.$queryRaw`SELECT id FROM research_method_assessments WHERE id = ${id} FOR UPDATE`;
}

export function createDetails(party, assessmentId, details, client = prisma) {
  return detailDelegate(party, client).createMany({
    data: details.map((d) => ({ assessmentId, assessmentCriteriaId: d.criteriaId, assessmentRubricId: d.rubricId, score: d.score })),
  });
}

export function findCoordinatorUserIds(client = prisma) {
  return client.userHasRole
    .findMany({ where: { status: "active", role: { name: ROLES.KOORDINATOR_METODE_PENELITIAN } }, select: { userId: true } })
    .then((rows) => rows.map((r) => r.userId));
}

export function findAcademicYear(id, client = prisma) {
  return client.academicYear.findUnique({ where: { id } });
}

export function updateMinimumScore(academicYearId, researchMethodMinimumScore, client = prisma) {
  return client.academicYear.update({ where: { id: academicYearId }, data: { researchMethodMinimumScore } });
}
