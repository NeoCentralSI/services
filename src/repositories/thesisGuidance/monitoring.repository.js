import prisma from "../../config/prisma.js";

/**
 * Get all theses with progress summary for management monitoring
 * @param {Object} filters - Filter options
 * @param {string} filters.status - Filter by thesis status name
 * @param {string} filters.lecturerId - Filter by supervisor
 * @param {string} filters.academicYear - Filter by academic year
 * @param {string} filters.search - Search by student name, NIM, or title
 * @param {number} filters.page - Page number
 * @param {number} filters.pageSize - Page size
 */
export async function getThesesOverview(filters = {}) {
  const { status, lecturerId, academicYear, search, page = 1, pageSize = 20 } = filters;

  const where = {};

  // Filter by thesis status
  if (status) {
    where.thesisStatus = { name: status };
  }

  // Filter by supervisor
  if (lecturerId) {
    where.thesisSupervisors = {
      some: {
        lecturerId,
        role: {
          name: { in: ["Pembimbing 1", "Pembimbing 2"] },
        },
      },
    };
  }

  // Filter by academic year
  if (academicYear) {
    where.academicYearId = academicYear;
  }

  // Search by student name, NIM, or thesis title
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { student: { user: { fullName: { contains: search, mode: 'insensitive' } } } },
      { student: { user: { identityNumber: { contains: search, mode: 'insensitive' } } } },
    ];
  }

  const [theses, total] = await Promise.all([
    prisma.thesis.findMany({
      where,
      select: {
        id: true,
        title: true,
        rating: true,
        createdAt: true,
        student: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                identityNumber: true,
                email: true,
              },
            },
          },
        },
        thesisStatus: true,
        academicYear: true,
        thesisSupervisors: {
          include: {
            lecturer: {
              include: {
                user: {
                  select: {
                    fullName: true,
                  },
                },
              },
            },
            role: true,
          },
        },
        thesisMilestones: {
          select: {
            id: true,
            status: true,
            progressPercentage: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.thesis.count({ where }),
  ]);

  return { theses, total, page, pageSize };
}

/**
 * Get thesis status distribution summary
 */
