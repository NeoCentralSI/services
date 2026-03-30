import * as monitoringRepository from "../../repositories/thesisGuidance/monitoring.repository.js";
import { sendFcmToUsers } from "../push.service.js";
import { createNotificationsForUsers } from "../notification.service.js";
import prisma from "../../config/prisma.js";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import PizZip from "pizzip";
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

/**
 * Calculate last activity date from multiple sources (guidance, milestone, seminar)
 */
function calculateLastActivity(thesis) {
  const dates = [];

  // 1. Guidance approvals
  const latestGuidance = (thesis.thesisGuidances || []).sort((a, b) => 
    new Date(b.approvedDate || b.completedAt || 0).getTime() - 
    new Date(a.approvedDate || a.completedAt || 0).getTime()
  )[0];
  if (latestGuidance) {
    const d = latestGuidance.approvedDate || latestGuidance.completedAt;
    if (d) dates.push(new Date(d));
  }

  // 2. Milestone completions/updates
  const latestMilestone = (thesis.thesisMilestones || []).filter(m => m.status === "completed").sort((a, b) => 
    new Date(b.updatedAt || b.completedAt || 0).getTime() - 
    new Date(a.updatedAt || a.completedAt || 0).getTime()
  )[0];
  if (latestMilestone) {
    const d = latestMilestone.updatedAt || latestMilestone.completedAt;
    if (d) dates.push(new Date(d));
  }

  // 3. Seminar updates/approvals
  const latestSeminar = (thesis.thesisSeminars || []).sort((a, b) => 
    new Date(b.updatedAt || 0).getTime() - 
    new Date(a.updatedAt || 0).getTime()
  )[0];
  if (latestSeminar) {
    if (latestSeminar.updatedAt) dates.push(new Date(latestSeminar.updatedAt));
  }

  // Fallback to thesis updatedAt
  if (thesis.updatedAt) dates.push(new Date(thesis.updatedAt));

  if (dates.length === 0) return thesis.createdAt;

  // Return the maximum date
  const validDates = dates.filter(d => !isNaN(d.getTime()));
  if (validDates.length === 0) return thesis.createdAt || new Date().toISOString();

  return new Date(Math.max(...validDates.map(d => d.getTime()))).toISOString();
}

/**
 * Get thesis monitoring dashboard data for management
 */
