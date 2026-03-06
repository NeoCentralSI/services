import prisma from "../../config/prisma.js";

export async function findAllDefences({ search, status } = {}) {
  const where = {};

  if (status) {
    where.status = status;
  }

  if (search) {
    where.thesis = {
      OR: [
        { title: { contains: search } },
        {
          student: {
            user: { fullName: { contains: search } },
          },
        },
        {
          student: {
            user: { identityNumber: { contains: search } },
          },
        },
      ],
    };
  }

  return prisma.thesisDefence.findMany({
    where,
    include: {
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
      documents: {
        include: {
          verifier: { select: { fullName: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function findDefenceById(defenceId) {
  const defence = await prisma.thesisDefence.findUnique({
    where: { id: defenceId },
    include: {
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
      documents: {
        include: {
          verifier: { select: { fullName: true } },
        },
      },
      room: true,
      examiners: {
        orderBy: { order: "asc" },
      },
    },
  });

  if (!defence) return null;

  const enrichedExaminers = await Promise.all(
    (defence.examiners || []).map(async (e) => {
      const lecturer = await prisma.lecturer.findUnique({
        where: { id: e.lecturerId },
        select: { user: { select: { fullName: true } } },
      });
      return { ...e, lecturerName: lecturer?.user?.fullName || "-" };
    })
  );

  return { ...defence, examiners: enrichedExaminers };
}

export async function findDefenceDocumentWithFile(thesisDefenceId, documentTypeId) {
  const defenceDoc = await prisma.thesisDefenceDocument.findUnique({
    where: {
      thesisDefenceId_documentTypeId: { thesisDefenceId, documentTypeId },
    },
  });

  if (!defenceDoc) return null;

  const doc = await prisma.document.findUnique({
    where: { id: defenceDoc.documentId },
    select: { id: true, fileName: true, filePath: true },
  });

  return {
    ...defenceDoc,
    document: doc,
  };
}

export async function updateDefenceDocumentStatus(
  thesisDefenceId,
  documentTypeId,
  { status, notes, verifiedBy }
) {
  return prisma.thesisDefenceDocument.update({
    where: {
      thesisDefenceId_documentTypeId: { thesisDefenceId, documentTypeId },
    },
    data: {
      status,
      notes: notes || null,
      verifiedBy,
      verifiedAt: new Date(),
    },
  });
}

export async function countDefenceDocumentsByStatus(thesisDefenceId) {
  return prisma.thesisDefenceDocument.findMany({
    where: { thesisDefenceId },
    select: { status: true, documentTypeId: true },
  });
}

export async function updateDefenceStatus(defenceId, status) {
  return prisma.thesisDefence.update({
    where: { id: defenceId },
    data: { status },
  });
}
