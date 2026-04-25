import {
  findAllDefences,
  findDefenceById,
  findDefenceDocumentWithFile,
  updateDefenceDocumentStatus,
  countDefenceDocumentsByStatus,
  updateDefenceStatus,
  findLecturerAvailabilitiesByLecturerIds,
  findAllRooms,
  findRoomScheduleConflict,
  updateDefenceSchedule,
} from "../../repositories/thesis-defence/admin.repository.js";
import { getDefenceDocumentTypes } from "../../repositories/thesis-defence/student.repository.js";
import { computeEffectiveDefenceStatus } from "../../utils/defenceStatus.util.js";

const STATUS_PRIORITY = {
  registered: 0,
  examiner_assigned: 1,
  verified: 2,
  scheduled: 3,
  ongoing: 3,
  passed: 4,
  passed_with_revision: 4,
  failed: 4,
  cancelled: 4,
};

export async function getAdminDefenceList({ search, status } = {}) {
  const defences = await findAllDefences({ search, status });
  const docTypes = await getDefenceDocumentTypes();
  const totalDocTypes = docTypes.length;

  const mapped = defences.map((d) => {
    const student = d.thesis?.student;
    const supervisors = (d.thesis?.thesisSupervisors || []).map((ts) => ({
      name: ts.lecturer?.user?.fullName || "-",
      role: ts.role?.name || "-",
    }));

    const approvedCount = d.documents.filter((x) => x.status === "approved").length;
    const submittedCount = d.documents.filter((x) => x.status === "submitted").length;
    const declinedCount = d.documents.filter((x) => x.status === "declined").length;

    return {
      id: d.id,
      thesisId: d.thesis?.id || null,
      studentName: student?.user?.fullName || "-",
      studentNim: student?.user?.identityNumber || "-",
      thesisTitle: d.thesis?.title || "-",
      supervisors,
      status: computeEffectiveDefenceStatus(d.status, d.date, d.startTime, d.endTime),
      registeredAt: d.registeredAt,
      date: d.date,
      startTime: d.startTime,
      endTime: d.endTime,
      documentSummary: {
        total: totalDocTypes,
        submitted: submittedCount,
        approved: approvedCount,
        declined: declinedCount,
      },
    };
  });

  mapped.sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 99;
    const pb = STATUS_PRIORITY[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    const dateA = a.registeredAt ? new Date(a.registeredAt).getTime() : 0;
    const dateB = b.registeredAt ? new Date(b.registeredAt).getTime() : 0;
    return dateA - dateB;
  });

  return mapped;
}

