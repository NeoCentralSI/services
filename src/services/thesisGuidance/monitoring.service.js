import * as monitoringRepository from "../../repositories/thesisGuidance/monitoring.repository.js";
import { sendFcmToUsers } from "../push.service.js";
import { DEPARTMENT_ROLES, ROLES } from "../../constants/roles.js";
import { createNotificationsForUsers } from "../notification.service.js";
import prisma from "../../config/prisma.js";
import { THESIS_STATUS, isThesisOnLeave } from "../../constants/thesisStatus.js";
import { getActiveAcademicYearId } from "../../helpers/academicYear.helper.js";
import { getSemesterRange, getThesisStartedAt, isDateInSemester } from "../../helpers/semester-scope.helper.js";
import { getThesisStatusLabel, getThesisActivityLabel, getEvaluationDueLabel, THESIS_ON_LEAVE_LABEL } from "../../constants/thesisLabels.js";
import {
  ACTIVITY_LEVEL,
  THESIS_PROGRESS_SELECT,
  WARNING_SKIP_LABELS,
  resolveProgressWarning,
  summarizeThesisProgress,
} from "../../helpers/thesis-progress.helper.js";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import axios from "axios";
import PizZip from "pizzip";
import { ENV } from "../../config/env.js";
import { convertDocxToPdf } from "../../utils/pdf.util.js";

const readFile = promisify(fs.readFile);

