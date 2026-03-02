import { getStudentByUserId } from "../../repositories/thesisGuidance/student.guidance.repository.js";
import {
  getStudentThesisWithSeminarInfo,
  countSeminarAttendance,
  getSeminarAttendanceHistory,
  getAllAnnouncedSeminars,
  findAudienceRegistration,
  createAudienceRegistration,
  deleteAudienceRegistration,
} from "../../repositories/thesisSeminar/studentSeminar.repository.js";
import prisma from "../../config/prisma.js";
import { ENV } from "../../config/env.js";

const MIN_BIMBINGAN = ENV.SEMINAR_MIN_BIMBINGAN;
const MIN_KEHADIRAN_SEMINAR = ENV.SEMINAR_MIN_KEHADIRAN;

/**
 * Get student seminar overview: checklist, status, documents
 */
export async function getStudentSeminarOverview(userId) {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }
  const studentId = student.id;

  const thesis = await getStudentThesisWithSeminarInfo(studentId);
  if (!thesis) {
    const err = new Error("Anda belum memiliki tugas akhir yang terdaftar.");
    err.statusCode = 404;
    throw err;
  }

  // Use data from the thesis query directly (repo already includes guidances & supervisors)
  const completedGuidances = thesis.thesisGuidances?.length ?? 0;
  const seminarAttendance = await countSeminarAttendance(studentId);
  const supervisorReadiness = thesis.thesisSupervisors || [];

  // Build checklist
  const allSupervisorsReady =
    supervisorReadiness.length > 0 &&
    supervisorReadiness.every((s) => s.seminarReady);

  const checklist = {
    bimbingan: {
      met: completedGuidances >= MIN_BIMBINGAN,
      current: completedGuidances,
      required: MIN_BIMBINGAN,
      label: `${MIN_BIMBINGAN} Bimbingan`,
    },
    kehadiran: {
      met: seminarAttendance >= MIN_KEHADIRAN_SEMINAR,
      current: seminarAttendance,
      required: MIN_KEHADIRAN_SEMINAR,
      label: `${MIN_KEHADIRAN_SEMINAR} Kehadiran Seminar`,
    },
    pembimbing: {
      met: allSupervisorsReady,
      label: "Persetujuan Dosen Pembimbing",
      supervisors: supervisorReadiness.map((s) => ({
        name: s.lecturer?.user?.fullName || "-",
        role: s.role?.name || "-",
        ready: s.seminarReady,
      })),
    },
  };

  const allChecklistMet =
    checklist.bimbingan.met &&
    checklist.kehadiran.met &&
    checklist.pembimbing.met;

  // Current seminar (latest)
  const currentSeminar = thesis.thesisSeminars?.[0] || null;

  return {
    thesisId: thesis.id,
    thesisTitle: thesis.title,
    checklist,
    allChecklistMet,
    seminar: currentSeminar
      ? {
          id: currentSeminar.id,
          status: currentSeminar.status,
          registeredAt: currentSeminar.registeredAt,
          date: currentSeminar.date,
          startTime: currentSeminar.startTime,
          endTime: currentSeminar.endTime,
          meetingLink: currentSeminar.meetingLink,
          finalScore: currentSeminar.finalScore,
          grade: currentSeminar.grade,
          resultFinalizedAt: currentSeminar.resultFinalizedAt,
          cancelledReason: currentSeminar.cancelledReason,
          room: currentSeminar.room,
          documents: currentSeminar.documents,
          examiners: currentSeminar.examiners,
        }
      : null,
  };
}

/**
 * Get all seminar announcements (scheduled/passed seminars) for a student,
 * including whether the student has registered as audience.
 */
