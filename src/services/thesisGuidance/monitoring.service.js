import * as monitoringRepository from "../../repositories/thesisGuidance/monitoring.repository.js";

/**
 * Get thesis monitoring dashboard data for management
 */
export async function getMonitoringDashboard(academicYear) {
  const [statusDistribution, progressStats, atRiskStudents, readyForSeminar] = await Promise.all([
    monitoringRepository.getStatusDistribution(academicYear),
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
        pembimbing2: pembimbing2?.lecturer?.user?.fullName || null,
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