function toTitleCaseName(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** A lecturer's name: title-cased, with the degrees after the first comma kept as written ("M.Sc"). */
function formatLecturerName(name) {
  if (!name) return "";
  const text = String(name).trim();
  const comma = text.indexOf(",");
  if (comma === -1) return toTitleCaseName(text);
  const person = toTitleCaseName(text.slice(0, comma).trim());
  const degrees = text.slice(comma + 1).trim();
  return degrees ? `${person}, ${degrees}` : person;
}

/** Derived progress fields of a thesis, shaped for API responses. */
function progressFields(thesis, now = new Date()) {
  const progress = summarizeThesisProgress(thesis, now);
  return {
    activityLevel: progress.activityLevel,
    lastActivity: progress.lastActivityAt ? progress.lastActivityAt.toISOString() : null,
    daysSinceActivity: progress.daysSinceActivity,
    supervisionClock: progress.supervisionClock,
  };
}

/**
 * Get thesis monitoring dashboard data for management
 */
export async function getMonitoringDashboard(academicYear) {
  const [statusDistribution, activityDistribution, progressStats, atRiskStudents, readyForSeminar, slowStudents, supervisorLoads, topicDistribution, batchDistribution, progressDistribution, guidanceTrend, evaluationDueStudents] = await Promise.all([
    monitoringRepository.getStatusDistribution(academicYear),
    monitoringRepository.getActivityDistribution(academicYear),
    monitoringRepository.getProgressStatistics(academicYear),
    monitoringRepository.getAtRiskStudents(5, academicYear),
    monitoringRepository.getStudentsReadyForSeminar(academicYear),
    monitoringRepository.getSlowStudents(5, academicYear),
    getSupervisorWorkloads(academicYear),
    monitoringRepository.getTopicDistribution(academicYear),
    monitoringRepository.getBatchDistribution(academicYear),
    monitoringRepository.getProgressDistribution(academicYear),
    monitoringRepository.getGuidanceTrend(academicYear),
    monitoringRepository.getEvaluationDueStudents(50, academicYear),
  ]);

  return {
    summary: {
      ...progressStats,
      totalEvaluationDue: evaluationDueStudents.length,
      totalReadyForSeminar: readyForSeminar.length,
      totalAtRisk: activityDistribution.find((r) => r.id === ACTIVITY_LEVEL.AT_RISK)?.count || 0,
      totalSlow: activityDistribution.find((r) => r.id === ACTIVITY_LEVEL.SLOW)?.count || 0,
    },
    statusDistribution,
    activityDistribution,
    topicDistribution,
    batchDistribution,
    progressDistribution,
    guidanceTrend,
    atRiskStudents,
    slowStudents,
    // "Perlu Evaluasi": theses whose guidance evaluation is due.
    evaluationDueStudents,
    supervisorLoads,
    readyForSeminar: readyForSeminar.slice(0, 5).map((t) => ({
      thesisId: t.id,
      title: t.title,
      student: {
        name: t.student?.user?.fullName,
        nim: t.student?.user?.identityNumber,
        email: t.student?.user?.email,
      },
      supervisors: t.thesisSupervisors.map((p) => ({
        name: p.lecturer?.user?.fullName,
        role: p.role?.name,
      })),
    })),
  };
}

/**
 * Get lecturer supervision workload, grouped by lecturer.
 */
export async function getSupervisorWorkloads(academicYear) {
  const rows = await monitoringRepository.getSupervisorWorkloadRows(academicYear);
  const lecturerMap = new Map();

  rows.forEach((row) => {
    const lecturerId = row.lecturerId;
    if (!lecturerId || !row.lecturer?.user) return;

    if (!lecturerMap.has(lecturerId)) {
      lecturerMap.set(lecturerId, {
        lecturerId,
        lecturerName: row.lecturer.user.fullName,
        lecturerNip: row.lecturer.user.identityNumber,
        lecturerEmail: row.lecturer.user.email,
        studentsByThesis: new Map(),
      });
    }

    const lecturer = lecturerMap.get(lecturerId);
    const thesisId = row.thesis?.id;
    if (!thesisId || lecturer.studentsByThesis.has(thesisId)) return;

    lecturer.studentsByThesis.set(thesisId, {
      thesisId,
      thesisTitle: row.thesis?.title,
      role: row.role?.name,
      name: row.thesis?.student?.user?.fullName,
      nim: row.thesis?.student?.user?.identityNumber,
      email: row.thesis?.student?.user?.email,
    });
  });

  return Array.from(lecturerMap.values())
    .map((lecturer) => {
      const students = Array.from(lecturer.studentsByThesis.values())
        .filter((student) => student.name || student.nim)
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

      return {
        lecturerId: lecturer.lecturerId,
        lecturerName: lecturer.lecturerName,
        lecturerNip: lecturer.lecturerNip,
        lecturerEmail: lecturer.lecturerEmail,
        studentCount: students.length,
        students,
      };
    })
    .sort((a, b) => {
      if (b.studentCount !== a.studentCount) return b.studentCount - a.studentCount;
      return (a.lecturerName || "").localeCompare(b.lecturerName || "");
    });
}

/**
 * Get thesis list with filters for management
 */
export async function getThesesList(filters) {
  const { theses, total, page, pageSize } = await monitoringRepository.getThesesOverview(filters);

  const allAcademicYears = await monitoringRepository.getAllAcademicYears();
  const now = new Date();

  const formattedTheses = theses.map((t) => {
    const milestones = t.thesisMilestones || [];
    const completedMilestones = milestones.filter((m) => m.status === "completed").length;
    const totalMilestones = milestones.length;
    const progressPercent = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

    // Activity level and supervision clock are derived when read.
    const progress = progressFields(t, now);

    // Get supervisors
    const pembimbing1 = t.thesisSupervisors?.find((p) => p.role?.name === "Pembimbing 1");
    const pembimbing2 = t.thesisSupervisors?.find((p) => p.role?.name === "Pembimbing 2");

    // Column "Mulai": the semester whose dates hold the start of the thesis (no margin,
    // like the semester filter); null when it started outside every listed semester.
    const startedAt = getThesisStartedAt(t);
    const startSemester = allAcademicYears.find((ay) => {
      const range = getSemesterRange(ay);
      return range && isDateInSemester(startedAt, range);
    })?.name?.trim() ?? null;

    return {
      id: t.id,
      title: t.title,
      ...progress,
      startDate: t.startDate,
      student: {
        id: t.student?.id,
        userId: t.student?.user?.id,
        name: t.student?.user?.fullName,
        nim: t.student?.user?.identityNumber,
        email: t.student?.user?.email,
      },
      status: t.status,
      // The student is on leave: the thesis is paused ("Cuti" badge).
      isOnLeave: isThesisOnLeave(t),
      topic: t.thesisTopic
        ? {
            id: t.thesisTopic.id,
            name: t.thesisTopic.name,
          }
        : null,
      academicYear: t.academicYear?.name,
      startSemester: startSemester,
      progress: {
        completed: completedMilestones,
        total: totalMilestones,
        percent: progressPercent,
      },
      supervisors: {
        pembimbing1: pembimbing1?.lecturer?.user?.fullName || null,
        pembimbing1Id: pembimbing1?.lecturerId || null,
        pembimbing2: pembimbing2?.lecturer?.user?.fullName || null,
        pembimbing2Id: pembimbing2?.lecturerId || null,
      },
      seminarApproval: (() => {
        const sup1 = t.thesisSupervisors?.find((p) => p.role?.name === "Pembimbing 1");
        const sup2 = t.thesisSupervisors?.find((p) => p.role?.name === "Pembimbing 2");
        const s1 = sup1?.seminarReady || false;
        const s2 = sup2?.seminarReady || false;
        return {
          supervisor1: s1,
          supervisor2: s2,
          hasPembimbing2: !!sup2,
          isFullyApproved: (sup1 ? s1 : true) && (sup2 ? s2 : true),
        };
      })(),
      createdAt: t.createdAt,
    };
  });

  // Filter: per student, show only the active thesis.
  // If a student has both a cancelled/failed thesis AND a newer active one,
  // hide the cancelled/failed one. Only show cancelled/failed if
  // the student has no other (active) thesis.
  const inactiveStatuses = new Set([THESIS_STATUS.FAILED]);
  const byStudent = new Map();
  for (const t of formattedTheses) {
    const studentId = t.student?.id;
    if (!studentId) continue;
    if (!byStudent.has(studentId)) byStudent.set(studentId, []);
    byStudent.get(studentId).push(t);
  }

  const filteredTheses = [];
  for (const [, studentTheses] of byStudent) {
    const activeTheses = studentTheses.filter((t) => !inactiveStatuses.has(t.status));
    if (activeTheses.length > 0) {
      // Student has active thesis(es), only show those
      filteredTheses.push(...activeTheses);
    } else {
      // Student has no active thesis, show the most recent cancelled/failed one
      studentTheses.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      filteredTheses.push(studentTheses[0]);
    }
  }

  return {
    data: filteredTheses,
    pagination: {
      page,
      pageSize,
      total: filteredTheses.length,
      totalPages: Math.ceil(filteredTheses.length / pageSize),
    },
  };
}

/**
 * Get filter options for monitoring page
 */
export async function getFilterOptions() {
  const [statusDistribution, supervisors, academicYears, topicDistribution, currentSemesterId] = await Promise.all([
    monitoringRepository.getStatusDistribution(),
    monitoringRepository.getAllSupervisors(),
    monitoringRepository.getAllAcademicYears(),
    monitoringRepository.getTopicDistribution(),
    // The semester that is running now, decided the way the rest of the app decides it. An
    // ambiguous calendar (overlapping semesters) leaves the stored flag in charge.
    getActiveAcademicYearId().catch(() => undefined),
  ]);

  return {
    statuses: statusDistribution
      .filter((s) => s.count > 0)
      .map((s) => ({
        value: s.name,
        label: s.name,
        count: s.count,
      })),
    supervisors: supervisors.map((s) => ({
      value: s.id,
      label: s.name,
    })),
    topics: topicDistribution.map((t) => ({
      value: t.id,
      label: t.name,
      count: t.count,
    })),
    academicYears: academicYears.map((ay) => ({
      value: ay.id,
      label: ay.name,
      isActive: currentSemesterId === undefined ? ay.isActive : ay.id === currentSemesterId,
    })),
  };
}

/**
 * Get full list of at-risk students
 */
export async function getAtRiskStudentsFull(academicYear) {
  return monitoringRepository.getAtRiskStudents(50, academicYear);
}

/**
 * Get full list of slow students
 */
export async function getSlowStudentsFull(academicYear) {
  return monitoringRepository.getSlowStudents(50, academicYear);
}

/**
 * Get full list of students ready for seminar
 */
export async function getStudentsReadyForSeminarFull(academicYear) {
  const theses = await monitoringRepository.getStudentsReadyForSeminar(academicYear);

  return theses.map((t) => ({
    thesisId: t.id,
    title: t.title,
    student: {
      name: t.student?.user?.fullName,
      nim: t.student?.user?.identityNumber,
      email: t.student?.user?.email,
    },
    supervisors: t.thesisSupervisors.map((p) => ({
      name: p.lecturer?.user?.fullName,
      role: p.role?.name,
    })),
  }));
}

/**
 * What the Seminar and Sidang cards of the monitoring detail show besides status, schedule
 * and score: room, the examiners that are still assigned, and revision progress (a revision
 * is done once a supervisor has approved it, as in the seminar and defence modules).
 */
function eventCardFields(event, revisionsKey) {
  const assigned = (event.examiners || []).filter((e) => e.availabilityStatus !== "unavailable");
  const revisions = assigned.flatMap((e) => e[revisionsKey] || []);
  return {
    room: event.room?.name ?? null,
    examiners: assigned.map((e) => ({ order: e.order ?? null, name: e.lecturer?.user?.fullName ?? null })),
    resultFinalizedAt: event.resultFinalizedAt ?? null,
    revisionFinalizedAt: event.revisionFinalizedAt ?? null,
    revisions: {
      total: revisions.length,
      completed: revisions.filter((r) => r.supervisorApprovedAt).length,
    },
  };
}

/**
 * Get detailed thesis information by thesis ID for monitoring
 */
export async function getThesisDetail(thesisId) {
  const thesis = await monitoringRepository.getThesisDetailById(thesisId);

  if (!thesis) {
    const err = new Error("Tugas akhir tidak ditemukan");
    err.statusCode = 404;
    throw err;
  }
  // Latest report = attachment of the latest TA-phase session with a file.
  const latestReport = await monitoringRepository.findLatestThesisReport(thesis.id);

  // Calculate milestone progress
  const milestones = thesis.thesisMilestones || [];
  const completedMilestones = milestones.filter((m) => m.status === "completed").length;
  const totalMilestones = milestones.length;
  const progressPercent = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

  // Activity level and supervision clock are derived when read.
  const progress = progressFields(thesis);

  // Separate supervisors and examiners
  const supervisors = thesis.thesisSupervisors
    .filter((p) => p.role?.name?.includes("Pembimbing"))
    .map((p) => ({
      id: p.lecturer?.user?.id,
      name: p.lecturer?.user?.fullName,
      email: p.lecturer?.user?.email,
      role: p.role?.name,
    }));

  const examiners = thesis.thesisSupervisors
    .filter((p) => p.role?.name?.toLowerCase().includes("penguji"))
    .map((p) => ({
      id: p.lecturer?.user?.id,
      name: p.lecturer?.user?.fullName,
      email: p.lecturer?.user?.email,
      role: p.role?.name,
    }));

  // Format seminars
  const seminars = thesis.thesisSeminars.map((s) => {
    const examiners = s.examiners || [];
    const scoredExaminers = examiners.filter((e) => e.assessmentScore != null);
    return {
      id: s.id,
      status: s.status,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      finalScore: s.finalScore,
      ...eventCardFields(s, "thesisSeminarRevisions"),
      examinerCount: examiners.length,
      scoredCount: scoredExaminers.length,
      averageScore: scoredExaminers.length > 0
        ? Math.round(scoredExaminers.reduce((sum, e) => sum + e.assessmentScore, 0) / scoredExaminers.length)
        : null,
    };
  });

  // Format defences
  const defences = thesis.thesisDefences.map((d) => {
    const examiners = d.examiners || [];
    const scoredExaminers = examiners.filter((e) => e.assessmentScore != null);
    return {
      id: d.id,
      status: d.status,
      date: d.date,
      startTime: d.startTime,
      endTime: d.endTime,
      finalScore: d.finalScore,
      grade: d.grade,
      examinerAverageScore: d.examinerAverageScore,
      supervisorScore: d.supervisorScore,
      ...eventCardFields(d, "thesisDefenceRevisions"),
      examinerCount: examiners.length,
      scoredCount: scoredExaminers.length,
      averageScore: scoredExaminers.length > 0
        ? Math.round(scoredExaminers.reduce((sum, e) => sum + e.assessmentScore, 0) / scoredExaminers.length)
        : null,
    };
  });

  // Format guidances
  const guidances = thesis.thesisGuidances.map((g) => ({
    id: g.id,
    status: g.status,
    topic: g.studentNotes,
    approvedDate: g.approvedDate,
    completedAt: g.completedAt,
    createdAt: g.createdAt,
  }));

  // Calculate guidance stats
  const completedGuidances = guidances.filter((g) => g.status === "completed").length;
  const pendingGuidances = guidances.filter((g) => g.status === "approved" || g.status === "pending").length;

  return {
    id: thesis.id,
    title: thesis.title,
    status: thesis.status,
    isOnLeave: isThesisOnLeave(thesis),
    ...progress,
    topic: thesis.thesisTopic?.name || null,
    academicYear: thesis.academicYear
      ? `${thesis.academicYear.semester === "ganjil" ? "Ganjil" : "Genap"} ${thesis.academicYear.year}`
      : null,
    startDate: thesis.startDate,
    createdAt: thesis.createdAt,
    seminarApproval: (() => {
      const sup1 = thesis.thesisSupervisors?.find((p) => p.role?.name === "Pembimbing 1");
      const sup2 = thesis.thesisSupervisors?.find((p) => p.role?.name === "Pembimbing 2");
      const s1 = sup1?.seminarReady || false;
      const s2 = sup2?.seminarReady || false;
      return {
        supervisor1: s1,
        supervisor2: s2,
        hasPembimbing2: !!sup2,
        isFullyApproved: (sup1 ? s1 : true) && (sup2 ? s2 : true),
      };
    })(),
    student: {
      id: thesis.student?.id,
      userId: thesis.student?.user?.id,
      name: thesis.student?.user?.fullName,
      nim: thesis.student?.user?.identityNumber,
      email: thesis.student?.user?.email,
      phone: thesis.student?.user?.phoneNumber,
    },
    supervisors,
    examiners,
    latestDocument: latestReport ? {
      id: latestReport.id,
      fileName: latestReport.fileName || path.basename(latestReport.filePath || ""),
      filePath: latestReport.filePath,
    } : null,
    progress: {
      completed: completedMilestones,
      total: totalMilestones,
      percent: progressPercent,
    },
    milestones: milestones.map((m) => ({
      id: m.id,
      title: m.title,
      status: m.status,
      progressPercentage: m.progressPercentage,
      targetDate: m.targetDate,
      completedAt: m.completedAt,
    })),
    guidances: {
      items: guidances,
      total: guidances.length,
      completed: completedGuidances,
      pending: pendingGuidances,
    },
    seminars,
    defences,
  };
}

/**
 * Send warning notification to student about thesis progress (for department roles: Kadep, Sekdep, GKM).
 * The wording follows the activity level of the thesis, derived here: the client does not
 * choose it. A thesis that is not `research`, or whose activity is Lancar, gets no warning (400).
 */
export async function sendWarningNotificationService(userId, thesisId) {
  // Get user info and roles for authorization
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { userHasRoles: { include: { role: true } } }
  });
  if (!user) {
    const err = new Error("Pengguna tidak ditemukan");
    err.statusCode = 404;
    throw err;
  }
  const senderName = toTitleCaseName(user?.fullName || "Manajemen Prodi");

  // Authorization: Ketua Departemen, Sekretaris Departemen, GKM, or an active
  // supervisor of the thesis may send warnings.
  const isKadep = (user.userHasRoles || []).some(
    (uhr) => DEPARTMENT_ROLES.includes(uhr.role?.name) && uhr.status === 'active'
  );

  // Check if user is an ACTIVE supervisor of this thesis (Lecturer.id is user id).
  // Released/terminated relations and global roles (e.g. GKM, Sekdep) are not enough.
  const supRecord = await prisma.thesisSupervisors.findFirst({
    where: { thesisId: thesisId, lecturerId: userId, status: "active" }
  });
  const isSupervisor = Boolean(supRecord);

  if (!isKadep && !isSupervisor) {
    const err = new Error("Hanya Ketua Departemen, Sekretaris Departemen, GKM, atau Dosen Pembimbing yang dapat mengirim peringatan tugas akhir");
    err.statusCode = 403;
    throw err;
  }

  // Get thesis with student info and what the activity helper reads
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      ...THESIS_PROGRESS_SELECT,
      student: {
        select: {
          user: { select: { id: true, fullName: true } }
        }
      }
    }
  });

  if (!thesis) {
    const err = new Error("Tugas akhir tidak ditemukan");
    err.statusCode = 404;
    throw err;
  }

  const studentUserId = thesis.student?.user?.id;
  const studentName = thesis.student?.user?.fullName || "Mahasiswa";

  if (!studentUserId) {
    const err = new Error("Mahasiswa pada tugas akhir ini tidak ditemukan");
    err.statusCode = 404;
    throw err;
  }

  const { level, skipReason } = resolveProgressWarning(thesis);
  if (!level) {
    const err = new Error(`Peringatan tidak dikirim: ${WARNING_SKIP_LABELS[skipReason]}.`);
    err.statusCode = 400;
    throw err;
  }

  // Warning text per activity level (`slow` | `at_risk`).
  const warningMessages = {
    slow: {
      title: "Peringatan Progress Tugas Akhir",
      body: `Halo ${studentName}, progress tugas akhir Anda terdeteksi lambat. Segera jadwalkan bimbingan dengan dosen pembimbing untuk mendiskusikan kendala yang dihadapi.`,
      notifBody: `Progress tugas akhir Anda terdeteksi lambat. Departemen mengingatkan Anda untuk segera menjadwalkan bimbingan.`
    },
    at_risk: {
      title: "Peringatan Serius: Progress Tugas Akhir",
      body: `Halo ${studentName}, aktivitas tugas akhir Anda berstatus Berisiko (tanpa aktivitas lebih dari 120 hari). Segera hubungi dosen pembimbing.`,
      notifBody: `Aktivitas tugas akhir Anda berstatus Berisiko. Departemen meminta Anda segera menghubungi dosen pembimbing.`
    },
  };

  const message = warningMessages[level];

  // Send FCM notification
  await sendFcmToUsers([studentUserId], {
    title: message.title,
    body: message.body,
    data: {
      type: "thesis_warning",
      thesisId: thesis.id,
      warningType: level
    }
  });

  // Create in-app notification
  await createNotificationsForUsers([studentUserId], {
    title: message.title,
    message: message.notifBody,
    type: "thesis_warning",
    referenceId: thesis.id
  });

  return {
    success: true,
    message: `Peringatan telah dikirim ke ${studentName}`,
    warningType: level
  };
}