export async function getStatusDistribution(academicYear) {
  const where = academicYear ? { academicYearId: academicYear } : {};

  const statuses = await prisma.thesisStatus.findMany({
    include: {
      _count: {
        select: {
          thesis: {
            where,
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return statuses.map((s) => ({
    id: s.id,
    name: s.name,
    count: s._count.thesis,
  }));
}

/**
 * Get thesis rating distribution summary (ONGOING, SLOW, AT_RISK, FAILED)
 */
export async function getRatingDistribution(academicYear) {
  const where = {
    thesisStatus: {
      name: { notIn: ["Selesai"] },
    },
  };

  if (academicYear) {
    where.academicYearId = academicYear;
  }

  const ratings = await prisma.thesis.groupBy({
    by: ['rating'],
    where,
    _count: {
      rating: true,
    },
  });

  // Map to friendly names
  const ratingLabels = {
    ONGOING: 'Ongoing',
    SLOW: 'Slow',
    AT_RISK: 'At Risk',
    FAILED: 'Gagal',
    CANCELLED: 'Dibatalkan',
  };

  return ['ONGOING', 'SLOW', 'AT_RISK', 'FAILED', 'CANCELLED'].map((rating) => {
    const found = ratings.find((r) => r.rating === rating);
    return {
      id: rating,
      name: ratingLabels[rating],
      value: rating,
      count: found?._count?.rating || 0,
    };
  });
}

/**
 * Get overall progress statistics
 */
export async function getProgressStatistics(academicYear) {
  // Build where clause
  const where = {
    thesisStatus: {
      name: { notIn: ["Selesai", "Gagal"] },
    },
  };

  if (academicYear) {
    where.academicYearId = academicYear;
  }

  // Get all theses with milestones
  const theses = await prisma.thesis.findMany({
    where,
    select: {
      thesisMilestones: {
        select: {
          status: true,
        },
      },
      thesisSupervisors: {
        select: {
          seminarReady: true,
          role: { select: { name: true } },
        },
      },
    },
  });

  let totalMilestones = 0;
  let completedMilestones = 0;
  let studentsComplete100 = 0;
  let studentsWithNoProgress = 0;

  theses.forEach((t) => {
    const milestones = t.thesisMilestones || [];
    const total = milestones.length;
    const completed = milestones.filter((m) => m.status === "completed").length;

    totalMilestones += total;
    completedMilestones += completed;

    if (total > 0 && completed === total) {
      studentsComplete100++;
    }
    if (total === 0 || completed === 0) {
      studentsWithNoProgress++;
    }
  });

  return {
    totalActiveTheses: theses.length,
    totalMilestones,
    completedMilestones,
    averageProgress: totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0,
    studentsComplete100,
    studentsWithNoProgress,
  };
}

/**
 * Get at-risk students (no activity for more than 2 months)
 */
export async function getAtRiskStudents(limit = 10, academicYear) {
  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

  const where = {
    thesisStatus: {
      name: { notIn: ["Selesai", "Gagal", "Acc Seminar"] },
    },
  };

  if (academicYear) {
    where.academicYearId = academicYear;
  }

  const theses = await prisma.thesis.findMany({
    where,
    include: {
      student: {
        include: {
          user: {
            select: {
              fullName: true,
              identityNumber: true,
            },
          },
        },
      },
      thesisStatus: true,
      thesisMilestones: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          updatedAt: true,
        },
      },
      thesisSupervisors: {
        where: {
          role: { name: { in: ["Pembimbing 1", "Pembimbing 2"] } },
        },
        include: {
          lecturer: {
            include: {
              user: { select: { fullName: true } },
            },
          },
          role: true,
        },
      },
    },
  });

  // Filter and calculate days since last activity
  const atRisk = theses
    .map((t) => {
      const lastMilestone = t.thesisMilestones[0];
      const lastActivity = lastMilestone?.updatedAt || t.createdAt;
      const daysSinceActivity = Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24));

      return {
        thesisId: t.id,
        title: t.title,
        student: {
          name: t.student?.user?.fullName,
          nim: t.student?.user?.identityNumber,
        },
        status: t.thesisStatus?.name,
        lastActivity,
        daysSinceActivity,
        supervisors: t.thesisSupervisors.map((p) => ({
          name: p.lecturer?.user?.fullName,
          role: p.role?.name,
        })),
      };
    })
    .filter((t) => t.daysSinceActivity >= 60) // 60 days = 2 months
    .sort((a, b) => b.daysSinceActivity - a.daysSinceActivity)
    .slice(0, limit);

  return atRisk;
}

/**
 * Get students ready for seminar
 */
export async function getStudentsReadyForSeminar(academicYear) {
  const where = {
    thesisStatus: {
      name: "Acc Seminar",
    },
    thesisSupervisors: {
      every: {
        seminarReady: true,
      },
    },
  };

  if (academicYear) {
    where.academicYearId = academicYear;
  }

  return prisma.thesis.findMany({
    where,
    include: {
      student: {
        include: {
          user: {
            select: {
              fullName: true,
              identityNumber: true,
              email: true,
            },
          },
        },
      },
      thesisSupervisors: {
        where: {
          role: { name: { in: ["Pembimbing 1", "Pembimbing 2"] } },
        },
        include: {
          lecturer: {
            include: {
              user: { select: { fullName: true } },
            },
          },
          role: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

/** * Get all academic years for filter options
 */
export async function getAllAcademicYears() {
  const academicYears = await prisma.academicYear.findMany({
    where: {
      thesis: {
        some: {},
      },
    },
    orderBy: [
      { year: "desc" },
      { semester: "desc" },
    ],
  });

  return academicYears.map((ay) => ({
    id: ay.id,
    name: `${ay.semester === "ganjil" ? "Ganjil" : "Genap"} ${ay.year}`,
    semester: ay.semester,
    year: ay.year,
    isActive: ay.isActive,
  }));
}

/** * Get all supervisors for filter dropdown
 */
export async function getAllSupervisors() {
  const participants = await prisma.ThesisSupervisors.findMany({
    where: {
      role: { name: { in: ["Pembimbing 1", "Pembimbing 2"] } },
    },
    distinct: ["lecturerId"],
    include: {
      lecturer: {
        include: {
          user: {
            select: {
              fullName: true,
            },
          },
        },
      },
    },
  });

  return participants
    .filter((p) => p.lecturer?.user?.fullName)
    .map((p) => ({
      id: p.lecturerId,
      name: p.lecturer.user.fullName,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Get detailed thesis information by thesis ID for monitoring
 */
export async function getThesisDetailById(thesisId) {
  return prisma.thesis.findUnique({
    where: { id: thesisId },
    include: {
      student: {
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              identityNumber: true,
              phoneNumber: true,
            },
          },
        },
      },
      thesisStatus: true,
      thesisTopic: true,
      academicYear: true,
      thesisSupervisors: {
        include: {
          lecturer: {
            include: {
              user: {
                select: {
                  id: true,
                  fullName: true,
                  email: true,
                },
              },
            },
          },
          role: true,
        },
      },
      thesisMilestones: {
        orderBy: { targetDate: "asc" },
        select: {
          id: true,
          title: true,
          status: true,
          progressPercentage: true,
          targetDate: true,
          completedAt: true,
          updatedAt: true,
        },
      },
      thesisGuidances: {
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          id: true,
          status: true,
          studentNotes: true,
          approvedDate: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      thesisSeminars: {
        orderBy: { createdAt: "desc" },
      },
      thesisDefences: {
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

/**
 * Get comprehensive thesis data for semester progress report
 * @param {string} academicYearId - Academic year ID for filtering
 */
export async function getThesesForReport(academicYearId) {
  const where = {};

  if (academicYearId) {
    where.academicYearId = academicYearId;
  }

  const theses = await prisma.thesis.findMany({
    where,
    include: {
      student: {
        include: {
          user: {
            select: {
              fullName: true,
              identityNumber: true,
              email: true,
            },
          },
          // studentStatus removed (now enum)
        },
      },
      thesisStatus: true,
      thesisTopic: true,
      academicYear: true,
      thesisSupervisors: {
        where: {
          role: { name: { in: ["Pembimbing 1", "Pembimbing 2"] } },
        },
        include: {
          lecturer: {
            include: {
              user: { select: { fullName: true } },
            },
          },
          role: true,
        },
      },
      thesisMilestones: {
        select: {
          id: true,
          title: true,
          status: true,
          progressPercentage: true,
          targetDate: true,
          completedAt: true,
        },
      },
      thesisGuidances: {
        select: {
          id: true,
          status: true,
          completedAt: true,
          createdAt: true,
        },
      },
    },
    orderBy: [
      { student: { user: { fullName: "asc" } } },
    ],
  });

  return theses;
}

/**
 * Get academic year by ID
 */
export async function getAcademicYearById(academicYearId) {
  return prisma.academicYear.findUnique({
    where: { id: academicYearId },
  });
}
