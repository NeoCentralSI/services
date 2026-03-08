import { getStudentByUserId } from "../../repositories/thesisGuidance/student.guidance.repository.js";
import { computeEffectiveStatus } from "../../utils/seminarStatus.util.js";
import {
  getStudentThesisWithSeminarInfo,
  countSeminarAttendance,
  getSeminarAttendanceHistory,
  getAllAnnouncedSeminars,
  findAudienceRegistration,
  createAudienceRegistration,
  deleteAudienceRegistration,
  getStudentSeminarRevisions,
  createStudentRevision,
  findRevisionById,
  submitRevisionAction,
  getAllStudentSeminars,
  findStudentSeminarDetail,
  getSeminarAudiences,
} from "../../repositories/thesisSeminar/studentSeminar.repository.js";
import {
  findActiveExaminersWithAssessments,
} from "../../repositories/thesisSeminar/lecturerSeminar.repository.js";
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

  // Resolve examiner lecturer names
  let enrichedExaminers = [];
  if (currentSeminar?.examiners?.length) {
    const examinerLecturerIds = [
      ...new Set(currentSeminar.examiners.map((e) => e.lecturerId).filter(Boolean)),
    ];
    const lecturerMap = new Map();
    if (examinerLecturerIds.length > 0) {
      const lecturers = await prisma.lecturer.findMany({
        where: { id: { in: examinerLecturerIds } },
        select: { id: true, user: { select: { fullName: true } } },
      });
      for (const l of lecturers) {
        lecturerMap.set(l.id, l.user?.fullName || "-");
      }
    }
    enrichedExaminers = currentSeminar.examiners.map((e) => ({
      ...e,
      lecturerName: lecturerMap.get(e.lecturerId) || "-",
    }));
  }

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
          examiners: enrichedExaminers,
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
      status: computeEffectiveStatus(s.status, s.date, s.startTime, s.endTime),
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

// ============================================================
// Student Revision
// ============================================================

/**
 * Get revisions for the student's current seminar.
 */
export async function getStudentRevisions(userId) {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const thesis = await getStudentThesisWithSeminarInfo(student.id);
  if (!thesis) {
    const err = new Error("Anda belum memiliki tugas akhir yang terdaftar.");
    err.statusCode = 404;
    throw err;
  }

  const seminar = thesis.thesisSeminars?.[0];
  if (!seminar) {
    const err = new Error("Anda belum memiliki seminar.");
    err.statusCode = 404;
    throw err;
  }

  if (seminar.status !== "passed_with_revision") {
    const err = new Error("Revisi hanya tersedia untuk seminar berstatus lulus dengan revisi.");
    err.statusCode = 400;
    throw err;
  }

  const revisions = await getStudentSeminarRevisions(seminar.id);

  // Get examiner names
  const lecturerIds = [...new Set(revisions.map((r) => r.seminarExaminer?.lecturerId).filter(Boolean))];
  const lecturerMap = new Map();
  if (lecturerIds.length > 0) {
    const lecturers = await prisma.lecturer.findMany({
      where: { id: { in: lecturerIds } },
      select: { id: true, user: { select: { fullName: true } } },
    });
    for (const l of lecturers) {
      lecturerMap.set(l.id, l.user?.fullName || "-");
    }
  }

  // Get examiner revision notes
  const examiners = seminar.examiners || [];
  const examinerNotes = [];
  for (const ex of examiners) {
    if (ex.revisionNotes) {
      examinerNotes.push({
        examinerOrder: ex.order,
        lecturerName: lecturerMap.get(ex.lecturerId) || "-",
        revisionNotes: ex.revisionNotes,
      });
    }
  }

  const totalRevisions = revisions.length;
  const finishedRevisions = revisions.filter((r) => r.isFinished).length;
  const pendingApproval = revisions.filter((r) => r.studentSubmittedAt && !r.isFinished).length;

  return {
    seminarId: seminar.id,
    examinerNotes,
    summary: {
      total: totalRevisions,
      finished: finishedRevisions,
      pendingApproval,
    },
    revisions: revisions.map((item) => ({
      id: item.id,
      examinerOrder: item.seminarExaminer?.order || null,
      examinerLecturerId: item.seminarExaminer?.lecturerId || null,
      examinerName: lecturerMap.get(item.seminarExaminer?.lecturerId) || "-",
      description: item.description,
      revisionAction: item.revisionAction,
      isFinished: item.isFinished,
      studentSubmittedAt: item.studentSubmittedAt,
      supervisorApprovedAt: item.supervisorApprovedAt,
      approvedBySupervisorName: item.supervisor?.lecturer?.user?.fullName || null,
    })),
  };
}

