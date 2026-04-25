import {
  findAllSeminars,
  findSeminarById,
  updateDocumentStatus,
  countDocumentsByStatus,
  updateSeminarStatus,
  findDocumentWithFile,
  findLecturerAvailabilitiesByLecturerIds,
  findAllRooms,
  findRoomScheduleConflict,
  updateSeminarSchedule,
  countAudienceLinks,
  countSeminarResults,
  createSeminarResultAudienceLinks,
  createSeminarResultWithExaminers,
  deleteSeminarResultAudienceLinkById,
  deleteSeminarResultById,
  findAudienceLinksPaginated,
  findExistingAudienceLinks,
  findLecturersByIds,
  findLecturersForSeminarOptions,
  findRoomById,
  findSeminarResultBasicById,
  findSeminarResultByIdForArchive,
  findSeminarResultByIdForArchiveDetail,
  findSeminarResultByThesisId,
  findSeminarResultByThesisIdExcludingId,
  findSeminarResultsPaginated,
  findSeminarsByIdsForAudience,
  findSeminarsForThesisResultOptions,
  findStudentById,
  findStudentsForSeminarResultOptions,
  findThesesForSeminarResultOptions,
  findThesisById,
  findThesisSupervisorsByThesisId,
  updateSeminarResultWithExaminers,
  findAllSeminarResultsForExport,
  findStudentByNim,
  findActiveThesisByStudentId,
  findRoomByNameLike,
  findLecturerByNameLike,
} from "../../repositories/thesis-seminar/admin.repository.js";
import * as xlsx from "xlsx";
import { getSeminarDocumentTypes } from "../../repositories/thesis-seminar/document.repository.js";
import { getSeminarAudiences } from "../../repositories/thesis-seminar/student.repository.js";
import { computeEffectiveStatus } from "../../utils/seminarStatus.util.js";

// ============================================================
// Status priority for admin-focused sorting
// ============================================================
const STATUS_PRIORITY = {
  registered: 0, // "Menunggu Validasi" – admin's top priority
  examiner_assigned: 1, // "Menunggu Jadwal" – admin schedules
  verified: 2, // "Menunggu Penetapan Dosen Penguji" – kadep's task
  scheduled: 3,
  passed: 4,
  passed_with_revision: 4,
  failed: 4,
  cancelled: 4,
};

const SEMINAR_RESULT_ALLOWED_STATUSES = ["passed", "passed_with_revision", "failed"];

// ============================================================
// PUBLIC SERVICE FUNCTIONS
// ============================================================

/**
 * Get all seminars formatted for admin table
 */
export async function getAdminSeminarList({ search, status } = {}) {
  const seminars = await findAllSeminars({ search, status });

  // Get document types so we know how many docs are expected (3)
  const docTypes = await getSeminarDocumentTypes();
  const totalDocTypes = docTypes.length; // should be 3

  const mapped = seminars.map((s) => {
    const student = s.thesis?.student;
    const supervisors = (s.thesis?.thesisSupervisors || []).map((ts) => ({
      name: ts.lecturer?.user?.fullName || "-",
      role: ts.role?.name || "-",
    }));

    // Document status summary
    const approvedCount = s.documents.filter(
      (d) => d.status === "approved"
    ).length;
    const submittedCount = s.documents.filter(
      (d) => d.status === "submitted"
    ).length;
    const declinedCount = s.documents.filter(
      (d) => d.status === "declined"
    ).length;

    return {
      id: s.id,
      thesisId: s.thesis?.id || null,
      studentName: student?.user?.fullName || "-",
      studentNim: student?.user?.identityNumber || "-",
      thesisTitle: s.thesis?.title || "-",
      supervisors,
      status: computeEffectiveStatus(s.status, s.date, s.startTime, s.endTime),
      registeredAt: s.registeredAt,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      documentSummary: {
        total: totalDocTypes,
        submitted: submittedCount,
        approved: approvedCount,
        declined: declinedCount,
      },
    };
  });

  // Sort by status priority, then by registeredAt (oldest first within same priority)
  mapped.sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 99;
    const pb = STATUS_PRIORITY[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    // Within same priority, oldest first (waiting longest = more urgent)
    const dateA = a.registeredAt ? new Date(a.registeredAt).getTime() : 0;
    const dateB = b.registeredAt ? new Date(b.registeredAt).getTime() : 0;
    return dateA - dateB;
  });

  return mapped;
}

