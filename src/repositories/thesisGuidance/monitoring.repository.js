import prisma from "../../config/prisma.js";
import {
  THESIS_STATUS,
  POST_PROPOSAL_THESIS_STATUSES,
  TA_PHASE,
} from "../../constants/thesisStatus.js";
import { THESIS_ACTIVITY_LABELS } from "../../constants/thesisLabels.js";
import {
  ACTIVITY_LEVEL,
  THESIS_CLOCK_COLUMNS,
  THESIS_PROGRESS_SELECT,
  summarizeThesisProgress,
} from "../../helpers/thesis-progress.helper.js";
import { findLatestThesisReport as findLatestReport } from "../../helpers/guidanceFile.helper.js";
import { SCHEDULED_GUIDANCE_STATUSES, getScheduledAt } from "../../constants/guidanceStatus.js";

/** Monitoring aggregates cover running TA-phase theses only (K15). */
const RUNNING_TA = THESIS_STATUS.RESEARCH;
/** TA that has not failed (running, suspended, or finished). */
const NOT_FAILED_TA_STATUSES = [THESIS_STATUS.RESEARCH, THESIS_STATUS.ON_LEAVE, THESIS_STATUS.COMPLETED];

/** Status filter from the client: only valid post-proposal values match; anything else matches nothing. */
function statusFilter(values) {
  const list = (Array.isArray(values) ? values : [values]).filter((v) => POST_PROPOSAL_THESIS_STATUSES.includes(v));
  return { in: list };
}

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
 * @param {string} filters.topicId - Filter by thesis topic
 * @param {string} filters.academicYear - Filter by academic year
 * @param {string} filters.search - Search by student name, NIM, or title
 * @param {number} filters.page - Page number
 * @param {number} filters.pageSize - Page size
 */
