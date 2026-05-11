import * as examinerRepo from "../../repositories/thesis-seminar/examiner.repository.js";
import * as coreRepo from "../../repositories/thesis-seminar/thesis-seminar.repository.js";
import { computeEffectiveStatus } from "../../utils/seminarStatus.util.js";
import prisma from "../../config/prisma.js";

// ============================================================
// HELPERS
// ============================================================

function throwError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
}

function resolveSupervisorMembership(supervisorRelation) {
  if (!supervisorRelation) return null;
  if (supervisorRelation.thesis?.thesisSupervisors?.length > 0) {
    return supervisorRelation.thesis.thesisSupervisors[0];
  }
  return supervisorRelation;
}

function mapScoreToGrade(score) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return null;
  const s = Number(score);
  if (s >= 80) return "A";
  if (s >= 76) return "A-";
  if (s >= 70) return "B+";
  if (s >= 65) return "B";
  if (s >= 55) return "C+";
  if (s >= 50) return "C";
  if (s >= 45) return "D";
  return "E";
}

const DAY_LABELS = {
  monday: "Senin",
  tuesday: "Selasa",
  wednesday: "Rabu",
  thursday: "Kamis",
  friday: "Jumat",
};

function formatTimeHHMM(value) {
  if (!value) return null;
  const d = new Date(value);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function getWorkloadLevel(count) {
  if (count <= 2) return "Ringan";
  if (count <= 5) return "Sedang";
  return "Berat";
}

// ============================================================
// PUBLIC: Get Eligible Examiners
// ============================================================

export async function getEligibleExaminers(seminarId) {
  const seminar = await coreRepo.findSeminarBasicById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);

  const lecturers = await examinerRepo.findEligibleExaminers(seminarId);
  const lecturerIds = lecturers.map((l) => l.id);
  if (lecturerIds.length === 0) return [];

  // Find past failed examiners
  let previousExaminerIds = [];
  const currentThesis = await prisma.thesis.findUnique({
    where: { id: seminar.thesisId },
    select: { studentId: true },
  });
  if (currentThesis?.studentId) {
    const pastFailedSeminars = await prisma.thesisSeminar.findMany({
      where: {
        thesis: { studentId: currentThesis.studentId },
        status: "failed",
      },
      include: { examiners: { select: { lecturerId: true } } },
    });
    pastFailedSeminars.forEach((s) => {
      s.examiners.forEach((e) => {
        previousExaminerIds.push(e.lecturerId);
      });
    });
  }

  const now = new Date();
  const oneMonthLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [availabilityRows, upcomingSeminars, upcomingDefences] = await Promise.all([
    prisma.lecturerAvailability.findMany({
      where: { lecturerId: { in: lecturerIds } },
      orderBy: [{ lecturerId: "asc" }, { day: "asc" }, { startTime: "asc" }],
    }),
    prisma.thesisSeminarExaminer.findMany({
      where: {
        lecturerId: { in: lecturerIds },
        availabilityStatus: { in: ["pending", "available"] },
        seminar: {
          date: { gte: now, lte: oneMonthLater },
          status: "scheduled",
        },
      },
      include: {
        seminar: {
          include: { thesis: { include: { student: { include: { user: true } } } } },
        },
      },
    }),
    prisma.thesisDefenceExaminer.findMany({
      where: {
        lecturerId: { in: lecturerIds },
        availabilityStatus: { in: ["pending", "available"] },
        defence: {
          date: { gte: now, lte: oneMonthLater },
          status: "scheduled",
        },
      },
      include: {
        defence: {
          include: { thesis: { include: { student: { include: { user: true } } } } },
        },
      },
    }),
  ]);

  const availabilitiesByLecturer = new Map();
  availabilityRows.forEach((slot) => {
    if (!availabilitiesByLecturer.has(slot.lecturerId)) availabilitiesByLecturer.set(slot.lecturerId, []);
    availabilitiesByLecturer.get(slot.lecturerId).push(slot);
  });

  return lecturers.map((l) => {
    const filteredSeminars = upcomingSeminars.filter((s) => s.lecturerId === l.id);
    const filteredDefences = upcomingDefences.filter((d) => d.lecturerId === l.id);
    const upcomingCount = filteredSeminars.length + filteredDefences.length;

    const events = [
      ...filteredSeminars.map((s) => ({
        type: "seminar",
        title: "Seminar Hasil",
        studentName: s.seminar?.thesis?.student?.user?.fullName || "Mahasiswa",
        date: s.seminar.date,
        startTime: formatTimeHHMM(s.seminar.startTime),
        endTime: formatTimeHHMM(s.seminar.endTime),
      })),
      ...filteredDefences.map((d) => ({
        type: "defence",
        title: "Sidang Tugas Akhir",
        studentName: d.defence?.thesis?.student?.user?.fullName || "Mahasiswa",
        date: d.defence.date,
        startTime: formatTimeHHMM(d.defence.startTime),
        endTime: formatTimeHHMM(d.defence.endTime),
      })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const availabilityRanges = (availabilitiesByLecturer.get(l.id) || []).map((slot) => ({
      day: slot.day,
      dayLabel: DAY_LABELS[slot.day] || slot.day,
      startTime: formatTimeHHMM(slot.startTime),
      endTime: formatTimeHHMM(slot.endTime),
      validFrom: slot.validFrom,
      validUntil: slot.validUntil,
      label: `${DAY_LABELS[slot.day] || slot.day}, ${formatTimeHHMM(slot.startTime)}-${formatTimeHHMM(slot.endTime)}`,
    }));

    return {
      id: l.id,
      fullName: l.user?.fullName || "-",
      identityNumber: l.user?.identityNumber || "-",
      scienceGroup: l.scienceGroup?.name || "-",
      upcomingCount,
      availabilityRanges,
      events,
      isPreviousExaminer: previousExaminerIds.includes(l.id),
      isSelectable: true,
    };
  });
}

// ============================================================
// PUBLIC: Assign Examiners (Kadep)
// ============================================================

export async function assignExaminers(seminarId, examinerIds, assignedByUserId) {
  const seminar = await coreRepo.findSeminarById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);
  if (!["verified", "examiner_assigned", "scheduled"].includes(seminar.status)) {
    throwError("Seminar harus berstatus 'verified', 'examiner_assigned', atau 'scheduled' untuk penetapan penguji.", 400);
  }

  if (examinerIds.length < 1) throwError("Minimal 1 penguji wajib ditetapkan.", 400);
  if (new Set(examinerIds).size !== examinerIds.length) throwError("Penguji tidak boleh duplikat.", 400);

  const currentAssignments = await prisma.thesisSeminarExaminer.findMany({
    where: {
      thesisSeminarId: seminarId,
      availabilityStatus: { in: ["available", "pending", "unavailable"] },
    },
    orderBy: [{ assignedAt: "desc" }, { createdAt: "desc" }],
  });
  const assignmentByLecturerId = new Map();
  currentAssignments.forEach((assignment) => {
    if (!assignmentByLecturerId.has(assignment.lecturerId)) {
      assignmentByLecturerId.set(assignment.lecturerId, assignment);
    }
  });
  const currentComparableAssignments = [...assignmentByLecturerId.values()];
  const requestedIdSet = new Set(examinerIds);
  const requestedOrderByLecturerId = new Map(examinerIds.map((lecturerId, idx) => [lecturerId, idx + 1]));

  const removedExaminerRecordIds = currentComparableAssignments
    .filter((examiner) => !requestedIdSet.has(examiner.lecturerId))
    .map((examiner) => examiner.id);
  const addedExaminerIds = examinerIds.filter((lecturerId) => !assignmentByLecturerId.has(lecturerId));
  const keptExaminerUpdates = examinerIds
    .map((lecturerId, idx) => ({ lecturerId, order: idx + 1, existing: assignmentByLecturerId.get(lecturerId) }))
    .filter((item) => item.existing);

  await prisma.$transaction(async (tx) => {
    if (removedExaminerRecordIds.length > 0) {
      await tx.thesisSeminarExaminer.deleteMany({
        where: {
          id: { in: removedExaminerRecordIds },
          thesisSeminarId: seminarId,
          availabilityStatus: { in: ["available", "pending", "unavailable"] },
        },
      });
    }

    if (keptExaminerUpdates.length > 0) {
      await Promise.all(
        keptExaminerUpdates.map((item) =>
          tx.thesisSeminarExaminer.update({
            where: { id: item.existing.id },
            data: {
              order: item.order,
              ...(item.existing.availabilityStatus === "unavailable"
                ? { availabilityStatus: "pending", respondedAt: null }
                : {}),
            },
          })
        )
      );
    }

    if (addedExaminerIds.length > 0) {
      const now = new Date();
      await tx.thesisSeminarExaminer.createMany({
        data: addedExaminerIds.map((lecturerId) => ({
          thesisSeminarId: seminarId,
          lecturerId,
          order: requestedOrderByLecturerId.get(lecturerId),
          assignedBy: assignedByUserId,
          assignedAt: now,
          availabilityStatus: "pending",
        })),
      });
    }
  });

  // 3. Notifications
  try {
    const studentName = seminar.thesis?.student?.user?.fullName || "Mahasiswa";
    const studentUserId = seminar.thesis?.student?.id;

    // Notify newly added examiners
    if (addedExaminerIds.length > 0) {
      const lecturers = await prisma.lecturer.findMany({
        where: { id: { in: addedExaminerIds } },
        include: { user: { select: { id: true } } },
      });
      const userIds = lecturers.map((l) => l.user.id);
      const title = "Penugasan Penguji Seminar Hasil";
      const message = `Anda telah ditugaskan sebagai penguji seminar hasil mahasiswa ${studentName}. Mohon berikan konfirmasi kesediaan Anda.`;

      await Promise.all([
        import("../notification.service.js").then((m) => m.createNotificationsForUsers(userIds, { title, message })),
        import("../push.service.js").then((m) => m.sendFcmToUsers(userIds, { title, body: message, data: { seminarId, type: "seminar_examiner_assigned" } })),
      ]);
    }

    // Notify student about assignment
    if (addedExaminerIds.length > 0 && studentUserId) {
      const title = "Penetapan Penguji Seminar Hasil";
      const message = "Dosen penguji untuk seminar hasil Anda telah ditetapkan. Menunggu konfirmasi kesediaan dari penguji.";
      await Promise.all([
        import("../notification.service.js").then((m) => m.createNotificationsForUsers([studentUserId], { title, message })),
        import("../push.service.js").then((m) => m.sendFcmToUsers([studentUserId], { title, body: message, data: { seminarId, type: "seminar_examiner_assigned_student" } })),
      ]);
    }
  } catch (err) {
    console.error("[Notification Error] Failed to notify stakeholders on examiner assignment:", err.message);
  }

  // Auto-transition if all assigned examiners are available
  const activeExaminers = await examinerRepo.findActiveExaminersBySeminar(seminarId);
  const allAvailable = activeExaminers.length > 0 && activeExaminers.every((e) => e.availabilityStatus === "available");
  if (seminar.status !== "scheduled") {
    const targetStatus = allAvailable ? "examiner_assigned" : "verified";
    if (seminar.status !== targetStatus) await coreRepo.updateSeminar(seminarId, { status: targetStatus });
  }

  return activeExaminers;
}

// ============================================================
// PUBLIC: Respond to Assignment (Lecturer)
// ============================================================

export async function respondExaminerAssignment(seminarId, examinerId, payload, lecturerId) {
  const { status, unavailableReasons } = payload || {};
  if (!["available", "unavailable"].includes(status)) throwError("Status harus 'available' atau 'unavailable'.", 400);

  const examiner = await examinerRepo.findExaminerById(examinerId);
  if (!examiner) throwError("Data penguji tidak ditemukan.", 404);
  const seminar = await coreRepo.findSeminarBasicById(examiner.thesisSeminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);
  if (examiner.lecturerId !== lecturerId) throwError("Anda bukan penguji yang ditugaskan.", 403);
  if (examiner.availabilityStatus !== "pending") throwError("Anda sudah memberikan respons sebelumnya.", 400);

  await examinerRepo.updateExaminerAvailability(examinerId, status, unavailableReasons);

  // Auto-transition if all assigned examiners are available
  const activeExaminers = await examinerRepo.findActiveExaminersBySeminar(examiner.thesisSeminarId);
  const allAvailable = activeExaminers.length > 0 && activeExaminers.every((e) => e.availabilityStatus === "available");
  let seminarTransitioned = false;
  if (allAvailable && seminar.status !== "scheduled") {
    await coreRepo.updateSeminar(examiner.thesisSeminarId, { status: "examiner_assigned" });
    seminarTransitioned = true;
  }

  // Notifications
  try {
    const thesis = await prisma.thesis.findUnique({
      where: { id: seminar.thesisId },
      select: {
        student: { select: { user: { select: { id: true, fullName: true } } } },
        thesisSupervisors: {
          include: { lecturer: { include: { user: { select: { id: true } } } } },
        },
      },
    });
    const student = thesis?.student?.user;
    const studentName = student?.fullName || "Mahasiswa";
    const supervisorUserIds = (thesis?.thesisSupervisors || []).map((s) => s.lecturer?.user?.id).filter(Boolean);

    const lecturer = await prisma.lecturer.findUnique({
      where: { id: lecturerId },
      include: { user: { select: { fullName: true } } },
    });
    const lecturerName = lecturer?.user?.fullName || "Dosen Penguji";

    // 1. Notify Kadep if unavailable (needs reassignment)
    if (status === "unavailable") {
      const kadepIds = await coreRepo.findUserIdsByRole("Ketua Departemen");
      if (kadepIds.length > 0) {
        const title = "Penguji Berhalangan Hadir";
        const message = `${lecturerName} tidak bersedia menjadi penguji seminar hasil mahasiswa ${studentName}. Alasan: ${unavailableReasons || "-"}. Mohon lakukan penetapan ulang.`;
        await Promise.all([
          import("../notification.service.js").then((m) => m.createNotificationsForUsers(kadepIds, { title, message })),
          import("../push.service.js").then((m) => m.sendFcmToUsers(kadepIds, { title, body: message, data: { seminarId, type: "seminar_examiner_unavailable" } })),
        ]);
      }
    }

    // 2. Notify Student, Admin, and Supervisors if all available (Ready for Scheduling)
    if (seminarTransitioned) {
      const title = "Penguji Seminar Hasil Lengkap";
      const message = `Seluruh penguji untuk seminar hasil ${studentName} telah bersedia hadir. Menunggu penetapan jadwal oleh Admin.`;

      // Student notification
      if (student?.id) {
        await Promise.all([
          import("../notification.service.js").then((m) => m.createNotificationsForUsers([student.id], { title, message })),
          import("../push.service.js").then((m) => m.sendFcmToUsers([student.id], { title, body: message, data: { seminarId, type: "seminar_all_examiners_available" } })),
        ]);
      }

      // Admin notification
      const adminIds = await coreRepo.findUserIdsByRole("Admin");
      if (adminIds.length > 0) {
        await Promise.all([
          import("../notification.service.js").then((m) => m.createNotificationsForUsers(adminIds, { title, message })),
          import("../push.service.js").then((m) => m.sendFcmToUsers(adminIds, { title, body: message, data: { seminarId, type: "seminar_all_examiners_available_admin" } })),
        ]);
      }

      // Supervisor notification
      if (supervisorUserIds.length > 0) {
        await Promise.all([
          import("../notification.service.js").then((m) => m.createNotificationsForUsers(supervisorUserIds, { title, message })),
          import("../push.service.js").then((m) => m.sendFcmToUsers(supervisorUserIds, { title, body: message, data: { seminarId, type: "seminar_all_examiners_available_supervisor" } })),
        ]);
      }
    }
  } catch (err) {
    console.error("[Notification Error] Failed to notify stakeholders on examiner response:", err.message);
  }

  return { examinerId, availabilityStatus: status, seminarTransitioned };
}

// ============================================================
// PUBLIC: Get Assessment Form (Examiner)
// ============================================================

export async function getExaminerAssessment(seminarId, user) {
  const seminar = await coreRepo.findSeminarById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);

  const effectiveStatus = computeEffectiveStatus(seminar.status, seminar.date, seminar.startTime, seminar.endTime);
  if (!["ongoing", "passed", "passed_with_revision", "failed"].includes(effectiveStatus)) {
    throwError("Form penilaian hanya tersedia saat seminar sedang berlangsung atau sudah selesai.", 400);
  }

  // Evaluate Roles
  const userRoles = await prisma.userHasRole.findMany({
    where: { userId: user.sub || user.id, status: "active" },
    select: { role: { select: { name: true } } },
  });
  const adminRoleNames = ["admin", "ketua departemen", "sekretaris departemen", "gkm"];
  const isAdmin = adminRoleNames.includes(String(user.role || "").toLowerCase()) || 
                   userRoles.some((r) => adminRoleNames.includes(String(r.role?.name || "").toLowerCase()));
  const isExaminer = user.lecturerId && (seminar.examiners || []).some((e) => e.lecturerId === user.lecturerId);
  
  const supervisorRelation = user.lecturerId ? await coreRepo.findSeminarSupervisorRole(seminarId, user.lecturerId) : null;
  const isSupervisor = supervisorRelation ? !!resolveSupervisorMembership(supervisorRelation) : false;
  
  const isStudent = user.studentId && seminar.thesis?.student?.id === user.studentId;

  const isFinalized = ["passed", "passed_with_revision", "failed"].includes(effectiveStatus) || seminar.resultFinalizedAt;

  if (isFinalized) {
    if (!isAdmin && !isExaminer && !isSupervisor && !isStudent) {
      throwError("Anda tidak memiliki akses untuk melihat form penilaian seminar ini.", 403);
    }
  } else {
    if (!isExaminer && !isAdmin) {
      throwError("Hanya dosen penguji atau pimpinan yang dapat mengakses form penilaian.", 403);
    }
  }

  const examiner = user.lecturerId ? await examinerRepo.findLatestExaminerBySeminarAndLecturer(seminarId, user.lecturerId) : null;

  const cpmks = await examinerRepo.findSeminarAssessmentCpmks();
  const existingScoreMap = new Map(
    examiner ? (examiner.thesisSeminarExaminerAssessmentDetails || []).map((item) => [item.assessmentCriteriaId, item.score]) : []
  );

  const criteriaGroups = cpmks.map((cpmk) => ({
    id: cpmk.id, code: cpmk.code, description: cpmk.description,
    criteria: (cpmk.assessmentCriterias || []).map((c) => ({
      id: c.id, name: c.name || "-", maxScore: c.maxScore || 0,
      score: existingScoreMap.get(c.id) ?? null,
      rubrics: (c.assessmentRubrics || []).map((r) => ({ id: r.id, minScore: r.minScore, maxScore: r.maxScore, description: r.description })),
    })),
  }));

  return {
    seminar: {
      id: seminar.id, status: effectiveStatus,
      studentName: seminar.thesis?.student?.user?.fullName || "-",
      studentNim: seminar.thesis?.student?.user?.identityNumber || "-",
      thesisTitle: seminar.thesis?.title || "-",
      date: seminar.date, startTime: seminar.startTime, endTime: seminar.endTime,
      room: seminar.room ? { id: seminar.room.id, name: seminar.room.name } : null,
    },
    examiner: examiner ? {
      id: examiner.id, order: examiner.order,
      assessmentScore: examiner.assessmentScore, revisionNotes: examiner.revisionNotes,
      assessmentSubmittedAt: examiner.assessmentSubmittedAt,
    } : null,
    criteriaGroups,
  };
}

