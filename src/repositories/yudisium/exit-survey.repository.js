import prisma from "../../config/prisma.js";

// ============================================================
// FORM
// ============================================================

const formDetailInclude = {
  sessions: {
    orderBy: { order: "asc" },
    include: {
      questions: {
        orderBy: { orderNumber: "asc" },
        include: { options: { orderBy: { orderNumber: "asc" } } },
      },
    },
  },
  _count: { select: { sessions: true, yudisiums: true } },
};

export const findAllForms = async () => {
  return await prisma.exitSurveyForm.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { yudisiums: true } },
      sessions: {
        select: {
          _count: { select: { questions: true } },
        },
      },
    },
  });
};

export const findFormById = async (id) => {
  return await prisma.exitSurveyForm.findUnique({
    where: { id },
    include: formDetailInclude,
  });
};

export const createForm = async (data) => {
  return await prisma.exitSurveyForm.create({ data });
};

export const updateForm = async (id, data) => {
  return await prisma.exitSurveyForm.update({ where: { id }, data });
};

export const removeForm = async (id) => {
  return await prisma.exitSurveyForm.delete({ where: { id } });
};

export const formHasRelatedYudisiums = async (id) => {
  const count = await prisma.yudisium.count({
    where: { exitSurveyFormId: id },
  });
  return count > 0;
};

export const formHasLinkedResponses = async (id) => {
  const count = await prisma.yudisiumParticipant.count({
    where: {
      exitSurveyFormId: id,
      exitSurveySubmittedAt: { not: null },
    },
  });
  return count > 0;
};

// ============================================================
// SESSION
// ============================================================

export const findSessionById = async (id) => {
  return await prisma.exitSurveySession.findUnique({
    where: { id },
    include: { questions: true },
  });
};

export const createSession = async (data) => {
  return await prisma.exitSurveySession.create({ data });
};

export const updateSession = async (id, data) => {
  return await prisma.exitSurveySession.update({ where: { id }, data });
};

export const deleteSession = async (id) => {
  return await prisma.exitSurveySession.delete({ where: { id } });
};

// ============================================================
// QUESTION
// ============================================================

export const findQuestionsByFormId = async (formId) => {
  return await prisma.exitSurveyQuestion.findMany({
    where: { session: { exitSurveyFormId: formId } },
    orderBy: { orderNumber: "asc" },
    include: {
      options: { orderBy: { orderNumber: "asc" } },
      session: true,
    },
  });
};

export const findQuestionById = async (id) => {
  return await prisma.exitSurveyQuestion.findUnique({
    where: { id },
    include: {
      options: { orderBy: { orderNumber: "asc" } },
      session: { include: { form: true } },
    },
  });
};

export const createQuestion = async (data) => {
  const { options, ...rest } = data;
  return await prisma.exitSurveyQuestion.create({
    data: {
      ...rest,
      ...(options?.length
        ? {
            options: {
              create: options.map((opt, i) => ({
                optionText: opt.optionText,
                orderNumber: opt.orderNumber ?? i + 1,
              })),
            },
          }
        : {}),
    },
    include: { options: { orderBy: { orderNumber: "asc" } } },
  });
};

export const updateQuestion = async (id, data) => {
  const { options, ...rest } = data;
  if (options && Array.isArray(options)) {
    await prisma.exitSurveyOption.deleteMany({ where: { exitSurveyQuestionId: id } });
  }
  return await prisma.exitSurveyQuestion.update({
    where: { id },
    data: {
      ...rest,
      ...(options?.length
        ? {
            options: {
              create: options.map((opt, i) => ({
                optionText: opt.optionText,
                orderNumber: opt.orderNumber ?? i + 1,
              })),
            },
          }
        : {}),
    },
    include: { options: { orderBy: { orderNumber: "asc" } } },
  });
};

export const removeQuestion = async (id) => {
  return await prisma.exitSurveyQuestion.delete({ where: { id } });
};

// ============================================================
// STUDENT RESPONSE (YudisiumParticipant & ExitSurveyAnswer)
// ============================================================

export const findResponseByYudisiumThesis = async (yudisiumId, thesisId, withAnswers = false) => {
  return await prisma.yudisiumParticipant.findFirst({
    where: {
      yudisiumId,
      thesisId,
      exitSurveySubmittedAt: { not: null },
    },
    ...(withAnswers
      ? {
          include: {
            exitSurveyAnswers: {
              include: {
                option: true,
                question: true,
                selectedOptions: { include: { option: true } },
              },
            },
          },
        }
      : { select: { id: true, exitSurveySubmittedAt: true } }),
  });
};

export const saveStudentExitSurveyAnswers = async ({
  yudisiumId,
  thesisId,
  exitSurveyFormId,
  answerRows,
  selectedOptionRows,
}) => {
  return await prisma.$transaction(async (tx) => {
    const now = new Date();
    const existing = await tx.yudisiumParticipant.findFirst({
      where: { yudisiumId, thesisId },
    });

    let participant;
    if (existing) {
      participant = await tx.yudisiumParticipant.update({
        where: { id: existing.id },
        data: {
          exitSurveyFormId,
          exitSurveySubmittedAt: now,
        },
      });
    } else {
      participant = await tx.yudisiumParticipant.create({
        data: {
          yudisiumId,
          thesisId,
          exitSurveyFormId,
          exitSurveySubmittedAt: now,
          registeredAt: null,
          status: "registered",
        },
      });
    }

    if (answerRows.length > 0) {
      for (const answer of answerRows) {
        await tx.yudisiumParticipantExitSurveyAnswer.upsert({
          where: {
            yudisiumParticipantId_exitSurveyFormId_exitSurveyQuestionId: {
              yudisiumParticipantId: participant.id,
              exitSurveyFormId,
              exitSurveyQuestionId: answer.exitSurveyQuestionId,
            },
          },
          create: {
            yudisiumParticipantId: participant.id,
            exitSurveyFormId,
            exitSurveyQuestionId: answer.exitSurveyQuestionId,
            exitSurveyOptionId: answer.exitSurveyOptionId || null,
            answerText: answer.answerText || null,
            answerNumber: answer.answerNumber !== undefined ? answer.answerNumber : null,
            answerDate: answer.answerDate || null,
          },
          update: {
            exitSurveyOptionId: answer.exitSurveyOptionId || null,
            answerText: answer.answerText || null,
            answerNumber: answer.answerNumber !== undefined ? answer.answerNumber : null,
            answerDate: answer.answerDate || null,
          },
        });
      }
    }

    if (selectedOptionRows && selectedOptionRows.length > 0) {
      for (const opt of selectedOptionRows) {
        await tx.yudisiumParticipantExitSurveySelectedOption.upsert({
          where: {
            yudisiumParticipantId_exitSurveyQuestionId_exitSurveyOptionId: {
              yudisiumParticipantId: participant.id,
              exitSurveyQuestionId: opt.exitSurveyQuestionId,
              exitSurveyOptionId: opt.exitSurveyOptionId,
            },
          },
          create: {
            yudisiumParticipantId: participant.id,
            exitSurveyFormId,
            exitSurveyQuestionId: opt.exitSurveyQuestionId,
            exitSurveyOptionId: opt.exitSurveyOptionId,
          },
          update: {},
        });
      }
    }

    return await tx.yudisiumParticipant.findUnique({
      where: { id: participant.id },
      include: {
        exitSurveyAnswers: {
          include: {
            option: true,
            question: true,
            selectedOptions: { include: { option: true } },
          },
        },
      },
    });
  });
};