/**
 * Get detailed seminar info for admin
 */
export async function getAdminSeminarDetail(seminarId) {
  const seminar = await findSeminarById(seminarId);
  if (!seminar) {
    const err = new Error("Seminar tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const student = seminar.thesis?.student;
  const supervisors = (seminar.thesis?.thesisSupervisors || []).map((ts) => ({
    name: ts.lecturer?.user?.fullName || "-",
    role: ts.role?.name || "-",
  }));

  // Map documents with file info
  const documents = await Promise.all(
    (seminar.documents || []).map(async (d) => {
      const withFile = await findDocumentWithFile(
        seminar.id,
        d.documentTypeId
      );
      return {
        documentTypeId: d.documentTypeId,
        documentId: d.documentId,
        status: d.status,
        submittedAt: d.submittedAt,
        verifiedAt: d.verifiedAt,
        notes: d.notes,
        verifiedBy: d.verifier?.fullName || null,
        fileName: withFile?.document?.fileName || null,
        filePath: withFile?.document?.filePath || null,
      };
    })
  );

  // Get document types for reference
  const docTypes = await getSeminarDocumentTypes();

  // Get audience data
  const audienceRows = await getSeminarAudiences(seminarId);
  const audiences = audienceRows.map((a) => ({
    studentName: a.student?.user?.fullName || "-",
    nim: a.student?.user?.identityNumber || "-",
    registeredAt: a.registeredAt,
    isPresent: a.isPresent,
    approvedAt: a.approvedAt,
    approvedByName: a.supervisor?.lecturer?.user?.fullName || null,
  }));

  return {
    id: seminar.id,
    status: computeEffectiveStatus(seminar.status, seminar.date, seminar.startTime, seminar.endTime),
    registeredAt: seminar.registeredAt,
    date: seminar.date,
    startTime: seminar.startTime,
    endTime: seminar.endTime,
    meetingLink: seminar.meetingLink,
    finalScore: seminar.finalScore,
    grade: seminar.grade,
    resultFinalizedAt: seminar.resultFinalizedAt,
    cancelledReason: seminar.cancelledReason,
    room: seminar.room
      ? { id: seminar.room.id, name: seminar.room.name }
      : null,
    thesis: {
      id: seminar.thesis?.id,
      title: seminar.thesis?.title,
    },
    student: {
      name: student?.user?.fullName || "-",
      nim: student?.user?.identityNumber || "-",
    },
    supervisors,
    documents,
    documentTypes: docTypes.map((dt) => ({
      id: dt.id,
      name: dt.name,
    })),
    // Active examiners (current: pending/available)
    examiners: (seminar.examiners || [])
      .filter((e) => e.availabilityStatus === "available" || e.availabilityStatus === "pending")
      .map((e) => ({
        id: e.id,
        lecturerName: e.lecturerName || "-",
        order: e.order,
        availabilityStatus: e.availabilityStatus,
      })),
    // Rejected examiners (historical log)
    rejectedExaminers: (seminar.examiners || [])
      .filter((e) => e.availabilityStatus === "unavailable")
      .map((e) => ({
        id: e.id,
        lecturerName: e.lecturerName || "-",
        order: e.order,
        availabilityStatus: e.availabilityStatus,
        respondedAt: e.respondedAt,
        assignedAt: e.assignedAt,
      })),
    audiences,
  };
}

/**
 * Validate (approve/decline) a seminar document
 * Auto-transitions seminar to 'verified' when all 3 docs are approved
 */
export async function validateSeminarDocument(
  seminarId,
  documentTypeId,
  { action, notes, userId }
) {
  // Validate action
  if (!["approve", "decline"].includes(action)) {
    const err = new Error('Action harus "approve" atau "decline".');
    err.statusCode = 400;
    throw err;
  }

  // Verify seminar exists and is in 'registered' status
  const seminar = await findSeminarById(seminarId);
  if (!seminar) {
    const err = new Error("Seminar tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  if (seminar.status !== "registered") {
    const err = new Error(
      "Validasi dokumen hanya dapat dilakukan saat seminar berstatus 'registered'."
    );
    err.statusCode = 400;
    throw err;
  }

  // Verify the document exists
  const docWithFile = await findDocumentWithFile(seminarId, documentTypeId);
  if (!docWithFile) {
    const err = new Error("Dokumen tidak ditemukan untuk di-validasi.");
    err.statusCode = 404;
    throw err;
  }

  // Update document status
  const newStatus = action === "approve" ? "approved" : "declined";
  await updateDocumentStatus(seminarId, documentTypeId, {
    status: newStatus,
    notes: notes || null,
    verifiedBy: userId,
  });

  // Check if all docs are now approved → auto-transition to 'verified'
  let seminarTransitioned = false;
  if (action === "approve") {
    const allDocs = await countDocumentsByStatus(seminarId);
    const docTypes = await getSeminarDocumentTypes();
    const expectedCount = docTypes.length; // 3

    // Count approved (including the one we just approved)
    const approvedCount = allDocs.filter((d) => {
      if (d.documentTypeId === documentTypeId) return true; // just approved
      return d.status === "approved";
    }).length;

    if (approvedCount >= expectedCount) {
      await updateSeminarStatus(seminarId, "verified");
      seminarTransitioned = true;
    }
  }

  return {
    documentTypeId,
    status: newStatus,
    seminarTransitioned,
    newSeminarStatus: seminarTransitioned ? "verified" : seminar.status,
  };
}

// ============================================================
// SCHEDULING
// ============================================================

/**
 * Get data needed for the scheduling UI:
 * - Lecturer availabilities (supervisors + confirmed examiners)
 * - All rooms
 */
export async function getSchedulingData(seminarId) {
  const seminar = await findSeminarById(seminarId);
  if (!seminar) {
    const err = new Error("Seminar tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  // Collect lecturer ids: only Pembimbing 1 (not Pembimbing 2) + all assigned examiners
  const supervisorIds = (seminar.thesis?.thesisSupervisors || [])
    .filter((ts) => ts.role?.name === "Pembimbing 1")
    .map((ts) => ts.lecturerId)
    .filter(Boolean);

  // Include all assigned examiners regardless of availability confirmation status
  const examinerIds = (seminar.examiners || [])
    .map((e) => e.lecturerId)
    .filter(Boolean);

  const allLecturerIds = [...new Set([...supervisorIds, ...examinerIds])];

  const [availabilities, rooms] = await Promise.all([
    allLecturerIds.length > 0
      ? findLecturerAvailabilitiesByLecturerIds(allLecturerIds)
      : [],
    findAllRooms(),
  ]);

  // Build lecturer name map from seminar data
  const lecturerNameMap = {};
  (seminar.thesis?.thesisSupervisors || []).forEach((ts) => {
    if (ts.lecturerId) {
      lecturerNameMap[ts.lecturerId] = ts.lecturer?.user?.fullName || "-";
    }
  });
  (seminar.examiners || []).forEach((e) => {
    if (e.lecturerId) {
      lecturerNameMap[e.lecturerId] = e.lecturerName || "-";
    }
  });

  // Enrich availabilities with lecturer names
  const enrichedAvailabilities = availabilities.map((a) => ({
    id: a.id,
    lecturerId: a.lecturerId,
    lecturerName: lecturerNameMap[a.lecturerId] || "-",
    day: a.day,
    startTime: a.startTime,
    endTime: a.endTime,
    validFrom: a.validFrom,
    validUntil: a.validUntil,
  }));

  return {
    rooms: rooms.map((r) => ({ id: r.id, name: r.name })),
    lecturerAvailabilities: enrichedAvailabilities,
    currentSchedule: seminar.date
      ? {
          date: seminar.date,
          startTime: seminar.startTime,
          endTime: seminar.endTime,
          meetingLink: seminar.meetingLink,
          isOnline: !seminar.roomId,
          room: seminar.room ? { id: seminar.room.id, name: seminar.room.name } : null,
        }
      : null,
  };
}

/**
 * Schedule (or re-schedule) a seminar
 * Only allowed when status is 'examiner_assigned' or already 'scheduled' (edit)
 */
export async function scheduleSeminar(seminarId, { roomId, date, startTime, endTime, isOnline, meetingLink }) {
  const seminar = await findSeminarById(seminarId);
  if (!seminar) {
    const err = new Error("Seminar tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const allowed = ["examiner_assigned", "scheduled"];
  if (!allowed.includes(seminar.status)) {
    const err = new Error(
      "Penjadwalan hanya dapat dilakukan saat seminar berstatus 'examiner_assigned' atau 'scheduled'."
    );
    err.statusCode = 400;
    throw err;
  }

  if (!isOnline) {
    const conflict = await findRoomScheduleConflict({ seminarId, roomId, date, startTime, endTime });
    if (conflict) {
      const err = new Error(
        "Ruangan sudah digunakan oleh seminar lain pada waktu yang sama."
      );
      err.statusCode = 409;
      throw err;
    }
  }

  await updateSeminarSchedule(seminarId, {
    roomId: isOnline ? null : roomId,
    date,
    startTime,
    endTime,
    meetingLink: isOnline ? meetingLink : null,
  });

  return { seminarId, status: "scheduled" };
}

// ============================================================
// Seminar Result Master (migrated from adminfeatures)
// ============================================================

async function validateSeminarResultExaminers({ thesisId, examinerLecturerIds }) {
  const uniqueLecturerIds = [...new Set(examinerLecturerIds || [])];
  if (uniqueLecturerIds.length < 1) {
    const err = new Error("Minimal 1 dosen penguji harus dipilih");
    err.statusCode = 400;
    throw err;
  }

  const [thesisSupervisors, lecturers] = await Promise.all([
    findThesisSupervisorsByThesisId(thesisId),
    findLecturersByIds(uniqueLecturerIds),
  ]);

  if (lecturers.length !== uniqueLecturerIds.length) {
    const err = new Error("Terdapat dosen penguji yang tidak valid");
    err.statusCode = 400;
    throw err;
  }

  const supervisorSet = new Set(thesisSupervisors.map((s) => s.lecturerId));
  const conflicts = uniqueLecturerIds.filter((id) => supervisorSet.has(id));
  if (conflicts.length > 0) {
    const err = new Error("Dosen pembimbing tidak boleh menjadi dosen penguji");
    err.statusCode = 400;
    throw err;
  }

  return uniqueLecturerIds;
}

async function getSeminarResultArchiveDetailById(seminarId) {
  const seminar = await findSeminarResultByIdForArchive(seminarId);
  if (!seminar) return null;

  const lecturerIds = seminar.examiners.map((e) => e.lecturerId);
  const lecturerMap = new Map();
  if (lecturerIds.length > 0) {
    const lecturers = await findLecturersByIds(lecturerIds);
    lecturers.forEach((l) => lecturerMap.set(l.id, l.user?.fullName || "-"));
  }

  return {
    id: seminar.id,
    thesisId: seminar.thesisId,
    thesisTitle: seminar.thesis?.title || "-",
    student: {
      id: seminar.thesis?.student?.id || null,
      fullName: seminar.thesis?.student?.user?.fullName || "-",
      nim: seminar.thesis?.student?.user?.identityNumber || "-",
    },
    date: seminar.date,
    room: seminar.room,
    status: seminar.status,
    audienceCount: seminar._count.audiences,
    examiners: seminar.examiners.map((e) => ({
      id: e.id,
      lecturerId: e.lecturerId,
      lecturerName: lecturerMap.get(e.lecturerId) || "-",
      order: e.order,
    })),
    createdAt: seminar.createdAt,
    updatedAt: seminar.updatedAt,
  };
}

export async function getSeminarResultThesisOptions() {
  const [theses, seminars] = await Promise.all([
    findThesesForSeminarResultOptions(),
    findSeminarsForThesisResultOptions(),
  ]);

  const seminarByThesis = new Map(seminars.map((s) => [s.thesisId, s.id]));

  return theses.map((t) => ({
    id: t.id,
    title: t.title || "(Tanpa Judul)",
    studentName: t.student?.user?.fullName || "-",
    studentNim: t.student?.user?.identityNumber || "-",
    hasSeminarResult: seminarByThesis.has(t.id),
    seminarResultId: seminarByThesis.get(t.id) || null,
    supervisorIds: (t.thesisSupervisors || []).map((s) => s.lecturerId),
  }));
}

export async function getSeminarResultLecturerOptions() {
  const lecturers = await findLecturersForSeminarOptions();
  return lecturers.map((l) => ({
    id: l.id,
    fullName: l.user?.fullName || "-",
    nip: l.user?.identityNumber || "-",
  }));
}

export async function getSeminarResultStudentOptions() {
  const students = await findStudentsForSeminarResultOptions();
  return students.map((s) => ({
    id: s.id,
    fullName: s.user?.fullName || "-",
    nim: s.user?.identityNumber || "-",
  }));
}

export async function getSeminarResults({ page = 1, pageSize = 10, search = "" } = {}) {
  const skip = (page - 1) * pageSize;
  const take = pageSize;

  const baseWhere = {
    status: { in: ['passed', 'passed_with_revision', 'failed'] },
  };

  const where = search
    ? {
        ...baseWhere,
        OR: [
          { thesis: { title: { contains: search } } },
          { thesis: { student: { user: { fullName: { contains: search } } } } },
          { thesis: { student: { user: { identityNumber: { contains: search } } } } },
        ],
      }
    : baseWhere;

  const [seminars, total] = await Promise.all([
    findSeminarResultsPaginated({ where, skip, take }),
    countSeminarResults(where),
  ]);

  const lecturerIds = seminars.flatMap((s) => s.examiners.map((e) => e.lecturerId));
  const uniqueLecturerIds = [...new Set(lecturerIds)];
  const lecturerMap = new Map();
  if (uniqueLecturerIds.length > 0) {
    const lecturers = await findLecturersByIds(uniqueLecturerIds);
    lecturers.forEach((l) => lecturerMap.set(l.id, l.user?.fullName || "-"));
  }

  return {
    seminars: seminars.map((s) => ({
      id: s.id,
      thesisId: s.thesisId,
      thesisTitle: s.thesis?.title || "-",
      student: {
        id: s.thesis?.student?.id || null,
        fullName: s.thesis?.student?.user?.fullName || "-",
        nim: s.thesis?.student?.user?.identityNumber || "-",
      },
      date: s.date,
      room: s.room,
      status: s.status,
      isEditable: s.registeredAt === null,
      audienceCount: s._count.audiences,
      examiners: s.examiners.map((e) => ({
        id: e.id,
        lecturerId: e.lecturerId,
        lecturerName: lecturerMap.get(e.lecturerId) || "-",
        order: e.order,
      })),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function getSeminarResultDetail(id) {
  const seminar = await findSeminarResultByIdForArchiveDetail(id);
  if (!seminar) {
    const err = new Error("Data seminar hasil tidak ditemukan");
    err.statusCode = 404;
    throw err;
  }

  const lecturerIds = seminar.examiners.map((e) => e.lecturerId);
  const lecturerMap = new Map();
  if (lecturerIds.length > 0) {
    const lecturers = await findLecturersByIds(lecturerIds);
    lecturers.forEach((l) => lecturerMap.set(l.id, l.user?.fullName || "-"));
  }

  return {
    id: seminar.id,
    thesisId: seminar.thesisId,
    thesisTitle: seminar.thesis?.title || "-",
    student: {
      id: seminar.thesis?.student?.id || null,
      fullName: seminar.thesis?.student?.user?.fullName || "-",
      nim: seminar.thesis?.student?.user?.identityNumber || "-",
      email: seminar.thesis?.student?.user?.email || "-",
    },
    date: seminar.date,
    room: seminar.room,
    status: seminar.status,
    isEditable: seminar.registeredAt === null,
    audienceCount: seminar._count.audiences,
    examiners: seminar.examiners.map((e) => ({
      id: e.id,
      lecturerId: e.lecturerId,
      lecturerName: lecturerMap.get(e.lecturerId) || "-",
      order: e.order,
    })),
    createdAt: seminar.createdAt,
    updatedAt: seminar.updatedAt,
  };
}

export async function createSeminarResult({
  thesisId,
  date,
  roomId,
  status,
  examinerLecturerIds,
  assignedByUserId,
}) {
  if (!SEMINAR_RESULT_ALLOWED_STATUSES.includes(status)) {
    const err = new Error("Status seminar hasil tidak valid");
    err.statusCode = 400;
    throw err;
  }

  const [thesis, room, existingSeminar] = await Promise.all([
    findThesisById(thesisId),
    findRoomById(roomId),
    findSeminarResultByThesisId(thesisId),
  ]);

  if (!thesis) {
    const err = new Error("Thesis tidak ditemukan");
    err.statusCode = 404;
    throw err;
  }

  if (!room) {
    const err = new Error("Ruangan tidak ditemukan");
    err.statusCode = 404;
    throw err;
  }

  if (existingSeminar) {
    const err = new Error("Thesis ini sudah memiliki data seminar hasil");
    err.statusCode = 409;
    throw err;
  }

  const uniqueLecturerIds = await validateSeminarResultExaminers({ thesisId, examinerLecturerIds });

  const created = await createSeminarResultWithExaminers({
    thesisId,
    roomId,
    date,
    status,
    examinerLecturerIds: uniqueLecturerIds,
    assignedByUserId,
  });

  return getSeminarResultArchiveDetailById(created.id);
}

export async function updateSeminarResult(
  seminarId,
  { thesisId, date, roomId, status, examinerLecturerIds, assignedByUserId }
) {
  if (!SEMINAR_RESULT_ALLOWED_STATUSES.includes(status)) {
    const err = new Error("Status seminar hasil tidak valid");
    err.statusCode = 400;
    throw err;
  }

  const existing = await findSeminarResultBasicById(seminarId);
  if (!existing) {
    const err = new Error("Data seminar hasil tidak ditemukan");
    err.statusCode = 404;
    throw err;
  }

  const [thesis, room, duplicateSeminar] = await Promise.all([
    findThesisById(thesisId),
    findRoomById(roomId),
    findSeminarResultByThesisIdExcludingId(thesisId, seminarId),
  ]);

  if (!thesis) {
    const err = new Error("Thesis tidak ditemukan");
    err.statusCode = 404;
    throw err;
  }

  if (!room) {
    const err = new Error("Ruangan tidak ditemukan");
    err.statusCode = 404;
    throw err;
  }

  if (duplicateSeminar) {
    const err = new Error("Thesis ini sudah memiliki data seminar hasil lain");
    err.statusCode = 409;
    throw err;
  }

  const uniqueLecturerIds = await validateSeminarResultExaminers({ thesisId, examinerLecturerIds });

  await updateSeminarResultWithExaminers({
    seminarId,
    thesisId,
    roomId,
    date,
    status,
    examinerLecturerIds: uniqueLecturerIds,
    assignedByUserId,
  });

  return getSeminarResultArchiveDetailById(seminarId);
}

export async function deleteSeminarResult(seminarId) {
  const existing = await findSeminarResultBasicById(seminarId);
  if (!existing) {
    const err = new Error("Data seminar hasil tidak ditemukan");
    err.statusCode = 404;
    throw err;
  }

  await deleteSeminarResultById(seminarId);
  return { success: true };
}

export async function getSeminarResultAudienceLinks({ page = 1, pageSize = 10, search = "" } = {}) {
  const skip = (page - 1) * pageSize;
  const take = pageSize;

  const where = search
    ? {
        OR: [
          { student: { user: { fullName: { contains: search } } } },
          { student: { user: { identityNumber: { contains: search } } } },
          { seminar: { thesis: { title: { contains: search } } } },
          { seminar: { thesis: { student: { user: { fullName: { contains: search } } } } } },
        ],
      }
    : {};

  const [links, total] = await Promise.all([
    findAudienceLinksPaginated({ where, skip, take }),
    countAudienceLinks(where),
  ]);

  return {
    links: links.map((item) => ({
      seminarId: item.thesisSeminarId,
      studentId: item.studentId,
      createdAt: item.createdAt,
      student: {
        id: item.student.id,
        fullName: item.student.user?.fullName || "-",
        nim: item.student.user?.identityNumber || "-",
      },
      seminar: {
        id: item.seminar.id,
        date: item.seminar.date,
        thesisTitle: item.seminar.thesis?.title || "-",
        ownerName: item.seminar.thesis?.student?.user?.fullName || "-",
        ownerNim: item.seminar.thesis?.student?.user?.identityNumber || "-",
      },
    })),
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

export async function assignSeminarResultAudiences({ studentId, seminarIds }) {
  const uniqueSeminarIds = [...new Set(seminarIds || [])];

  const [student, seminars] = await Promise.all([
    findStudentById(studentId),
    findSeminarsByIdsForAudience(uniqueSeminarIds),
  ]);

  if (!student) {
    const err = new Error("Mahasiswa tidak ditemukan");
    err.statusCode = 404;
    throw err;
  }

  if (seminars.length !== uniqueSeminarIds.length) {
    const err = new Error("Terdapat seminar hasil yang tidak valid");
    err.statusCode = 400;
    throw err;
  }

  const ownSeminarIds = seminars
    .filter((s) => s.thesis?.studentId === studentId)
    .map((s) => s.id);

  const targetSeminarIds = seminars
    .filter((s) => s.thesis?.studentId !== studentId)
    .map((s) => s.id);

  if (targetSeminarIds.length === 0) {
    return {
      created: 0,
      skippedOwnSeminarIds: ownSeminarIds,
      skippedDuplicate: 0,
    };
  }

  const existingLinks = await findExistingAudienceLinks(studentId, targetSeminarIds);
  const existingSet = new Set(existingLinks.map((e) => e.thesisSeminarId));

  const toCreate = targetSeminarIds.filter((id) => !existingSet.has(id));

  if (toCreate.length > 0) {
    await createSeminarResultAudienceLinks(studentId, toCreate);
  }

  return {
    created: toCreate.length,
    skippedOwnSeminarIds: ownSeminarIds,
    skippedDuplicate: targetSeminarIds.length - toCreate.length,
  };
}

export async function removeSeminarResultAudienceLink({ seminarId, studentId }) {
  try {
    await deleteSeminarResultAudienceLinkById(seminarId, studentId);
  } catch (err) {
    if (err?.code === "P2025") {
      const e = new Error("Relasi audience tidak ditemukan");
      e.statusCode = 404;
      throw e;
    }
    throw err;
  }

  return { success: true };
}

export async function exportSeminarArchive() {
  const where = {
    status: { in: ['passed', 'passed_with_revision', 'failed'] },
  };

  const seminars = await findAllSeminarResultsForExport(where);

  const data = seminars.map((s, index) => {
    const supervisors = s.thesis?.thesisSupervisors || [];
    const supervisorNames = supervisors.map(sup => sup.lecturer?.user?.fullName).filter(Boolean).join(", ");
    
    const examiners = s.examiners || [];
    const examinerNames = examiners.map(e => e.lecturerName).filter(Boolean).join("; ");

    let hasil = "-";
    if (s.status === "passed") hasil = "Lulus";
    else if (s.status === "passed_with_revision") hasil = "Lulus dengan Revisi";
    else if (s.status === "failed") hasil = "Gagal";

    const localDate = s.date ? new Date(s.date) : null;
    const dateStr = localDate 
      ? `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`
      : "-";

    return {
      "No": index + 1,
      "Nama": s.thesis?.student?.user?.fullName || "-",
      "NIM": s.thesis?.student?.user?.identityNumber || "-",
      "Judul TA": s.thesis?.title || "-",
      "Pembimbing": supervisorNames || "-",
      "Tanggal": dateStr,
      "Ruangan": s.room?.name || "-",
      "Hasil": hasil,
      "Dosen Penguji": examinerNames || "-",
    };
  });

  const ws = xlsx.utils.json_to_sheet(data);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Arsip Seminar");

  return xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
}

export async function exportSeminarArchiveTemplate() {
  const data = [
    {
      "No": 1,
      "Nama": "Mahasiswa Contoh",
      "NIM": "12345678",
      "Judul TA": "Judul Tugas Akhir Contoh",
      "Tanggal": "2026-04-30",
      "Ruangan": "Ruang Seminar 1",
      "Hasil": "Lulus / Lulus dengan Revisi / Gagal",
      "Dosen Penguji 1": "Nama Dosen 1",
      "Dosen Penguji 2": "Nama Dosen 2",
      "Dosen Penguji 3": "Nama Dosen 3 (Opsional)",
    }
  ];

  const ws = xlsx.utils.json_to_sheet(data);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, "Template Import");

  return xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
}

export async function importSeminarArchive(fileBuffer, userId) {
  const wb = xlsx.read(fileBuffer, { type: "buffer" });
  const sheetName = wb.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(wb.Sheets[sheetName]);

  const results = {
    total: data.length,
    successCount: 0,
    failed: 0,
    failedRows: [],
  };

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    try {
      const nim = String(row["NIM"] || "").trim();
      const tanggalStr = String(row["Tanggal"] || "").trim();
      const ruanganName = String(row["Ruangan"] || "").trim();
      const hasil = String(row["Hasil"] || "").trim();
      const p1 = String(row["Dosen Penguji 1"] || "").trim();
      const p2 = String(row["Dosen Penguji 2"] || "").trim();
      const p3 = String(row["Dosen Penguji 3"] || "").trim();

      if (!nim) throw new Error("NIM kosong");

      const student = await findStudentByNim(nim);
      if (!student) throw new Error(`Mahasiswa dengan NIM ${nim} tidak ditemukan`);

      const thesis = await findActiveThesisByStudentId(student.id);
      if (!thesis) throw new Error(`Tugas akhir aktif untuk mahasiswa ${nim} tidak ditemukan`);

      const existingSeminar = await findSeminarResultByThesisId(thesis.id);
      if (existingSeminar) throw new Error("Mahasiswa ini sudah memiliki data seminar hasil yang valid (tidak gagal)");

      let roomId = null;
      if (ruanganName && ruanganName !== "-") {
        const room = await findRoomByNameLike(ruanganName);
        if (!room) throw new Error(`Ruangan "${ruanganName}" tidak ditemukan`);
        roomId = room.id;
      }

      let status = "failed";
      if (hasil.toLowerCase().includes("dengan revisi")) status = "passed_with_revision";
      else if (hasil.toLowerCase().includes("lulus")) status = "passed";

      let date = null;
      if (tanggalStr && tanggalStr !== "-") {
        const parsed = new Date(tanggalStr);
        if (!isNaN(parsed.getTime())) date = parsed.toISOString();
      }

      const examinerIds = [];
      const pengujiNames = [p1, p2, p3].filter(name => name && name !== "-" && !name.includes("(Opsional)"));
      
      for (const name of pengujiNames) {
        const lec = await findLecturerByNameLike(name);
        if (lec) {
          examinerIds.push(lec.id);
        } else {
          throw new Error(`Dosen Penguji "${name}" tidak ditemukan`);
        }
      }

      if (examinerIds.length < 2) {
        throw new Error("Minimal 2 Dosen Penguji diperlukan");
      }

      await createSeminarResultWithExaminers({
        thesisId: thesis.id,
        date,
        roomId,
        status,
        examinerLecturerIds: examinerIds,
        assignedByUserId: userId
      });

      results.successCount++;
    } catch (err) {
      results.failed++;
      let msg = err.message;
      // Clean up technical errors for users
      if (msg.includes('Invalid `prisma')) {
        msg = "Format data tidak valid untuk database.";
      }
      results.failedRows.push({ row: i + 2, error: msg });
    }
  }

  return results;
}
