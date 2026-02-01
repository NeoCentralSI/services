import * as monitoringRepository from "../../repositories/thesisGuidance/monitoring.repository.js";
import { sendFcmToUsers } from "../push.service.js";
import { createNotificationsForUsers } from "../notification.service.js";
import prisma from "../../config/prisma.js";

function toTitleCaseName(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Get thesis monitoring dashboard data for management
 */
export async function getMonitoringDashboard(academicYear) {
  const [statusDistribution, ratingDistribution, progressStats, atRiskStudents, readyForSeminar] = await Promise.all([
    monitoringRepository.getStatusDistribution(academicYear),
    monitoringRepository.getRatingDistribution(academicYear),
    monitoringRepository.getProgressStatistics(academicYear),
    monitoringRepository.getAtRiskStudents(5, academicYear),
    monitoringRepository.getStudentsReadyForSeminar(academicYear),
  ]);

  return {
    summary: {
      ...progressStats,
      totalReadyForSeminar: readyForSeminar.length,
      totalAtRisk: atRiskStudents.length,
    },
    statusDistribution,
    ratingDistribution,
    atRiskStudents,
    readyForSeminar: readyForSeminar.slice(0, 5).map((t) => ({
      thesisId: t.id,
      title: t.title,
      student: {
        name: t.student?.user?.fullName,
        nim: t.student?.user?.identityNumber,
        email: t.student?.user?.email,
      },
      supervisors: t.thesisParticipants.map((p) => ({
        name: p.lecturer?.user?.fullName,
        role: p.role?.name,
      })),
      approvedAt: t.seminarReadyApprovedAt,
    })),
  };
}

/**
 * Get thesis list with filters for management
 */
export async function getThesesList(filters) {
  const { theses, total, page, pageSize } = await monitoringRepository.getThesesOverview(filters);

  const formattedTheses = theses.map((t) => {
    const milestones = t.thesisMilestones || [];
    const completedMilestones = milestones.filter((m) => m.status === "completed").length;
    const totalMilestones = milestones.length;
    const progressPercent = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

    // Get last activity date from milestones
    let lastActivity = t.createdAt;
    if (milestones.length > 0) {
      const sortedMilestones = [...milestones].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      lastActivity = sortedMilestones[0].updatedAt;
    }

    // Get supervisors
    const pembimbing1 = t.thesisParticipants?.find((p) => p.role?.name === "Pembimbing 1");
    const pembimbing2 = t.thesisParticipants?.find((p) => p.role?.name === "Pembimbing 2");

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
      seminarApproval: {
        supervisor1: t.seminarReadyApprovedBySupervisor1 || false,
        supervisor2: t.seminarReadyApprovedBySupervisor2 || false,
        isFullyApproved: t.seminarReadyApprovedBySupervisor1 && t.seminarReadyApprovedBySupervisor2,
      },
      lastActivity,
      createdAt: t.createdAt,
    };
  });

  return {
    data: formattedTheses,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
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
    supervisors: t.thesisParticipants.map((p) => ({
      name: p.lecturer?.user?.fullName,
      role: p.role?.name,
    })),
    approvedAt: t.seminarReadyApprovedAt,
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

  // Get last activity
  let lastActivity = thesis.createdAt;
  if (milestones.length > 0) {
    const sortedMilestones = [...milestones].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    lastActivity = sortedMilestones[0].updatedAt;
  }

  // Separate supervisors and examiners
  const supervisors = thesis.thesisParticipants
    .filter((p) => p.role?.name?.includes("Pembimbing"))
    .map((p) => ({
      id: p.lecturer?.user?.id,
      name: p.lecturer?.user?.fullName,
      email: p.lecturer?.user?.email,
      role: p.role?.name,
    }));

  const examiners = thesis.thesisParticipants
    .filter((p) => p.role?.name?.toLowerCase().includes("penguji"))
    .map((p) => ({
      id: p.lecturer?.user?.id,
      name: p.lecturer?.user?.fullName,
      email: p.lecturer?.user?.email,
      role: p.role?.name,
    }));

  // Format seminars
  const seminars = thesis.thesisSeminars.map((s) => ({
    id: s.id,
    status: s.status,
    result: s.result?.name || null,
    scheduledAt: s.schedule?.startTime || null,
    endTime: s.schedule?.endTime || null,
    room: s.schedule?.room?.name || null,
    scores: s.scores.map((sc) => ({
      scorerName: sc.scorer?.user?.fullName,
      rubric: sc.rubricDetail?.name || null,
      score: sc.score,
    })),
    averageScore: s.scores.length > 0 
      ? Math.round(s.scores.reduce((sum, sc) => sum + (sc.score || 0), 0) / s.scores.length) 
      : null,
  }));

  // Format defences
  const defences = thesis.thesisDefences.map((d) => ({
    id: d.id,
    status: d.status?.name || null,
    scheduledAt: d.schedule?.startTime || null,
    endTime: d.schedule?.endTime || null,
    room: d.schedule?.room?.name || null,
    scores: d.scores.map((sc) => ({
      scorerName: sc.scorer?.user?.fullName,
      rubric: sc.rubricDetail?.name || null,
      score: sc.score,
    })),
    averageScore: d.scores.length > 0 
      ? Math.round(d.scores.reduce((sum, sc) => sum + (sc.score || 0), 0) / d.scores.length) 
      : null,
  }));

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
    topic: thesis.thesisTopic?.name || null,
    academicYear: thesis.academicYear
      ? `${thesis.academicYear.semester === "ganjil" ? "Ganjil" : "Genap"} ${thesis.academicYear.year}`
      : null,
    startDate: thesis.startDate,
    deadlineDate: thesis.deadlineDate,
    createdAt: thesis.createdAt,
    lastActivity,
    seminarApproval: {
      supervisor1: thesis.seminarReadyApprovedBySupervisor1 || false,
      supervisor2: thesis.seminarReadyApprovedBySupervisor2 || false,
      isFullyApproved: thesis.seminarReadyApprovedBySupervisor1 && thesis.seminarReadyApprovedBySupervisor2,
      approvedAt: thesis.seminarReadyApprovedAt,
    },
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
      notifBody: `Progress tugas akhir Anda terdeteksi lambat. ${senderName} mengingatkan Anda untuk segera menjadwalkan bimbingan.`
    },
    AT_RISK: {
      title: "🚨 Peringatan Serius: Progress Tugas Akhir",
      body: `Halo ${toTitleCaseName(studentName)}, status tugas akhir Anda dalam kondisi BERISIKO. Segera hubungi dosen pembimbing untuk menghindari kegagalan.`,
      notifBody: `Status tugas akhir Anda dalam kondisi BERISIKO. ${senderName} meminta Anda segera menghubungi dosen pembimbing.`
    },
    FAILED: {
      title: "❌ Pemberitahuan Status Tugas Akhir",
      body: `Halo ${toTitleCaseName(studentName)}, tugas akhir Anda telah melampaui batas waktu. Segera hubungi dosen pembimbing untuk langkah selanjutnya.`,
      notifBody: `Tugas akhir Anda telah melampaui batas waktu. Silakan hubungi dosen pembimbing atau ${senderName}.`
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