// ============================================================
// PUBLIC: Submit Assessment (Examiner)
// ============================================================

export async function submitExaminerAssessment(seminarId, { scores, revisionNotes, isDraft }, lecturerId) {
  const seminar = await coreRepo.findSeminarById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);

  const effectiveStatus = computeEffectiveStatus(seminar.status, seminar.date, seminar.startTime, seminar.endTime);
  if (effectiveStatus !== "ongoing") throwError("Penilaian hanya dapat disubmit saat seminar sedang berlangsung.", 400);

  const examiner = await examinerRepo.findLatestExaminerBySeminarAndLecturer(seminarId, lecturerId);
  if (!examiner || examiner.availabilityStatus !== "available") throwError("Anda bukan penguji aktif pada seminar ini.", 403);
  if (examiner.assessmentSubmittedAt) throwError("Penilaian sudah disubmit sebelumnya dan tidak dapat diubah.", 400);

  // Validate criteria
  const cpmks = await examinerRepo.findSeminarAssessmentCpmks();
  const activeCriteria = cpmks.flatMap((c) => c.assessmentCriterias || []);
  const criteriaMap = new Map(activeCriteria.map((item) => [item.id, item]));

  if (!isDraft && (scores || []).length !== activeCriteria.length) {
    throwError("Semua kriteria aktif harus diisi sebelum submit.", 400);
  }

  const seen = new Set();
  const normalizedScores = (scores || []).map((item) => {
    const criterion = criteriaMap.get(item.assessmentCriteriaId);
    if (!criterion) throwError("Terdapat kriteria yang tidak valid.", 400);
    if (seen.has(item.assessmentCriteriaId)) throwError("Duplikasi kriteria pada payload penilaian.", 400);
    seen.add(item.assessmentCriteriaId);
    const max = criterion.maxScore || 0;
    if (item.score < 0 || item.score > max) throwError(`Nilai untuk '${criterion.name || "kriteria"}' harus 0-${max}.`, 400);
    return { assessmentCriteriaId: item.assessmentCriteriaId, score: item.score };
  });

  const updated = await examinerRepo.saveExaminerAssessment({ examinerId: examiner.id, scores: normalizedScores, revisionNotes, isDraft });
  return { examinerId: updated.id, assessmentScore: updated.assessmentScore, assessmentSubmittedAt: updated.assessmentSubmittedAt };
}

