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

      requirementVerifiedAt: true,

      cplValidatedAt: true,

      exitSurveySubmittedAt: true,

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

      requirementVerifiedAt: true,

      cplValidatedAt: true,

      exitSurveySubmittedAt: true,

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

          filePath: true,

          fileName: true,

          mimeType: true,

          fileSize: true,

          fileHash: true,

          submittedAt: true,

          verifiedAt: true,

          notes: true,

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

    select: {

      id: true,

      status: true,

      yudisiumId: true,

      registeredAt: true,

      requirementVerifiedAt: true,

      cplValidatedAt: true,

      exitSurveySubmittedAt: true,

    },

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

      registeredAt: true,

      requirementVerifiedAt: true,

      cplValidatedAt: true,

      exitSurveySubmittedAt: true,

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



const resolveExitSurveyFormId = async (yudisiumId, explicitFormId = null) => {
  if (explicitFormId) return explicitFormId;

  const yudisium = await prisma.yudisium.findUnique({
    where: { id: yudisiumId },
    select: { exitSurveyFormId: true },
  });

  if (yudisium?.exitSurveyFormId) {
    return yudisium.exitSurveyFormId;
  }

  const activeForm = await prisma.exitSurveyForm.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (!activeForm) {
    throw new Error("Tidak ada form exit survey aktif yang dapat dikaitkan");
  }

  await prisma.yudisium.update({
    where: { id: yudisiumId },
    data: { exitSurveyFormId: activeForm.id },
  });

  return activeForm.id;
};

export const createForThesis = async (yudisiumId, thesisId, exitSurveyFormId = null) => {
  const formId = await resolveExitSurveyFormId(yudisiumId, exitSurveyFormId);
  return await prisma.yudisiumParticipant.create({
    data: {
      thesisId,
      yudisiumId,
      exitSurveyFormId: formId,
      registeredAt: new Date(),
      status: "registered",
    },
  });
};

