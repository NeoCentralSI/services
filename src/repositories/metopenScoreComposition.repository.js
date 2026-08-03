import prisma from "../config/prisma.js";
import { randomUUID } from "node:crypto";

export const DEFAULT_TA03A_CAP = 75;
export const DEFAULT_TA03B_CAP = 25;

export function findCompositionByAcademicYearId(academicYearId) {
  return prisma.metopenScoreComposition.findUnique({
    where: { academicYearId },
    select: {
      id: true,
      academicYearId: true,
      ta03aCap: true,
      ta03bCap: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export function findAcademicYearById(academicYearId) {
  return prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: { id: true, year: true, semester: true, isActive: true },
  });
}

export async function upsertComposition(academicYearId, { ta03aCap, ta03bCap }) {
  return prisma.metopenScoreComposition.upsert({
    where: { academicYearId },
    create: {
      id: randomUUID(),
      academicYearId,
      ta03aCap,
      ta03bCap,
    },
    update: {
      ta03aCap,
      ta03bCap,
    },
    select: {
      id: true,
      academicYearId: true,
      ta03aCap: true,
      ta03bCap: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function ensureDefaultComposition(academicYearId) {
  const existing = await findCompositionByAcademicYearId(academicYearId);
  if (existing) return existing;
  return upsertComposition(academicYearId, {
    ta03aCap: DEFAULT_TA03A_CAP,
    ta03bCap: DEFAULT_TA03B_CAP,
  });
}

/**
 * Count finalized ResearchMethodScore rows for theses in the given academic year.
 * Uses thesis.academicYearId OR thesis.ta04AssignmentAcademicYearId.
 */
export async function countFinalizedScoresForAcademicYear(academicYearId) {
  return prisma.researchMethodScore.count({
    where: {
      isFinalized: true,
      thesis: {
        OR: [
          { academicYearId },
          { ta04AssignmentAcademicYearId: academicYearId },
        ],
      },
    },
  });
}

/**
 * Sum maxScore of criteria whose CPMK belongs to the academic year.
 * Criteria under CPMK with null academicYearId are included only when
 * `includeNullAyCpmks` is true (typically for the active AY).
 */
export async function getCriteriaTotalScoreForAcademicYear(
  role,
  academicYearId,
  { excludeCriteriaId = null, includeNullAyCpmks = false } = {},
) {
  const result = await prisma.metopenAssessmentCriteria.aggregate({
    where: {
      role,
      ...(excludeCriteriaId ? { id: { not: excludeCriteriaId } } : {}),
      metopenCpmk: {
        OR: [
          { academicYearId },
          ...(includeNullAyCpmks ? [{ academicYearId: null }] : []),
        ],
      },
    },
    _sum: { maxScore: true },
  });
  return result._sum.maxScore || 0;
}

/**
 * Global sum by role (legacy criteria without AY partitioning).
 * Used when CPMK has no academicYearId and we need remaining capacity
 * against the active-year composition.
 */
export async function getGlobalCriteriaTotalScore(role, excludeCriteriaId = null) {
  const where = { role };
  if (excludeCriteriaId) {
    where.id = { not: excludeCriteriaId };
  }
  const result = await prisma.metopenAssessmentCriteria.aggregate({
    where,
    _sum: { maxScore: true },
  });
  return result._sum.maxScore || 0;
}
