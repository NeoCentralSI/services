import prisma from "../../config/prisma.js";

/**
 * Helper to build a dynamic start date filter based on academic year
 */
async function buildAcademicYearFilter(academicYearId) {
  if (!academicYearId) return null;
  const ay = await prisma.academicYear.findUnique({ where: { id: academicYearId } });
  if (ay && ay.startDate && ay.endDate) {
    const margin = 30 * 24 * 60 * 60 * 1000;
    const start = new Date(new Date(ay.startDate).getTime() - margin);
    return {
      startDate: { gte: start, lte: ay.endDate }
    };
  }
  return { academicYearId }; // fallback
}

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

  const where = { isProposal: false };

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
    Object.assign(where, await buildAcademicYearFilter(academicYear));
  }

  // Search by student name, NIM, or thesis title
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { student: { user: { fullName: { contains: search } } } },
      { student: { user: { identityNumber: { contains: search } } } },
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
        updatedAt: true,
        startDate: true,
        deadlineDate: true,
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
        thesisGuidances: {
          where: { status: "completed" },
          orderBy: { approvedDate: "desc" },
          take: 1,
          select: {
            approvedDate: true,
            completedAt: true,
          },
        },
        thesisSeminars: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          select: {
            status: true,
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
  const where = academicYear ? await buildAcademicYearFilter(academicYear) : {};
  where.isProposal = false;

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
    isProposal: false,
    rating: { notIn: ["FAILED", "CANCELLED"] },
    thesisStatus: {
      name: { notIn: ["Selesai", "Gagal", "Dibatalkan"] },
    },
  };

  if (academicYear) {
    Object.assign(where, await buildAcademicYearFilter(academicYear));
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
  };

  return ['ONGOING', 'SLOW', 'AT_RISK'].map((rating) => {
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
  // Active means it has rating ONGOING, SLOW, or AT_RISK
  // FAILED and CANCELLED are not active
  const where = {
    isProposal: false,
    rating: { in: ["ONGOING", "SLOW", "AT_RISK"] },
    thesisStatus: {
      name: { notIn: ["Selesai", "Gagal", "Dibatalkan"] },
    },
  };

  if (academicYear) {
    Object.assign(where, await buildAcademicYearFilter(academicYear));
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
  const where = {
    isProposal: false,
    rating: "AT_RISK",
    thesisStatus: {
      name: { notIn: ["Selesai", "Gagal", "Acc Seminar"] },
    },
  };

  if (academicYear) {
    Object.assign(where, await buildAcademicYearFilter(academicYear));
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
      thesisGuidances: {
        where: { status: "completed" },
        orderBy: { approvedDate: "desc" },
        take: 1,
        select: {
          approvedDate: true,
          completedAt: true,
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

  // Filter and calculate days since last activity
  const atRisk = theses
    .map((t) => {
      const latestGuidance = t.thesisGuidances?.[0];
      const latestMilestone = t.thesisMilestones?.[0];
      const latestSeminar = t.thesisSeminars?.[0];

      const activityDates = [
        latestGuidance?.approvedDate || latestGuidance?.completedAt,
        latestMilestone?.updatedAt,
        latestSeminar?.updatedAt,
        t.updatedAt
      ].filter(Boolean).map(d => new Date(d).getTime());

      const lastActivity = activityDates.length > 0
        ? new Date(Math.max(...activityDates)).toISOString()
        : t.updatedAt;

      const daysSinceActivity = Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24));

      return {
        thesisId: t.id,
        title: t.title,
        student: {
          name: t.student?.user?.fullName,
          nim: t.student?.user?.identityNumber,
          email: t.student?.user?.email,
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
    .sort((a, b) => b.daysSinceActivity - a.daysSinceActivity)
    .slice(0, limit);

  return atRisk;
}

/**
 * Get slow students (rating SLOW)
 */
export async function getSlowStudents(limit = 10, academicYear) {
  const where = {
    isProposal: false,
    rating: "SLOW",
    thesisStatus: {
      name: { notIn: ["Selesai", "Gagal", "Acc Seminar"] },
    },
  };

  if (academicYear) {
    Object.assign(where, await buildAcademicYearFilter(academicYear));
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
      thesisGuidances: {
        where: { status: "completed" },
        orderBy: { approvedDate: "desc" },
        take: 1,
        select: {
          approvedDate: true,
          completedAt: true,
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

  const slow = theses
    .map((t) => {
      const latestGuidance = t.thesisGuidances?.[0];
      const latestMilestone = t.thesisMilestones?.[0];
      const latestSeminar = t.thesisSeminars?.[0];

      const activityDates = [
        latestGuidance?.approvedDate || latestGuidance?.completedAt,
        latestMilestone?.updatedAt,
        latestSeminar?.updatedAt,
        t.updatedAt
      ].filter(Boolean).map(d => new Date(d).getTime());

      const lastActivity = activityDates.length > 0
        ? new Date(Math.max(...activityDates)).toISOString()
        : t.updatedAt;

      const daysSinceActivity = Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24));

      return {
        thesisId: t.id,
        title: t.title,
        student: {
          name: t.student?.user?.fullName,
          nim: t.student?.user?.identityNumber,
          email: t.student?.user?.email,
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
    .slice(0, limit);

  return slow;
}

/**
 * Get students ready for seminar
 */
export async function getStudentsReadyForSeminar(academicYear) {
  const where = {
    isProposal: false,
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
    Object.assign(where, await buildAcademicYearFilter(academicYear));
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

/**
 * Get thesis supervisor assignment rows for lecturer workload summary
 */
export async function getSupervisorWorkloadRows(academicYear) {
  const thesisWhere = {
    isProposal: false,
    thesisStatus: {
      name: { notIn: ["Selesai", "Gagal", "Dibatalkan"] },
    },
  };

  if (academicYear) {
    Object.assign(thesisWhere, await buildAcademicYearFilter(academicYear));
  }

  return prisma.thesisSupervisors.findMany({
    where: {
      role: { name: { in: ["Pembimbing 1", "Pembimbing 2"] } },
      thesis: thesisWhere,
    },
    include: {
      lecturer: {
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
      role: true,
      thesis: {
        select: {
          id: true,
          title: true,
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
        },
      },
    },
    orderBy: [
      { lecturer: { user: { fullName: "asc" } } },
      { thesis: { student: { user: { fullName: "asc" } } } },
    ],
  });
}

/** * Get all academic years for filter options
 */
export async function getAllAcademicYears() {
  const academicYears = await prisma.academicYear.findMany({
    where: {
      OR: [
        { thesis: { some: {} } },
        { isActive: true }
      ]
    },
    orderBy: [
      { year: "desc" },
      { semester: "desc" },
    ],
  });

  return academicYears.map((ay) => ({
    id: ay.id,
    name: `${ay.semester === "ganjil" ? "Ganjil" : "Genap"} ${ay.year} `,
    semester: ay.semester,
    year: ay.year,
    isActive: ay.isActive,
    startDate: ay.startDate,
    endDate: ay.endDate,
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
      document: {
        select: { id: true, fileName: true, filePath: true, createdAt: true },
      },
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
        select: {
          id: true,
          thesisId: true,
          status: true,
          finalScore: true,
          date: true,
          startTime: true,
          endTime: true,
          createdAt: true,
          updatedAt: true,
          examiners: {
            select: {
              id: true,
              assessmentScore: true,
              lecturerId: true,
              order: true,
            },
          },
        },
      },
      thesisDefences: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          thesisId: true,
          status: true,
          examinerAverageScore: true,
          supervisorScore: true,
          finalScore: true,
          grade: true,
          date: true,
          startTime: true,
          endTime: true,
          createdAt: true,
          updatedAt: true,
          examiners: {
            select: {
              id: true,
              assessmentScore: true,
              lecturerId: true,
              order: true,
            },
          },
        },
      },
    },
  });
}

/**
 * Get comprehensive thesis data for semester progress report
 * @param {Object} options - Filter options
 * @param {string} options.academicYearId - Academic year ID
 * @param {string[]} options.statusIds - Array of status IDs
 * @param {string[]} options.ratings - Array of ratings
 */
export async function getThesesForReport(options = {}) {
  const { academicYearId, statusIds, ratings } = options;
  const where = { isProposal: false };

  if (academicYearId && academicYearId !== 'all') {
    Object.assign(where, await buildAcademicYearFilter(academicYearId));
  }

  if (statusIds && Array.isArray(statusIds) && statusIds.length > 0) {
    where.thesisStatus = { name: { in: statusIds } };
  }

  if (ratings && Array.isArray(ratings) && ratings.length > 0) {
    where.rating = { in: ratings };
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
        orderBy: { completedAt: "desc" },
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

/**
 * Get topic distribution - count of theses per topic
 */
export async function getTopicDistribution(academicYear) {
  const where = { isProposal: false };
  if (academicYear) {
    Object.assign(where, await buildAcademicYearFilter(academicYear));
  }

  const topics = await prisma.thesisTopic.findMany({
    include: {
      _count: {
        select: {
          thesis: { where },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return topics
    .map((t) => ({
      id: t.id,
      name: t.name,
      count: t._count.thesis,
    }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);
}

/**
 * Get batch/angkatan distribution - count of theses grouped by student enrollment year
 */
export async function getBatchDistribution(academicYear) {
  const where = {
    isProposal: false,
    thesisStatus: { name: { notIn: ["Gagal", "Dibatalkan"] } },
  };
  if (academicYear) {
    Object.assign(where, await buildAcademicYearFilter(academicYear));
  }

  const theses = await prisma.thesis.findMany({
    where,
    select: {
      student: {
        select: { enrollmentYear: true },
      },
    },
  });

  const yearMap = new Map();
  theses.forEach((t) => {
    const year = t.student?.enrollmentYear;
    if (year) {
      yearMap.set(year, (yearMap.get(year) || 0) + 1);
    }
  });

  return Array.from(yearMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, count]) => ({
      id: String(year),
      name: `Angkatan ${year}`,
      count,
    }));
}

/**
 * Get progress distribution - count of theses per progress bucket
 */
export async function getProgressDistribution(academicYear) {
  const where = {
    isProposal: false,
    rating: { in: ["ONGOING", "SLOW", "AT_RISK"] },
    thesisStatus: {
      name: { notIn: ["Selesai", "Gagal", "Dibatalkan"] },
    },
  };
  if (academicYear) {
    Object.assign(where, await buildAcademicYearFilter(academicYear));
  }

  const theses = await prisma.thesis.findMany({
    where,
    select: {
      thesisMilestones: {
        select: { status: true },
      },
    },
  });

  // Categorize into progress buckets
  const buckets = [
    { label: "0%", min: 0, max: 0, count: 0 },
    { label: "1-25%", min: 1, max: 25, count: 0 },
    { label: "26-50%", min: 26, max: 50, count: 0 },
    { label: "51-75%", min: 51, max: 75, count: 0 },
    { label: "76-99%", min: 76, max: 99, count: 0 },
    { label: "100%", min: 100, max: 100, count: 0 },
  ];

  theses.forEach((t) => {
    const total = t.thesisMilestones.length;
    const completed = t.thesisMilestones.filter((m) => m.status === "completed").length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    const bucket = buckets.find((b) => percent >= b.min && percent <= b.max);
    if (bucket) bucket.count++;
  });

  return buckets.map((b) => ({
    label: b.label,
    count: b.count,
  }));
}

/**
 * Get monthly guidance session trend - count of completed/accepted guidances per month
 */
export async function getGuidanceTrend(academicYear) {
  const thesisWhere = {
    isProposal: false,
    thesisStatus: {
      name: { notIn: ["Gagal", "Dibatalkan"] },
    },
  };
  if (academicYear) {
    Object.assign(thesisWhere, await buildAcademicYearFilter(academicYear));
  }

  const guidances = await prisma.thesisGuidance.findMany({
    where: {
      status: { in: ["completed", "accepted", "summary_pending"] },
      thesis: thesisWhere,
    },
    select: { requestedDate: true },
    orderBy: { requestedDate: "asc" },
  });

  const monthMap = new Map();
  guidances.forEach((g) => {
    const d = new Date(g.requestedDate);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(key, (monthMap.get(key) || 0) + 1);
  });

  return Array.from(monthMap.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
}