export const createFinalizedForThesis = async (yudisiumId, thesisId, exitSurveyFormId = null) => {
  const formId = await resolveExitSurveyFormId(yudisiumId, exitSurveyFormId);
  return await prisma.yudisiumParticipant.create({
    data: {
      thesisId,
      yudisiumId,
      exitSurveyFormId: formId,
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

  return await prisma.yudisiumParticipantRequirement.findFirst({

    where: {

      yudisiumParticipantId: participantId,

      yudisiumRequirementItemId: requirementItemId,

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

  return await prisma.yudisiumParticipantRequirement.updateMany({

    where: {

      yudisiumParticipantId: participantId,

      yudisiumRequirementItemId: requirementItemId,

    },

    data,

  });

};



export const upsertRequirementRecord = async (participantId, requirementItemId, yudisiumId, fileData, db = prisma) => {

  const { filePath, fileName, mimeType, fileSize, fileHash } = fileData;

  const now = new Date();



  const existing = await db.yudisiumParticipantRequirement.findFirst({

    where: {

      yudisiumParticipantId: participantId,

      yudisiumRequirementItemId: requirementItemId,

      yudisiumId,

    },

  });



  if (existing) {

    return await db.yudisiumParticipantRequirement.update({

      where: {

        yudisiumParticipantId_yudisiumRequirementItemId_yudisiumId: {

          yudisiumParticipantId: participantId,

          yudisiumRequirementItemId: requirementItemId,

          yudisiumId,

        },

      },

      data: {

        filePath,

        fileName,

        mimeType,

        fileSize,

        fileHash: fileHash || null,

        status: "submitted",

        submittedAt: now,

        notes: null,

        verifiedAt: null,

        verifiedBy: null,

      },

    });

  }



  return await db.yudisiumParticipantRequirement.create({

    data: {

      yudisiumParticipantId: participantId,

      yudisiumRequirementItemId: requirementItemId,

      yudisiumId,

      filePath,

      fileName,

      mimeType,

      fileSize,

      fileHash: fileHash || null,

      status: "submitted",

      submittedAt: now,

    },

  });

};



export const findRequirementRecordsForStudent = async (participantId, db = prisma) => {

  return await db.yudisiumParticipantRequirement.findMany({

    where: { yudisiumParticipantId: participantId },

    select: {

      yudisiumRequirementItemId: true,

      status: true,

      filePath: true,

      fileName: true,

      mimeType: true,

      fileSize: true,

      fileHash: true,

      submittedAt: true,

      verifiedAt: true,

      notes: true,

    },

  });

};



// ============================================================

// CPL — student score & recommendation queries

// ============================================================



export const findCplsActive = async (db = prisma) => {

  return await db.cpl.findMany({

    where: { isActive: true },

    orderBy: { code: "asc" },

    select: { id: true, code: true, description: true, minimalScore: true },

  });

};



export const findCplById = async (cplId, db = prisma) => {

  return await db.cpl.findUnique({ where: { id: cplId } });

};



export const findStudentCplScores = async (studentId, db = prisma) => {
  const scores = await db.studentCplScore.findMany({
    where: { studentId },
    select: {
      cplId: true,
      score: true,
      status: true,
      oldCplScore: true,
      recommendationDocumentPath: true,
      recommendationDocumentName: true,
      recommendationDocumentMimeType: true,
      recommendationDocumentSize: true,
      settlementDocumentPath: true,
      settlementDocumentName: true,
      settlementDocumentMimeType: true,
      settlementDocumentSize: true,
      validatedAt: true,
      validatedBy: true,
      validatorLecturer: { select: { user: { select: { fullName: true, identityNumber: true } } } },
      cpl: { select: { code: true, description: true, minimalScore: true } },
    },
    orderBy: { cpl: { code: "asc" } },
  });

  const validatorUserIds = [...new Set(scores.map((s) => s.validatedBy).filter(Boolean))];
  const [validatorUsers, validatorLecturers] = await Promise.all([
    validatorUserIds.length > 0
      ? db.user.findMany({
          where: { id: { in: validatorUserIds } },
          select: { id: true, fullName: true, identityNumber: true },
        })
      : [],
    validatorUserIds.length > 0
      ? db.lecturer.findMany({
          where: { id: { in: validatorUserIds } },
          select: { id: true, user: { select: { fullName: true, identityNumber: true } } },
        })
      : [],
  ]);

  const validatorUserMap = new Map(validatorUsers.map((u) => [u.id, u]));
  const validatorLecturerMap = new Map(validatorLecturers.map((l) => [l.id, l.user]));

  return scores.map((sc) => {
    const valUser = sc.validatedBy ? (validatorUserMap.get(sc.validatedBy) || validatorLecturerMap.get(sc.validatedBy)) : null;
    const valLecturerUser = sc.validatorLecturer?.user;
    const validatorName = valLecturerUser?.fullName || valUser?.fullName || null;
    const validatorNip = valLecturerUser?.identityNumber || valUser?.identityNumber || null;
    const status = sc.status === "finalized"
      ? "finalized"
      : (sc.status === "validated" || sc.validatedBy || sc.validatedAt)
        ? "validated"
        : (sc.status ?? "calculated");

    return {
      ...sc,
      status,
      validatorName,
      validatorNip,
    };
  });
};



export const findStudentCplScore = async (studentId, cplId, db = prisma) => {

  return await db.studentCplScore.findUnique({

    where: { studentId_cplId: { studentId, cplId } },

  });

};



export const validateStudentCplScore = async (studentId, cplId, userId, db = prisma) => {

  return await db.studentCplScore.update({

    where: { studentId_cplId: { studentId, cplId } },

    data: { status: "validated", validatedBy: userId, validatedAt: new Date() },

  });

};



export const saveCplRepairment = async (studentId, cplId, data, db = prisma) => {

  const {

    recommendationDocumentPath,

    recommendationDocumentName,

    recommendationDocumentMimeType,

    recommendationDocumentSize,

    settlementDocumentPath,

    settlementDocumentName,

    settlementDocumentMimeType,

    settlementDocumentSize,

    verifiedBy,

    ...scoreData

  } = data;



  const updateData = {

    ...scoreData,

    status: "validated",

    validatedAt: new Date(),

    validatedBy: verifiedBy || null,

  };



  if (recommendationDocumentPath) {

    updateData.recommendationDocumentPath = recommendationDocumentPath;

    updateData.recommendationDocumentName = recommendationDocumentName || null;

    updateData.recommendationDocumentMimeType = recommendationDocumentMimeType || null;

    updateData.recommendationDocumentSize = recommendationDocumentSize || null;

  }



  if (settlementDocumentPath) {

    updateData.settlementDocumentPath = settlementDocumentPath;

    updateData.settlementDocumentName = settlementDocumentName || null;

    updateData.settlementDocumentMimeType = settlementDocumentMimeType || null;

    updateData.settlementDocumentSize = settlementDocumentSize || null;

  }



  return await db.studentCplScore.update({

    where: { studentId_cplId: { studentId, cplId } },

    data: updateData,

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



export const finalizeAllParticipants = async (yudisiumId, appointedAt = new Date()) => {

  return await prisma.$transaction([

    // 1. eligible -> appointed

    prisma.yudisiumParticipant.updateMany({

      where: { yudisiumId, status: "eligible" },

      data: { status: "appointed" },

    }),

    // 2. registered -> rejected
    prisma.yudisiumParticipant.updateMany({
      where: {
        yudisiumId,
        status: "registered"
      },
      data: { status: "rejected" },
    }),

    prisma.yudisium.update({

      where: { id: yudisiumId },

      data: { appointedAt },

    }),

  ]);

};



export const findYudisiumById = async (id) => {

  return await prisma.yudisium.findUnique({ where: { id } });

};



export const updateYudisiumDecree = async (id, data) => {

  return await prisma.yudisium.update({ where: { id }, data });

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
