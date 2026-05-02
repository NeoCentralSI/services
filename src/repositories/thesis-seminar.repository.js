import prisma from "../config/prisma.js";

// ============================================================
// SHARED INCLUDES — reused across list, detail, and CRUD queries
// ============================================================

/**
 * Standard include for seminar list items.
 * Keeps thesis + student + supervisors + room + examiners + docs + audience count.
 */
const seminarListInclude = {
  thesis: {
    select: {
      id: true,
      title: true,
      student: {
        select: {
          id: true,
          user: {
            select: { fullName: true, identityNumber: true, email: true },
          },
        },
      },
      thesisSupervisors: {
        select: {
          id: true,
          lecturerId: true,
          seminarReady: true,
          role: { select: { name: true } },
          lecturer: {
            select: { user: { select: { fullName: true } } },
          },
        },
      },
    },
  },
  room: {
    select: { id: true, name: true, location: true },
  },
  examiners: {
    orderBy: { order: "asc" },
  },
  documents: {
    include: {
      verifier: { select: { fullName: true } },
    },
  },
  _count: {
    select: { audiences: true },
  },
};

/**
 * Detail include — same as list but adds audiences list.
 */
const seminarDetailInclude = {
  ...seminarListInclude,
  audiences: {
    select: {
      thesisSeminarId: true,
      studentId: true,
      registeredAt: true,
      approvedAt: true,
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
    orderBy: { registeredAt: "asc" },
  },
};

// ============================================================
// HELPER: Enrich examiners with lecturer names
// ThesisSeminarExaminer stores lecturerId but has no direct
// Prisma relation to Lecturer, so we do a manual lookup.
// ============================================================

export async function enrichExaminers(examiners = []) {
  if (examiners.length === 0) return [];

  // Batch-fetch all lecturers in one query instead of N+1
  const lecturerIds = [...new Set(examiners.map((e) => e.lecturerId))];
  const lecturers = await prisma.lecturer.findMany({
    where: { id: { in: lecturerIds } },
    select: { id: true, user: { select: { fullName: true } } },
  });
  const lecturerMap = new Map(lecturers.map((l) => [l.id, l.user?.fullName || "-"]));

  return examiners.map((e) => ({
    ...e,
    lecturerName: lecturerMap.get(e.lecturerId) || "-",
  }));
}

// ============================================================
// LIST & PAGINATION
// ============================================================

/**
 * Paginated seminar list with atomic count (uses $transaction).
 * @param {Object} params
 * @param {Object} params.where  - Prisma where clause
 * @param {number} params.skip   - Offset
 * @param {number} params.take   - Limit
 * @param {Object} [params.orderBy] - Order specification
 * @returns {{ data: Array, total: number }}
 */
export async function findSeminarsPaginated({ where, skip, take, orderBy = { createdAt: "desc" } }) {
  const [data, total] = await prisma.$transaction([
    prisma.thesisSeminar.findMany({
      where,
      skip,
      take,
      orderBy,
      include: seminarListInclude,
    }),
    prisma.thesisSeminar.count({ where }),
  ]);

  // Enrich all examiners with lecturer names (same as findSeminarById)
  const enriched = await Promise.all(
    data.map(async (s) => ({
      ...s,
      examiners: await enrichExaminers(s.examiners),
    }))
  );

  return { data: enriched, total };
}


// ============================================================
// LECTURER-SPECIFIC LISTS
// ============================================================

/**
 * Get seminars where the lecturer is a supervisor (Pembimbing).
 */
export async function findSeminarsBySupervisor({ lecturerId, search, status }) {
  const where = {
    thesis: {
      thesisSupervisors: { some: { lecturerId } },
    },
    ...whereSearch(search),
  };
  if (status) {
    if (Array.isArray(status)) where.status = { in: status };
    else where.status = status;
  }

  const data = await prisma.thesisSeminar.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: seminarListInclude,
  });

  return await Promise.all(
    data.map(async (s) => ({
      ...s,
      examiners: await enrichExaminers(s.examiners),
    }))
  );
}

/**
 * Get seminars where the lecturer is an examiner (Penguji).
 */