/** Reasons a thesis of a batch gets no warning, besides those of `resolveProgressWarning`. */
const BATCH_NOT_SENT_LABELS = Object.freeze({
  ...WARNING_SKIP_LABELS,
  not_found: "Tugas akhir tidak ditemukan",
  no_student: "Akun mahasiswa tidak ditemukan",
  failed: "Notifikasi gagal dikirim",
});

/**
 * Send batch warning notifications to multiple students.
 *
 * Each thesis is warned with the wording of its own activity level (Lambat or Berisiko),
 * derived here: the client does not choose it. A thesis that is not `research`, or whose
 * activity is Lancar, is skipped and listed in `notSent` with the reason.
 */
export async function sendBatchWarningNotificationService(userId, thesisIds) {
  if (!Array.isArray(thesisIds) || thesisIds.length === 0) {
    throw new Error("Daftar mahasiswa (thesisId) tidak boleh kosong");
  }

  // Get user info and roles for authorization
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { userHasRoles: { include: { role: true } } }
  });
  if (!user) {
    const err = new Error("Pengguna tidak ditemukan");
    err.statusCode = 404;
    throw err;
  }
  const senderName = toTitleCaseName(user?.fullName || "Manajemen Prodi");

  // The department roles (Kadep, Sekdep, GKM) may warn any thesis.
  const isKadep = (user.userHasRoles || []).some(
    (uhr) => DEPARTMENT_ROLES.includes(uhr.role?.name) && uhr.status === 'active'
  );

  const uniqueThesisIds = [...new Set(thesisIds)];

  // If not kadep, ensure the user is an ACTIVE supervisor of ALL (distinct) theses.
  if (!isKadep) {
    const activeRelations = await prisma.thesisSupervisors.findMany({
      where: { thesisId: { in: uniqueThesisIds }, lecturerId: userId, status: "active" },
      select: { thesisId: true },
    });
    const supervisedCount = new Set(activeRelations.map((r) => r.thesisId)).size;
    if (supervisedCount !== uniqueThesisIds.length) {
      const err = new Error("Hanya Ketua Departemen, Sekretaris Departemen, GKM, atau Dosen Pembimbing yang mengawasi tugas akhir tersebut yang dapat mengirim peringatan massal");
      err.statusCode = 403;
      throw err;
    }
  }

  // Get all theses with student user info and what the activity helper reads
  const theses = await prisma.thesis.findMany({
    where: { id: { in: uniqueThesisIds } },
    select: {
      id: true,
      ...THESIS_PROGRESS_SELECT,
      student: {
        select: {
          user: { select: { id: true, fullName: true } }
        }
      }
    }
  });

  if (theses.length === 0) {
    throw new Error("Tidak ada data tugas akhir yang ditemukan");
  }

  // Warning text per activity level (`slow` | `at_risk`).
  const warningMessages = {
    slow: {
      title: "Peringatan: Progress Tugas Akhir",
      body: (name, days) => `Halo ${name}, Anda sudah tidak ada update progress tugas akhir selama ${days} hari. Segera lakukan bimbingan dengan dosen pembimbing Anda.`,
      notifBody: (days) => `Anda tidak ada update progress selama ${days} hari. Segera hubungi dosen pembimbing Anda.`
    },
    at_risk: {
      title: "Peringatan Serius: Progress Tugas Akhir",
      body: (name, days) => `Halo ${name}, Anda sudah tidak ada update progress tugas akhir selama ${days} hari (aktivitas: Berisiko). Segera lakukan bimbingan dengan dosen pembimbing Anda.`,
      notifBody: (days) => `Progress Anda terhenti selama ${days} hari (aktivitas: Berisiko). Segera hubungi dosen pembimbing Anda.`
    }
  };

  const now = new Date();

  // One notification per thesis, worded for the level of that thesis
  const outcomes = await Promise.all(theses.map(async (thesis) => {
    const studentUserId = thesis.student?.user?.id;
    // The student's name as stored (e.g. "Uji TA Lambat"), not re-cased.
    const studentName = thesis.student?.user?.fullName || "Mahasiswa";
    const outcome = { thesisId: thesis.id, studentName };
    if (!studentUserId) return { ...outcome, reason: "no_student" };

    const { level, skipReason, daysSinceActivity } = resolveProgressWarning(thesis, now);
    if (!level) return { ...outcome, reason: skipReason };

    const messageConfig = warningMessages[level];
    const days = daysSinceActivity ?? 0;
    try {
      // Send FCM notification
      await sendFcmToUsers([studentUserId], {
        title: messageConfig.title,
        body: messageConfig.body(studentName, days),
        data: {
          type: "thesis_warning",
          thesisId: thesis.id,
          warningType: level
        }
      });

      // Create in-app notification
      await createNotificationsForUsers([studentUserId], {
        title: messageConfig.title,
        message: messageConfig.notifBody(days),
        type: "thesis_warning",
        referenceId: thesis.id
      });
      return { ...outcome, warningType: level };
    } catch {
      return { ...outcome, reason: "failed" };
    }
  }));

  const foundIds = new Set(theses.map((thesis) => thesis.id));
  const missing = uniqueThesisIds
    .filter((thesisId) => !foundIds.has(thesisId))
    .map((thesisId) => ({ thesisId, studentName: null, reason: "not_found" }));

  const sent = outcomes.filter((outcome) => outcome.warningType);
  const notSent = [...outcomes.filter((outcome) => outcome.reason), ...missing]
    .map((outcome) => ({ ...outcome, reasonLabel: BATCH_NOT_SENT_LABELS[outcome.reason] }));

  const countOf = (level) => sent.filter((item) => item.warningType === level).length;
  const sentCounts = { [ACTIVITY_LEVEL.SLOW]: countOf(ACTIVITY_LEVEL.SLOW), [ACTIVITY_LEVEL.AT_RISK]: countOf(ACTIVITY_LEVEL.AT_RISK) };
  const sentText = sent.length > 0
    ? `Peringatan dikirim ke ${sent.length} mahasiswa (${sentCounts.at_risk} Berisiko, ${sentCounts.slow} Lambat).`
    : "Tidak ada peringatan yang dikirim.";

  return {
    success: true,
    message: notSent.length > 0 ? `${sentText} ${notSent.length} tidak dikirim.` : sentText,
    sentCount: sent.length,
    sentCounts,
    sent,
    notSent
  };
}

