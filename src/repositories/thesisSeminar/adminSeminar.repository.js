import prisma from "../../config/prisma.js";

/**
 * Get all thesis seminars with student, thesis, and documents info for admin view
 */
export async function findAllSeminars({ search, status } = {}) {
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

  const seminars = await prisma.thesisSeminar.findMany({
    where,
    include: {
      thesis: {
        select: {
          id: true,
          title: true,
          student: {
            select: {
              id: true,
              user: {
                select: {
                  fullName: true,
                  identityNumber: true,
                },
              },
            },
          },
          thesisSupervisors: {
            select: {
              lecturer: {
                select: {
                  user: {
                    select: { fullName: true },
                  },
                },
              },
              role: {
                select: { name: true },
              },
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

  return seminars;
}

/**
 * Get a single seminar detail by ID (for admin detail page)
 */
export async function findSeminarById(seminarId) {
  const seminar = await prisma.thesisSeminar.findUnique({
    where: { id: seminarId },
    include: {
      thesis: {
        select: {
          id: true,
          title: true,
          student: {
            select: {
              id: true,
              user: {
                select: {
                  fullName: true,
                  identityNumber: true,
                },
              },
            },
          },
          thesisSupervisors: {
            select: {
              lecturer: {
                select: {
                  user: {
                    select: { fullName: true },
                  },
                },
              },
              role: {
                select: { name: true },
              },
            },
          },
        },
      },
      documents: {
        include: {
          verifier: { select: { fullName: true } },
        },
      },
      examiners: {
        orderBy: { order: "asc" },
      },
      room: true,
    },
  });

  if (!seminar) return null;

  // Enrich examiners with lecturer names (no direct relation on ThesisSeminarExaminer)
  const enrichedExaminers = await Promise.all(
    (seminar.examiners || []).map(async (e) => {
      const lecturer = await prisma.lecturer.findUnique({
        where: { id: e.lecturerId },
        select: { user: { select: { fullName: true } } },
      });
      return { ...e, lecturerName: lecturer?.user?.fullName || "-" };
    })
  );

  return { ...seminar, examiners: enrichedExaminers };
}

/**
 * Update a ThesisSeminarDocument status (approve/decline)
 */
export async function updateDocumentStatus(
  thesisSeminarId,
  documentTypeId,
  { status, notes, verifiedBy }
) {
  return prisma.thesisSeminarDocument.update({
    where: {
      thesisSeminarId_documentTypeId: { thesisSeminarId, documentTypeId },
    },
    data: {
      status,
      notes: notes || null,
      verifiedBy,
      verifiedAt: new Date(),
    },
  });
}

/**
 * Count documents by status for a given seminar
 */
export async function countDocumentsByStatus(thesisSeminarId) {
  const docs = await prisma.thesisSeminarDocument.findMany({
    where: { thesisSeminarId },
    select: { status: true, documentTypeId: true },
  });
  return docs;
}

/**
 * Update seminar status
 */
export async function updateSeminarStatus(seminarId, status) {
  return prisma.thesisSeminar.update({
    where: { id: seminarId },
    data: { status },
  });
}

/**
 * Get document with its file info
 */
export async function findDocumentWithFile(thesisSeminarId, documentTypeId) {
  const semDoc = await prisma.thesisSeminarDocument.findUnique({
    where: {
      thesisSeminarId_documentTypeId: { thesisSeminarId, documentTypeId },
    },
  });

  if (!semDoc) return null;

  const doc = await prisma.document.findUnique({
    where: { id: semDoc.documentId },
    select: { id: true, fileName: true, filePath: true },
  });

  return {
    ...semDoc,
    document: doc,
  };
}
