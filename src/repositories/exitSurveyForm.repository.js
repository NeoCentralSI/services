import prisma from "../config/prisma.js";

export const findAll = async () => {
  return await prisma.exitSurveyForm.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { questions: true } },
    },
  });
};

export const findById = async (id) => {
  return await prisma.exitSurveyForm.findUnique({
    where: { id },
    include: {
      questions: {
        orderBy: { orderNumber: "asc" },
        include: { options: { orderBy: { orderNumber: "asc" } } },
      },
      _count: { select: { questions: true, yudisiums: true } },
    },
  });
};

export const create = async (data) => {
  return await prisma.exitSurveyForm.create({ data });
};

export const update = async (id, data) => {
  return await prisma.exitSurveyForm.update({
    where: { id },
    data,
  });
};

export const remove = async (id) => {
  return await prisma.exitSurveyForm.delete({
    where: { id },
  });
};