export async function findSeminarsByExaminer({ lecturerId, search, status }) {
  const where = {
    examiners: { some: { lecturerId } },
    ...whereSearch(search),
  };
  if (status) {
    if (Array.isArray(status)) where.status = { in: status };
    else where.status = status;
  }

  const data = await prisma.thesisSeminar.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: seminarListInclude,
  });

  return await Promise.all(
    data.map(async (s) => ({
      ...s,
      examiners: await enrichExaminers(s.examiners),
    }))
  );
}

function whereSearch(search) {
  if (!search) return {};
  return {
    OR: [
      { thesis: { title: { contains: search } } },
      { thesis: { student: { user: { fullName: { contains: search } } } } },
      { thesis: { student: { user: { identityNumber: { contains: search } } } } },
    ],
  };
}

// ============================================================
// DETAIL
// ============================================================

/**
 * Full seminar detail (single item) with all relations.
 */
export async function findSeminarById(id) {
  const seminar = await prisma.thesisSeminar.findUnique({
    where: { id },
    include: seminarDetailInclude,
  });

  if (!seminar) return null;

  return {
    ...seminar,
    examiners: await enrichExaminers(seminar.examiners),
  };
}

/**
 * Lightweight seminar lookup (for existence checks, etc.)
 */
export async function findSeminarBasicById(id) {
  return prisma.thesisSeminar.findUnique({
    where: { id },
    select: {
      id: true,
      thesisId: true,
      status: true,
      roomId: true,
      date: true,
      startTime: true,
      endTime: true,
      finalScore: true,
      resultFinalizedBy: true,
      revisionFinalizedBy: true,
      registeredAt: true,
    },
  });
}

// ============================================================
// CRUD — Core Seminar
// ============================================================

/**
 * Create seminar with examiners in one transaction (archive input).
 */
export async function createSeminarWithExaminers({
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

    if (examinerLecturerIds?.length > 0) {
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
    }

    return seminar;
  });
}

/**
 * Update seminar + replace all examiners in one transaction (archive edit).
 */
export async function updateSeminarWithExaminers({
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

    await tx.thesisSeminarExaminer.deleteMany({
      where: { thesisSeminarId: seminarId },
    });

    if (examinerLecturerIds?.length > 0) {
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
    }
  });
}

/**
 * Generic seminar update (status, schedule fields, finalization, etc.)
 */
export async function updateSeminar(id, data) {
  return prisma.thesisSeminar.update({
    where: { id },
    data,
  });
}

/**
 * Delete a seminar record.
 */
export async function deleteSeminar(id) {
  return prisma.thesisSeminar.delete({
    where: { id },
  });
}

// ============================================================
// SCHEDULING
// ============================================================

/**
 * Check for room schedule conflicts (overlapping time on same date).
 * Excludes the given seminarId (for edits) and cancelled seminars.
 */