// ============================================================
// PUBLIC: Finalization Data (Supervisor view)
// ============================================================

export async function getFinalizationData(seminarId, user) {
  const seminar = await coreRepo.findSeminarById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);

  const effectiveStatus = computeEffectiveStatus(seminar.status, seminar.date, seminar.startTime, seminar.endTime);

  // Evaluate Roles
  let userRoles = [];
  if (user.sub || user.id) {
    userRoles = await prisma.userHasRole.findMany({
      where: { userId: user.sub || user.id, status: "active" },
      select: { role: { select: { name: true } } },
    });
  }
  const adminRoleNames = ["admin", "ketua departemen", "sekretaris departemen", "gkm"];
  const isAdmin = adminRoleNames.includes(String(user.role || "").toLowerCase()) || 
                   userRoles.some((r) => adminRoleNames.includes(String(r.role?.name || "").toLowerCase()));
  const isExaminer = user.lecturerId && (seminar.examiners || []).some((e) => e.lecturerId === user.lecturerId);
  
  const supervisorRelation = user.lecturerId ? await coreRepo.findSeminarSupervisorRole(seminarId, user.lecturerId) : null;
  const mySupervisor = supervisorRelation ? resolveSupervisorMembership(supervisorRelation) : null;
  const isSupervisor = !!mySupervisor;
  
  const isStudent = user.studentId && seminar.thesis?.student?.id === user.studentId;

  const isFinalized = ["passed", "passed_with_revision", "failed"].includes(effectiveStatus) || seminar.resultFinalizedAt;

  if (isFinalized) {
    if (!isAdmin && !isExaminer && !isSupervisor && !isStudent) {
      throwError("Anda tidak memiliki akses untuk melihat data finalisasi seminar ini.", 403);
    }
  } else {
    if (!isSupervisor && !isAdmin) {
      throwError("Hanya dosen pembimbing atau pimpinan yang dapat melihat data rekap awal.", 403);
    }
  }

  const examiners = await examinerRepo.findActiveExaminersWithAssessments(seminarId);
  const allSubmitted = examiners.length >= 2 && examiners.every((e) => !!e.assessmentSubmittedAt && e.assessmentScore !== null);

  const avgScore = allSubmitted ? examiners.reduce((s, e) => s + (e.assessmentScore || 0), 0) / examiners.length : null;

  const cpmks = await examinerRepo.findSeminarAssessmentCpmks();
  const criteriaGroups = cpmks.map((cpmk) => {
    const criteria = (cpmk.assessmentCriterias || []).map((c) => ({
      id: c.id, name: c.name || "-", maxScore: c.maxScore || 0,
    }));
    return {
      id: cpmk.id, 
      code: cpmk.code, 
      description: cpmk.description,
      name: cpmk.description || cpmk.code,
      maxScore: criteria.reduce((sum, c) => sum + c.maxScore, 0),
      criteria
    };
  });

  return {
    seminar: {
      id: seminar.id, status: effectiveStatus, finalScore: seminar.finalScore,
      grade: mapScoreToGrade(seminar.finalScore), resultFinalizedAt: seminar.resultFinalizedAt,
      revisionFinalizedAt: seminar.revisionFinalizedAt,
      studentName: seminar.thesis?.student?.user?.fullName || "-",
      studentNim: seminar.thesis?.student?.user?.identityNumber || "-",
      thesisTitle: seminar.thesis?.title || "-",
    },
    supervisor: { 
      roleName: mySupervisor?.role?.name || "Pembimbing", 
      canFinalize: isSupervisor && effectiveStatus === "ongoing" && !seminar.resultFinalizedAt 
    },
    examiners: examiners.map((item) => {
      const detailsByGroup = {};
      (item.thesisSeminarExaminerAssessmentDetails || []).forEach((d) => {
        const cpmk = d.criteria?.cpmk;
        if (!cpmk) return;
        if (!detailsByGroup[cpmk.id]) detailsByGroup[cpmk.id] = { id: cpmk.id, code: cpmk.code, description: cpmk.description, criteria: [] };
        detailsByGroup[cpmk.id].criteria.push({ id: d.criteria.id, name: d.criteria.name, maxScore: d.criteria.maxScore, score: d.score, displayOrder: d.criteria.displayOrder });
      });
      Object.values(detailsByGroup).forEach((g) => g.criteria.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)));
      return {
        id: item.id, lecturerId: item.lecturerId,
        lecturerName: (seminar.examiners || []).find((x) => x.lecturerId === item.lecturerId)?.lecturerName || "-",
        order: item.order, assessmentScore: item.assessmentScore, revisionNotes: item.revisionNotes,
        assessmentSubmittedAt: item.assessmentSubmittedAt,
        assessmentDetails: Object.values(detailsByGroup).sort((a, b) => (a.code || "").localeCompare(b.code || "")),
      };
    }),
    allExaminerSubmitted: allSubmitted, averageScore: avgScore, averageGrade: avgScore !== null ? mapScoreToGrade(avgScore) : null,
    recommendationUnlocked: allSubmitted,
    criteriaGroups,
  };
}