/**
 * Create a new revision item by student.
 */
export async function createStudentRevisionItem(userId, body) {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const thesis = await getStudentThesisWithSeminarInfo(student.id);
  if (!thesis) {
    const err = new Error("Anda belum memiliki tugas akhir.");
    err.statusCode = 404;
    throw err;
  }

  const seminar = thesis.thesisSeminars?.[0];
  if (!seminar || seminar.status !== "passed_with_revision") {
    const err = new Error("Revisi hanya tersedia untuk seminar berstatus lulus dengan revisi.");
    err.statusCode = 400;
    throw err;
  }

  // Validate seminarExaminerId belongs to this seminar
  const validExaminer = seminar.examiners.find((e) => e.id === body.seminarExaminerId);
  if (!validExaminer) {
    const err = new Error("Penguji tidak ditemukan pada seminar ini.");
    err.statusCode = 400;
    throw err;
  }

  const revision = await createStudentRevision({
    seminarExaminerId: body.seminarExaminerId,
    description: body.description,
  });

  return {
    id: revision.id,
    seminarExaminerId: revision.seminarExaminerId,
    description: revision.description,
  };
}

/**
 * Submit revision action by student.
 */
export async function submitStudentRevisionAction(userId, revisionId, body) {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const revision = await findRevisionById(revisionId);
  if (!revision) {
    const err = new Error("Item revisi tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  // Verify student owns this seminar
  const seminar = revision.seminarExaminer?.seminar;
  if (!seminar || seminar.thesis?.studentId !== student.id) {
    const err = new Error("Anda tidak memiliki akses ke revisi ini.");
    err.statusCode = 403;
    throw err;
  }

  if (seminar.status !== "passed_with_revision") {
    const err = new Error("Revisi hanya tersedia untuk seminar berstatus lulus dengan revisi.");
    err.statusCode = 400;
    throw err;
  }

  if (revision.isFinished) {
    const err = new Error("Revisi ini sudah disetujui dan tidak dapat diubah.");
    err.statusCode = 400;
    throw err;
  }

  const updated = await submitRevisionAction(revisionId, body.revisionAction);

  return {
    id: updated.id,
    revisionAction: updated.revisionAction,
    studentSubmittedAt: updated.studentSubmittedAt,
  };
}

/**
 * Get seminar history for student.
 */
export async function getStudentSeminarHistory(userId) {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const seminars = await getAllStudentSeminars(student.id);

  // Get examiner lecturer names
  const allLecturerIds = [...new Set(seminars.flatMap((s) => s.examiners.map((e) => e.lecturerId).filter(Boolean)))];
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

  return seminars.map((s) => ({
    id: s.id,
    status: s.status,
    registeredAt: s.registeredAt,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    meetingLink: s.meetingLink,
    finalScore: s.finalScore,
    grade: s.grade,
    resultFinalizedAt: s.resultFinalizedAt,
    cancelledReason: s.cancelledReason,
    room: s.room,
    examiners: s.examiners.map((e) => ({
      order: e.order,
      lecturerName: lecturerMap.get(e.lecturerId) || "-",
      assessmentScore: e.assessmentScore,
    })),
  }));
}

// ============================================================
// Student Seminar Detail (for history detail page)
// ============================================================

/**
 * Get detailed info about a specific seminar for the student.
 */
export async function getStudentSeminarDetail(userId, seminarId) {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const seminar = await findStudentSeminarDetail(seminarId);
  if (!seminar) {
    const err = new Error("Seminar tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  // Verify student owns this seminar
  if (seminar.thesis?.studentId !== student.id) {
    const err = new Error("Anda tidak memiliki akses ke seminar ini.");
    err.statusCode = 403;
    throw err;
  }

  // Get lecturer names for examiners
  const lecturerIds = [...new Set(seminar.examiners.map((e) => e.lecturerId).filter(Boolean))];
  const lecturerMap = new Map();
  if (lecturerIds.length > 0) {
    const lecturers = await prisma.lecturer.findMany({
      where: { id: { in: lecturerIds } },
      select: { id: true, user: { select: { fullName: true } } },
    });
    for (const l of lecturers) {
      lecturerMap.set(l.id, l.user?.fullName || "-");
    }
  }

  // Get document type names
  const { getSeminarDocumentTypes } = await import("../../repositories/thesisSeminar/seminarDocument.repository.js");
  const docTypes = await getSeminarDocumentTypes();

  // Manually join Document data for fileName
  const docIds = seminar.documents.map((d) => d.documentId).filter(Boolean);
  const docFiles = docIds.length
    ? await prisma.document.findMany({
        where: { id: { in: docIds } },
        select: { id: true, fileName: true, filePath: true },
      })
    : [];
  const docFileMap = new Map(docFiles.map((d) => [d.id, { fileName: d.fileName, filePath: d.filePath }]));

  // Build examiner notes (for revision notes)
  const examinerNotes = seminar.examiners
    .filter((e) => e.revisionNotes)
    .map((e) => ({
      examinerOrder: e.order,
      lecturerName: lecturerMap.get(e.lecturerId) || "-",
      revisionNotes: e.revisionNotes,
    }));

  // Get revisions if passed_with_revision
  let revisions = [];
  let revisionSummary = { total: 0, finished: 0, pendingApproval: 0 };
  if (seminar.status === "passed_with_revision") {
    const revisionData = await getStudentSeminarRevisions(seminarId);
    revisions = revisionData.map((item) => ({
      id: item.id,
      examinerOrder: item.seminarExaminer?.order || null,
      examinerLecturerId: item.seminarExaminer?.lecturerId || null,
      examinerName: lecturerMap.get(item.seminarExaminer?.lecturerId) || "-",
      description: item.description,
      revisionAction: item.revisionAction,
      isFinished: item.isFinished,
      studentSubmittedAt: item.studentSubmittedAt,
      supervisorApprovedAt: item.supervisorApprovedAt,
      approvedBySupervisorName: item.supervisor?.lecturer?.user?.fullName || null,
    }));
    revisionSummary = {
      total: revisions.length,
      finished: revisions.filter((r) => r.isFinished).length,
      pendingApproval: revisions.filter((r) => r.studentSubmittedAt && !r.isFinished).length,
    };
  }

  return {
    id: seminar.id,
    status: seminar.status,
    registeredAt: seminar.registeredAt,
    date: seminar.date,
    startTime: seminar.startTime,
    endTime: seminar.endTime,
    meetingLink: seminar.meetingLink,
    finalScore: seminar.finalScore,
    grade: seminar.grade,
    resultFinalizedAt: seminar.resultFinalizedAt,
    cancelledReason: seminar.cancelledReason,
    room: seminar.room,
    thesis: {
      id: seminar.thesis.id,
      title: seminar.thesis.title,
      supervisors: (seminar.thesis.thesisSupervisors || []).map((s) => ({
        role: s.role?.name || "-",
        lecturerName: s.lecturer?.user?.fullName || "-",
      })),
    },
    examiners: seminar.examiners.map((e) => ({
      id: e.id,
      order: e.order,
      lecturerName: lecturerMap.get(e.lecturerId) || "-",
      assessmentScore: e.assessmentScore,
      assessmentSubmittedAt: e.assessmentSubmittedAt,
    })),
    documents: seminar.documents.map((d) => {
      const dt = docTypes.find((t) => t.id === d.documentTypeId);
      const docFile = docFileMap.get(d.documentId);
      return {
        documentTypeId: d.documentTypeId,
        documentTypeName: dt?.name || "-",
        fileName: docFile?.fileName || null,
        filePath: docFile?.filePath || null,
        status: d.status,
        submittedAt: d.submittedAt,
        verifiedAt: d.verifiedAt,
        notes: d.notes,
      };
    }),
    examinerNotes,
    revisions,
    revisionSummary,
    audiences: (seminar.audiences || []).map((a) => ({
      studentName: a.student?.user?.fullName || "-",
      nim: a.student?.user?.identityNumber || "-",
      registeredAt: a.registeredAt,
      isPresent: a.isPresent,
      approvedAt: a.approvedAt,
      approvedByName: a.supervisor?.lecturer?.user?.fullName || null,
    })),
  };
}

// ============================================================
// Student Assessment View (read-only rubric view)
// ============================================================

function mapScoreToGrade(score) {
  if (score >= 85) return "A";
  if (score >= 80) return "AB";
  if (score >= 75) return "B";
  if (score >= 70) return "BC";
  if (score >= 65) return "C";
  if (score >= 60) return "D";
  return "E";
}

/**
 * Get assessment/rubric data for a student's seminar (read-only).
 * Similar to supervisor finalization data but student-accessible.
 */
export async function getStudentSeminarAssessment(userId, seminarId) {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const seminar = await findStudentSeminarDetail(seminarId);
  if (!seminar) {
    const err = new Error("Seminar tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  if (seminar.thesis?.studentId !== student.id) {
    const err = new Error("Anda tidak memiliki akses ke seminar ini.");
    err.statusCode = 403;
    throw err;
  }

  // Get examiner names
  const lecturerIds = [...new Set(seminar.examiners.map((e) => e.lecturerId).filter(Boolean))];
  const lecturerMap = new Map();
  if (lecturerIds.length > 0) {
    const lecturers = await prisma.lecturer.findMany({
      where: { id: { in: lecturerIds } },
      select: { id: true, user: { select: { fullName: true } } },
    });
    for (const l of lecturers) {
      lecturerMap.set(l.id, l.user?.fullName || "-");
    }
  }

  const examiners = await findActiveExaminersWithAssessments(seminarId);
  const allExaminerSubmitted =
    examiners.length >= 2 &&
    examiners.every((item) => !!item.assessmentSubmittedAt && item.assessmentScore !== null);

  const averageScore = allExaminerSubmitted
    ? examiners.reduce((sum, item) => sum + (item.assessmentScore || 0), 0) / examiners.length
    : null;
  const averageGrade = averageScore !== null ? mapScoreToGrade(averageScore) : null;

  return {
    seminar: {
      id: seminar.id,
      status: seminar.status,
      finalScore: seminar.finalScore ?? null,
      grade: seminar.grade ?? null,
      resultFinalizedAt: seminar.resultFinalizedAt ?? null,
    },
    examiners: examiners.map((item) => {
      const detailsByGroup = {};
      (item.thesisSeminarExaminerAssessmentDetails || []).forEach((d) => {
        const cpmk = d.criteria?.cpmk;
        if (!cpmk) return;
        if (!detailsByGroup[cpmk.id]) {
          detailsByGroup[cpmk.id] = {
            id: cpmk.id,
            code: cpmk.code,
            description: cpmk.description,
            criteria: [],
          };
        }
        detailsByGroup[cpmk.id].criteria.push({
          id: d.criteria.id,
          name: d.criteria.name,
          maxScore: d.criteria.maxScore,
          score: d.score,
          displayOrder: d.criteria.displayOrder,
        });
      });
      Object.values(detailsByGroup).forEach((g) => {
        g.criteria.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
      });

      return {
        id: item.id,
        lecturerId: item.lecturerId,
        lecturerName: lecturerMap.get(item.lecturerId) || "-",
        order: item.order,
        assessmentScore: item.assessmentScore,
        revisionNotes: item.revisionNotes,
        assessmentSubmittedAt: item.assessmentSubmittedAt,
        assessmentDetails: Object.values(detailsByGroup).sort((a, b) =>
          (a.code || "").localeCompare(b.code || "")
        ),
      };
    }),
    allExaminerSubmitted,
    averageScore,
    averageGrade,
  };
}

// ============================================================
// Separated Revision Flow
// ============================================================

/**
 * Save perbaikan text (revisionAction) without submitting.
 */
export async function saveStudentRevisionAction(userId, revisionId, body) {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const revision = await findRevisionById(revisionId);
  if (!revision) {
    const err = new Error("Item revisi tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const seminar = revision.seminarExaminer?.seminar;
  if (!seminar || seminar.thesis?.studentId !== student.id) {
    const err = new Error("Anda tidak memiliki akses ke revisi ini.");
    err.statusCode = 403;
    throw err;
  }

  if (seminar.status !== "passed_with_revision") {
    const err = new Error("Revisi hanya tersedia untuk seminar berstatus lulus dengan revisi.");
    err.statusCode = 400;
    throw err;
  }

  if (revision.isFinished) {
    const err = new Error("Revisi ini sudah disetujui dan tidak dapat diubah.");
    err.statusCode = 400;
    throw err;
  }

  if (revision.studentSubmittedAt) {
    const err = new Error("Perbaikan sudah diajukan. Batalkan pengajuan terlebih dahulu untuk mengedit.");
    err.statusCode = 400;
    throw err;
  }

  const nextDescription =
    typeof body.description === "string" ? body.description.trim() : revision.description;
  const nextAction =
    typeof body.revisionAction === "string"
      ? body.revisionAction.trim()
      : revision.revisionAction;

  const updated = await prisma.thesisSeminarRevision.update({
    where: { id: revisionId },
    data: {
      description: nextDescription,
      revisionAction: nextAction,
    },
  });

  return {
    id: updated.id,
    description: updated.description,
    revisionAction: updated.revisionAction,
  };
}

/**
 * Submit revision (set studentSubmittedAt) - separate from saving perbaikan.
 */
export async function submitStudentRevision(userId, revisionId) {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const revision = await findRevisionById(revisionId);
  if (!revision) {
    const err = new Error("Item revisi tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const seminar = revision.seminarExaminer?.seminar;
  if (!seminar || seminar.thesis?.studentId !== student.id) {
    const err = new Error("Anda tidak memiliki akses ke revisi ini.");
    err.statusCode = 403;
    throw err;
  }

  if (seminar.status !== "passed_with_revision") {
    const err = new Error("Revisi hanya tersedia untuk seminar berstatus lulus dengan revisi.");
    err.statusCode = 400;
    throw err;
  }

  if (revision.isFinished) {
    const err = new Error("Revisi ini sudah disetujui.");
    err.statusCode = 400;
    throw err;
  }

  if (revision.studentSubmittedAt) {
    const err = new Error("Revisi ini sudah diajukan.");
    err.statusCode = 400;
    throw err;
  }

  if (!revision.revisionAction) {
    const err = new Error("Isi perbaikan terlebih dahulu sebelum mengajukan.");
    err.statusCode = 400;
    throw err;
  }

  const updated = await prisma.thesisSeminarRevision.update({
    where: { id: revisionId },
    data: { studentSubmittedAt: new Date() },
  });

  return {
    id: updated.id,
    studentSubmittedAt: updated.studentSubmittedAt,
  };
}

/**
 * Cancel revision submission (clear studentSubmittedAt).
 */
export async function cancelStudentRevisionSubmission(userId, revisionId) {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const revision = await findRevisionById(revisionId);
  if (!revision) {
    const err = new Error("Item revisi tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const seminar = revision.seminarExaminer?.seminar;
  if (!seminar || seminar.thesis?.studentId !== student.id) {
    const err = new Error("Anda tidak memiliki akses ke revisi ini.");
    err.statusCode = 403;
    throw err;
  }

  if (revision.isFinished) {
    const err = new Error("Revisi yang sudah disetujui tidak dapat dibatalkan.");
    err.statusCode = 400;
    throw err;
  }

  if (!revision.studentSubmittedAt) {
    const err = new Error("Revisi ini belum diajukan.");
    err.statusCode = 400;
    throw err;
  }

  const updated = await prisma.thesisSeminarRevision.update({
    where: { id: revisionId },
    data: { studentSubmittedAt: null },
  });

  return {
    id: updated.id,
    studentSubmittedAt: updated.studentSubmittedAt,
  };
}

/**
 * Delete revision item while still in draft (before submit).
 */
export async function deleteStudentRevision(userId, revisionId) {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Data mahasiswa tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const revision = await findRevisionById(revisionId);
  if (!revision) {
    const err = new Error("Item revisi tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const seminar = revision.seminarExaminer?.seminar;
  if (!seminar || seminar.thesis?.studentId !== student.id) {
    const err = new Error("Anda tidak memiliki akses ke revisi ini.");
    err.statusCode = 403;
    throw err;
  }

  if (seminar.status !== "passed_with_revision") {
    const err = new Error("Revisi hanya tersedia untuk seminar berstatus lulus dengan revisi.");
    err.statusCode = 400;
    throw err;
  }

  if (revision.isFinished) {
    const err = new Error("Revisi yang sudah disetujui tidak dapat dihapus.");
    err.statusCode = 400;
    throw err;
  }

  if (revision.studentSubmittedAt) {
    const err = new Error("Revisi yang sudah diajukan tidak dapat dihapus.");
    err.statusCode = 400;
    throw err;
  }

  const deleted = await prisma.thesisSeminarRevision.delete({
    where: { id: revisionId },
  });

  return { id: deleted.id };
}