/**
 * Get comprehensive progress report data for PDF generation
 * @param {Object} options - Filter options (academicYearId, statusIds, activityLevels)
 */
export async function getProgressReportService(options = {}) {
  const { academicYearId } = options;
  // Get academic year info
  const forOneSemester = Boolean(academicYearId) && academicYearId !== 'all';
  const academicYear = forOneSemester
    ? await monitoringRepository.getAcademicYearById(academicYearId)
    : null;
  if (forOneSemester && !academicYear) {
    // The rows would be filtered by a semester the report cannot name.
    const err = new Error("Semester tidak ditemukan");
    err.statusCode = 404;
    throw err;
  }

  // Get all theses for the academic year with filters
  const theses = await monitoringRepository.getThesesForReport(options);

  // Get statistics
  const [statusDistribution, activityDistribution] = await Promise.all([
    monitoringRepository.getStatusDistribution(academicYearId),
    monitoringRepository.getActivityDistribution(academicYearId),
  ]);

  // Calculate summary statistics
  let totalGuidances = 0;
  let completedGuidances = 0;
  let totalMilestones = 0;
  let completedMilestones = 0;

  // Format thesis data for report
  const reportData = theses.map((t, index) => {
    const milestones = t.thesisMilestones || [];
    const guidances = t.thesisGuidances || [];

    const completedMilestoneCount = milestones.filter(m => m.status === "completed").length;
    const completedGuidanceCount = guidances.filter(g => g.status === "completed").length;
    const progressPercent = milestones.length > 0
      ? Math.round((completedMilestoneCount / milestones.length) * 100)
      : 0;

    // Add to totals
    totalGuidances += guidances.length;
    completedGuidances += completedGuidanceCount;
    totalMilestones += milestones.length;
    completedMilestones += completedMilestoneCount;

    // Get supervisors
    const pembimbing1 = t.thesisSupervisors?.find(p => p.role?.name === "Pembimbing 1");
    const pembimbing2 = t.thesisSupervisors?.find(p => p.role?.name === "Pembimbing 2");

    // Get last guidance
    const lastGuidance = guidances.find(g => g.status === "completed");
    const activityLevel = t.progress?.activityLevel ?? null;
    const evaluationDue = t.progress?.supervisionClock?.evaluationDue ?? null;

    return {
      no: index + 1,
      nim: t.student?.user?.identityNumber || "-",
      name: toTitleCaseName(t.student?.user?.fullName || "-"),
      title: t.title || "-",
      topic: t.thesisTopic?.name || "-",
      // The codes, and beside each the text the report prints (never the code itself).
      status: t.status || "-",
      statusLabel: isThesisOnLeave(t) ? `${getThesisStatusLabel(t.status)} (${THESIS_ON_LEAVE_LABEL})` : getThesisStatusLabel(t.status),
      activityLevel,
      activityLabel: getThesisActivityLabel(activityLevel),
      supervisionLabel: t.progress?.supervisionClock?.elapsedLabel ?? "-",
      evaluationDue,
      evaluationDueLabel: evaluationDue ? getEvaluationDueLabel(evaluationDue) : null,
      pembimbing1: formatLecturerName(pembimbing1?.lecturer?.user?.fullName) || "-",
      pembimbing2: formatLecturerName(pembimbing2?.lecturer?.user?.fullName) || "-",
      guidanceTotal: guidances.length,
      guidanceCompleted: completedGuidanceCount,
      lastGuidanceDate: lastGuidance?.completedAt || null,
      milestoneTotal: milestones.length,
      milestoneCompleted: completedMilestoneCount,
      progressPercent,
      startDate: t.startDate,
      createdAt: t.createdAt,
    };
  });

  // Calculate overall statistics
  const summary = {
    totalTheses: theses.length,
    totalGuidances,
    completedGuidances,
    totalMilestones,
    completedMilestones,
    averageMilestoneProgress: totalMilestones > 0
      ? Math.round((completedMilestones / totalMilestones) * 100)
      : 0,
    averageGuidanceCompletion: totalGuidances > 0
      ? Math.round((completedGuidances / totalGuidances) * 100)
      : 0,
  };

  const semesterLabel = academicYear
    ? `${academicYear.semester === "ganjil" ? "Ganjil" : "Genap"} ${academicYear.year}`
    : null;

  return {
    academicYear: semesterLabel ?? "Semua Semester",
    // Subtitle of the report. The semester filter keeps the theses that RUN in the semester,
    // not the ones that started in it.
    periodTitle: semesterLabel
      ? `Tugas Akhir yang Berjalan pada Semester ${semesterLabel}`
      : "Tugas Akhir dari Semua Semester",
    generatedAt: new Date().toISOString(),
    summary,
    // `name` is the label shown to people; `id` stays the status value.
    statusDistribution: statusDistribution.map((row) => ({ ...row, name: getThesisStatusLabel(row.id) })),
    activityDistribution,
    theses: reportData,
  };
}

