import prisma from "../config/prisma.js";
import { THESIS_PHASE } from "../constants/thesisStatus.js";
import { EVALUATION_RECOMMENDATION, EVALUATION_STATUS } from "../constants/thesis-guidance-evaluation.js";
import { THESIS_PROGRESS_SELECT } from "../helpers/thesis-progress.helper.js";

const USER_NAME = { select: { id: true, fullName: true, identityNumber: true } };

/** What an evaluation response shows: the student, the supervisor who filled it, the decision. */
export const EVALUATION_INCLUDE = Object.freeze({
  thesis: {
    select: {
      id: true,
      title: true,
      status: true,
      student: { select: { id: true, user: USER_NAME } },
    },
  },
  thesisSupervisor: { select: { id: true, lecturerId: true, lecturer: { select: { user: USER_NAME } } } },
  kadepApprover: USER_NAME,
});

const NEWEST_FIRST = [{ createdAt: "desc" }, { id: "desc" }];

/** Thesis with what the evaluation rules read: the supervision clock, activity and people. */
export function findThesisForEvaluation(thesisId, client = prisma) {
  return client.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      title: true,
      studentId: true,
      academicYearId: true,
      ...THESIS_PROGRESS_SELECT,
      academicYear: { select: { id: true, year: true, semester: true } },
      student: { select: { id: true, user: USER_NAME } },
      thesisSupervisors: {
        where: { status: "active" },
        select: {
          id: true,
          lecturerId: true,
          role: { select: { name: true } },
          lecturer: { select: { user: USER_NAME } },
        },
      },
    },
  });
}

/** The thesis a student's evaluations are about: the open one, else the latest. */
export async function findStudentThesisId(studentId, client = prisma) {
  const theses = await client.thesis.findMany({
    where: { studentId },
    select: { id: true, status: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const open = theses.find((thesis) => ["research", "on_leave", "proposal"].includes(thesis.status));
  return (open ?? theses[0])?.id ?? null;
}

/** Research-phase sessions with status Selesai: "jumlah pertemuan tercatat". */
export function countCompletedGuidances(thesisId, client = prisma) {
  return client.thesisGuidance.count({ where: { thesisId, phase: THESIS_PHASE.RESEARCH, status: "completed" } });
}

export function findById(id, client = prisma) {
  return client.thesisGuidanceEvaluation.findUnique({ where: { id }, include: EVALUATION_INCLUDE });
}

export function findByThesisId(thesisId, client = prisma) {
  return client.thesisGuidanceEvaluation.findMany({ where: { thesisId }, include: EVALUATION_INCLUDE, orderBy: NEWEST_FIRST });
}

/** One page of evaluations for a filter built by the service (Evaluasi table of the Kadep). */
export function findEvaluationPage(where, orderBy, { skip, take }, client = prisma) {
  if (take <= 0) return Promise.resolve([]);
  return client.thesisGuidanceEvaluation.findMany({ where, include: EVALUATION_INCLUDE, orderBy, skip, take });
}

export function countEvaluations(where, client = prisma) {
  return client.thesisGuidanceEvaluation.count({ where });
}

export function countPending(client = prisma) {
  return client.thesisGuidanceEvaluation.count({ where: { status: EVALUATION_STATUS.PENDING } });
}

/**
 * True while a thesis is back in `proposal` because an approved evaluation asked the
 * student to repeat the proposal. Guidance and milestone actions show this as their reason.
 */
/**
 * The approved "Mengulang Proposal" evaluation a thesis in `proposal` is repeating under, latest
 * first (its proposal revisions belong to this cycle), or null.
 */
export function findRepeatProposalEvaluation(thesisId, client = prisma) {
  if (!thesisId) return Promise.resolve(null);
  return client.thesisGuidanceEvaluation.findFirst({
    where: {
      thesisId,
      status: EVALUATION_STATUS.APPROVED,
      recommendation: EVALUATION_RECOMMENDATION.REVISE_PROPOSAL,
      thesis: { status: "proposal" },
    },
    select: { id: true, kadepApprovedAt: true, createdAt: true },
    orderBy: [{ kadepApprovedAt: "desc" }, { createdAt: "desc" }],
  });
}

export async function isRepeatingProposal(thesisId, client = prisma) {
  if (!thesisId) return false;
  const evaluation = await client.thesisGuidanceEvaluation.findFirst({
    where: {
      thesisId,
      status: EVALUATION_STATUS.APPROVED,
      recommendation: EVALUATION_RECOMMENDATION.REVISE_PROPOSAL,
      thesis: { status: "proposal" },
    },
    select: { id: true },
  });
  return Boolean(evaluation);
}

/** Active users holding a role (e.g. the Ketua Departemen). */
export function findUsersByActiveRole(roleName, client = prisma) {
  return client.user.findMany({
    where: { userHasRoles: { some: { role: { name: roleName }, status: "active" } } },
  });
}