export async function getThesesOverview(filters = {}) {
  const { status, lecturerId, topicId, academicYear, search, page = 1, pageSize = 20 } = filters;

  const where = { status: { in: POST_PROPOSAL_THESIS_STATUSES } };

  // Filter by thesis status
  if (status) {
    where.status = statusFilter(status);
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

  // Filter by thesis topic
  if (topicId) {
    where.thesisTopicId = topicId;
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
        ...THESIS_CLOCK_COLUMNS,
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
        status: true,
        thesisTopic: {
          select: {
            id: true,
            name: true,
          },
        },
        academicYear: true,
        thesisSupervisors: {
          where: { status: "active" },
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
          where: TA_PHASE,
          select: {
            id: true,
            status: true,
            progressPercentage: true,
            updatedAt: true,
          },
        },
        thesisGuidances: {
          where: { status: "completed", ...TA_PHASE },
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
        // Read by the supervision clock: which evaluation stages are already recorded.
        thesisGuidanceEvaluations: THESIS_PROGRESS_SELECT.thesisGuidanceEvaluations,
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
  where.status = { in: POST_PROPOSAL_THESIS_STATUSES };

  const grouped = await prisma.thesis.groupBy({
    by: ["status"],
    where,
    _count: { status: true },
  });

  return POST_PROPOSAL_THESIS_STATUSES.map((status) => ({
    id: status,
    name: status,
    count: grouped.find((g) => g.status === status)?._count?.status || 0,
  }));
}

/**
 * Running (research) theses with everything the activity helpers read, plus the student
 * and the active supervisors. The activity level is derived, so filters by level run on
 * this result (the number of running theses is small).
 */
async function findRunningThesesWithActivity(academicYear) {
  const where = { status: RUNNING_TA };
  if (academicYear) {
    Object.assign(where, await buildAcademicYearFilter(academicYear));
  }
  const theses = await prisma.thesis.findMany({
    where,
    select: {
      id: true,
      title: true,
      ...THESIS_PROGRESS_SELECT,
      student: {
        select: {
          user: { select: { fullName: true, identityNumber: true, email: true } },
        },
      },
      thesisSupervisors: {
        where: {
          status: "active",
          role: { name: { in: ["Pembimbing 1", "Pembimbing 2"] } },
        },
        select: {
          lecturer: { select: { user: { select: { fullName: true } } } },
          role: { select: { name: true } },
        },
      },
    },
  });
  const now = new Date();
  return theses.map((thesis) => ({ thesis, progress: summarizeThesisProgress(thesis, now) }));
}

/**
 * Activity level distribution of running theses (Lancar / Lambat / Berisiko)
 */
export async function getActivityDistribution(academicYear) {
  const rows = await findRunningThesesWithActivity(academicYear);
  return Object.values(ACTIVITY_LEVEL).map((level) => ({
    id: level,
    name: THESIS_ACTIVITY_LABELS[level],
    value: level,
    count: rows.filter((row) => row.progress.activityLevel === level).length,
  }));
}

/**
 * Get overall progress statistics
 */
export async function getProgressStatistics(academicYear) {
  // Running theses only (status `research`).
  const where = { status: RUNNING_TA };

  if (academicYear) {
    Object.assign(where, await buildAcademicYearFilter(academicYear));
  }

  // Get all theses with milestones
  const theses = await prisma.thesis.findMany({
    where,
    select: {
      thesisMilestones: {
        where: TA_PHASE,
        select: {
          status: true,
        },
      },
      thesisSupervisors: {
        where: { status: "active" },
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
 * Running theses at one activity level, longest without activity first.
 */
export async function getStudentsByActivityLevel(level, limit = 10, academicYear) {
  const rows = await findRunningThesesWithActivity(academicYear);
  return rows
    .filter((row) => row.progress.activityLevel === level)
    .map(({ thesis: t, progress }) => ({
      thesisId: t.id,
      title: t.title,
      student: {
        name: t.student?.user?.fullName,
        nim: t.student?.user?.identityNumber,
        email: t.student?.user?.email,
      },
      status: t.status,
      activityLevel: progress.activityLevel,
      lastActivity: progress.lastActivityAt ? progress.lastActivityAt.toISOString() : null,
      daysSinceActivity: progress.daysSinceActivity ?? 0,
      supervisionClock: progress.supervisionClock,
      supervisors: t.thesisSupervisors.map((p) => ({
        name: p.lecturer?.user?.fullName,
        role: p.role?.name,
      })),
    }))
    .sort((a, b) => b.daysSinceActivity - a.daysSinceActivity)
    .slice(0, limit);
}

/**
 * Running theses whose guidance evaluation is due (six months, extension follow-up, or one
 * year), longest supervision first: the "Perlu Evaluasi" list of the monitoring dashboard.
 */
export async function getEvaluationDueStudents(limit = 50, academicYear) {
  const rows = await findRunningThesesWithActivity(academicYear);
  return rows
    .filter((row) => row.progress.supervisionClock.evaluationDue)
    .map(({ thesis: t, progress }) => ({
      thesisId: t.id,
      title: t.title,
      student: {
        name: t.student?.user?.fullName,
        nim: t.student?.user?.identityNumber,
        email: t.student?.user?.email,
      },
      activityLevel: progress.activityLevel,
      evaluationDue: progress.supervisionClock.evaluationDue,
      supervisionClock: progress.supervisionClock,
      supervisors: t.thesisSupervisors.map((p) => ({
        name: p.lecturer?.user?.fullName,
        role: p.role?.name,
      })),
    }))
    .sort((a, b) => (b.supervisionClock.elapsedDays ?? 0) - (a.supervisionClock.elapsedDays ?? 0))
    .slice(0, limit);
}

/** Students without activity for more than 120 days. */
export const getAtRiskStudents = (limit = 10, academicYear) =>
  getStudentsByActivityLevel(ACTIVITY_LEVEL.AT_RISK, limit, academicYear);

/** Students without activity for 60 to 120 days. */
export const getSlowStudents = (limit = 10, academicYear) =>
  getStudentsByActivityLevel(ACTIVITY_LEVEL.SLOW, limit, academicYear);

/**
 * Get students ready for seminar
 */
export async function getStudentsReadyForSeminar(academicYear) {
  // "Acc Seminar" is no longer a thesis status (K15): ready = running TA whose active
  // supervisors (at least one) all gave seminarReady.
  const where = {
    status: RUNNING_TA,
    AND: [
      { thesisSupervisors: { every: { OR: [{ status: { not: "active" } }, { seminarReady: true }] } } },
      { thesisSupervisors: { some: { status: "active", seminarReady: true } } },
    ],
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
          status: "active",
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
    status: { in: [THESIS_STATUS.RESEARCH, THESIS_STATUS.ON_LEAVE] },
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
  const participants = await prisma.thesisSupervisors.findMany({
    where: {
      status: "active",
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
      thesisTopic: true,
      academicYear: true,
      thesisSupervisors: {
        where: { status: "active" },
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
        where: TA_PHASE,
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
        where: TA_PHASE,
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
      // Read by the supervision clock: which evaluation stages are already recorded.
      thesisGuidanceEvaluations: THESIS_PROGRESS_SELECT.thesisGuidanceEvaluations,
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
 * Latest report of a thesis = attachment of the latest TA-phase session with a file (K17).
 */
export function findLatestThesisReport(thesisId) {
  return findLatestReport(prisma, thesisId);
}

/**
 * Get comprehensive thesis data for semester progress report
 * @param {Object} options - Filter options
 * @param {string} options.academicYearId - Academic year ID
 * @param {string[]} options.statusIds - Array of status IDs
 * @param {string[]} options.activityLevels - Activity levels to keep (filtered after reading,
 *   because the level is derived)
 */
export async function getThesesForReport(options = {}) {
  const { academicYearId, statusIds, activityLevels } = options;
  const where = { status: { in: POST_PROPOSAL_THESIS_STATUSES } };

  if (academicYearId && academicYearId !== 'all') {
    Object.assign(where, await buildAcademicYearFilter(academicYearId));
  }

  if (statusIds && Array.isArray(statusIds) && statusIds.length > 0) {
    where.status = statusFilter(statusIds);
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
      thesisTopic: true,
      academicYear: true,
      thesisSupervisors: {
        where: {
          status: "active",
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
        where: TA_PHASE,
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
        where: TA_PHASE,
        select: {
          id: true,
          status: true,
          approvedDate: true,
          completedAt: true,
          createdAt: true,
        },
        orderBy: { completedAt: "desc" },
      },
      thesisSeminars: THESIS_PROGRESS_SELECT.thesisSeminars,
      thesisGuidanceEvaluations: THESIS_PROGRESS_SELECT.thesisGuidanceEvaluations,
    },
    orderBy: [
      { student: { user: { fullName: "asc" } } },
    ],
  });

  const now = new Date();
  const withProgress = theses.map((thesis) => ({ ...thesis, progress: summarizeThesisProgress(thesis, now) }));
  if (Array.isArray(activityLevels) && activityLevels.length > 0) {
    return withProgress.filter((thesis) => activityLevels.includes(thesis.progress.activityLevel));
  }
  return withProgress;
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
  const where = { status: { in: POST_PROPOSAL_THESIS_STATUSES } };
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
    status: { in: NOT_FAILED_TA_STATUSES },
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
  const where = { status: RUNNING_TA };
  if (academicYear) {
    Object.assign(where, await buildAcademicYearFilter(academicYear));
  }

  const theses = await prisma.thesis.findMany({
    where,
    select: {
      thesisMilestones: {
        where: TA_PHASE,
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
    status: { in: NOT_FAILED_TA_STATUSES },
  };
  if (academicYear) {
    Object.assign(thesisWhere, await buildAcademicYearFilter(academicYear));
  }

  const guidances = await prisma.thesisGuidance.findMany({
    where: {
      ...TA_PHASE,
      status: { in: ["completed", ...SCHEDULED_GUIDANCE_STATUSES, "summary_pending"] },
      thesis: thesisWhere,
    },
    select: { requestedDate: true, approvedDate: true },
    orderBy: { requestedDate: "asc" },
  });

  // C6: a session counts in the month of its effective schedule (approvedDate ?? requestedDate)
  const monthMap = new Map();
  guidances.forEach((g) => {
    const d = new Date(getScheduledAt(g));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(key, (monthMap.get(key) || 0) + 1);
  });

  return Array.from(monthMap.entries())
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));
}
