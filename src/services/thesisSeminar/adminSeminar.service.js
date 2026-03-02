import {
  findAllSeminars,
  findSeminarById,
  updateDocumentStatus,
  countDocumentsByStatus,
  updateSeminarStatus,
  findDocumentWithFile,
} from "../../repositories/thesisSeminar/adminSeminar.repository.js";
import { getSeminarDocumentTypes } from "../../repositories/thesisSeminar/seminarDocument.repository.js";

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
      status: s.status,
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
    examiners: (seminar.examiners || []).map((e) => ({
      id: e.id,
      lecturerName: e.lecturerName || "-",
      order: e.order,
      availabilityStatus: e.availabilityStatus,
    })),
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
