import { getStudentByUserId } from "../../repositories/thesisGuidance/student.guidance.repository.js";
import {
  getStudentThesisWithSeminarInfo,
  countSeminarAttendance,
  getSeminarAttendanceHistory,
} from "../../repositories/thesisGuidance/studentSeminar.repository.js";

const MIN_BIMBINGAN = 8;
const MIN_KEHADIRAN_SEMINAR = 8;

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
