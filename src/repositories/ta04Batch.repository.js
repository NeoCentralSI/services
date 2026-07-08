import prisma from "../config/prisma.js";

export const TA04_BATCH_STATUS = {
  CURRENT: "current",
  SUPERSEDED: "superseded",
};

const documentSelect = {
  id: true,
  fileName: true,
  filePath: true,
  fileSize: true,
  mimeType: true,
  createdAt: true,
};

const batchInclude = {
  document: { select: documentSelect },
  members: {
    select: {
      thesisId: true,
      studentName: true,
      studentNim: true,
      title: true,
      supervisorNames: true,
    },
    orderBy: { createdAt: "asc" },
  },
};

export const findCurrentTa04BatchByAcademicYear = async (academicYearId) => {
  if (!academicYearId) return null;
  return prisma.ta04Batch.findFirst({
    where: { academicYearId, status: TA04_BATCH_STATUS.CURRENT },
    include: batchInclude,
    orderBy: { version: "desc" },
  });
};

export const findCurrentTa04BatchesByAcademicYears = async (academicYearIds = []) => {
  const uniqueIds = [...new Set((academicYearIds ?? []).filter(Boolean))];
  if (uniqueIds.length === 0) return [];
  return prisma.ta04Batch.findMany({
    where: {
      academicYearId: { in: uniqueIds },
      status: TA04_BATCH_STATUS.CURRENT,
    },
    include: batchInclude,
    orderBy: [{ academicYearId: "asc" }, { version: "desc" }],
  });
};

export const findCurrentTa04BatchForThesis = async (thesisId) => {
  if (!thesisId) return null;
  return prisma.ta04Batch.findFirst({
    where: {
      status: TA04_BATCH_STATUS.CURRENT,
      members: { some: { thesisId } },
    },
    include: batchInclude,
    orderBy: { version: "desc" },
  });
};

export const findAcceptedThesisForStudentTitleApproval = async (userId) => {
  if (!userId) return null;
  return prisma.thesis.findFirst({
    where: {
      studentId: userId,
      titleApprovalDocumentId: { not: null },
      ta04AssignmentIssuedAt: { not: null },
    },
    select: {
      id: true,
      studentId: true,
      title: true,
      academicYearId: true,
      ta04AssignmentIssuedAt: true,
    },
    orderBy: [{ ta04AssignmentIssuedAt: "desc" }, { updatedAt: "desc" }],
  });
};

export const createTa04BatchWithDocument = async ({
  academicYearId,
  documentData,
  thesisIds,
  cohortHash,
  members,
  generatedByUserId = null,
}) => {
  const issuedAt = new Date();
  return prisma.$transaction(async (tx) => {
    await tx.ta04Batch.updateMany({
      where: { academicYearId, status: TA04_BATCH_STATUS.CURRENT },
      data: { status: TA04_BATCH_STATUS.SUPERSEDED },
    });

    const latestBatch = await tx.ta04Batch.findFirst({
      where: { academicYearId },
      select: { version: true },
      orderBy: { version: "desc" },
    });
    const version = (latestBatch?.version ?? 0) + 1;

    const document = await tx.document.create({ data: documentData });

    const batch = await tx.ta04Batch.create({
      data: {
        academicYearId,
        documentId: document.id,
        version,
        status: TA04_BATCH_STATUS.CURRENT,
        cohortHash,
        generatedByUserId,
        members: {
          createMany: {
            data: members.map((member) => ({
              thesisId: member.thesisId,
              studentName: member.studentName,
              studentNim: member.studentNim,
              title: member.title,
              supervisorNames: member.supervisorNames,
            })),
          },
        },
      },
      include: batchInclude,
    });

    await tx.thesis.updateMany({
      where: { id: { in: thesisIds } },
      data: { titleApprovalDocumentId: document.id },
    });

    const membersNeedingSnapshot = members.filter((member) => member.needsAssignmentSnapshot);
    for (const member of membersNeedingSnapshot) {
      await tx.thesis.update({
        where: { id: member.thesisId },
        data: {
          ta04AssignmentIssuedAt: issuedAt,
          ta04AssignmentIssuedByUserId: generatedByUserId,
          ta04AssignmentTitle: member.title,
          ta04AssignmentSupervisorNames: member.supervisorNames,
          ta04AssignmentAcademicYearId: academicYearId,
        },
      });
    }

    return { document, batch };
  }, { isolationLevel: "Serializable" });
};