export async function findRoomScheduleConflict({ seminarId, roomId, date, startTime, endTime }) {
  const seminarConflict = await prisma.thesisSeminar.findFirst({
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

  if (seminarConflict) return true;

  const defenceConflict = await prisma.thesisDefence.findFirst({
    where: {
      roomId,
      date: new Date(date),
      status: "scheduled",
      AND: [
        { startTime: { lt: new Date(`1970-01-01T${endTime}:00.000Z`) } },
        { endTime: { gt: new Date(`1970-01-01T${startTime}:00.000Z`) } },
      ],
    },
  });

  return !!defenceConflict;
}

/**
 * Check if a student has their own seminar or defence at the same time.
 */
export async function findStudentScheduleConflict({ studentId, date, startTime, endTime, excludeSeminarId }) {
  const seminarConflict = await prisma.thesisSeminar.findFirst({
    where: {
      id: excludeSeminarId ? { not: excludeSeminarId } : undefined,
      thesis: { studentId },
      date: new Date(date),
      status: { notIn: ["cancelled"] },
      AND: [
        { startTime: { lt: new Date(`1970-01-01T${endTime}:00.000Z`) } },
        { endTime: { gt: new Date(`1970-01-01T${startTime}:00.000Z`) } },
      ],
    },
  });
  if (seminarConflict) return "seminar";

  const defenceConflict = await prisma.thesisDefence.findFirst({
    where: {
      thesis: { studentId },
      date: new Date(date),
      status: { notIn: ["cancelled"] },
      AND: [
        { startTime: { lt: new Date(`1970-01-01T${endTime}:00.000Z`) } },
        { endTime: { gt: new Date(`1970-01-01T${startTime}:00.000Z`) } },
      ],
    },
  });
  if (defenceConflict) return "sidang";

  return null;
}

export async function findRoomBookings() {
  const nextMonth = new Date();
  nextMonth.setDate(nextMonth.getDate() + 30);

  const [seminars, defences] = await Promise.all([
    prisma.thesisSeminar.findMany({
      where: {
        date: { gte: new Date(new Date().setHours(0, 0, 0, 0)), lte: nextMonth },
        roomId: { not: null },
        status: "scheduled",
      },
      include: {
        thesis: {
          include: {
            student: {
              include: {
                user: true
              }
            }
          }
        }
      }
    }),
    prisma.thesisDefence.findMany({
      where: {
        date: { gte: new Date(new Date().setHours(0, 0, 0, 0)), lte: nextMonth },
        roomId: { not: null },
        status: "scheduled",
      },
      include: {
        thesis: {
          include: {
            student: {
              include: {
                user: true
              }
            }
          }
        }
      }
    })
  ]);

  return [
    ...seminars.map(s => ({
      id: `seminar-${s.id}`,
      type: "seminar",
      title: `Seminar Hasil: ${s.thesis?.student?.user?.fullName || "Mahasiswa"}`,
      roomId: s.roomId,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime
    })),
    ...defences.map(d => ({
      id: `defence-${d.id}`,
      type: "defence",
      title: `Sidang TA: ${d.thesis?.student?.user?.fullName || "Mahasiswa"}`,
      roomId: d.roomId,
      date: d.date,
      startTime: d.startTime,
      endTime: d.endTime
    }))
  ];
}

/**
 * Lecturer availability records for scheduling UI.
 */
export async function findLecturerAvailabilities(lecturerIds) {
  return prisma.lecturerAvailability.findMany({
    where: {
      lecturerId: { in: lecturerIds },
    },
    orderBy: [{ lecturerId: "asc" }, { day: "asc" }, { startTime: "asc" }],
  });
}

// ============================================================
// STUDENT-SPECIFIC QUERIES
// ============================================================

/**
 * Get the student's thesis with full seminar info for the overview page.
 */
export async function getStudentThesisWithSeminarInfo(studentId) {
  return prisma.thesis.findFirst({
    where: { studentId },
    select: {
      id: true,
      title: true,
      rating: true,
      thesisSupervisors: {
        select: {
          id: true,
          lecturerId: true,
          seminarReady: true,
          role: { select: { id: true, name: true } },
          lecturer: {
            select: {
              id: true,
              user: { select: { id: true, fullName: true } },
            },
          },
        },
      },
      thesisGuidances: {
        where: { status: "completed" },
        select: { id: true },
      },
      thesisSeminars: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          registeredAt: true,
          date: true,
          startTime: true,
          endTime: true,
          meetingLink: true,
          finalScore: true,
          resultFinalizedAt: true,
          cancelledReason: true,
          room: { select: { id: true, name: true } },
          documents: {
            select: {
              thesisSeminarId: true,
              documentTypeId: true,
              documentId: true,
              status: true,
              submittedAt: true,
              verifiedAt: true,
              notes: true,
            },
          },
          examiners: {
            select: {
              id: true,
              lecturerId: true,
              order: true,
              availabilityStatus: true,
              assessmentScore: true,
              assessmentSubmittedAt: true,
              revisionNotes: true,
              seminar: { select: { id: true } },
            },
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });
}

/**
 * Count completed guidances for a thesis (checklist prerequisite).
 */
export async function countCompletedGuidances(thesisId) {
  return prisma.thesisGuidance.count({
    where: { thesisId, status: "completed" },
  });
}

/**
 * Count attended seminars by student (as audience, with approval).
 */
export async function countSeminarAttendance(studentId) {
  return prisma.thesisSeminarAudience.count({
    where: {
      studentId,
      approvedAt: { not: null },
    },
  });
}

/**
 * Get seminar attendance history for a student.
 */
export async function getSeminarAttendanceHistory(studentId) {
  return prisma.thesisSeminarAudience.findMany({
    where: { studentId },
    select: {
      thesisSeminarId: true,
      approvedAt: true,
      registeredAt: true,
      supervisor: {
        select: {
          lecturer: {
            select: { user: { select: { fullName: true } } },
          },
        },
      },
      seminar: {
        select: {
          id: true,
          date: true,
          status: true,
          thesis: {
            select: {
              title: true,
              student: {
                select: {
                  user: { select: { fullName: true, identityNumber: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { seminar: { date: "desc" } },
  });
}

/**
 * Get all announced seminars for student announcement board.
 * Includes the student's own audience registration status.
 */
export async function getAllAnnouncedSeminars(studentId) {
  return prisma.thesisSeminar.findMany({
    where: {
      status: { in: ["scheduled", "passed", "passed_with_revision", "failed"] },
      date: { not: null },
    },
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      status: true,
      meetingLink: true,
      room: { select: { id: true, name: true } },
      thesis: {
        select: {
          id: true,
          title: true,
          student: {
            select: {
              id: true,
              user: { select: { fullName: true } },
            },
          },
          thesisSupervisors: {
            select: {
              role: { select: { name: true } },
              lecturer: {
                select: { user: { select: { fullName: true } } },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
      examiners: {
        where: { availabilityStatus: "available" },
        select: { order: true, lecturerId: true },
        orderBy: { order: "asc" },
      },
      audiences: {
        where: { studentId },
        select: { studentId: true, approvedAt: true, registeredAt: true },
      },
    },
    orderBy: { date: "desc" },
  });
}

/**
 * Get all seminars for a student's thesis (for history tab).
 */
export async function getAllStudentSeminars(studentId) {
  return prisma.thesisSeminar.findMany({
    where: { thesis: { studentId } },
    orderBy: [
      { date: "desc" },
      { startTime: "desc" },
      { registeredAt: "desc" },
    ],
    select: {
      id: true,
      status: true,
      registeredAt: true,
      date: true,
      startTime: true,
      endTime: true,
      finalScore: true,
      resultFinalizedAt: true,
      cancelledReason: true,
      meetingLink: true,
      room: { select: { id: true, name: true } },
      examiners: {
        where: { availabilityStatus: "available" },
        select: {
          id: true,
          lecturerId: true,
          order: true,
          assessmentScore: true,
          assessmentSubmittedAt: true,
        },
        orderBy: { order: "asc" },
      },
    },
  });
}

// ============================================================
// OPTIONS & LOOKUPS
// ============================================================

/**
 * Thesis dropdown options for archive form.
 */
export async function findThesesForOptions() {
  const theses = await prisma.thesis.findMany({
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
      thesisSeminars: {
        where: {
          status: { in: ["passed", "passed_with_revision"] },
        },
        select: { id: true, status: true },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return theses.map((t) => ({
    ...t,
    hasSeminarResult: t.thesisSeminars.length > 0,
    seminarResultId: t.thesisSeminars[0]?.id || null,
  }));
}

/**
 * Lecturer dropdown options for archive form.
 */
export async function findLecturersForOptions() {
  return prisma.lecturer.findMany({
    where: {
      user: {
        userHasRoles: {
          some: {
            role: { name: "Penguji" },
          },
        },
      },
    },
    select: {
      id: true,
      user: { select: { fullName: true, identityNumber: true } },
    },
    orderBy: { user: { fullName: "asc" } },
  });
}

/**
 * Student dropdown options.
 */
export async function findStudentsForOptions() {
  return prisma.student.findMany({
    select: {
      id: true,
      user: { select: { fullName: true, identityNumber: true } },
    },
    orderBy: { user: { fullName: "asc" } },
  });
}

/**
 * All rooms for scheduling UI.
 */
export async function findAllRooms() {
  return prisma.room.findMany({ orderBy: { name: "asc" } });
}

/**
 * Room by ID (existence check).
 */
export async function findRoomById(id) {
  return prisma.room.findUnique({ where: { id }, select: { id: true } });
}

/**
 * Thesis by ID (existence check).
 */
export async function findThesisById(id) {
  return prisma.thesis.findUnique({ where: { id }, select: { id: true, studentId: true } });
}

/**
 * Find supervisors for a given thesis.
 */
export async function findSupervisorsByThesisId(thesisId) {
  return prisma.thesisSupervisors.findMany({
    where: { thesisId },
    select: {
      id: true,
      lecturerId: true,
      seminarReady: true,
      role: { select: { name: true } },
      lecturer: {
        select: { user: { select: { fullName: true } } },
      },
    },
  });
}

/**
 * Find an active (non-failed, non-cancelled) seminar for a thesis.
 * Used to prevent duplicate active seminars.
 */
export async function findSeminarByThesisId(thesisId) {
  return prisma.thesisSeminar.findFirst({
    where: { thesisId, status: { notIn: ["failed", "cancelled"] } },
    select: { id: true, status: true },
  });
}

/**
 * Same as above but excluding a specific seminar ID (for update checks).
 */
export async function findSeminarByThesisIdExcludingId(thesisId, seminarId) {
  return prisma.thesisSeminar.findFirst({
    where: {
      thesisId,
      id: { not: seminarId },
      status: { notIn: ["failed", "cancelled"] },
    },
    select: { id: true, status: true },
  });
}

/**
 * Find supervisor role for a lecturer in a seminar's thesis.
 */
export async function findSeminarSupervisorRole(seminarId, lecturerId) {
  return prisma.thesisSeminar.findFirst({
    where: {
      id: seminarId,
      thesis: {
        thesisSupervisors: { some: { lecturerId } },
      },
    },
    select: {
      id: true,
      thesis: {
        select: {
          thesisSupervisors: {
            where: { lecturerId },
            select: {
              id: true,
              role: { select: { name: true } },
            },
            take: 1,
          },
        },
      },
    },
  });
}

// ============================================================
// IMPORT / EXPORT HELPERS
// ============================================================

/**
 * Full seminar data for Excel export.
 */
export async function findAllSeminarResultsForExport(where) {
  const seminars = await prisma.thesisSeminar.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      thesis: {
        include: {
          student: { include: { user: true } },
          thesisSupervisors: {
            include: {
              lecturer: { include: { user: true } },
              role: true,
            },
          },
        },
      },
      room: true,
      examiners: { orderBy: { order: "asc" } },
    },
  });

  return Promise.all(
    seminars.map(async (s) => ({
      ...s,
      examiners: await enrichExaminers(s.examiners),
    }))
  );
}

/**
 * Find student by NIM (identity number) for import matching.
 */
export async function findStudentByNim(nim) {
  return prisma.student.findFirst({
    where: { user: { identityNumber: nim } },
    include: { user: true },
  });
}

/**
 * Find student by name or NIM for import matching.
 */
export async function findStudentByNameOrNim({ fullName, nim }) {
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

/**
 * Find active thesis by student ID for import matching.
 */
export async function findActiveThesisByStudentId(studentId) {
  return prisma.thesis.findFirst({
    where: { studentId },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Find room by name (partial match) for import matching.
 */
export async function findRoomByNameLike(name) {
  return prisma.room.findFirst({
    where: { name: { contains: name } },
  });
}

/**
 * Find lecturer by name (partial match) for import matching.
 */
export async function findLecturerByNameLike(name) {
  return prisma.lecturer.findFirst({
    where: { user: { fullName: { contains: name } } },
    include: { user: true },
  });
}

/**
 * Get thesis with latest seminar for a student (used in document upload flow).
 */
export async function getThesisWithSeminar(studentId) {
  return prisma.thesis.findFirst({
    where: { studentId },
    select: {
      id: true,
      title: true,
      studentId: true,
      thesisSeminars: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true },
      },
    },
  });
}

/**
 * Create a new seminar with status 'registered' (student self-registration flow).
 */
export async function createThesisSeminar(thesisId) {
  return prisma.thesisSeminar.create({
    data: {
      thesisId,
      registeredAt: new Date(),
      status: "registered",
    },
  });
}
