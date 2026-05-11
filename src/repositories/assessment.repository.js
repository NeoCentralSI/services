import prisma from '../config/prisma.js';

// ── Assessment Criteria ───────────────────────────────────────────────

export const findCriteriaByFormCode = async (formCode) => {
  const normalized = String(formCode || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  let role = null;
  if (normalized === "TA03A") {
    role = "supervisor";
  } else if (normalized === "TA03B") {
    role = "default";
  } else {
    return [];
  }

  return prisma.assessmentCriteria.findMany({
    where: {
      appliesTo: { in: ["proposal", "metopen"] },
      role,
      isDeleted: false,
      cpmk: { type: "research_method" },
    },
    include: {
      cpmk: true,
    },
    orderBy: [{ role: 'asc' }, { displayOrder: 'asc' }],
  });
};

// ── ResearchMethodScore ───────────────────────────────────────────────

export const findScoreByThesisId = async (thesisId) => {
  return prisma.researchMethodScore.findFirst({
    where: { thesisId },
    include: { researchMethodScoreDetails: true },
  });
};

export const upsertScore = async (data) => {
  const existing = await prisma.researchMethodScore.findFirst({
    where: { thesisId: data.thesisId },
  });

  if (existing) {
    return prisma.researchMethodScore.update({
      where: { id: existing.id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  return prisma.researchMethodScore.create({ data });
};

// ── Supervisor scoring queue ──────────────────────────────────────────

export const findSupervisorScoringQueue = async (lecturerId) => {
  return prisma.thesis.findMany({
    where: {
      thesisSupervisors: {
        some: { lecturerId },
      },
      // Has seminar or is in a scoreable phase
    },
    include: {
      student: {
        include: {
          user: { select: { fullName: true, identityNumber: true } },
        },
      },
      researchMethodScores: true,
    },
  });
};

// ── Metopen lecturer scoring queue ───────────────────────────────────

export const findMetopenScoringQueue = async (metopenLecturerId) => {
  return prisma.thesis.findMany({
    where: {
      // Theses that have gone through metopen
      thesisMilestones: {
        some: {
          status: 'completed',
          milestoneTemplate: { phase: 'metopen' },
        },
      },
    },
    include: {
      student: {
        include: {
          user: { select: { fullName: true, identityNumber: true } },
        },
      },
      researchMethodScores: true,
      thesisSupervisors: {
        include: {
          lecturer: { include: { user: true } },
        },
        take: 1,
      },
    },
  });
};