export async function getSeminarAnnouncements(userId) {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }
  const studentId = student.id;

  // Get student's own thesis/seminar id(s) to prevent self-registration
  const ownThesis = await prisma.thesis.findFirst({
    where: { studentId },
    select: { thesisSeminars: { select: { id: true } } },
  });
  const ownSeminarIds = new Set((ownThesis?.thesisSeminars || []).map((s) => s.id));

  const seminars = await getAllAnnouncedSeminars(studentId);

  // Batch-lookup examiner lecturer names (ThesisSeminarExaminer has no direct Prisma relation)
  const allLecturerIds = [
    ...new Set(
      seminars.flatMap((s) => (s.examiners || []).map((e) => e.lecturerId).filter(Boolean))
    ),
  ];
  const lecturerMap = new Map();
  if (allLecturerIds.length > 0) {
    const lecturers = await prisma.lecturer.findMany({
      where: { id: { in: allLecturerIds } },
      select: { id: true, user: { select: { fullName: true } } },
    });
    for (const l of lecturers) {
      lecturerMap.set(l.id, l.user?.fullName || "-");
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return seminars.map((s) => {
    const seminarDate = s.date ? new Date(s.date) : null;
    if (seminarDate) seminarDate.setHours(0, 0, 0, 0);
    const isPast = seminarDate ? seminarDate < today : false;
    const isOwn = ownSeminarIds.has(s.id);
    const audienceRecord = s.audiences?.[0] || null;
    const isRegistered = !!audienceRecord;

    return {
      id: s.id,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status,
      meetingLink: s.meetingLink,
      room: s.room,
      thesisTitle: s.thesis?.title || "-",
      presenterName: s.thesis?.student?.user?.fullName || "-",
      presenterStudentId: s.thesis?.student?.id || null,
      supervisors: (s.thesis?.thesisSupervisors || []).map((ts) => ({
        role: ts.role?.name || "-",
        name: ts.lecturer?.user?.fullName || "-",
      })),
      examiners: (s.examiners || []).map((e) => ({
        order: e.order,
        name: lecturerMap.get(e.lecturerId) || "-",
      })),
      isOwn,
      isPast,
      isRegistered,
      isPresent: audienceRecord?.isPresent || false,
      registeredAt: audienceRecord?.registeredAt || null,
    };
  });
}

/**
 * Register the current student as an audience for a seminar
 */
export async function registerToSeminar(userId, seminarId) {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }
  const studentId = student.id;

  // Check seminar exists and is scheduleable (not cancelled/own)
  const seminar = await prisma.thesisSeminar.findUnique({
    where: { id: seminarId },
    select: {
      id: true,
      status: true,
      date: true,
      thesis: { select: { student: { select: { id: true } } } },
    },
  });
  if (!seminar) {
    const err = new Error("Seminar tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }
  if (seminar.thesis?.student?.id === studentId) {
    const err = new Error("Anda tidak dapat mendaftar pada seminar milik sendiri.");
    err.statusCode = 400;
    throw err;
  }
  if (seminar.status !== "scheduled") {
    const err = new Error("Seminar ini tidak lagi membuka pendaftaran kehadiran.");
    err.statusCode = 400;
    throw err;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const seminarDate = seminar.date ? new Date(seminar.date) : null;
  if (seminarDate) seminarDate.setHours(0, 0, 0, 0);
  if (seminarDate && seminarDate < today) {
    const err = new Error("Seminar ini sudah berlangsung.");
    err.statusCode = 400;
    throw err;
  }

  const existing = await findAudienceRegistration(seminarId, studentId);
  if (existing) {
    const err = new Error("Anda sudah terdaftar sebagai peserta seminar ini.");
    err.statusCode = 409;
    throw err;
  }

  await createAudienceRegistration(seminarId, studentId);
  return { message: "Berhasil mendaftar sebagai peserta seminar." };
}

/**
 * Cancel the current student's audience registration from a seminar
 */
export async function cancelSeminarRegistration(userId, seminarId) {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }
  const studentId = student.id;

  const existing = await findAudienceRegistration(seminarId, studentId);
  if (!existing) {
    const err = new Error("Anda belum terdaftar sebagai peserta seminar ini.");
    err.statusCode = 404;
    throw err;
  }

  await deleteAudienceRegistration(seminarId, studentId);
  return { message: "Pendaftaran berhasil dibatalkan." };
}

/**
 * Get student seminar attendance history
 */
export async function getStudentAttendanceHistory(userId) {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }
  const studentId = student.id;

  const records = await getSeminarAttendanceHistory(studentId);

  const attendedCount = records.filter((r) => r.isPresent).length;
  const totalCount = records.length;

  return {
    summary: {
      attended: attendedCount,
      total: totalCount,
      required: MIN_KEHADIRAN_SEMINAR,
      met: attendedCount >= MIN_KEHADIRAN_SEMINAR,
    },
    records: records.map((r) => ({
      seminarId: r.thesisSeminarId,
      presenterName: r.seminar?.thesis?.student?.user?.fullName || "-",
      thesisTitle: r.seminar?.thesis?.title || "-",
      date: r.seminar?.date,
      isPresent: r.isPresent,
      approvedAt: r.approvedAt,
      approvedBy: r.supervisor?.lecturer?.user?.fullName || null,
    })),
  };
}
