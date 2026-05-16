import prisma from "../../config/prisma.js";

const eventInclude = {
  document: { select: { id: true, fileName: true, filePath: true } },
  exitSurveyForm: { select: { id: true, name: true } },
  room: { select: { id: true, name: true } },
  requirementItems: {
    orderBy: { order: "asc" },
    include: {
      yudisiumRequirement: { select: { id: true, name: true, description: true, isPublic: true } },
    },
  },
  participants: {
    where: { registeredAt: { not: null } },
    take: 1,
    select: { id: true }
  },
  _count: { select: { participants: true, studentExitSurveyResponses: true } },
};

export const findAll = async () => {
  return await prisma.yudisium.findMany({
    orderBy: { createdAt: "desc" },
    include: eventInclude,
  });
};

export const findById = async (id) => {
  return await prisma.yudisium.findUnique({
    where: { id },
    include: eventInclude,
  });
};

export const create = async (data) => {
  return await prisma.yudisium.create({
    data,
    include: eventInclude,
  });
};

export const update = async (id, data) => {
  return await prisma.yudisium.update({
    where: { id },
    data,
    include: eventInclude,
  });
};

export const remove = async (id) => {
  return await prisma.yudisium.delete({ where: { id } });
};

export const removeWithParticipants = async (id) => {
  return await prisma.$transaction(async (tx) => {
    await tx.studentExitSurveyAnswer.deleteMany({
      where: { response: { yudisiumId: id } },
    });
    await tx.studentExitSurveyResponse.deleteMany({ where: { yudisiumId: id } });
    await tx.yudisiumParticipantRequirement.deleteMany({
      where: { participant: { yudisiumId: id } },
    });
    await tx.yudisiumParticipant.deleteMany({ where: { yudisiumId: id } });
    return await tx.yudisium.delete({ where: { id } });
  });
};

export const hasParticipants = async (id) => {
  const count = await prisma.yudisiumParticipant.count({ where: { yudisiumId: id } });
  return count > 0;
};

export const hasStudentExitSurveyResponses = async (id) => {
  const count = await prisma.studentExitSurveyResponse.count({ where: { yudisiumId: id } });
  return count > 0;
};

export const hasRegisteredParticipants = async (id) => {
  const count = await prisma.yudisiumParticipant.count({
    where: {
      yudisiumId: id,
      registeredAt: { not: null },
    },
  });
  return count > 0;
};
