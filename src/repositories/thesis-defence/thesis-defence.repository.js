import prisma from "../../config/prisma.js";

// ============================================================
// SHARED INCLUDES
// ============================================================

const defenceListInclude = {
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
          id: true,
          lecturerId: true,
          defenceReady: true,
          role: { select: { name: true } },
          lecturer: { select: { user: { select: { fullName: true } } } },
        },
      },
    },
  },
  room: { select: { id: true, name: true, location: true } },
  examiners: { orderBy: { order: "asc" } },
  documents: {
    include: {
      verifier: { select: { fullName: true } },
    },
  },
};

const defenceDetailInclude = {
  ...defenceListInclude,
};

// ============================================================
// HELPER: Enrich examiners with lecturer names
// ============================================================

export async function enrichExaminers(examiners = []) {
  if (examiners.length === 0) return [];
  const lecturerIds = [...new Set(examiners.map((e) => e.lecturerId).filter(Boolean))];
  if (lecturerIds.length === 0) return examiners.map((e) => ({ ...e, lecturerName: "-" }));
  const lecturers = await prisma.lecturer.findMany({
    where: { id: { in: lecturerIds } },
    select: { id: true, user: { select: { fullName: true } } },
  });
  const lecturerMap = new Map(lecturers.map((l) => [l.id, l.user?.fullName || "-"]));
  return examiners.map((e) => ({ ...e, lecturerName: lecturerMap.get(e.lecturerId) || "-" }));
}

// ============================================================
// LIST QUERIES
// ============================================================

function whereSearch(search) {
  if (!search) return {};
  return {
    thesis: {
      OR: [
        { title: { contains: search } },
        { student: { user: { fullName: { contains: search } } } },
        { student: { user: { identityNumber: { contains: search } } } },
      ],
    },
  };
}

