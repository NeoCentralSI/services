import prisma from "../config/prisma.js";

// ============================================
// Class CRUD
// ============================================

const enrollmentInclude = {
  include: {
    student: {
      include: {
        user: { select: { fullName: true, identityNumber: true } },
      },
    },
  },
  orderBy: { enrolledAt: "asc" },
};

export async function findClassesByLecturer(lecturerId, academicYearId = null) {
  const where = { lecturerId };
  if (academicYearId) {
    where.academicYearId = academicYearId;
  }

  return prisma.metopenClass.findMany({
    where,
    include: {
      academicYear: { select: { id: true, semester: true, year: true, isActive: true } },
      enrollments: enrollmentInclude,
      _count: { select: { enrollments: true, milestones: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function findAllClasses(academicYearId = null) {
  const where = {};
  if (academicYearId) {
    where.academicYearId = academicYearId;
  }

  return prisma.metopenClass.findMany({
    where,
    include: {
      lecturer: { select: { user: { select: { fullName: true } } } },
      academicYear: { select: { id: true, semester: true, year: true, isActive: true } },
      enrollments: enrollmentInclude,
      _count: { select: { enrollments: true, milestones: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function findClassById(classId) {
  return prisma.metopenClass.findUnique({
    where: { id: classId },
    include: {
      lecturer: { select: { user: { select: { fullName: true, identityNumber: true } } } },
      academicYear: { select: { id: true, semester: true, year: true, isActive: true } },
      enrollments: {
        include: {
          student: {
            include: {
              user: { select: { fullName: true, identityNumber: true } },
              thesis: {
                where: { thesisStatus: { name: "Metopel" } },
                select: { id: true, title: true },
                take: 1,
              },
            },
          },
        },
        orderBy: { enrolledAt: "asc" },
      },
      _count: { select: { enrollments: true, milestones: true } },
    },
  });
}

export async function createClass(data) {
  return prisma.metopenClass.create({
    data: {
      name: data.name,
      description: data.description || null,
      lecturerId: data.lecturerId,
      academicYearId: data.academicYearId,
    },
  });
}

export async function updateClass(classId, data) {
  return prisma.metopenClass.update({
    where: { id: classId },
    data,
  });
}

export async function findAcademicYearById(academicYearId) {
  return prisma.academicYear.findUnique({
    where: { id: academicYearId },
    select: {
      id: true,
      year: true,
      semester: true,
      startDate: true,
      endDate: true,
      isActive: true,
    },
  });
}

export async function deleteClass(classId) {
  return prisma.metopenClass.delete({ where: { id: classId } });
}

// ============================================
// Enrollment
// ============================================

export async function enrollStudents(classId, studentIds, academicYearId) {
  const data = studentIds.map((studentId) => ({
    classId,
    studentId,
    academicYearId,
  }));

  return prisma.metopenClassStudent.createMany({
    data,
    skipDuplicates: true,
  });
}

export async function unenrollStudent(classId, studentId) {
  return prisma.metopenClassStudent.delete({
    where: { classId_studentId: { classId, studentId } },
  });
}

export async function findEnrolledStudentIds(classId) {
  const enrollments = await prisma.metopenClassStudent.findMany({
    where: { classId },
    select: { studentId: true },
  });
  return enrollments.map((e) => e.studentId);
}

export async function findRosterEnrollments(academicYearId) {
  return prisma.metopenClassStudent.findMany({
    where: { academicYearId },
    include: {
      student: {
        include: {
          user: { select: { id: true, fullName: true, identityNumber: true, email: true } },
        },
      },
      metopenClass: {
        include: {
          lecturer: {
            select: {
              id: true,
              user: { select: { id: true, fullName: true, identityNumber: true } },
            },
          },
          academicYear: {
            select: { id: true, year: true, semester: true, isActive: true, startDate: true, endDate: true },
          },
        },
      },
    },
    orderBy: [
      { student: { user: { fullName: "asc" } } },
      { enrolledAt: "asc" },
    ],
  });
}

export async function findConflictingEnrollments(academicYearId, studentIds, excludeClassId = null) {
  const where = {
    academicYearId,
    studentId: { in: studentIds },
  };

  if (excludeClassId) {
    where.classId = { not: excludeClassId };
  }

  return prisma.metopenClassStudent.findMany({
    where,
    include: {
      student: {
        include: {
          user: { select: { fullName: true, identityNumber: true } },
        },
      },
      metopenClass: {
        select: {
          id: true,
          name: true,
          lecturer: {
            select: {
              user: { select: { fullName: true } },
            },
          },
        },
      },
    },
    orderBy: [{ student: { user: { fullName: "asc" } } }, { enrolledAt: "asc" }],
  });
}

export async function resolveDuplicateEnrollment({ academicYearId, studentId, keepClassId }) {
  return prisma.$transaction(async (tx) => {
    const enrollments = await tx.metopenClassStudent.findMany({
      where: { academicYearId, studentId },
      include: {
        metopenClass: {
          select: {
            id: true,
            name: true,
            lecturer: {
              select: {
                user: { select: { fullName: true } },
              },
            },
          },
        },
      },
      orderBy: { enrolledAt: "asc" },
    });

    const keepEnrollment = enrollments.find((enrollment) => enrollment.classId === keepClassId);
    if (!keepEnrollment) {
      return null;
    }

    const removedClassIds = enrollments
      .filter((enrollment) => enrollment.classId !== keepClassId)
      .map((enrollment) => enrollment.classId);

    const movedMilestones = removedClassIds.length > 0
      ? await tx.thesisMilestone.updateMany({
          where: {
            metopenClassId: { in: removedClassIds },
            thesis: { is: { studentId } },
          },
          data: { metopenClassId: keepClassId },
        })
      : { count: 0 };

    const deletedEnrollments = removedClassIds.length > 0
      ? await tx.metopenClassStudent.deleteMany({
          where: {
            academicYearId,
            studentId,
            classId: { in: removedClassIds },
          },
        })
      : { count: 0 };

    return {
      keepEnrollment,
      removedClassIds,
      movedMilestones: movedMilestones.count,
      deletedEnrollments: deletedEnrollments.count,
    };
  });
}

// ============================================
// Class Tasks (Published Templates)
// ============================================

export async function findClassTasks(classId) {
  // Get unique published templates for this class
  const milestones = await prisma.thesisMilestone.findMany({
    where: { metopenClassId: classId },
    include: {
      milestoneTemplate: {
        select: { id: true, name: true, description: true, orderIndex: true, weightPercentage: true, isGateToAdvisorSearch: true },
      },
      thesis: {
        include: {
          student: {
            include: { user: { select: { fullName: true, identityNumber: true } } },
          },
        },
      },
    },
    orderBy: [{ milestoneTemplate: { orderIndex: "asc" } }, { createdAt: "asc" }],
  });

  // Group by template
  const templateMap = new Map();
  for (const m of milestones) {
    const tmplId = m.milestoneTemplateId;
    if (!tmplId) continue;

    if (!templateMap.has(tmplId)) {
      templateMap.set(tmplId, {
        template: m.milestoneTemplate,
        deadline: m.targetDate,
        submissions: [],
      });
    }

    templateMap.get(tmplId).submissions.push({
      milestoneId: m.id,
      studentId: m.thesis?.studentId,
      studentName: m.thesis?.student?.user?.fullName ?? "-",
      studentNim: m.thesis?.student?.user?.identityNumber ?? "-",
      status: m.status,
      submittedAt: m.submittedAt,
      totalScore: m.totalScore,
      isLate: !!(m.submittedAt && m.targetDate && new Date(m.submittedAt) > new Date(m.targetDate)),
    });
  }

  return Array.from(templateMap.values());
}

export async function findClassTaskDetail(classId, templateId) {
  return prisma.thesisMilestone.findMany({
    where: {
      metopenClassId: classId,
      milestoneTemplateId: templateId,
    },
    include: {
      milestoneTemplate: {
        select: {
          id: true, name: true, description: true, weightPercentage: true,
          attachments: {
            include: { document: { select: { id: true, name: true, fileUrl: true, mimeType: true } } },
          },
        },
      },
      thesis: {
        include: {
          student: {
            include: { user: { select: { fullName: true, identityNumber: true } } },
          },
        },
      },
      milestoneDocuments: {
        where: { isLatest: true },
        select: { id: true, fileName: true, filePath: true, mimeType: true, createdAt: true },
      },
    },
    orderBy: { thesis: { student: { user: { fullName: "asc" } } } },
  });
}

export async function findPublishedTemplateIdsForClass(classId) {
  const result = await prisma.thesisMilestone.findMany({
    where: { metopenClassId: classId },
    select: { milestoneTemplateId: true },
    distinct: ["milestoneTemplateId"],
  });
  return new Set(result.map((r) => r.milestoneTemplateId).filter(Boolean));
}

export async function createManyClassMilestones(data) {
  return prisma.thesisMilestone.createMany({ data });
}