// ========== DOCX XML Helpers ==========

function escapeXml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build a single OOXML table cell
 */
function makeCell(text, opts = {}) {
  const { bold = false, center = false, fontSize = 18, shading = "" } = opts;
  const jc = center ? '<w:jc w:val="center"/>' : "";
  const b = bold ? "<w:b/><w:bCs/>" : "";
  const shd = shading
    ? `<w:shd w:val="clear" w:color="auto" w:fill="${shading}"/>`
    : "";
  const rpr = `<w:rPr>${b}<w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/></w:rPr>`;
  const ppr = `<w:pPr>${jc}<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>${rpr}</w:pPr>`;

  const lines = (text || "").split("\n");
  const paragraphs = lines
    .map(
      (line) =>
        `<w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">${escapeXml(
          line
        )}</w:t></w:r></w:p>`
    )
    .join("");

  return `<w:tc><w:tcPr>${shd}<w:vAlign w:val="center"/></w:tcPr>${paragraphs}</w:tc>`;
}

/**
 * Build the monitoring report content as OOXML
 */
function buildMonitoringReportXml(reportData) {
  const { periodTitle, generatedAt, theses } = reportData;

  const formatDateLong = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  // Title
  const titleXml = `
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:before="240" w:after="60"/>
        <w:rPr><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
      </w:pPr>
      <w:r>
        <w:rPr><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
        <w:t>Laporan Progress Pengerjaan Tugas Akhir Mahasiswa</w:t>
      </w:r>
    </w:p>`;

  // Subtitle
  const subtitleXml = `
    <w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:after="240"/>
        <w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
      </w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
        <w:t>${escapeXml(periodTitle)}</w:t>
      </w:r>
    </w:p>`;

  // Table header
  const headerRow = `
    <w:tr>
      ${makeCell("No", { bold: true, center: true, fontSize: 20 })}
      ${makeCell("Nama / NIM", { bold: true, center: true, fontSize: 20 })}
      ${makeCell("Judul / Topik", { bold: true, center: true, fontSize: 20 })}
      ${makeCell("Pembimbing", { bold: true, center: true, fontSize: 20 })}
      ${makeCell("Mulai / Masa Bimbingan", { bold: true, center: true, fontSize: 20 })}
      ${makeCell("Aktivitas / Progress", { bold: true, center: true, fontSize: 20 })}
      ${makeCell("Status / Bimbingan Terakhir", { bold: true, center: true, fontSize: 20 })}
    </w:tr>`;

  // Table data rows
  const dataRows = theses
    .map((t) => {
      let pembimbingText = `${t.pembimbing1}`;
      if (t.pembimbing2 && t.pembimbing2 !== "-") {
        pembimbingText += `\n${t.pembimbing2}`;
      }
      // §2.2b: enum values are never printed raw in the report; the rows carry the labels.
      const identity = `${t.name}\n${t.nim}`;
      const info = `${t.title}\n(${t.topic})`;
      const dueLabel = t.evaluationDueLabel ? `\n${t.evaluationDueLabel}` : "";
      const dates = `${formatDateLong(t.startDate)}\n${t.supervisionLabel}${dueLabel}`;
      const statusInfo = `${t.statusLabel}\n${formatDateLong(t.lastGuidanceDate)}`;
      const progressInfo = `${t.activityLabel}\n${t.progressPercent}%`;

      return `
      <w:tr>
        ${makeCell(String(t.no), { center: true, fontSize: 20 })}
        ${makeCell(identity, { center: false, fontSize: 20 })}
        ${makeCell(info, { center: false, fontSize: 20 })}
        ${makeCell(pembimbingText, { center: false, fontSize: 20 })}
        ${makeCell(dates, { center: true, fontSize: 20 })}
        ${makeCell(progressInfo, { center: true, fontSize: 20 })}
        ${makeCell(statusInfo, { center: true, fontSize: 20 })}
      </w:tr>`;
    })
    .join("");

  // Full table
  const tableXml = `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="5000" w:type="pct"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        </w:tblBorders>
        <w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="650"/>
        <w:gridCol w:w="2500"/>
        <w:gridCol w:w="3350"/>
        <w:gridCol w:w="2500"/>
        <w:gridCol w:w="1800"/>
        <w:gridCol w:w="1500"/>
        <w:gridCol w:w="2200"/>
      </w:tblGrid>
      ${headerRow}
      ${dataRows}
    </w:tbl>`;

  // Signature section
  const signatureXml = `
    <w:p><w:pPr><w:spacing w:before="480"/></w:pPr></w:p>
    <w:p>
      <w:pPr>
        <w:jc w:val="right"/>
        <w:keepLines/>
        <w:spacing w:after="0"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
        <w:t>Padang, ${escapeXml(formatDateLong(generatedAt))}</w:t>
        <w:br/>
        <w:t>Mengetahui,</w:t>
        <w:br/>
        <w:t>Ketua Departemen,</w:t>
        <w:br/>
        <w:br/>
        <w:br/>
        <w:br/>
      </w:r>
      <w:r>
        <w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
        <w:t>Ricky Akbar M.Kom</w:t>
        <w:br/>
      </w:r>
      <w:r>
        <w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
        <w:t>NIP. 198410062012121001</w:t>
      </w:r>
    </w:p>`;

  return titleXml + subtitleXml + tableXml + signatureXml;
}