export async function findAllDefences({ search, status } = {}) {
  const where = {};
  if (status) where.status = status;
  Object.assign(where, whereSearch(search));

  const data = await prisma.thesisDefence.findMany({
    where,
    include: defenceListInclude,
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(data.map(async (d) => ({ ...d, examiners: await enrichExaminers(d.examiners) })));
}

export async function findDefencesPaginated({ where = {}, skip = 0, take = 10 } = {}) {
  const [data, total] = await Promise.all([
    prisma.thesisDefence.findMany({
      where,
      include: defenceListInclude,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    }),
    prisma.thesisDefence.count({ where }),
  ]);

  const enriched = await Promise.all(data.map(async (d) => ({ 
    ...d, 
    examiners: await enrichExaminers(d.examiners) 
  })));

  return { data: enriched, total };
}

export async function findDefencesForAssignment({ search } = {}) {
  const where = { 
    status: { 
      in: ["verified", "examiner_assigned", "scheduled", "passed", "passed_with_revision", "failed", "cancelled"] 
    }, 
    ...whereSearch(search) 
  };
  const data = await prisma.thesisDefence.findMany({
    where,
    include: defenceListInclude,
    orderBy: { createdAt: "desc" },
  });
  return Promise.all(data.map(async (d) => ({ ...d, examiners: await enrichExaminers(d.examiners) })));
}

export async function findDefencesByExaminer(lecturerId, { search } = {}) {
  const where = {
    status: { notIn: ["cancelled"] },
    examiners: { some: { lecturerId } },
    ...whereSearch(search),
  };
  const data = await prisma.thesisDefence.findMany({
    where,
    include: defenceListInclude,
    orderBy: { createdAt: "desc" },
  });
  return Promise.all(data.map(async (d) => ({ ...d, examiners: await enrichExaminers(d.examiners) })));
}

export async function findDefencesBySupervisor(lecturerId, { search } = {}) {
  const where = {
    status: { notIn: ["cancelled"] },
    thesis: { thesisSupervisors: { some: { lecturerId } } },
    ...whereSearch(search),
  };
  if (search) {
    where.thesis = {
      thesisSupervisors: { some: { lecturerId } },
      OR: where.thesis.OR,
    };
  }
  const data = await prisma.thesisDefence.findMany({
    where,
    include: defenceListInclude,
    orderBy: { createdAt: "desc" },
  });
  return Promise.all(data.map(async (d) => ({ ...d, examiners: await enrichExaminers(d.examiners) })));
}

// ============================================================
// DETAIL
// ============================================================

export async function findDefenceById(defenceId) {
  const defence = await prisma.thesisDefence.findUnique({
    where: { id: defenceId },
    include: defenceDetailInclude,
  });
  if (!defence) return null;
  return { ...defence, examiners: await enrichExaminers(defence.examiners) };
}

export async function findDefenceBasicById(defenceId) {
  return prisma.thesisDefence.findUnique({
    where: { id: defenceId },
    select: {
      id: true,
      thesisId: true,
      status: true,
      registeredAt: true,
      roomId: true,
      date: true,
      startTime: true,
      endTime: true,
      finalScore: true,
      supervisorScore: true,
      resultFinalizedAt: true,
      revisionFinalizedAt: true,
      revisionFinalizedBy: true,
      thesis: {
        select: {
          studentId: true,
          thesisSupervisors: {
            select: { lecturerId: true },
          },
        },
      },
    },
  });
}

// ============================================================
// CRUD
// ============================================================

export async function updateDefence(defenceId, data) {
  return prisma.thesisDefence.update({ where: { id: defenceId }, data });
}

export async function updateDefenceStatus(defenceId, status) {
  return prisma.thesisDefence.update({ where: { id: defenceId }, data: { status } });
}

export async function deleteDefence(id) {
  return prisma.$transaction(async (tx) => {
    await tx.thesisDefenceDocument.deleteMany({ where: { thesisDefenceId: id } });
    await tx.thesisDefenceExaminer.deleteMany({ where: { thesisDefenceId: id } });
    await tx.thesisDefenceSupervisorAssessmentDetail.deleteMany({ where: { thesisDefenceId: id } });
    await tx.thesisDefenceRevision.deleteMany({
      where: { defenceExaminer: { thesisDefenceId: id } },
    });
    return tx.thesisDefence.delete({ where: { id } });
  });
}

export async function createArchive(data) {
  const { thesisId, date, roomId, status, examinerLecturerIds, userId, finalScore, grade } = data;
  return prisma.$transaction(async (tx) => {
    const defence = await tx.thesisDefence.create({
      data: {
        thesisId,
        date: date ? new Date(date) : undefined,
        roomId,
        status,
        finalScore,
        grade,
        registeredAt: null, // Mark as archive
        resultFinalizedAt: new Date(),
      },
    });

    if (examinerLecturerIds && examinerLecturerIds.length > 0) {
      await tx.thesisDefenceExaminer.createMany({
        data: examinerLecturerIds.map((lecturerId, index) => ({
          thesisDefenceId: defence.id,
          lecturerId,
          assignedBy: userId,
          order: index + 1,
          availabilityStatus: "available",
          assignedAt: new Date(),
          respondedAt: new Date(),
        })),
      });
    }

    return defence;
  });
}

export async function updateArchive(id, data) {
  const { date, roomId, status, examinerLecturerIds, userId, finalScore, grade } = data;
  return prisma.$transaction(async (tx) => {
    await tx.thesisDefence.update({
      where: { id },
      data: {
        date: date ? new Date(date) : undefined,
        roomId,
        status,
        finalScore,
        grade,
      },
    });

    if (examinerLecturerIds) {
      // Refresh examiners to ensure all have assignedBy and correct order
      await tx.thesisDefenceExaminer.deleteMany({ where: { thesisDefenceId: id } });
      if (examinerLecturerIds.length > 0) {
        await tx.thesisDefenceExaminer.createMany({
          data: examinerLecturerIds.map((lecturerId, index) => ({
            thesisDefenceId: id,
            lecturerId,
            assignedBy: userId,
            order: index + 1,
            availabilityStatus: "available",
            assignedAt: new Date(),
            respondedAt: new Date(),
          })),
        });
      }
    }

    return await tx.thesisDefence.findUnique({ where: { id } });
  });
}

export async function getThesisOptions() {
  return prisma.thesis.findMany({
    select: {
      id: true,
      title: true,
      student: { select: { user: { select: { fullName: true, identityNumber: true } } } },
      thesisSupervisors: { select: { lecturerId: true } },
      thesisDefences: {
        select: { id: true, status: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { student: { user: { fullName: "asc" } } },
  });
}

export async function getLecturerOptions() {
  return prisma.lecturer.findMany({
    select: {
      id: true,
      user: { select: { fullName: true, identityNumber: true } },
    },
    orderBy: { user: { fullName: "asc" } },
  });
}

export async function getStudentOptions() {
  return prisma.student.findMany({
    select: {
      id: true,
      user: { select: { fullName: true, identityNumber: true } },
    },
    orderBy: { user: { fullName: "asc" } },
  });
}

// ============================================================
// SCHEDULING
// ============================================================

export async function findLecturerAvailabilities(lecturerIds) {
  return prisma.lecturerAvailability.findMany({
    where: { lecturerId: { in: lecturerIds } },
    orderBy: [{ lecturerId: "asc" }, { day: "asc" }, { startTime: "asc" }],
  });
}

export async function findAllRooms() {
  return prisma.room.findMany({ orderBy: { name: "asc" } });
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
            student: { include: { user: true } }
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
            student: { include: { user: true } }
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

export async function findRoomScheduleConflict({ defenceId, roomId, date, startTime, endTime }) {
  return prisma.thesisDefence.findFirst({
    where: {
      id: defenceId ? { not: defenceId } : undefined,
      roomId,
      date: new Date(date),
      status: "scheduled",
      AND: [
        { startTime: { lt: new Date(`1970-01-01T${endTime}:00.000Z`) } },
        { endTime: { gt: new Date(`1970-01-01T${startTime}:00.000Z`) } },
      ],
    },
  });
}

export async function updateDefenceSchedule(defenceId, { roomId, date, startTime, endTime, meetingLink }) {
  return prisma.thesisDefence.update({
    where: { id: defenceId },
    data: {
      roomId,
      meetingLink,
      date: new Date(date),
      startTime: new Date(`1970-01-01T${startTime}:00.000Z`),
      endTime: new Date(`1970-01-01T${endTime}:00.000Z`),
    },
  });
}

// ============================================================
// SUPERVISOR LOOKUPS
// ============================================================

export async function findDefenceSupervisorRole(defenceId, lecturerId) {
  return prisma.thesisDefence.findFirst({
    where: {
      id: defenceId,
      thesis: { thesisSupervisors: { some: { lecturerId } } },
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
              lecturer: { select: { user: { select: { fullName: true } } } },
            },
            take: 1,
          },
        },
      },
    },
  });
}

// ============================================================
// SUPERVISOR ASSESSMENT
// ============================================================

export async function findDefenceSupervisorAssessmentDetails(defenceId) {
  return prisma.thesisDefenceSupervisorAssessmentDetail.findMany({
    where: { thesisDefenceId: defenceId },
    include: {
      criteria: {
        select: {
          id: true,
          name: true,
          maxScore: true,
          displayOrder: true,
          cpmk: { select: { id: true, code: true, description: true } },
        },
      },
    },
  });
}

export async function saveDefenceSupervisorAssessment({ defenceId, scores, supervisorNotes, isDraft }) {
  return prisma.$transaction(async (tx) => {
    await tx.thesisDefenceSupervisorAssessmentDetail.deleteMany({
      where: { thesisDefenceId: defenceId },
    });

    if (scores.length > 0) {
      await tx.thesisDefenceSupervisorAssessmentDetail.createMany({
        data: scores.map((item) => ({
          thesisDefenceId: defenceId,
          assessmentCriteriaId: item.assessmentCriteriaId,
          score: item.score,
        })),
      });
    }

    const totalScore = scores.reduce((sum, item) => sum + item.score, 0);
    return tx.thesisDefence.update({
      where: { id: defenceId },
      data: {
        supervisorScore: totalScore,
        supervisorNotes: supervisorNotes || null,
        supervisorAssessmentSubmittedAt: isDraft ? undefined : new Date(),
        updatedAt: new Date(),
      },
    });
  });
}

// ============================================================
// FINALIZATION
// ============================================================

export async function finalizeDefenceResult({
  defenceId,
  status,
  examinerAverageScore,
  supervisorScore,
  finalScore,
  grade,
  resultFinalizedBy,
  recommendRevision,
}) {
  return prisma.thesisDefence.update({
    where: { id: defenceId },
    data: {
      status,
      examinerAverageScore,
      supervisorScore,
      finalScore,
      grade,
      resultFinalizedAt: new Date(),
      resultFinalizedBy,
      recommendRevision: !!recommendRevision,
    },
  });
}

export async function finalizeDefenceRevisions({ defenceId, supervisorId }) {
  return prisma.thesisDefence.update({
    where: { id: defenceId },
    data: {
      revisionFinalizedAt: new Date(),
      revisionFinalizedBy: supervisorId,
    },
    select: {
      id: true,
      revisionFinalizedAt: true,
      revisionFinalizedBy: true,
    },
  });
}

// ============================================================
// STUDENT QUERIES
// ============================================================

export async function getStudentThesisWithDefenceInfo(studentId) {
  return prisma.thesis.findFirst({
    where: { studentId },
    select: {
      id: true,
      title: true,
      thesisSupervisors: {
        select: {
          id: true,
          lecturerId: true,
          defenceReady: true,
          role: { select: { id: true, name: true } },
          lecturer: {
            select: { id: true, user: { select: { id: true, fullName: true } } },
          },
        },
      },
      thesisSeminars: {
        where: { status: { in: ["passed", "passed_with_revision"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          revisionFinalizedAt: true,
          examiners: { select: { id: true } },
        },
      },
      thesisDefences: {
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
          grade: true,
          resultFinalizedAt: true,
          cancelledReason: true,
          room: { select: { id: true, name: true } },
          documents: {
            select: {
              thesisDefenceId: true,
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
            },
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });
}

export async function countSeminarRevisions(seminarId) {
  const [total, finished] = await Promise.all([
    prisma.thesisSeminarRevision.count({
      where: { seminarExaminer: { seminar: { id: seminarId } } },
    }),
    prisma.thesisSeminarRevision.count({
      where: {
        seminarExaminer: { seminar: { id: seminarId } },
        supervisorApprovedAt: { not: null },
      },
    }),
  ]);
  return { total, finished };
}

export async function getAllStudentDefences(studentId) {
  return prisma.thesisDefence.findMany({
    where: { thesis: { studentId } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      registeredAt: true,
      date: true,
      startTime: true,
      endTime: true,
      meetingLink: true,
      examinerAverageScore: true,
      supervisorScore: true,
      supervisorNotes: true,
      finalScore: true,
      grade: true,
      resultFinalizedAt: true,
      cancelledReason: true,
      updatedAt: true,
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

export async function findStudentDefenceDetail(defenceId) {
  return prisma.thesisDefence.findUnique({
    where: { id: defenceId },
    select: {
      id: true,
      thesisId: true,
      status: true,
      registeredAt: true,
      date: true,
      startTime: true,
      endTime: true,
      meetingLink: true,
      examinerAverageScore: true,
      supervisorScore: true,
      supervisorNotes: true,
      finalScore: true,
      grade: true,
      resultFinalizedAt: true,
      updatedAt: true,
      cancelledReason: true,
      room: { select: { id: true, name: true } },
      resultFinalizer: {
        select: {
          lecturer: { select: { user: { select: { fullName: true } } } },
          role: { select: { name: true } },
        },
      },
      thesis: {
        select: {
          id: true,
          studentId: true,
          title: true,
          thesisSupervisors: {
            select: {
              role: { select: { name: true } },
              lecturer: { select: { user: { select: { fullName: true } } } },
            },
          },
        },
      },
      examiners: {
        where: { availabilityStatus: "available" },
        select: {
          id: true,
          lecturerId: true,
          order: true,
          assessmentScore: true,
          assessmentSubmittedAt: true,
          revisionNotes: true,
        },
        orderBy: { order: "asc" },
      },
      documents: {
        select: {
          thesisDefenceId: true,
          documentTypeId: true,
          documentId: true,
          status: true,
          submittedAt: true,
          verifiedAt: true,
          notes: true,
        },
      },
    },
  });
}
