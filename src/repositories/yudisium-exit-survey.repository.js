import prisma from "../config/prisma.js";

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

// ============================================================
// SESSION
// ============================================================

export const createSession = async (data) => {
  return await prisma.exitSurveySession.create({ data });
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
// STUDENT RESPONSE
// ============================================================

export const findResponseByYudisiumThesis = async (yudisiumId, thesisId, withAnswers = false) => {
  return await prisma.studentExitSurveyResponse.findFirst({
    where: { yudisiumId, thesisId },
    ...(withAnswers
      ? { include: { answers: true } }
      : { select: { id: true, submittedAt: true } }),
  });
};

export const createResponseWithAnswers = async ({ yudisiumId, thesisId, answers }) => {
  return await prisma.$transaction(async (tx) => {
    const response = await tx.studentExitSurveyResponse.create({
      data: { yudisiumId, thesisId, submittedAt: new Date() },
    });

    if (answers.length > 0) {
      await tx.studentExitSurveyAnswer.createMany({
        data: answers.map((a) => ({
          studentExitSurveyResponseId: response.id,
          exitSurveyQuestionId: a.exitSurveyQuestionId,
          exitSurveyOptionId: a.exitSurveyOptionId,
          answerText: a.answerText,
        })),
      });
    }

    return await tx.studentExitSurveyResponse.findUnique({
      where: { id: response.id },
      include: { answers: true },
    });
  });
};
