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
              lecturerId: true,
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

/**
 * Get lecturer availability records for a list of lecturer IDs (active only)
 */
export async function findLecturerAvailabilitiesByLecturerIds(lecturerIds) {
  return prisma.lecturerAvailability.findMany({
    where: {
      lecturerId: { in: lecturerIds },
      isActive: true,
    },
    orderBy: [{ lecturerId: "asc" }, { day: "asc" }, { startTime: "asc" }],
  });
}

/**
 * Get all rooms
 */
export async function findAllRooms() {
  return prisma.room.findMany({
    orderBy: { name: "asc" },
  });
}

/**
 * Check for conflicting room schedules (another seminar in same room at overlapping time on same date),
 * excluding the given seminarId (for editing).
 */
export async function findRoomScheduleConflict({ seminarId, roomId, date, startTime, endTime }) {
  return prisma.thesisSeminar.findFirst({
    where: {
      id: seminarId ? { not: seminarId } : undefined,
      roomId,
      date: new Date(date),
      status: { notIn: ["cancelled"] },
      AND: [
        { startTime: { lt: new Date(`1970-01-01T${endTime}:00.000Z`) } },
        { endTime: { gt: new Date(`1970-01-01T${startTime}:00.000Z`) } },
      ],
    },
  });
}

/**
 * Set / update seminar schedule (date, time, room) and transition to 'scheduled'
 */
export async function updateSeminarSchedule(seminarId, { roomId, date, startTime, endTime, meetingLink }) {
  return prisma.thesisSeminar.update({
    where: { id: seminarId },
    data: {
      roomId,
      meetingLink,
      date: new Date(date),
      startTime: new Date(`1970-01-01T${startTime}:00.000Z`),
      endTime: new Date(`1970-01-01T${endTime}:00.000Z`),
      status: "scheduled",
    },
  });
}

// ==================== Seminar Result Master (Admin Archive) ====================

export function findThesisSupervisorsByThesisId(thesisId) {
  return prisma.thesisSupervisors.findMany({
    where: { thesisId },
    select: { lecturerId: true },
  });
}

export function findLecturersByIds(lecturerIds) {
  return prisma.lecturer.findMany({
    where: { id: { in: lecturerIds } },
    select: {
      id: true,
      user: {
        select: {
          fullName: true,
          identityNumber: true,
        },
      },
    },
  });
}

export function findLecturersForSeminarOptions() {
  return prisma.lecturer.findMany({
    where: {
      user: {
        userHasRoles: {
          some: {
            role: {
              name: "Penguji",
            },
          },
        },
      },
    },
    select: {
      id: true,
      user: {
        select: {
          fullName: true,
          identityNumber: true,
        },
      },
    },
    orderBy: {
      user: {
        fullName: "asc",
      },
    },
  });
}

export function findSeminarResultByIdForArchive(seminarId) {
  return prisma.thesisSeminar.findUnique({
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
        },
      },
      room: {
        select: {
          id: true,
          name: true,
          location: true,
        },
      },
      examiners: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          lecturerId: true,
          order: true,
        },
      },
      _count: {
        select: {
          audiences: true,
        },
      },
    },
  });
}

export function findSeminarResultByIdForArchiveDetail(id) {
  return prisma.thesisSeminar.findUnique({
    where: { id },
    select: {
      id: true,
      thesisId: true,
      registeredAt: true,
      date: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      thesis: {
        select: {
          title: true,
          student: {
            select: {
              id: true,
              user: { select: { fullName: true, identityNumber: true, email: true } },
            },
          },
        },
      },
      room: { select: { id: true, name: true, location: true } },
      examiners: {
        select: {
          id: true,
          lecturerId: true,
          order: true,
        },
        orderBy: { order: "asc" },
      },
      _count: { select: { audiences: true } },
    },
  });
}