export async function getMonitoringDashboard(academicYear) {
  const [statusDistribution, ratingDistribution, progressStats, atRiskStudents, readyForSeminar, slowStudents, topicDistribution, batchDistribution, progressDistribution, guidanceTrend] = await Promise.all([
    monitoringRepository.getStatusDistribution(academicYear),
    monitoringRepository.getRatingDistribution(academicYear),
    monitoringRepository.getProgressStatistics(academicYear),
    monitoringRepository.getAtRiskStudents(5, academicYear),
    monitoringRepository.getStudentsReadyForSeminar(academicYear),
    monitoringRepository.getSlowStudents(5, academicYear),
    monitoringRepository.getTopicDistribution(academicYear),
    monitoringRepository.getBatchDistribution(academicYear),
    monitoringRepository.getProgressDistribution(academicYear),
    monitoringRepository.getGuidanceTrend(academicYear),
  ]);

  return {
    summary: {
      ...progressStats,
      totalReadyForSeminar: readyForSeminar.length,
      totalAtRisk: atRiskStudents.length,
      totalSlow: ratingDistribution.find((r) => r.id === "SLOW")?.count || 0,
    },
    statusDistribution,
    ratingDistribution,
    topicDistribution,
    batchDistribution,
    progressDistribution,
    guidanceTrend,
    atRiskStudents,
    slowStudents,
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
 * Get thesis list with filters for management
 */
export async function getThesesList(filters) {
  const { theses, total, page, pageSize } = await monitoringRepository.getThesesOverview(filters);

  const allAcademicYears = await monitoringRepository.getAllAcademicYears();

  const formattedTheses = theses.map((t) => {
    const milestones = t.thesisMilestones || [];
    const completedMilestones = milestones.filter((m) => m.status === "completed").length;
    const totalMilestones = milestones.length;
    const progressPercent = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

    // Get last activity from multiple indicators (guidance, milestone, seminar)
    const lastActivity = calculateLastActivity(t);

    // Get supervisors
    const pembimbing1 = t.thesisSupervisors?.find((p) => p.role?.name === "Pembimbing 1");
    const pembimbing2 = t.thesisSupervisors?.find((p) => p.role?.name === "Pembimbing 2");

    // Determine Semester Mulai TA
    let startSemester = t.academicYear?.name;
    if (t.startDate) {
      const ts = new Date(t.startDate).getTime();
      let matchedAy = null;
      for (const ay of allAcademicYears) {
        if (ay.startDate && ay.endDate) {
          const start = new Date(ay.startDate).getTime();
          const end = new Date(ay.endDate).getTime();
          // 30 days margin before start date
          const margin = 30 * 24 * 60 * 60 * 1000;
          if (ts >= (start - margin) && ts <= end) {
            matchedAy = ay;
            break;
          }
        }
      }
      if (matchedAy) {
        startSemester = matchedAy.name;
      }
    }

    return {
      id: t.id,
      title: t.title,
      rating: t.rating || 'ONGOING',
      student: {
        id: t.student?.id,
        userId: t.student?.user?.id,
        name: t.student?.user?.fullName,
        nim: t.student?.user?.identityNumber,
        email: t.student?.user?.email,
      },
      status: t.thesisStatus?.name,
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
      lastActivity,
      deadlineDate: t.deadlineDate,
      createdAt: t.createdAt,
    };
  });

  // Filter: per student, show only the active thesis.
  // If a student has both a cancelled/failed thesis AND a newer active one,
  // hide the cancelled/failed one. Only show cancelled/failed if
  // the student has no other (active) thesis.
  const inactiveStatuses = new Set(["Dibatalkan", "Gagal"]);
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
  const [statusDistribution, supervisors, academicYears] = await Promise.all([
    monitoringRepository.getStatusDistribution(),
    monitoringRepository.getAllSupervisors(),
    monitoringRepository.getAllAcademicYears(),
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
    academicYears: academicYears.map((ay) => ({
      value: ay.id,
      label: ay.name,
      isActive: ay.isActive,
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
 * Get detailed thesis information by thesis ID for monitoring
 */
export async function getThesisDetail(thesisId) {
  const thesis = await monitoringRepository.getThesisDetailById(thesisId);

  if (!thesis) {
    const err = new Error("Tugas akhir tidak ditemukan");
    err.statusCode = 404;
    throw err;
  }

  // Calculate milestone progress
  const milestones = thesis.thesisMilestones || [];
  const completedMilestones = milestones.filter((m) => m.status === "completed").length;
  const totalMilestones = milestones.length;
  const progressPercent = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

  // Get last activity from multiple indicators (guidance, milestone, seminar)
  const lastActivity = calculateLastActivity(thesis);

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
    status: thesis.thesisStatus?.name || null,
    rating: thesis.rating || 'ONGOING',
    topic: thesis.thesisTopic?.name || null,
    academicYear: thesis.academicYear
      ? `${thesis.academicYear.semester === "ganjil" ? "Ganjil" : "Genap"} ${thesis.academicYear.year}`
      : null,
    startDate: thesis.startDate,
    deadlineDate: thesis.deadlineDate,
    createdAt: thesis.createdAt,
    lastActivity,
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
    latestDocument: thesis.document ? {
      id: thesis.document.id,
      fileName: path.basename(thesis.document.filePath || "") || thesis.document.fileName,
      filePath: thesis.document.filePath,
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
 * Send warning notification to student about thesis progress (for department roles: Kadep, Sekdep, GKM)
 */
export async function sendWarningNotificationService(userId, thesisId, warningType) {
  // Get user info for sender name
  const sender = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true }
  });
  const senderName = toTitleCaseName(sender?.fullName || "Manajemen Prodi");

  // Get thesis with student info
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    include: {
      student: {
        include: {
          user: { select: { id: true, fullName: true } }
        }
      }
    }
  });

  if (!thesis) {
    const err = new Error("Thesis not found");
    err.statusCode = 404;
    throw err;
  }

  const studentUserId = thesis.student?.user?.id;
  const studentName = thesis.student?.user?.fullName || "Mahasiswa";

  if (!studentUserId) {
    const err = new Error("Student not found for this thesis");
    err.statusCode = 404;
    throw err;
  }

  // Define warning messages based on type
  const warningMessages = {
    SLOW: {
      title: "⚠️ Peringatan Progress Tugas Akhir",
      body: `Halo ${toTitleCaseName(studentName)}, progress tugas akhir Anda terdeteksi lambat. Segera jadwalkan bimbingan dengan dosen pembimbing untuk mendiskusikan kendala yang dihadapi.`,
      notifBody: `Progress tugas akhir Anda terdeteksi lambat. Departemen mengingatkan Anda untuk segera menjadwalkan bimbingan.`
    },
    AT_RISK: {
      title: "🚨 Peringatan Serius: Progress Tugas Akhir",
      body: `Halo ${toTitleCaseName(studentName)}, status tugas akhir Anda dalam kondisi BERISIKO. Segera hubungi dosen pembimbing untuk menghindari kegagalan.`,
      notifBody: `Status tugas akhir Anda dalam kondisi BERISIKO. Departemen meminta Anda segera menghubungi dosen pembimbing.`
    },
    FAILED: {
      title: "❌ Pemberitahuan Status Tugas Akhir",
      body: `Halo ${toTitleCaseName(studentName)}, tugas akhir Anda telah melampaui batas waktu. Segera hubungi dosen pembimbing untuk langkah selanjutnya.`,
      notifBody: `Tugas akhir Anda telah melampaui batas waktu. Silakan hubungi dosen pembimbing atau Departemen.`
    }
  };

  const message = warningMessages[warningType] || warningMessages.SLOW;

  // Send FCM notification
  await sendFcmToUsers([studentUserId], {
    title: message.title,
    body: message.body,
    data: {
      type: "thesis_warning",
      thesisId: thesis.id,
      warningType
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
    message: `Peringatan telah dikirim ke ${toTitleCaseName(studentName)}`
  };
}

/**
 * Send batch warning notifications to multiple students
 */
export async function sendBatchWarningNotificationService(userId, thesisIds, warningType) {
  if (!Array.isArray(thesisIds) || thesisIds.length === 0) {
    throw new Error("Daftar mahasiswa (thesisId) tidak boleh kosong");
  }

  // Get user info for sender name
  const sender = await prisma.user.findUnique({
    where: { id: userId },
    select: { fullName: true }
  });
  const senderName = toTitleCaseName(sender?.fullName || "Manajemen Prodi");

  // Get all theses with student user info
  const theses = await prisma.thesis.findMany({
    where: { id: { in: thesisIds } },
    include: {
      student: {
        include: {
          user: { select: { id: true, fullName: true } }
        }
      }
    }
  });

  if (theses.length === 0) {
    throw new Error("Tidak ada data tugas akhir yang ditemukan");
  }

  // Define warning messages based on type
  const warningMessages = {
    SLOW: {
      title: "⚠️ Peringatan: Progress Tugas Akhir",
      body: (name, days) => `Halo ${toTitleCaseName(name)}, Anda sudah tidak ada update progress tugas akhir selama ${days} hari. Segera lakukan bimbingan dengan dosen pembimbing Anda sebelum deadline tugas akhir Anda berakhir.`,
      notifBody: (days) => `Anda tidak ada update progress selama ${days} hari. Segera hubungi dosen pembimbing Anda.`
    },
    AT_RISK: {
      title: "🚨 Peringatan Serius: Progress Tugas Akhir",
      body: (name, days) => `Halo ${toTitleCaseName(name)}, Anda sudah tidak ada update progress tugas akhir selama ${days} hari (Status: BERISIKO). Segera lakukan bimbingan dengan dosen pembimbing Anda sebelum deadline tugas akhir Anda berakhir.`,
      notifBody: (days) => `Progress Anda terhenti selama ${days} hari (BERISIKO). Segera hubungi dosen pembimbing untuk menghindari kegagalan.`
    }
  };

  const messageConfig = warningMessages[warningType] || warningMessages.SLOW;

  // Process notifications in batches
  const results = await Promise.allSettled(theses.map(async (thesis) => {
    const studentUserId = thesis.student?.user?.id;
    const studentName = thesis.student?.user?.fullName || "Mahasiswa";
    const daysSinceActivity = thesis.daysSinceActivity || 0;

    if (!studentUserId) return;

    // Send FCM notification
    await sendFcmToUsers([studentUserId], {
      title: messageConfig.title,
      body: typeof messageConfig.body === 'function' ? messageConfig.body(studentName, daysSinceActivity) : messageConfig.body,
      data: {
        type: "thesis_warning",
        thesisId: thesis.id,
        warningType
      }
    });

    // Create in-app notification
    await createNotificationsForUsers([studentUserId], {
      title: messageConfig.title,
      message: typeof messageConfig.notifBody === 'function' ? messageConfig.notifBody(daysSinceActivity) : messageConfig.notifBody,
      type: "thesis_warning",
      referenceId: thesis.id
    });
  }));

  const successfulCount = results.filter(r => r.status === 'fulfilled').length;

  return {
    success: true,
    message: `Peringatan berhasil dikirim ke ${successfulCount} mahasiswa.`
  };
}

/**
 * Get comprehensive progress report data for PDF generation
 * @param {Object} options - Filter options (academicYearId, statusIds, ratings)
 */
export async function getProgressReportService(options = {}) {
  const { academicYearId } = options;
  // Get academic year info
  const academicYear = academicYearId && academicYearId !== 'all'
    ? await monitoringRepository.getAcademicYearById(academicYearId)
    : null;

  // Get all theses for the academic year with filters
  const theses = await monitoringRepository.getThesesForReport(options);

  // Get statistics
  const [statusDistribution, ratingDistribution] = await Promise.all([
    monitoringRepository.getStatusDistribution(academicYearId),
    monitoringRepository.getRatingDistribution(academicYearId),
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

    return {
      no: index + 1,
      nim: t.student?.user?.identityNumber || "-",
      name: toTitleCaseName(t.student?.user?.fullName || "-"),
      title: t.title || "-",
      topic: t.thesisTopic?.name || "-",
      status: t.thesisStatus?.name || "-",
      rating: t.rating || "ONGOING",
      pembimbing1: toTitleCaseName(pembimbing1?.lecturer?.user?.fullName || "-"),
      pembimbing2: toTitleCaseName(pembimbing2?.lecturer?.user?.fullName || "-"),
      guidanceTotal: guidances.length,
      guidanceCompleted: completedGuidanceCount,
      lastGuidanceDate: lastGuidance?.completedAt || null,
      milestoneTotal: milestones.length,
      milestoneCompleted: completedMilestoneCount,
      progressPercent,
      startDate: t.startDate,
      deadlineDate: t.deadlineDate,
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

  return {
    academicYear: academicYear
      ? `${academicYear.semester === "ganjil" ? "Ganjil" : "Genap"} ${academicYear.year}`
      : "Semua Semester",
    generatedAt: new Date().toISOString(),
    summary,
    statusDistribution,
    ratingDistribution,
    theses: reportData,
  };
}

// ========== RATING LABELS ==========
const RATING_LABELS = {
  ONGOING: "Ongoing",
  SLOW: "Lambat",
  AT_RISK: "Berisiko",
  FAILED: "Gagal",
  CANCELLED: "Dibatalkan",
};

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
  const { academicYear, generatedAt, theses } = reportData;

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
        <w:t>Periode Semester ${escapeXml(academicYear)}</w:t>
      </w:r>
    </w:p>`;

  // Table header
  const headerRow = `
    <w:tr>
      ${makeCell("No", { bold: true, center: true, fontSize: 20 })}
      ${makeCell("Nama / NIM", { bold: true, center: true, fontSize: 20 })}
      ${makeCell("Judul / Topik", { bold: true, center: true, fontSize: 20 })}
      ${makeCell("Pembimbing", { bold: true, center: true, fontSize: 20 })}
      ${makeCell("Mulai / Deadline", { bold: true, center: true, fontSize: 20 })}
      ${makeCell("Rating / Progress", { bold: true, center: true, fontSize: 20 })}
      ${makeCell("Status / Bimbingan Terakhir", { bold: true, center: true, fontSize: 20 })}
    </w:tr>`;

  // Table data rows
  const dataRows = theses
    .map((t) => {
      let pembimbingText = `${t.pembimbing1}`;
      if (t.pembimbing2 && t.pembimbing2 !== "-") {
        pembimbingText += `\n${t.pembimbing2}`;
      }
      const ratingLabel = RATING_LABELS[t.rating] || t.rating;

      const identity = `${t.name}\n${t.nim}`;
      const info = `${t.title}\n(${t.topic})`;
      const dates = `${formatDateLong(t.startDate)}\n${formatDateLong(t.deadlineDate)}`;
      const statusInfo = `${t.status}\n${formatDateLong(t.lastGuidanceDate)}`;
      const progressInfo = `${ratingLabel}\n${t.progressPercent}%`;

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
        <w:gridCol w:w="500"/>
        <w:gridCol w:w="2500"/>
        <w:gridCol w:w="3500"/>
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
        <w:spacing w:after="0"/>
        <w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
      </w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
        <w:t>Padang, ${escapeXml(formatDateLong(generatedAt))}</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:jc w:val="right"/>
        <w:spacing w:after="0"/>
        <w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
      </w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
        <w:t>Mengetahui,</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:jc w:val="right"/>
        <w:spacing w:after="0"/>
        <w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
      </w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
        <w:t>Ketua Departemen,</w:t>
      </w:r>
    </w:p>
    <w:p><w:pPr><w:spacing w:before="1000"/></w:pPr></w:p>
    <w:p>
      <w:pPr>
        <w:jc w:val="right"/>
        <w:spacing w:after="0"/>
        <w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
      </w:pPr>
      <w:r>
        <w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
        <w:t>Ricky Akbar M.Kom</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:pPr>
        <w:jc w:val="right"/>
        <w:spacing w:after="0"/>
        <w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
      </w:pPr>
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

/**
 * Generate progress report PDF using the catatan template header
 * @param {Object} options - Filter options (academicYearId, statusIds, ratings)
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
  const pdfBuffer = await convertDocxToPdf(docxBuffer, docxFilename);

  return {
    buffer: pdfBuffer,
    filename: `Laporan_Progress_TA_${semester}_${new Date().toISOString().slice(0, 10)}.pdf`,
  };
}
