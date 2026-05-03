import prisma from "../config/prisma.js";

// ============================================================
// PARTICIPANT QUERIES
// ============================================================

export const findManyByYudisium = async (yudisiumId) => {
  return await prisma.yudisiumParticipant.findMany({
    where: { yudisiumId },
    orderBy: { registeredAt: "asc" },
    select: {
      id: true,
      status: true,
      registeredAt: true,
      appointedAt: true,
      notes: true,
      thesis: {
        select: {
          id: true,
          title: true,
          student: {
            select: {
              user: { select: { fullName: true, identityNumber: true } },
            },
          },
        },
      },
      yudisiumParticipantRequirements: {
        select: { yudisiumRequirementId: true, status: true },
      },
    },
  });
};

export const findDetailById = async (participantId) => {
  return await prisma.yudisiumParticipant.findUnique({
    where: { id: participantId },
    select: {
      id: true,
      status: true,
      registeredAt: true,
      appointedAt: true,
      notes: true,
      yudisium: { select: { id: true, name: true, status: true } },
      thesis: {
        select: {
          id: true,
          title: true,
          student: {
            select: {
              id: true,
              user: { select: { fullName: true, identityNumber: true } },
            },
          },
          thesisSupervisors: {
            select: {
              lecturer: { select: { user: { select: { fullName: true } } } },
              role: { select: { name: true } },
            },
          },
        },
      },
      yudisiumParticipantRequirements: {
        select: {
          yudisiumRequirementId: true,
          status: true,
          submittedAt: true,
          verifiedAt: true,
          notes: true,
          document: { select: { id: true, fileName: true, filePath: true } },
          requirement: { select: { id: true, name: true, description: true, order: true } },
          verifier: { select: { fullName: true } },
        },
        orderBy: { requirement: { order: "asc" } },
      },
    },
  });
};

export const findStatusById = async (participantId) => {
  return await prisma.yudisiumParticipant.findUnique({
    where: { id: participantId },
    select: { id: true, status: true },
  });
};

export const findStudentByParticipant = async (participantId) => {
  return await prisma.yudisiumParticipant.findUnique({
    where: { id: participantId },
    select: {
      id: true,
      status: true,
      thesis: { select: { student: { select: { id: true } } } },
    },
  });
};

export const findByThesisAndYudisium = async (yudisiumId, thesisId) => {
  return await prisma.yudisiumParticipant.findFirst({
    where: { yudisiumId, thesisId },
  });
};

export const createForThesis = async (yudisiumId, thesisId) => {
  return await prisma.yudisiumParticipant.create({
    data: {
      thesisId,
      yudisiumId,
      registeredAt: new Date(),
      status: "registered",
    },
  });
};

export const updateStatus = async (participantId, status) => {
  return await prisma.yudisiumParticipant.update({
    where: { id: participantId },
    data: { status },
  });
};

// ============================================================
// PARTICIPANT REQUIREMENT (document) RECORDS
// ============================================================

export const findRequirementRecord = async (participantId, requirementId) => {
  return await prisma.yudisiumParticipantRequirement.findUnique({
    where: {
      yudisiumParticipantId_yudisiumRequirementId: {
        yudisiumParticipantId: participantId,
        yudisiumRequirementId: requirementId,
      },
    },
  });
};

export const listRequirementRecords = async (participantId) => {
  return await prisma.yudisiumParticipantRequirement.findMany({
    where: { yudisiumParticipantId: participantId },
    select: { yudisiumRequirementId: true, status: true },
  });
};

export const updateRequirementRecord = async (participantId, requirementId, data) => {
  return await prisma.yudisiumParticipantRequirement.update({
    where: {
      yudisiumParticipantId_yudisiumRequirementId: {
        yudisiumParticipantId: participantId,
        yudisiumRequirementId: requirementId,
      },
    },
    data,
  });
};

export const upsertRequirementRecord = async (participantId, requirementId, { documentId }) => {
  return await prisma.yudisiumParticipantRequirement.upsert({
    where: {
      yudisiumParticipantId_yudisiumRequirementId: {
        yudisiumParticipantId: participantId,
        yudisiumRequirementId: requirementId,
      },
    },
    create: {
      yudisiumParticipantId: participantId,
      yudisiumRequirementId: requirementId,
      documentId,
      status: "submitted",
      submittedAt: new Date(),
    },
    update: {
      documentId,
      status: "submitted",
      submittedAt: new Date(),
      notes: null,
      verifiedAt: null,
      verifiedBy: null,
    },
  });
};

export const findRequirementRecordsForStudent = async (participantId) => {
  return await prisma.yudisiumParticipantRequirement.findMany({
    where: { yudisiumParticipantId: participantId },
    select: {
      yudisiumRequirementId: true,
      status: true,
      submittedAt: true,
      verifiedAt: true,
      notes: true,
      documentId: true,
      document: { select: { id: true, fileName: true, filePath: true } },
    },
  });
};

// ============================================================
// CPL — student score & recommendation queries
// ============================================================

export const findCplsActive = async () => {
  return await prisma.cpl.findMany({
    where: { isActive: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, description: true, minimalScore: true },
  });
};

export const findCplById = async (cplId) => {
  return await prisma.cpl.findUnique({ where: { id: cplId } });
};

export const findStudentCplScores = async (studentId) => {
  return await prisma.studentCplScore.findMany({
    where: { studentId },
    select: {
      cplId: true,
      score: true,
      status: true,
      oldCplScore: true,
      recommendationDocumentId: true,
      settlementDocumentId: true,
      verifiedAt: true,
      verifiedBy: true,
      verifier: { select: { fullName: true } },
      recommendationDocument: { select: { fileName: true, filePath: true } },
      settlementDocument: { select: { fileName: true, filePath: true } },
    },
  });
};

export const findStudentCplScore = async (studentId, cplId) => {
  return await prisma.studentCplScore.findUnique({
    where: { studentId_cplId: { studentId, cplId } },
  });
};

export const verifyStudentCplScore = async (studentId, cplId, userId) => {
  return await prisma.studentCplScore.update({
    where: { studentId_cplId: { studentId, cplId } },
    data: { status: "verified", verifiedBy: userId, verifiedAt: new Date() },
  });
};

export const saveCplRepairment = async (studentId, cplId, data) => {
  return await prisma.studentCplScore.update({
    where: { studentId_cplId: { studentId, cplId } },
    data: {
      ...data,
      status: "verified",
      verifiedAt: new Date(),
    },
  });
};



// ============================================================
// SK (Decree) — yudisium event with participants for draft generation
// ============================================================

export const findYudisiumWithParticipantsForDraft = async (yudisiumId) => {
  return await prisma.yudisium.findUnique({
    where: { id: yudisiumId },
    select: {
      id: true,
      name: true,
      status: true,
      eventDate: true,
      participants: {
        select: {
          id: true,
          status: true,
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
        },
        orderBy: { registeredAt: "asc" },
      },
    },
  });
};

export const findYudisiumById = async (id) => {
  return await prisma.yudisium.findUnique({ where: { id } });
};

export const updateYudisiumDecree = async (id, data) => {
  return await prisma.yudisium.update({ where: { id }, data });
};

export const createDocument = async ({ userId, fileName, filePath }) => {
  return await prisma.document.create({ data: { userId, fileName, filePath } });
};
