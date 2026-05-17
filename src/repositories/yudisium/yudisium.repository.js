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

export const findDuplicateName = async (name, excludeId = null) => {
  const normalizedName = name.trim().toLowerCase();
  const candidates = await prisma.yudisium.findMany({
    where: {
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, name: true },
  });

  return candidates.find((item) => item.name?.trim().toLowerCase() === normalizedName) ?? null;
};

export const findOverlappingActivePeriod = async (registrationOpenDate, registrationCloseDate, excludeId = null) => {
  return await prisma.yudisium.findFirst({
    where: {
      registrationOpenDate: { not: null, lte: registrationCloseDate },
      registrationCloseDate: { not: null, gte: registrationOpenDate },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      name: true,
      registrationOpenDate: true,
      registrationCloseDate: true,
    },
  });
};

export const findDuplicateEventSchedule = async (eventDate, roomId, excludeId = null) => {
  const start = new Date(eventDate);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return await prisma.yudisium.findFirst({
    where: {
      roomId,
      eventDate: { gte: start, lt: end },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, name: true, eventDate: true, roomId: true },
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