export function findThesesForSeminarResultOptions() {
  return prisma.thesis.findMany({
    select: {
      id: true,
      title: true,
      studentId: true,
      student: {
        select: {
          user: { select: { fullName: true, identityNumber: true } },
        },
      },
      thesisSupervisors: {
        select: { lecturerId: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function findSeminarsForThesisResultOptions() {
  return prisma.thesisSeminar.findMany({ 
    where: { status: { notIn: ["failed", "cancelled"] } },
    select: { id: true, thesisId: true } 
  });
}

export function findStudentsForSeminarResultOptions() {
  return prisma.student.findMany({
    select: {
      id: true,
      user: {
        select: {
          fullName: true,
          identityNumber: true,
        },
      },
    },
    orderBy: {
      user: {
        fullName: "asc",
      },
    },
  });
}

export function findSeminarResultsPaginated({ where, skip, take }) {
  return prisma.thesisSeminar.findMany({
    where,
    skip,
    take,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      thesisId: true,
      date: true,
      status: true,
      registeredAt: true,
      createdAt: true,
      updatedAt: true,
      thesis: {
        select: {
          title: true,
          student: {
            select: {
              id: true,
              user: { select: { fullName: true, identityNumber: true } },
            },
          },
        },
      },
      room: { select: { id: true, name: true, location: true } },
      examiners: {
        select: {
          id: true,
          lecturerId: true,
          order: true,
        },
        orderBy: { order: "asc" },
      },
      _count: { select: { audiences: true } },
    },
  });
}

export function countSeminarResults(where) {
  return prisma.thesisSeminar.count({ where });
}

export function findThesisById(id) {
  return prisma.thesis.findUnique({ where: { id }, select: { id: true } });
}

export function findRoomById(id) {
  return prisma.room.findUnique({ where: { id }, select: { id: true } });
}

export function findSeminarResultByThesisId(thesisId) {
  return prisma.thesisSeminar.findFirst({ 
    where: { thesisId, status: { notIn: ["failed", "cancelled"] } }, 
    select: { id: true } 
  });
}

export function findSeminarResultByThesisIdExcludingId(thesisId, seminarId) {
  return prisma.thesisSeminar.findFirst({
    where: { thesisId, id: { not: seminarId }, status: { notIn: ["failed", "cancelled"] } },
    select: { id: true },
  });
}

export function findSeminarResultBasicById(seminarId) {
  return prisma.thesisSeminar.findUnique({ where: { id: seminarId }, select: { id: true } });
}

export async function createSeminarResultWithExaminers({
  thesisId,
  roomId,
  date,
  status,
  examinerLecturerIds,
  assignedByUserId,
}) {
  return prisma.$transaction(async (tx) => {
    const seminar = await tx.thesisSeminar.create({
      data: {
        thesisId,
        roomId,
        date: date ? new Date(date) : null,
        status,
      },
    });

    await tx.thesisSeminarExaminer.createMany({
      data: examinerLecturerIds.map((lecturerId, index) => ({
        thesisSeminarId: seminar.id,
        lecturerId,
        assignedBy: assignedByUserId,
        order: index + 1,
        assignedAt: new Date(),
        availabilityStatus: "available",
        respondedAt: date ? new Date(date) : null,
      })),
    });

    return seminar;
  });
}

export async function updateSeminarResultWithExaminers({
  seminarId,
  thesisId,
  roomId,
  date,
  status,
  examinerLecturerIds,
  assignedByUserId,
}) {
  return prisma.$transaction(async (tx) => {
    await tx.thesisSeminar.update({
      where: { id: seminarId },
      data: {
        thesisId,
        roomId,
        date: new Date(date),
        status,
      },
    });

    await tx.thesisSeminarExaminer.deleteMany({ where: { thesisSeminarId: seminarId } });

    await tx.thesisSeminarExaminer.createMany({
      data: examinerLecturerIds.map((lecturerId, index) => ({
        thesisSeminarId: seminarId,
        lecturerId,
        assignedBy: assignedByUserId,
        order: index + 1,
        assignedAt: new Date(),
        availabilityStatus: "available",
        respondedAt: date ? new Date(date) : null,
      })),
    });
  });
}

export function deleteSeminarResultById(seminarId) {
  return prisma.thesisSeminar.delete({ where: { id: seminarId } });
}

// ==================== Audience (Nested) ====================

export function findSeminarForAudienceCheck(seminarId) {
  return prisma.thesisSeminar.findUnique({
    where: { id: seminarId },
    select: {
      id: true,
      registeredAt: true,
      date: true,
      thesisId: true,
    },
  });
}

export function findFirstSupervisorByThesisId(thesisId) {
  return prisma.thesisSupervisors.findFirst({
    where: { thesisId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
}

export function findSeminarAudiences(seminarId) {
  return prisma.thesisSeminarAudience.findMany({
    where: { thesisSeminarId: seminarId },
    orderBy: { createdAt: "asc" },
    select: {
      thesisSeminarId: true,
      studentId: true,
      registeredAt: true,
      approvedAt: true,
      createdAt: true,
      student: {
        select: {
          id: true,
          user: { select: { fullName: true, identityNumber: true } },
        },
      },
      supervisor: {
        select: {
          id: true,
          lecturer: {
            select: { user: { select: { fullName: true } } },
          },
        },
      },
    },
  });
}

export function findStudentOptionsForAudience(seminarId) {
  return prisma.student.findMany({
    where: {
      NOT: {
        thesisSeminarAudiences: { some: { thesisSeminarId: seminarId } },
      },
      thesis: { some: {} }, // must have a thesis
    },
    select: {
      id: true,
      user: { select: { fullName: true, identityNumber: true } },
    },
    orderBy: { user: { fullName: "asc" } },
  });
}

export function findAudienceByKey(seminarId, studentId) {
  return prisma.thesisSeminarAudience.findUnique({
    where: { thesisSeminarId_studentId: { thesisSeminarId: seminarId, studentId } },
    select: { thesisSeminarId: true, studentId: true },
  });
}

export function createSeminarAudience({ seminarId, studentId, supervisorId, seminarDate }) {
  return prisma.thesisSeminarAudience.create({
    data: {
      thesisSeminarId: seminarId,
      studentId,
      approvedBy: supervisorId,
      registeredAt: seminarDate,
      approvedAt: seminarDate,
    },
  });
}

export function createSeminarAudiencesMany(records) {
  return prisma.thesisSeminarAudience.createMany({
    data: records,
    skipDuplicates: true,
  });
}

export function deleteSeminarAudience(seminarId, studentId) {
  return prisma.thesisSeminarAudience.delete({
    where: { thesisSeminarId_studentId: { thesisSeminarId: seminarId, studentId } },
  });
}

export function findStudentByNameOrNim({ fullName, nim }) {
  return prisma.student.findFirst({
    where: {
      user: {
        OR: [
          { fullName: { equals: fullName } },
          { identityNumber: { equals: nim } },
        ],
      },
    },
    select: {
      id: true,
      user: { select: { fullName: true, identityNumber: true } },
    },
  });
}


export async function findAllSeminarResultsForExport(where) {
  const seminars = await prisma.thesisSeminar.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      thesis: {
        include: {
          student: {
            include: { user: true }
          },
          thesisSupervisors: {
            include: {
              lecturer: { include: { user: true } },
              role: true
            }
          }
        }
      },
      room: true,
      examiners: {
        orderBy: { order: "asc" },
      }
    }
  });

  const enrichedSeminars = await Promise.all(
    seminars.map(async (s) => {
      const examinersWithNames = await Promise.all(
        (s.examiners || []).map(async (e) => {
          const lecturer = await prisma.lecturer.findUnique({
            where: { id: e.lecturerId },
            select: { user: { select: { fullName: true } } },
          });
          return { ...e, lecturerName: lecturer?.user?.fullName || "-" };
        })
      );
      return { ...s, examiners: examinersWithNames };
    })
  );

  return enrichedSeminars;
}

export function findStudentByNim(nim) {
  return prisma.student.findFirst({
    where: { user: { identityNumber: nim } },
    include: { user: true }
  });
}

export function findActiveThesisByStudentId(studentId) {
  return prisma.thesis.findFirst({
    where: { studentId },
    orderBy: { createdAt: "desc" }
  });
}

export function findRoomByNameLike(name) {
  return prisma.room.findFirst({
    where: { name: { contains: name } }
  });
}

export function findLecturerByNameLike(name) {
  return prisma.lecturer.findFirst({
    where: { user: { fullName: { contains: name } } },
    include: { user: true }
  });
}
