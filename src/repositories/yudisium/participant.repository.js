import prisma from "../../config/prisma.js";

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
        select: { yudisiumRequirementItemId: true, status: true },
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
      notes: true,
      yudisium: { 
        select: { 
          id: true, 
          name: true, 
          registrationOpenDate: true,
          registrationCloseDate: true,
          eventDate: true,
          appointedAt: true
        } 
      },
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
          yudisiumRequirementItemId: true,
          status: true,
          submittedAt: true,
          verifiedAt: true,
          notes: true,
          document: { select: { id: true, fileName: true, filePath: true } },
          requirement: {
            select: {
              id: true,
              order: true,
              yudisiumRequirement: { select: { name: true, description: true } },
            },
          },
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
    select: { id: true, status: true, yudisiumId: true },
  });
};

export const findVerificationContext = async (participantId, requirementItemId) => {
  return await prisma.yudisiumParticipant.findUnique({
    where: { id: participantId },
    select: {
      id: true,
      status: true,
      yudisiumId: true,
      yudisium: { select: { id: true, name: true } },
      thesis: {
        select: {
          student: {
            select: {
              id: true,
              user: { select: { id: true, fullName: true, identityNumber: true } },
            },
          },
        },
      },
      yudisiumParticipantRequirements: {
        where: { yudisiumRequirementItemId: requirementItemId },
        select: {
          yudisiumRequirementItemId: true,
          requirement: {
            select: {
              yudisiumRequirement: { select: { name: true } },
            },
          },
        },
        take: 1,
      },
    },
  });
};

export const findStudentByParticipant = async (participantId) => {
  return await prisma.yudisiumParticipant.findUnique({
    where: { id: participantId },
    select: {
      id: true,
      yudisiumId: true,
      status: true,
      yudisium: { select: { id: true, name: true } },
      thesis: {
        select: {
          student: {
            select: {
              id: true,
              user: { select: { id: true, fullName: true, identityNumber: true } },
            },
          },
        },
      },
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

export const createFinalizedForThesis = async (yudisiumId, thesisId) => {
  return await prisma.yudisiumParticipant.create({
    data: {
      thesisId,
      yudisiumId,
      registeredAt: new Date(),
      status: "finalized",
    },
  });
};

export const updateStatus = async (participantId, status, additionalData = {}) => {
  return await prisma.yudisiumParticipant.update({
    where: { id: participantId },
    data: { status, ...additionalData },
  });
};

export const findThesisById = async (thesisId) => {
  return await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      title: true,
      student: {
        select: {
          id: true,
          user: { select: { fullName: true, identityNumber: true } },
        },
      },
    },
  });
};

export const findStudentWithThesesByNim = async (nim) => {
  return await prisma.student.findFirst({
    where: {
      user: { identityNumber: nim },
    },
    select: {
      id: true,
      user: { select: { fullName: true, identityNumber: true } },
      thesis: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
        },
      },
    },
  });
};

export const findAvailableThesesForArchiveParticipant = async (yudisiumId) => {
  return await prisma.thesis.findMany({
    where: {
      yudisiumParticipants: {
        none: { yudisiumId },
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      student: {
        select: {
          id: true,
          user: { select: { fullName: true, identityNumber: true } },
        },
      },
    },
  });
};

export const findByIdAndYudisium = async (participantId, yudisiumId) => {
  return await prisma.yudisiumParticipant.findFirst({
    where: { id: participantId, yudisiumId },
    select: { id: true, yudisiumId: true, thesisId: true, status: true },
  });
};

export const removeParticipant = async (participantId) => {
  return await prisma.$transaction(async (tx) => {
    await tx.yudisiumParticipantRequirement.deleteMany({
      where: { yudisiumParticipantId: participantId },
    });

    return tx.yudisiumParticipant.delete({
      where: { id: participantId },
    });
  });
};

// ============================================================
// PARTICIPANT REQUIREMENT (document) RECORDS
// ============================================================

export const findRequirementRecord = async (participantId, requirementItemId) => {
  return await prisma.yudisiumParticipantRequirement.findUnique({
    where: {
      yudisiumParticipantId_yudisiumRequirementItemId: {
        yudisiumParticipantId: participantId,
        yudisiumRequirementItemId: requirementItemId,
      },
    },
  });
};

export const listRequirementRecords = async (participantId) => {
  return await prisma.yudisiumParticipantRequirement.findMany({
    where: { yudisiumParticipantId: participantId },
    select: { yudisiumRequirementItemId: true, status: true },
  });
};

export const updateRequirementRecord = async (participantId, requirementItemId, data) => {
  return await prisma.yudisiumParticipantRequirement.update({
    where: {
      yudisiumParticipantId_yudisiumRequirementItemId: {
        yudisiumParticipantId: participantId,
        yudisiumRequirementItemId: requirementItemId,
      },
    },
    data,
  });
};

export const upsertRequirementRecord = async (participantId, requirementItemId, { documentId }) => {
  return await prisma.yudisiumParticipantRequirement.upsert({
    where: {
      yudisiumParticipantId_yudisiumRequirementItemId: {
        yudisiumParticipantId: participantId,
        yudisiumRequirementItemId: requirementItemId,
      },
    },
    create: {
      yudisiumParticipantId: participantId,
      yudisiumRequirementItemId: requirementItemId,
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
      yudisiumRequirementItemId: true,
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
      validatedAt: true,
      validatedBy: true,
      validator: { select: { fullName: true, identityNumber: true } },
      recommendationDocument: { select: { fileName: true, filePath: true } },
      settlementDocument: { select: { fileName: true, filePath: true } },
      cpl: { select: { code: true, description: true, minimalScore: true } },
    },
    orderBy: { cpl: { code: "asc" } },
  });
};

export const findStudentCplScore = async (studentId, cplId) => {
  return await prisma.studentCplScore.findUnique({
    where: { studentId_cplId: { studentId, cplId } },
  });
};

export const validateStudentCplScore = async (studentId, cplId, userId) => {
  return await prisma.studentCplScore.update({
    where: { studentId_cplId: { studentId, cplId } },
    data: { status: "validated", validatedBy: userId, validatedAt: new Date() },
  });
};

export const saveCplRepairment = async (studentId, cplId, data) => {
  return await prisma.studentCplScore.update({
    where: { studentId_cplId: { studentId, cplId } },
    data: {
      ...data,
      status: "validated",
      validatedAt: new Date(),
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

export const finalizeAllParticipants = async (yudisiumId) => {
  return await prisma.$transaction([
    // 1. cpl_validated -> appointed
    prisma.yudisiumParticipant.updateMany({
      where: { yudisiumId, status: "cpl_validated" },
      data: { status: "appointed" },
    }),
    // 2. registered, verified -> rejected
    prisma.yudisiumParticipant.updateMany({
      where: { 
        yudisiumId, 
        status: { in: ["registered", "verified"] } 
      },
      data: { status: "rejected" },
    }),
  ]);
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

export const findUserIdsByRole = async (roleName) => {
  const users = await prisma.user.findMany({
    where: {
      userHasRoles: {
        some: { role: { name: roleName } },
      },
    },
    select: { id: true },
  });
  return users.map((user) => user.id);
};
