import prisma from "../config/prisma.js";

export const findManyByFormId = async (formId) => {
  return await prisma.exitSurveyQuestion.findMany({
    where: { exitSurveyFormId: formId },
    orderBy: { orderNumber: "asc" },
    include: { options: { orderBy: { orderNumber: "asc" } } },
  });
};

export const findById = async (id) => {
  return await prisma.exitSurveyQuestion.findUnique({
    where: { id },
    include: { options: { orderBy: { orderNumber: "asc" } } },
  });
};

export const create = async (data) => {
  const { options, ...questionData } = data;
  return await prisma.exitSurveyQuestion.create({
    data: {
      ...questionData,
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

export const update = async (id, data) => {
  const { options, ...questionData } = data;
  const existing = await prisma.exitSurveyQuestion.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return null;

  if (options && Array.isArray(options)) {
    await prisma.exitSurveyOption.deleteMany({
      where: { exitSurveyQuestionId: id },
    });
  }

  return await prisma.exitSurveyQuestion.update({
    where: { id },
    data: {
      ...questionData,
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

export const remove = async (id) => {
  return await prisma.exitSurveyQuestion.delete({
    where: { id },
  });
};
