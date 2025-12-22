import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";

export function getStudentByUserId(userId) {
  // Schema baru: Student.id adalah foreign key ke User.id
  return prisma.student.findUnique({ where: { id: userId } });
}

export async function getActiveThesisForStudent(studentId) {
  // Pick the most recent by startDate desc (fallback by id desc)
  const thesis = await prisma.thesis.findFirst({
    where: { studentId },
    orderBy: [
      { startDate: "desc" },
      { id: "desc" },
    ],
    include: {
      document: { select: { id: true, filePath: true, fileName: true } },
    },
  });
  return thesis;
}

export async function getSupervisorsForThesis(thesisId) {
  const parts = await prisma.thesisParticipant.findMany({
    where: { thesisId, role: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } } },
    include: {
      lecturer: { include: { user: { select: { id: true, fullName: true, email: true } } } },
      role: { select: { id: true, name: true } },
    },
  });
  return parts;
}

export function listGuidancesForThesis(thesisId, status) {
  const where = { thesisId };
  if (status) where.status = status;
  // Schema baru: tidak ada schedule relation, gunakan requestedDate/approvedDate langsung
  return prisma.thesisGuidance.findMany({
    where,
    include: { supervisor: { include: { user: true } } },
    orderBy: [
      { requestedDate: "desc" },
      { id: "desc" },
    ],
  });
}

export function getGuidanceByIdForStudent(guidanceId, studentId) {
  return prisma.thesisGuidance.findFirst({
    where: { id: guidanceId, thesis: { studentId } },
    include: { supervisor: { include: { user: true } } },
  });
}

// Schema baru: tidak ada ThesisGuidanceSchedule, requestedDate langsung di ThesisGuidance
export function createGuidance(data) {
  return prisma.thesisGuidance.create({ 
    data,
    include: { supervisor: { include: { user: true } } }
  });
}

// Schema baru: update requestedDate langsung di ThesisGuidance
export function updateGuidanceRequestedDate(guidanceId, requestedDate) {
  return prisma.thesisGuidance.update({ 
    where: { id: guidanceId }, 
    data: { requestedDate } 
  });
}

export function updateGuidanceById(id, data) {
  return prisma.thesisGuidance.update({ 
    where: { id }, 
    data, 
    include: { supervisor: { include: { user: true } } } 
  });
}

export function listActivityLogsByStudent(studentId) {
  return prisma.thesisActivityLog.findMany({ where: { thesis: { studentId } }, orderBy: { createdAt: "desc" } });
}

export function listGuidanceHistoryByStudent(studentId) {
  return prisma.thesisGuidance.findMany({
    where: { thesis: { studentId } },
    include: { supervisor: { include: { user: true } } },
    orderBy: [
      { requestedDate: "desc" },
      { id: "desc" },
    ],
  });
}

export function listProgressComponents() {
  // Schema baru: orderBy orderIndex untuk urutan milestone
  return prisma.thesisProgressComponent.findMany({ orderBy: { orderIndex: "asc" } });
}

export function getCompletionsForThesis(thesisId) {
  return prisma.thesisProgressCompletion.findMany({ where: { thesisId } });
}

export async function upsertStudentCompletions(thesisId, componentIds = [], completedAt = undefined) {
  if (!componentIds.length) return { updated: 0, created: 0 };
  const existing = await prisma.thesisProgressCompletion.findMany({
    where: { thesisId, componentId: { in: componentIds } },
    select: { id: true, componentId: true },
  });
  const existingSet = new Set(existing.map((e) => e.componentId));

  const toUpdateIds = existing.map((e) => e.id);
  const toCreate = componentIds.filter((cid) => !existingSet.has(cid));

  const when = completedAt || new Date();

  const [updateRes, createRes] = await prisma.$transaction([
    toUpdateIds.length
      ? prisma.thesisProgressCompletion.updateMany({
          where: { id: { in: toUpdateIds } },
          data: { completedAt: when }, // keep validatedBySupervisor as-is
        })
      : Promise.resolve({ count: 0 }),
    toCreate.length
      ? prisma.thesisProgressCompletion.createMany({
          data: toCreate.map((cid) => ({ thesisId, componentId: cid, completedAt: when })),
          skipDuplicates: true,
        })
      : Promise.resolve({ count: 0 }),
  ]);

  return { updated: updateRes.count || 0, created: createRes.count || 0 };
}