// ============================================================
// PUBLIC: Finalize Seminar Result (Supervisor)
// ============================================================

export async function finalizeSeminar(seminarId, lecturerId, payload) {
  const { recommendRevision } = payload;
  const seminar = await coreRepo.findSeminarById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);
  if (seminar.resultFinalizedAt) throwError("Hasil seminar sudah pernah ditetapkan.", 400);

  const supervisorRelation = await coreRepo.findSeminarSupervisorRole(seminarId, lecturerId);
  if (!resolveSupervisorMembership(supervisorRelation)) {
    throwError("Anda bukan dosen pembimbing pada seminar ini.", 403);
  }

  const effectiveStatus = computeEffectiveStatus(seminar.status, seminar.date, seminar.startTime, seminar.endTime);
  if (effectiveStatus !== "ongoing") throwError("Penetapan hasil hanya dapat dilakukan saat seminar berstatus sedang berlangsung.", 400);

  const examiners = await examinerRepo.findActiveExaminersWithAssessments(seminarId);
  const allSubmitted = examiners.length >= 2 && examiners.every((e) => !!e.assessmentSubmittedAt && e.assessmentScore !== null);
  if (!allSubmitted) throwError("Penetapan hasil dikunci sampai seluruh penguji submit nilai.", 400);

  const avgScore = examiners.reduce((s, e) => s + (e.assessmentScore || 0), 0) / examiners.length;

  // Determine status based on business rules
  let targetStatus = "passed";
  if (avgScore < 55) {
    targetStatus = "failed";
  } else if (recommendRevision) {
    targetStatus = "passed_with_revision";
  }

  const finalized = await coreRepo.updateSeminar(seminarId, {
    status: targetStatus,
    finalScore: avgScore,
    resultFinalizedAt: new Date(),
  });

  // If failed, reset seminarReady so student can re-register
  if (targetStatus === "failed" && seminar.thesisId) {
    await prisma.thesisSupervisors.updateMany({ where: { thesisId: seminar.thesisId }, data: { seminarReady: false } });
  }

  return { 
    seminarId: finalized.id, 
    status: finalized.status, 
    finalScore: finalized.finalScore, 
    grade: mapScoreToGrade(avgScore), 
    resultFinalizedAt: finalized.resultFinalizedAt 
  };
}