export async function getAdminDefenceDetail(defenceId) {
  const defence = await findDefenceById(defenceId);
  if (!defence) {
    const err = new Error("Sidang tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const student = defence.thesis?.student;
  const supervisors = (defence.thesis?.thesisSupervisors || []).map((ts) => ({
    name: ts.lecturer?.user?.fullName || "-",
    role: ts.role?.name || "-",
  }));

  const documents = await Promise.all(
    (defence.documents || []).map(async (d) => {
      const withFile = await findDefenceDocumentWithFile(defence.id, d.documentTypeId);
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

  const docTypes = await getDefenceDocumentTypes();

  return {
    id: defence.id,
    status: computeEffectiveDefenceStatus(
      defence.status,
      defence.date,
      defence.startTime,
      defence.endTime
    ),
    registeredAt: defence.registeredAt,
    date: defence.date,
    startTime: defence.startTime,
    endTime: defence.endTime,
    meetingLink: defence.meetingLink,
    finalScore: defence.finalScore,
    grade: defence.grade,
    resultFinalizedAt: defence.resultFinalizedAt,
    cancelledReason: defence.cancelledReason,
    room: defence.room ? { id: defence.room.id, name: defence.room.name } : null,
    thesis: {
      id: defence.thesis?.id,
      title: defence.thesis?.title,
    },
    student: {
      name: student?.user?.fullName || "-",
      nim: student?.user?.identityNumber || "-",
    },
    supervisors,
    documents,
    documentTypes: docTypes.map((dt) => ({ id: dt.id, name: dt.name })),
    examiners: (defence.examiners || [])
      .filter((e) => e.availabilityStatus === "available" || e.availabilityStatus === "pending")
      .map((e) => ({
        id: e.id,
        lecturerName: e.lecturerName || "-",
        order: e.order,
        availabilityStatus: e.availabilityStatus,
      })),
    rejectedExaminers: (defence.examiners || [])
      .filter((e) => e.availabilityStatus === "unavailable")
      .map((e) => ({
        id: e.id,
        lecturerName: e.lecturerName || "-",
        order: e.order,
        availabilityStatus: e.availabilityStatus,
        respondedAt: e.respondedAt,
        assignedAt: e.assignedAt,
      })),
  };
}

export async function validateDefenceDocument(
  defenceId,
  documentTypeId,
  { action, notes, userId }
) {
  if (!["approve", "decline"].includes(action)) {
    const err = new Error('Action harus "approve" atau "decline".');
    err.statusCode = 400;
    throw err;
  }

  const defence = await findDefenceById(defenceId);
  if (!defence) {
    const err = new Error("Sidang tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  if (defence.status !== "registered") {
    const err = new Error(
      "Validasi dokumen hanya dapat dilakukan saat sidang berstatus 'registered'."
    );
    err.statusCode = 400;
    throw err;
  }

  const docWithFile = await findDefenceDocumentWithFile(defenceId, documentTypeId);
  if (!docWithFile) {
    const err = new Error("Dokumen tidak ditemukan untuk di-validasi.");
    err.statusCode = 404;
    throw err;
  }

  const newStatus = action === "approve" ? "approved" : "declined";
  await updateDefenceDocumentStatus(defenceId, documentTypeId, {
    status: newStatus,
    notes: notes || null,
    verifiedBy: userId,
  });

  let defenceTransitioned = false;
  if (action === "approve") {
    const allDocs = await countDefenceDocumentsByStatus(defenceId);
    const docTypes = await getDefenceDocumentTypes();
    const expectedCount = docTypes.length;

    const approvedCount = allDocs.filter((d) => {
      if (d.documentTypeId === documentTypeId) return true;
      return d.status === "approved";
    }).length;

    if (approvedCount >= expectedCount) {
      await updateDefenceStatus(defenceId, "verified");
      defenceTransitioned = true;
    }
  }

  return {
    documentTypeId,
    status: newStatus,
    defenceTransitioned,
    newDefenceStatus: defenceTransitioned ? "verified" : defence.status,
  };
}

export async function getDefenceSchedulingData(defenceId) {
  const defence = await findDefenceById(defenceId);
  if (!defence) {
    const err = new Error("Sidang tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const supervisorIds = (defence.thesis?.thesisSupervisors || [])
    .filter((ts) => ts.role?.name === "Pembimbing 1")
    .map((ts) => ts.lecturerId)
    .filter(Boolean);

  const examinerIds = (defence.examiners || [])
    .map((e) => e.lecturerId)
    .filter(Boolean);

  const allLecturerIds = [...new Set([...supervisorIds, ...examinerIds])];

  const [availabilities, rooms] = await Promise.all([
    allLecturerIds.length > 0
      ? findLecturerAvailabilitiesByLecturerIds(allLecturerIds)
      : [],
    findAllRooms(),
  ]);

  const lecturerNameMap = {};
  (defence.thesis?.thesisSupervisors || []).forEach((ts) => {
    if (ts.lecturerId) {
      lecturerNameMap[ts.lecturerId] = ts.lecturer?.user?.fullName || "-";
    }
  });
  (defence.examiners || []).forEach((e) => {
    if (e.lecturerId) {
      lecturerNameMap[e.lecturerId] = e.lecturerName || "-";
    }
  });

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
    currentSchedule: defence.date
      ? {
          date: defence.date,
          startTime: defence.startTime,
          endTime: defence.endTime,
          meetingLink: defence.meetingLink,
          isOnline: !defence.roomId,
          room: defence.room ? { id: defence.room.id, name: defence.room.name } : null,
        }
      : null,
  };
}

export async function scheduleDefence(defenceId, { roomId, date, startTime, endTime, isOnline, meetingLink }) {
  const defence = await findDefenceById(defenceId);
  if (!defence) {
    const err = new Error("Sidang tidak ditemukan.");
    err.statusCode = 404;
    throw err;
  }

  const allowed = ["examiner_assigned", "scheduled"];
  if (!allowed.includes(defence.status)) {
    const err = new Error(
      "Penjadwalan hanya dapat dilakukan saat sidang berstatus 'examiner_assigned' atau 'scheduled'."
    );
    err.statusCode = 400;
    throw err;
  }

  if (!isOnline) {
    const conflict = await findRoomScheduleConflict({ defenceId, roomId, date, startTime, endTime });
    if (conflict) {
      const err = new Error("Ruangan sudah digunakan oleh sidang lain pada waktu yang sama.");
      err.statusCode = 409;
      throw err;
    }
  }

  await updateDefenceSchedule(defenceId, {
    roomId: isOnline ? null : roomId,
    date,
    startTime,
    endTime,
    meetingLink: isOnline ? meetingLink : null,
  });

  return { defenceId, status: "scheduled" };
}
