import prisma from "../../config/prisma.js";

// ============================================================
// Shared Prisma Includes
// ============================================================

const defenceWithThesisInclude = {
  thesis: {
    select: {
      id: true,
      title: true,
      student: {
        select: {
          id: true,
          user: {
            select: { fullName: true, identityNumber: true },
          },
        },
      },
      thesisSupervisors: {
        select: {
          lecturerId: true,
          lecturer: {
            select: { user: { select: { fullName: true } } },
          },
          role: { select: { name: true } },
        },
      },
    },
  },
  examiners: { orderBy: { order: "asc" } },
  room: true,
};

// ============================================================
// Helper: enrich examiners with lecturer names
// ============================================================

export async function enrichExaminers(examiners = []) {
  return Promise.all(
    examiners.map(async (e) => {
      const lecturer = await prisma.lecturer.findUnique({
        where: { id: e.lecturerId },
        select: { user: { select: { fullName: true } } },
      });
      return { ...e, lecturerName: lecturer?.user?.fullName || "-" };
    })
  );
}

// ============================================================
// KETUA DEPARTEMEN — examiner assignment queries
// ============================================================

export async function findDefencesForAssignment({ search } = {}) {
  const where = {
    status: { in: ["verified", "examiner_assigned"] },
  };

  if (search) {
    where.thesis = {
      OR: [
        { title: { contains: search } },
        { student: { user: { fullName: { contains: search } } } },
        { student: { user: { identityNumber: { contains: search } } } },
      ],
    };
  }

  const defences = await prisma.thesisDefence.findMany({
    where,
    include: defenceWithThesisInclude,
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    defences.map(async (d) => ({
      ...d,
      examiners: await enrichExaminers(d.examiners),
    }))
  );
}

export async function findEligibleExaminers(defenceId) {
  const defence = await prisma.thesisDefence.findUnique({
    where: { id: defenceId },
    select: {
      thesis: {
        select: {
          thesisSupervisors: { select: { lecturerId: true } },
        },
      },
    },
  });

  if (!defence) return [];

  const supervisorIds = (defence.thesis?.thesisSupervisors || []).map(
    (ts) => ts.lecturerId
  );

  return prisma.lecturer.findMany({
    where: {
      id: { notIn: supervisorIds },
    },
    select: {
      id: true,
      user: { select: { fullName: true, identityNumber: true } },
      scienceGroup: { select: { name: true } },
    },
    orderBy: { user: { fullName: "asc" } },
  });
}

export async function createExaminers(defenceId, examiners, assignedBy) {
  const now = new Date();
  const data = examiners.map((e) => ({
    thesisDefenceId: defenceId,
    lecturerId: e.lecturerId,
    order: e.order,
    assignedBy,
    assignedAt: now,
    availabilityStatus: e.availabilityStatus || "pending",
    respondedAt: e.availabilityStatus === "available" ? now : null,
  }));

  return prisma.thesisDefenceExaminer.createMany({ data });
}

export async function deletePendingExaminers(defenceId) {
  return prisma.thesisDefenceExaminer.deleteMany({
    where: {
      thesisDefenceId: defenceId,
      availabilityStatus: "pending",
    },
  });
}

export async function findActiveExaminersByDefence(defenceId) {
  const examiners = await prisma.thesisDefenceExaminer.findMany({
    where: {
      thesisDefenceId: defenceId,
      availabilityStatus: { in: ["pending", "available"] },
    },
    orderBy: { order: "asc" },
  });
  return enrichExaminers(examiners);
}

// ============================================================
// LECTURER — defence overview queries
// ============================================================

export async function findExaminerRequestsByLecturerId(lecturerId, { search } = {}) {
  const where = {
    status: { notIn: ["cancelled"] },
    examiners: { some: { lecturerId } },
  };

  if (search) {
    where.thesis = {
      OR: [
        { title: { contains: search } },
        { student: { user: { fullName: { contains: search } } } },
        { student: { user: { identityNumber: { contains: search } } } },
      ],
    };
  }

  const defences = await prisma.thesisDefence.findMany({
    where,
    include: defenceWithThesisInclude,
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    defences.map(async (d) => ({
      ...d,
      examiners: await enrichExaminers(d.examiners),
    }))
  );
}

export async function findSupervisedStudentDefences(lecturerId, { search } = {}) {
  const where = {
    status: { notIn: ["cancelled"] },
    thesis: {
      thesisSupervisors: { some: { lecturerId } },
    },
  };

  if (search) {
    where.thesis = {
      ...where.thesis,
      OR: [
        { title: { contains: search } },
        { student: { user: { fullName: { contains: search } } } },
        { student: { user: { identityNumber: { contains: search } } } },
      ],
    };
  }

  const defences = await prisma.thesisDefence.findMany({
    where,
    include: defenceWithThesisInclude,
    orderBy: { createdAt: "desc" },
  });

  return Promise.all(
    defences.map(async (d) => ({
      ...d,
      examiners: await enrichExaminers(d.examiners),
    }))
  );
}

export async function findDefenceDetailById(defenceId) {
  const defence = await prisma.thesisDefence.findUnique({
    where: { id: defenceId },
    include: {
      ...defenceWithThesisInclude,
      documents: {
        include: {
          verifier: { select: { fullName: true } },
        },
      },
    },
  });

  if (!defence) return null;

  return {
    ...defence,
    examiners: await enrichExaminers(defence.examiners),
  };
}

export async function updateExaminerAvailability(examinerId, status) {
  return prisma.thesisDefenceExaminer.update({
    where: { id: examinerId },
    data: {
      availabilityStatus: status,
      respondedAt: new Date(),
    },
  });
}

export async function findExaminerById(examinerId) {
  return prisma.thesisDefenceExaminer.findUnique({
    where: { id: examinerId },
  });
}

export async function updateDefenceStatus(defenceId, status) {
  return prisma.thesisDefence.update({
    where: { id: defenceId },
    data: { status },
  });
}