/**
 * Extract only the kop surat (letterhead) from the catatan template DOCX.
 * Stops before "TA" heading and "Identitas Mahasiswa" section.
 *
 * Uses element-boundary-safe extraction: tracks table nesting depth so
 * the cut always happens at a top-level element boundary (never inside
 * an open <w:tbl>), producing well-formed OOXML.
 */
function extractHeaderFromDocXml(body) {
  const stopPatterns = [/TA\s*[–\-]/, /Identitas/i, /\{[a-z#]/];

  // --- Find the earliest stop-text position ---
  let firstStopPos = body.length;
  for (const pattern of stopPatterns) {
    const m = body.match(pattern);
    if (m && m.index < firstStopPos) firstStopPos = m.index;
  }

  if (firstStopPos >= body.length || firstStopPos <= 0) {
    const firstTable = body.indexOf("<w:tbl");
    if (firstTable > 0) return body.substring(0, firstTable);
    return "";
  }

  // --- Build an ordered list of structural events ---
  const events = [];
  const scanRegex =
    /(<w:tbl[\s>])|(<\/w:tbl>)|(<\/w:p>)|(<\/w:sdt>)/g;
  let m;
  while ((m = scanRegex.exec(body)) !== null) {
    if (m[1]) events.push({ pos: m.index, end: m.index, type: "open-tbl" });
    else if (m[2])
      events.push({ pos: m.index, end: m.index + m[2].length, type: "close-tbl" });
    else if (m[3])
      events.push({ pos: m.index, end: m.index + m[3].length, type: "close-p" });
    else if (m[4])
      events.push({ pos: m.index, end: m.index + m[4].length, type: "close-sdt" });
  }

  // --- Walk events, track table depth, collect safe cut-points ---
  let tblDepth = 0;
  const cutPoints = [0]; // position 0 = empty header (fallback)

  for (const ev of events) {
    if (ev.type === "open-tbl") {
      tblDepth++;
    } else if (ev.type === "close-tbl") {
      tblDepth--;
      if (tblDepth === 0) cutPoints.push(ev.end);
    } else if (ev.type === "close-p" || ev.type === "close-sdt") {
      if (tblDepth === 0) cutPoints.push(ev.end);
    }
  }

  // --- Pick the last safe cut-point that comes before the stop text ---
  let bestCut = 0;
  for (const cp of cutPoints) {
    if (cp <= firstStopPos) bestCut = cp;
  }

  return body.substring(0, bestCut);
}

const PDF_SERVICE_DOWN_MESSAGE = "Layanan pembuat PDF sedang tidak aktif. Hubungi admin sistem.";

/**
 * True when the PDF converter (Gotenberg) answers and reports itself up. The address is the
 * one utils/pdf.util.js posts to.
 */
async function isPdfConverterUp() {
  try {
    const response = await axios.get(`${ENV.GOTENBERG_URL || "http://localhost:3001"}/health`, {
      timeout: 5000,
      validateStatus: () => true,
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

/**
 * Converts the report to PDF. `convertDocxToPdf` reports every failure with the same error,
 * so after a failure the converter itself is asked whether it is up: when it is not, the
 * answer is a 503 with a message for the user; any other failure is passed on as it is.
 */
export async function convertReportToPdf(docxBuffer, filename) {
  try {
    return await convertDocxToPdf(docxBuffer, filename);
  } catch (error) {
    if (await isPdfConverterUp()) throw error;
    const err = new Error(PDF_SERVICE_DOWN_MESSAGE);
    err.statusCode = 503;
    throw err;
  }
}

/**
 * Generate progress report PDF using the catatan template header
 * @param {Object} options - Filter options (academicYearId, statusIds, activityLevels)
 * @returns {{ buffer: Buffer, filename: string }}
 */
export async function generateProgressReportPdfService(options = {}) {
  // Get report data
  const reportData = await getProgressReportService(options);

  // Read catatan template
  const templatePath = path.join(
    process.cwd(),
    "uploads",
    "sop",
    "logcatatantemplate.docx"
  );
  if (!fs.existsSync(templatePath)) {
    const err = new Error(
      "Template log catatan (TA-06) belum diupload oleh Sekretaris Departemen. Template dibutuhkan untuk header laporan."
    );
    err.statusCode = 404;
    throw err;
  }

  const content = await readFile(templatePath);
  const zip = new PizZip(content);

  // Get document.xml
  const docXmlFile = zip.file("word/document.xml");
  if (!docXmlFile) {
    throw new Error("Template DOCX tidak valid: word/document.xml tidak ditemukan");
  }

  let docXml = docXmlFile.asText();

  // Extract body content
  const bodyStartTag = "<w:body>";
  const bodyStart = docXml.indexOf(bodyStartTag) + bodyStartTag.length;
  const bodyEnd = docXml.lastIndexOf("</w:body>");
  const body = docXml.substring(bodyStart, bodyEnd);

  // Extract section properties (page margins, size, header/footer refs)
  const sectPrMatch = body.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
  let sectPr = sectPrMatch ? sectPrMatch[0] : "";

  // Override to Landscape
  if (sectPr) {
    sectPr = sectPr.replace(
      /<w:pgSz[^>]*\/>/,
      '<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>'
    );
  } else {
    sectPr = `<w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/></w:sectPr>`;
  }

  // Extract header portion (kop surat) from the template
  const headerXml = extractHeaderFromDocXml(body);

  // Build monitoring report content
  const reportContentXml = buildMonitoringReportXml(reportData);

  // Assemble new body: header + report content + section properties
  const newBody = headerXml + reportContentXml + sectPr;

  // Replace document.xml body
  const newDocXml =
    docXml.substring(0, bodyStart) + newBody + docXml.substring(bodyEnd);
  zip.file("word/document.xml", newDocXml);

  // Generate DOCX buffer
  const docxBuffer = zip.generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  // Convert to PDF via Gotenberg
  const semester = reportData.academicYear.replace(/\s+/g, "_");
  const docxFilename = `Laporan_Progress_TA_${semester}.docx`;
  const pdfBuffer = await convertReportToPdf(docxBuffer, docxFilename);

  return {
    buffer: pdfBuffer,
    filename: `Laporan_Progress_TA_${semester}_${new Date().toISOString().slice(0, 10)}.pdf`,
  };
}
