import {
  getStudentByUserId,
  getActiveThesisForStudent,
  getSupervisorsForThesis,
  listGuidancesForThesis,
  getGuidanceByIdForStudent,
  createGuidance,
  updateGuidanceById,
  listGuidanceHistoryByStudent,
  listMilestones,
  submitSessionSummary,
  getGuidanceForExport,
  getGuidancesNeedingSummary,
  getThesisHistory,
} from "../../repositories/thesisGuidance/student.guidance.repository.js";

import prisma from "../../config/prisma.js";
import { sendFcmToUsers } from "../../services/push.service.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { formatDateTimeJakarta, formatDateTimeWib } from "../../utils/date.util.js";
import { toTitleCaseName } from "../../utils/global.util.js";
import { deleteCalendarEvent } from "../outlook-calendar.service.js";
import {
  ROLES,
  isSupervisorRole,
  ROLE_CATEGORY,
} from "../../constants/roles.js";
import { getActiveAcademicYear } from "../../helpers/academicYear.helper.js";
import { logAudit, AUDIT_ACTIONS, ENTITY_TYPES } from "../auditLog.service.js";
import { ForbiddenError } from "../../utils/errors.js";
import {
  THESIS_STATUS,
  POST_PROPOSAL_THESIS_STATUSES,
  TA_PHASE,
  phaseForThesisStatus,
} from "../../constants/thesisStatus.js";
import { THESIS_STATUS_LABELS, GUIDANCE_STATUS_LABELS } from "../../constants/thesisLabels.js";
import {
  GUIDANCE_STATUS,
  GUIDANCE_ACTOR,
  SCHEDULED_GUIDANCE_STATUSES,
  SLOT_HOLDING_GUIDANCE_STATUSES,
  SUMMARY_SUBMITTABLE_STATUSES,
  effectiveGuidanceDate,
  getScheduledAt,
  byScheduledAt,
} from "../../constants/guidanceStatus.js";
import {
  guidanceDocument,
  storeGuidanceAttachment,
  removeStoredAttachment,
  findLatestThesisReport,
} from "../../helpers/guidanceFile.helper.js";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import {
  convertDocxToPdf,
  addGuidanceTablePages,
} from "../../utils/pdf.util.js";
const readFile = promisify(fs.readFile);

async function ensureThesisAcademicYear(thesis) {
  if (thesis.academicYearId) return thesis;

  // Revival decision (GUIDANCE_REVIVAL_PLAN e4): the baseline silently attached the
  // active academic year here. The active app rejects it to protect period integrity,
  // and that guard is kept until the department decides otherwise.
  throw new ForbiddenError(
    "Thesis ini tidak terikat tahun ajaran. Bimbingan ditolak sampai data diperbaiki Admin.",
  );
}

function addMinutes(date, minutes = 0) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + (minutes || 0));
  return d;
}

/**
 * Prevents double booking of a supervisor. A slot is held by `requested` sessions (at the
 * requested time) and scheduled sessions (at the approved/rescheduled time, K19).
 * Shared with the lecturer reschedule action.
 */
export async function ensureSupervisorAvailability({
  supervisorId,
  start,
  durationMinutes = 60,
  excludeGuidanceId,
} = {}) {
  if (!supervisorId || !start) return;
  const startDate = new Date(start);
  const endDate = addMinutes(startDate, durationMinutes);

  const conflicts = await prisma.thesisGuidance.findMany({
    where: {
      supervisorId,
      status: { in: SLOT_HOLDING_GUIDANCE_STATUSES },
      ...(excludeGuidanceId ? { id: { not: excludeGuidanceId } } : {}),
    },
    include: {
      thesis: {
        include: {
          student: { include: { user: { select: { fullName: true } } } },
        },
      },
    },
  });

  // The slot starts at the session's effective time (approved/rescheduled, else requested).
  const hit = conflicts.find((g) => {
    const slotStart = new Date(effectiveGuidanceDate(g));
    const slotEnd = addMinutes(slotStart, g.duration || 60);
    return startDate < slotEnd && endDate > slotStart;
  });

  if (hit) {
    const studentName = hit.thesis?.student?.user?.fullName || "mahasiswa lain";
    const conflictDate =
      formatDateTimeWib(effectiveGuidanceDate(hit), { withWeekday: true }) ||
      "jadwal lain";
    const err = new Error(
      `Jadwal bentrok dengan ${studentName} pada ${conflictDate}. Pilih waktu lain.`,
    );
    err.statusCode = 400;
    throw err;
  }
}

function ensureStudent(student) {
  if (!student) {
    const err = new Error("Student profile not found for this user");
    err.statusCode = 404;
    throw err;
  }
}

const NOT_WRITABLE_MESSAGES = {
  [THESIS_STATUS.PROPOSAL]:
    "Tugas akhir Anda masih dalam fase proposal. Bimbingan dan milestone tugas akhir baru dapat dipakai setelah masuk fase Tugas Akhir.",
  [THESIS_STATUS.ON_LEAVE]:
    `Tugas akhir Anda sedang berstatus "${THESIS_STATUS_LABELS.on_leave}". Bimbingan dan milestone tidak dapat diubah.`,
};

/** Aksi tulis bimbingan/milestone fase TA hanya untuk TA berstatus `research`. */
function ensureThesisWritable(thesis) {
  if (thesis?.status === THESIS_STATUS.RESEARCH) return;
  const err = new Error(
    NOT_WRITABLE_MESSAGES[thesis?.status] ||
      "Tugas akhir ini sudah tidak aktif. Bimbingan dan milestone tidak dapat diubah.",
  );
  err.statusCode = 403;
  throw err;
}

/** Aksi pada sesi yang sudah ada: TA pemilik sesi harus berstatus `research`. */
async function ensureGuidanceThesisWritable(guidance) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: guidance.thesisId },
    select: { status: true },
  });
  ensureThesisWritable(thesis);
}

async function getActiveThesisOrThrow(userId) {
  const student = await getStudentByUserId(userId);
  ensureStudent(student);
  const thesis = await getActiveThesisForStudent(student.id);
  if (!thesis) {
    const err = new Error("Active thesis not found for this student");
    err.statusCode = 404;
    throw err;
  }
  return { student, thesis };
}

/** K19 fields shown to the student: rejection with suggested time, lecturer reschedule, cancellation. */
function k19Fields(g) {
  const fmt = (d) => (d ? formatDateTimeJakarta(d, { withDay: true }) : null);
  return {
    supervisorFeedback: g.supervisorFeedback || null,
    suggestedDate: g.suggestedDate || null,
    suggestedDateFormatted: fmt(g.suggestedDate),
    rescheduleReason: g.rescheduleReason || null,
    rescheduledAt: g.rescheduledAt || null,
    rescheduledAtFormatted: fmt(g.rescheduledAt),
    cancelReason: g.cancelReason || null,
    cancelledAt: g.cancelledAt || null,
    cancelledBy: g.cancelledBy || null,
  };
}

// Schema baru: gunakan requestedDate/approvedDate langsung, bukan schedule relation
export async function listMyGuidancesService(userId, status) {
  const { thesis } = await getActiveThesisOrThrow(userId);
  // List guidances even if thesis is archived/cancelled (for history view)
  const rows = await listGuidancesForThesis(thesis.id, status);
  // C6: newest first by the effective schedule (approvedDate ?? requestedDate), so a session
  // moved by the lecturer sorts at its agreed time.
  rows.sort(byScheduledAt("desc"));
  const items = rows.map((g) => ({
    id: g.id,
    status: g.status,
    // Schema baru: gunakan requestedDate/approvedDate
    scheduledAt: g.approvedDate || g.requestedDate || null,
    scheduledAtFormatted:
      g.approvedDate || g.requestedDate
        ? formatDateTimeJakarta(g.approvedDate || g.requestedDate, {
            withDay: true,
          })
        : null,
    requestedDate: g.requestedDate || null,
    approvedDate: g.approvedDate || null,
    duration: g.duration || 60,
    supervisorId: g.supervisorId || null,
    supervisorName: g?.supervisor?.user?.fullName || null,
    // Additional fields for merged view (history data in main table)
    studentNotes: g.studentNotes || null,
    rejectionReason: g.rejectionReason || null,
    sessionSummary: g.sessionSummary || null,
    actionItems: g.actionItems || null,
    completedAt: g.completedAt || null,
    completedAtFormatted: g.completedAt
      ? formatDateTimeJakarta(g.completedAt, { withDay: true })
      : null,
    document: guidanceDocument(g),
    ...k19Fields(g),
  }));
  return { count: items.length, items };
}

export async function getGuidanceDetailService(userId, guidanceId) {
  const student = await getStudentByUserId(userId);
  ensureStudent(student);
  const guidance = await getGuidanceByIdForStudent(guidanceId, student.id);
  if (!guidance) {
    const err = new Error("Guidance not found for this student");
    err.statusCode = 404;
    throw err;
  }
  // Derive milestone IDs and titles from junction table
  const milestoneIds = (guidance.milestones || []).map((m) => m.milestoneId);
  const milestoneTitles = (guidance.milestones || [])
    .map((m) => m.milestone?.title)
    .filter(Boolean);

  const flat = {
    id: guidance.id,
    status: guidance.status,
    scheduledAt: guidance.approvedDate || guidance.requestedDate || null,
    scheduledAtFormatted:
      guidance.approvedDate || guidance.requestedDate
        ? formatDateTimeJakarta(
            guidance.approvedDate || guidance.requestedDate,
            { withDay: true },
          )
        : null,
    requestedDate: guidance.requestedDate || null,
    approvedDate: guidance.approvedDate || null,
    duration: guidance.duration || 60,
    supervisorId: guidance.supervisorId || null,
    supervisorName: guidance?.supervisor?.user?.fullName || null,
    notes: guidance.studentNotes || null,
    supervisorFeedback: guidance.supervisorFeedback || null,
    rejectionReason: guidance.rejectionReason || null,
    sessionSummary: guidance.sessionSummary || null,
    actionItems: guidance.actionItems || null,
    milestoneIds,
    milestoneTitles,
    ...k19Fields(guidance),
  };
  // attach guidance-level document (uploaded during this specific guidance request)
  const document = guidanceDocument(guidance);
  if (document) flat.document = document;
  return { guidance: flat };
}

export async function requestGuidanceService(
  userId,
  guidanceDate,
  studentNotes,
  file,
  supervisorId,
  options = {},
) {
  const {
    duration = 60,
    milestoneId = null,
    milestoneIds = [],
    documentUrl = null,
  } = options;

  let { student, thesis } = await getActiveThesisOrThrow(userId);
  ensureThesisWritable(thesis);
  thesis = await ensureThesisAcademicYear(thesis);
  // K6: phase is set by the server from the thesis status, never by the client.
  const phase = phaseForThesisStatus(thesis.status);

  // Get student name for notifications - convert to Title Case
  const studentUser = await prisma.user.findUnique({ where: { id: userId } });
  const studentName = toTitleCaseName(studentUser?.fullName || "Mahasiswa");

  // Check if there's any pending request (status: requested)
  // Schema baru: tidak ada schedule relation
  const pendingRequest = await prisma.thesisGuidance.findFirst({
    where: {
      thesisId: thesis.id,
      status: "requested",
    },
  });

  if (pendingRequest) {
    // Schema baru: gunakan requestedDate langsung
    const dateStr = pendingRequest?.requestedDate
      ? formatDateTimeWib(new Date(pendingRequest.requestedDate), {
          withWeekday: true,
        })
      : "belum ditentukan";
    const err = new Error(
      `Anda masih memiliki pengajuan bimbingan yang belum direspon oleh dosen (jadwal: ${dateStr}). Tunggu hingga dosen menyetujui atau menolak pengajuan sebelumnya.`,
    );
    err.statusCode = 400;
    throw err;
  }

  // === MILESTONE SELECTION (OPTIONAL) ===
  // Milestone is now optional - student can request guidance without specifying milestone
  // Collect requested milestone IDs (if any provided)
  const requestedMilestoneIds = Array.from(
    new Set(
      [
        ...(Array.isArray(milestoneIds) ? milestoneIds.filter(Boolean) : []),
        milestoneId || null,
      ].filter(Boolean),
    ),
  );

  // Validate milestoneIds if provided (optional)
  const validMilestones = [];
  for (const mid of requestedMilestoneIds) {
    const m = await prisma.thesisMilestone.findFirst({
      where: { id: mid, thesisId: thesis.id, phase },
    });
    if (!m) {
      const err = new Error(
        "Milestone tidak ditemukan atau bukan milik thesis ini",
      );
      err.statusCode = 400;
      throw err;
    }
    validMilestones.push(m);
    // Auto-start milestone if not started
    if (m.status === "not_started") {
      await prisma.thesisMilestone.update({
        where: { id: mid },
        data: { status: "in_progress", startedAt: m.startedAt || new Date() },
      });
    }
  }
  const selectedMilestoneId = validMilestones[0]?.id || null; // for notification data
  const milestoneNames = validMilestones.map((m) => m.title);

  const supervisors = await getSupervisorsForThesis(thesis.id);
  const sup1 = supervisors.find((p) => p.role?.name === ROLES.PEMBIMBING_1);
  const sup2 = supervisors.find((p) => p.role?.name === ROLES.PEMBIMBING_2);
  let selectedSupervisorId = supervisorId || null;
  if (selectedSupervisorId) {
    const allowed = supervisors.some(
      (s) => s.lecturerId === selectedSupervisorId,
    );
    if (!allowed) {
      const err = new Error("Invalid supervisorId for this thesis");
      err.statusCode = 400;
      throw err;
    }
  } else {
    // Placeholder - verified in next step - verified in next step: Pembimbing 1 -> Pembimbing 2 -> first available supervisor
    selectedSupervisorId =
      sup1?.lecturerId ||
      sup2?.lecturerId ||
      supervisors[0]?.lecturerId ||
      null;
  }
  if (!selectedSupervisorId) {
    const err = new Error("No supervisor assigned to this thesis");
    err.statusCode = 400;
    throw err;
  }

  // Prevent double booking with other students for the same supervisor
  await ensureSupervisorAvailability({
    supervisorId: selectedSupervisorId,
    start: guidanceDate,
    durationMinutes: duration,
  });

  // K17: the attachment is written first (under the pre-generated session id) and its
  // metadata is stored on the session row. A storage failure aborts the request.
  const guidanceId = randomUUID();
  let fileColumns = {};
  if (file && file.buffer) {
    try {
      fileColumns = await storeGuidanceAttachment({ thesisId: thesis.id, guidanceId, file });
    } catch (e) {
      console.error("Failed to store guidance attachment:", e?.message || e);
      const err = new Error("Gagal menyimpan lampiran. Pengajuan bimbingan dibatalkan, silakan coba lagi.");
      err.statusCode = 500;
      throw err;
    }
  }

  // Schema baru: tidak perlu createGuidanceSchedule, requestedDate langsung di ThesisGuidance
  const guidanceData = {
    id: guidanceId,
    thesisId: thesis.id,
    requestedDate: guidanceDate, // Schema baru
    supervisorId: selectedSupervisorId,
    studentNotes: studentNotes || "",
    supervisorFeedback: "",
    documentUrl: documentUrl || null, // Link dokumen yang akan dibahas
    duration: duration || 60,
    phase,
    status: "requested",
    ...fileColumns,
  };
  // Link milestones through junction table
  if (validMilestones.length > 0) {
    guidanceData.milestones = {
      create: validMilestones.map((m) => ({ milestoneId: m.id })),
    };
  }
  let created;
  try {
    created = await createGuidance(guidanceData);
  } catch (e) {
    await removeStoredAttachment(fileColumns.filePath);
    throw e;
  }

  try {
    // Only notify the selected supervisor, not all supervisors
    const selectedSupervisor = supervisors.find(
      (p) => p.lecturerId === selectedSupervisorId,
    );
    const supervisorUserId = selectedSupervisor?.lecturer?.user?.id;
    if (supervisorUserId) {
      const dateStr =
        formatDateTimeWib(guidanceDate, { withWeekday: true }) ||
        (guidanceDate instanceof Date
          ? guidanceDate.toISOString()
          : String(guidanceDate));
      const notifMessage = milestoneNames.length
        ? `${studentName} mengajukan bimbingan untuk ${milestoneNames.length} milestone. Jadwal: ${dateStr}`
        : `${studentName} mengajukan bimbingan. Jadwal: ${dateStr}`;
      await createNotificationsForUsers([supervisorUserId], {
        title: "Permintaan bimbingan baru",
        message: notifMessage,
      });
    }
  } catch (e) {
    console.warn("Notify (DB) failed (guidance request):", e?.message || e);
  }

  try {
    // Only send FCM to the selected supervisor
    const selectedSupervisor = supervisors.find(
      (p) => p.lecturerId === selectedSupervisorId,
    );
    const supUserId = selectedSupervisor?.lecturer?.user?.id;
    if (supUserId) {
      console.log(
        `[Guidance] Sending FCM requested -> supervisor=${supUserId} guidanceId=${created.id}`,
      );
      // Schema baru: gunakan requestedDate
      const data = {
        type: "thesis-guidance:requested",
        role: "supervisor",
        guidanceId: String(created.id),
        thesisId: String(thesis.id),
        milestoneId: selectedMilestoneId || "",
        milestoneName: milestoneNames[0] || "",
        scheduledAt: created?.requestedDate
          ? new Date(created.requestedDate).toISOString()
          : "",
        scheduledAtFormatted:
          formatDateTimeWib(created?.requestedDate, { withWeekday: true }) ||
          "",
        supervisorId: String(selectedSupervisorId),
        playSound: "true",
      };
      await sendFcmToUsers([supUserId], {
        title: "Permintaan bimbingan baru",
        body: `${studentName} mengajukan bimbingan. Jadwal: ${
          data.scheduledAtFormatted ||
          formatDateTimeWib(guidanceDate, { withWeekday: true }) ||
          "-"
        }`,
        data,
        dataOnly: true,
      });
    }
  } catch (e) {
    console.warn("FCM notify failed (guidance request):", e?.message || e);
  }

  const supMap = new Map(supervisors.map((p) => [p.lecturerId, p]));
  const sup = supMap.get(selectedSupervisorId);
  // Schema baru: gunakan requestedDate
  const flat = {
    id: created.id,
    status: created.status,
    scheduledAt: created?.requestedDate || null,
    scheduledAtFormatted: created?.requestedDate
      ? formatDateTimeJakarta(created.requestedDate, { withDay: true })
      : null,
    requestedDate: created?.requestedDate || null,
    approvedDate: created?.approvedDate || null,
    duration: created?.duration || 60,
    supervisorId: created.supervisorId || null,
    supervisorName: sup?.lecturer?.user?.fullName || null,
    notes: created.studentNotes || null,
    supervisorFeedback: created.supervisorFeedback || null,
  };

  await logAudit({
    actorUserId: userId,
    action: AUDIT_ACTIONS.GUIDANCE_REQUESTED,
    entityType: ENTITY_TYPES.THESIS_GUIDANCE,
    entityId: created.id,
    newValues: { thesisId: thesis.id, supervisorId: selectedSupervisorId, requestedDate: guidanceDate },
  });

  return { guidance: flat };
}

export async function rescheduleGuidanceService(
  userId,
  guidanceId,
  guidanceDate,
  studentNotes,
  options = {},
) {
  const { duration } = options;
  const student = await getStudentByUserId(userId);
  ensureStudent(student);

  // Get student name for notifications - convert to Title Case
  const studentUser = await prisma.user.findUnique({ where: { id: userId } });
  const studentName = toTitleCaseName(studentUser?.fullName || "Mahasiswa");

  const guidance = await getGuidanceByIdForStudent(guidanceId, student.id);
  if (!guidance) {
    const err = new Error("Guidance not found for this student");
    err.statusCode = 404;
    throw err;
  }

  // Check if thesis is active
  const thesis = await prisma.thesis.findUnique({
    where: { id: guidance.thesisId },
  });
  ensureThesisWritable(thesis);

  // K19: the student may move only a request the lecturer has not answered yet.
  if (guidance.status !== GUIDANCE_STATUS.REQUESTED) {
    const err = new Error(
      `Jadwal hanya dapat diubah selama pengajuan berstatus "${GUIDANCE_STATUS_LABELS.requested}". Status saat ini: "${GUIDANCE_STATUS_LABELS[guidance.status] ?? guidance.status}".`,
    );
    err.statusCode = 400;
    throw err;
  }

  if (!guidance.supervisorId) {
    const err = new Error("Supervisor belum ditetapkan untuk bimbingan ini");
    err.statusCode = 400;
    throw err;
  }

  await ensureSupervisorAvailability({
    supervisorId: guidance.supervisorId,
    start: guidanceDate,
    durationMinutes: duration || guidance.duration || 60,
    excludeGuidanceId: guidance.id,
  });

  // Delete old calendar events if they exist (will create new ones when approved)
  try {
    if (guidance.studentCalendarEventId) {
      await deleteCalendarEvent(userId, guidance.studentCalendarEventId);
    }
    if (guidance.supervisorCalendarEventId && guidance.supervisor?.user?.id) {
      await deleteCalendarEvent(
        guidance.supervisor.user.id,
        guidance.supervisorCalendarEventId,
      );
    }
    // Clear calendar event IDs
    await prisma.thesisGuidance.update({
      where: { id: guidanceId },
      data: { studentCalendarEventId: null, supervisorCalendarEventId: null },
    });
  } catch (e) {
    console.error("Failed to delete old calendar events:", e?.message || e);
  }

  // Update requested date and reset feedback
  const updateData = {
    requestedDate: guidanceDate,
    studentNotes: studentNotes || guidance.studentNotes || "",
    supervisorFeedback: "", // back to pending
    approvedDate: null, // reset approved date
  };
  // Only update optional fields if provided
  if (duration !== undefined) updateData.duration = duration;

  const updated = await updateGuidanceById(guidance.id, updateData);
  // Persist notifications
  try {
    const supervisors = await getSupervisorsForThesis(guidance.thesisId);
    const supervisorsUserIds = supervisors
      .map((p) => p?.lecturer?.user?.id)
      .filter(Boolean);
    const dateStr =
      formatDateTimeWib(guidanceDate, { withWeekday: true }) ||
      (guidanceDate instanceof Date
        ? guidanceDate.toISOString()
        : String(guidanceDate));
    await createNotificationsForUsers(supervisorsUserIds, {
      title: "Jadwal bimbingan dijadwalkan ulang",
      message: `${studentName} menjadwalkan ulang bimbingan ke ${dateStr}`,
    });
    await createNotificationsForUsers([userId], {
      title: "Bimbingan dijadwalkan ulang",
      message: `Jadwal baru: ${dateStr}`,
    });
  } catch (e) {
    console.warn("Notify (DB) failed (reschedule):", e?.message || e);
  }
  // FCM notify supervisors only (student uses local toast)
  try {
    const supervisors = await getSupervisorsForThesis(guidance.thesisId);
    const supUserIds = supervisors
      .map((p) => p?.lecturer?.user?.id)
      .filter(Boolean);
    const dateFormatted =
      formatDateTimeWib(guidanceDate, { withWeekday: true }) ||
      (guidanceDate instanceof Date
        ? guidanceDate.toISOString()
        : String(guidanceDate));
    const data = {
      type: "thesis-guidance:rescheduled",
      role: "supervisor",
      guidanceId: String(guidance.id),
      thesisId: String(guidance.thesisId),
      scheduledAt: new Date(guidanceDate).toISOString(),
      scheduledAtFormatted: dateFormatted,
    };
    await sendFcmToUsers(supUserIds, {
      title: "Jadwal bimbingan dijadwalkan ulang",
      body: `${studentName} menjadwalkan ulang bimbingan ke ${dateFormatted}`,
      data,
    });
    // Student notification removed - frontend shows local toast instead
  } catch (e) {
    console.warn("FCM notify failed (guidance reschedule):", e?.message || e);
  }
  const flat = {
    id: updated.id,
    status: updated.status,
    requestedDate: updated.requestedDate || null,
    requestedDateFormatted: updated.requestedDate
      ? formatDateTimeJakarta(updated.requestedDate, { withDay: true })
      : null,
    approvedDate: updated.approvedDate || null,
    approvedDateFormatted: updated.approvedDate
      ? formatDateTimeJakarta(updated.approvedDate, { withDay: true })
      : null,
    supervisorId: updated.supervisorId || null,
    supervisorName: null,
    notes: updated.studentNotes || null,
    supervisorFeedback: updated.supervisorFeedback || null,
    duration: updated.duration || null,
  };
  return { guidance: flat };
}

export async function cancelGuidanceService(userId, guidanceId, reason) {
  const student = await getStudentByUserId(userId);
  ensureStudent(student);

  const guidance = await getGuidanceByIdForStudent(guidanceId, student.id);
  if (!guidance) {
    const err = new Error("Guidance not found for this student");
    err.statusCode = 404;
    throw err;
  }
  await ensureGuidanceThesisWritable(guidance);

  // K19: a student cancels a requested or scheduled session (legacy "rescheduled"
  // counts as scheduled), always with a reason. The row is kept as history.
  const isAccepted = SCHEDULED_GUIDANCE_STATUSES.includes(guidance.status);
  if (guidance.status !== GUIDANCE_STATUS.REQUESTED && !isAccepted) {
    const err = new Error(
      `Hanya bimbingan berstatus "${GUIDANCE_STATUS_LABELS.requested}" atau "${GUIDANCE_STATUS_LABELS.accepted}" yang dapat dibatalkan. Status saat ini: "${GUIDANCE_STATUS_LABELS[guidance.status] ?? guidance.status}".`,
    );
    err.statusCode = 400;
    throw err;
  }
  const cancelReason = String(reason ?? "").trim();
  if (!cancelReason) {
    const err = new Error("Alasan pembatalan wajib diisi");
    err.statusCode = 400;
    throw err;
  }
  reason = cancelReason;

  // Delete calendar events if they exist
  try {
    if (guidance.studentCalendarEventId) {
      await deleteCalendarEvent(userId, guidance.studentCalendarEventId);
    }
    if (guidance.supervisorCalendarEventId && guidance.supervisor?.user?.id) {
      await deleteCalendarEvent(
        guidance.supervisor.user.id,
        guidance.supervisorCalendarEventId,
      );
    }
  } catch (e) {
    console.error("Failed to delete calendar events:", e?.message || e);
    // Don't fail if calendar deletion fails
  }

  // Get student name for notifications
  const studentUser = await prisma.user.findUnique({ where: { id: userId } });
  const studentName = toTitleCaseName(studentUser?.fullName || "Mahasiswa");

  // Send notification to supervisor
  try {
    if (guidance.supervisor?.user?.id) {
      const supervisorUserId = guidance.supervisor.user.id;
      const sessionDate = effectiveGuidanceDate(guidance);
      const dateStr = sessionDate
        ? formatDateTimeWib(new Date(sessionDate), {
            withWeekday: true,
          })
        : "belum ditentukan";

      const notifTitle = isAccepted
        ? "Bimbingan terjadwal dibatalkan"
        : "Pengajuan bimbingan dibatalkan";
      const notifMessage = isAccepted
        ? `${studentName} membatalkan bimbingan terjadwal untuk ${dateStr}. Alasan: ${reason}`
        : `${studentName} membatalkan pengajuan bimbingan untuk ${dateStr}. Alasan: ${reason}`;

      // Persist notification
      await createNotificationsForUsers([supervisorUserId], {
        title: notifTitle,
        message: notifMessage,
      });

      // Send FCM
      const data = {
        type: "thesis-guidance:cancelled",
        role: ROLE_CATEGORY.LECTURER,
        thesisId: String(guidance.thesisId),
        studentName: String(studentName),
        scheduledAt: getScheduledAt(guidance)
          ? new Date(getScheduledAt(guidance)).toISOString()
          : "",
        reason: reason || "",
        playSound: "true",
      };
      await sendFcmToUsers([supervisorUserId], {
        title: notifTitle,
        body: notifMessage,
        data,
        dataOnly: true,
      });
    }
  } catch (e) {
    console.warn("FCM notify failed (guidance cancelled):", e?.message || e);
  }

  // K19: the session is kept (status cancelled) for history; the old code deleted a
  // cancelled request, losing its attachment record.
  await prisma.thesisGuidance.update({
    where: { id: guidance.id },
    data: {
      status: GUIDANCE_STATUS.CANCELLED,
      cancelReason: reason,
      cancelledAt: new Date(),
      cancelledBy: GUIDANCE_ACTOR.STUDENT,
      studentCalendarEventId: null,
      supervisorCalendarEventId: null,
    },
  });
  await logAudit({
    actorUserId: userId,
    action: AUDIT_ACTIONS.GUIDANCE_CANCELLED,
    entityType: ENTITY_TYPES.THESIS_GUIDANCE,
    entityId: guidance.id,
    oldValues: { status: guidance.status },
    newValues: { status: GUIDANCE_STATUS.CANCELLED, cancelledBy: GUIDANCE_ACTOR.STUDENT, reason },
  });
  return {
    success: true,
    message: isAccepted ? "Bimbingan berhasil dibatalkan" : "Pengajuan bimbingan berhasil dibatalkan",
  };
}

export async function updateStudentNotesService(
  userId,
  guidanceId,
  studentNotes,
) {
  const student = await getStudentByUserId(userId);
  ensureStudent(student);

  // Get student name for notifications - convert to Title Case
  const studentUser = await prisma.user.findUnique({ where: { id: userId } });
  const studentName = toTitleCaseName(studentUser?.fullName || "Mahasiswa");

  const guidance = await getGuidanceByIdForStudent(guidanceId, student.id);
  if (!guidance) {
    const err = new Error("Guidance not found for this student");
    err.statusCode = 404;
    throw err;
  }
  await ensureGuidanceThesisWritable(guidance);
  const updated = await updateGuidanceById(guidance.id, {
    studentNotes: studentNotes || "",
  });
  // Persist notifications
  try {
    const supervisors = await getSupervisorsForThesis(guidance.thesisId);
    const supervisorsUserIds = supervisors
      .map((p) => p?.lecturer?.user?.id)
      .filter(Boolean);
    const preview = (studentNotes || "").slice(0, 120);
    await createNotificationsForUsers(supervisorsUserIds, {
      title: "Catatan mahasiswa diperbarui",
      message: preview
        ? `${studentName} memperbarui catatan: ${preview}`
        : `${studentName} memperbarui catatan bimbingan`,
    });
    await createNotificationsForUsers([userId], {
      title: "Catatan diperbarui",
      message: preview ? `Catatan: ${preview}` : "Catatan diperbarui",
    });
  } catch (e) {
    console.warn("Notify (DB) failed (notes updated):", e?.message || e);
  }
  // FCM notify all supervisors + student
  try {
    const supervisors = await getSupervisorsForThesis(guidance.thesisId);
    const supUserIds = supervisors
      .map((p) => p?.lecturer?.user?.id)
      .filter(Boolean);
    const preview = (studentNotes || "").slice(0, 100);
    const data = {
      type: "thesis-guidance:notes-updated",
      role: ROLE_CATEGORY.LECTURER,
      guidanceId: String(guidance.id),
      thesisId: String(guidance.thesisId),
      notes: String(studentNotes || ""),
    };
    await sendFcmToUsers(supUserIds, {
      title: "Catatan mahasiswa diperbarui",
      body: preview
        ? `${studentName}: ${preview}${studentNotes.length > 100 ? "..." : ""}`
        : `${studentName} memperbarui catatan`,
      data,
    });
    await sendFcmToUsers([userId], {
      title: "Catatan diperbarui",
      body: preview
        ? `${preview}${studentNotes.length > 100 ? "..." : ""}`
        : "Catatan berhasil diperbarui",
      data: { ...data, role: ROLE_CATEGORY.STUDENT },
    });
  } catch (e) {
    console.warn("FCM notify failed (notes updated):", e?.message || e);
  }
  const flat = {
    id: updated.id,
    status: updated.status,
    requestedDate: updated.requestedDate || null,
    requestedDateFormatted: updated.requestedDate
      ? formatDateTimeJakarta(updated.requestedDate, { withDay: true })
      : null,
    approvedDate: updated.approvedDate || null,
    approvedDateFormatted: updated.approvedDate
      ? formatDateTimeJakarta(updated.approvedDate, { withDay: true })
      : null,
    supervisorId: updated.supervisorId || null,
    supervisorName: null,
    notes: updated.studentNotes || null,
    supervisorFeedback: updated.supervisorFeedback || null,
    duration: updated.duration || null,
  };
  return { guidance: flat };
}

export async function getMyProgressService(userId) {
  const { thesis } = await getActiveThesisOrThrow(userId);

  // K20: a GET never writes. Templates are applied explicitly ("Buat dari Template"),
  // so the old silent seeding of milestones from topic templates is gone.
  const milestones = await listMilestones(thesis.id);

  // Transform to legacy format for frontend compatibility
  const items = milestones.map((m) => ({
    componentId: m.id,
    name: m.title,
    description: m.description,
    completedAt: m.status === "completed" ? m.completedAt || m.updatedAt : null,
    validatedBySupervisor: Boolean(m.validatedBy),
    status: m.status,
    progressPercentage: m.progressPercentage,
  }));

  return { thesisId: thesis.id, components: items };
}

export async function completeProgressComponentsService(
  userId,
  componentIds,
  completedAt,
) {
  // Guidance revival correction: a student can no longer mark milestones completed
  // directly. Completion happens only through validation by the active Pembimbing 1
  // (POST /milestones/:id/validate). Students update progress / submit for review.
  void userId;
  void componentIds;
  void completedAt;
  const err = new Error(
    "Penyelesaian milestone langsung oleh mahasiswa tidak tersedia. Perbarui progres atau ajukan review; milestone selesai setelah divalidasi Pembimbing 1.",
  );
  err.statusCode = 410;
  throw err;
}

export async function guidanceHistoryService(userId) {
  const student = await getStudentByUserId(userId);
  ensureStudent(student);
  const rows = await listGuidanceHistoryByStudent(student.id);
  const items = rows.map((g) => ({
    id: g.id,
    status: g.status,
    requestedDate: g.requestedDate || null,
    requestedDateFormatted: g.requestedDate
      ? formatDateTimeJakarta(g.requestedDate, { withDay: true })
      : null,
    approvedDate: g.approvedDate || null,
    approvedDateFormatted: g.approvedDate
      ? formatDateTimeJakarta(g.approvedDate, { withDay: true })
      : null,
    supervisorId: g.supervisorId || null,
    supervisorName: g?.supervisor?.user?.fullName || null,
    duration: g.duration || null,
    completedAt: g.completedAt || null,
  }));
  return { count: items.length, items };
}

export async function listSupervisorsService(userId) {
  const student = await getStudentByUserId(userId);
  ensureStudent(student);

  // Try active thesis first
  let thesis = await getActiveThesisForStudent(student.id);

  // Fall back to most recent thesis (including completed/failed) for overview display
  if (!thesis) {
    thesis = await prisma.thesis.findFirst({
      where: { studentId: student.id, status: { in: POST_PROPOSAL_THESIS_STATUSES } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (!thesis) {
      const err = new Error("Active thesis not found for this student");
      err.statusCode = 404;
      throw err;
    }
  }

  const parts = await getSupervisorsForThesis(thesis.id);
  const supervisors = parts.map((p) => ({
    id: p.lecturerId,
    name: p.lecturer?.user?.fullName || null,
    email: p.lecturer?.user?.email || null,
    role: p.role?.name || null,
  }));

  // Sort by role: Pembimbing 1 first
  const roleOrder = { [ROLES.PEMBIMBING_1]: 1, [ROLES.PEMBIMBING_2]: 2 };
  supervisors.sort((a, b) => {
    const orderA = roleOrder[a.role] || 99;
    const orderB = roleOrder[b.role] || 99;
    return orderA - orderB;
  });

  return { thesisId: thesis.id, supervisors };
}

export async function getSupervisorAvailabilityService(
  userId,
  supervisorId,
  rangeStart,
  rangeEnd,
) {
  // Ensure caller is a valid student (same role check as other student endpoints)
  await getActiveThesisOrThrow(userId);

  if (!supervisorId) {
    const err = new Error("supervisorId wajib diisi");
    err.statusCode = 400;
    throw err;
  }

  const start = rangeStart ? new Date(rangeStart) : new Date();
  const end = rangeEnd
    ? new Date(rangeEnd)
    : addMinutes(new Date(), 14 * 24 * 60);

  // K19: a slot sits at the session's effective time (approved/rescheduled by the
  // lecturer, else requested), so both dates are matched against the range.
  const items = await prisma.thesisGuidance.findMany({
    where: {
      supervisorId,
      status: { in: SLOT_HOLDING_GUIDANCE_STATUSES },
      OR: [
        { requestedDate: { gte: start, lte: end } },
        { approvedDate: { gte: start, lte: end } },
      ],
    },
    include: {
      thesis: {
        include: {
          student: { include: { user: { select: { fullName: true } } } },
        },
      },
    },
    orderBy: [{ requestedDate: "asc" }],
  });

  const busySlots = items
    .map((g) => {
      const slotStart = new Date(effectiveGuidanceDate(g));
      const duration = g.duration || 60;
      const slotEnd = addMinutes(slotStart, duration);
      return {
        id: g.id,
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
        duration,
        status: g.status,
        studentName: g.thesis?.student?.user?.fullName || null,
      };
    })
    .filter((s) => {
      const sStart = new Date(s.start);
      const sEnd = new Date(s.end);
      return sStart <= end && sEnd >= start;
    })
    // C6: slots sit at the effective schedule, so they are ordered by it
    .sort((a, b) => a.start.localeCompare(b.start));

  return { busySlots };
}

// Public variant (no auth). Use cautiously: expose busy slots only.
export async function getSupervisorAvailabilityPublic(
  supervisorId,
  rangeStart,
  rangeEnd,
) {
  if (!supervisorId) {
    const err = new Error("supervisorId wajib diisi");
    err.statusCode = 400;
    throw err;
  }

  const start = rangeStart ? new Date(rangeStart) : new Date();
  const end = rangeEnd
    ? new Date(rangeEnd)
    : addMinutes(new Date(), 14 * 24 * 60);

  // K19: a slot sits at the session's effective time (approved/rescheduled by the
  // lecturer, else requested), so both dates are matched against the range.
  const items = await prisma.thesisGuidance.findMany({
    where: {
      supervisorId,
      status: { in: SLOT_HOLDING_GUIDANCE_STATUSES },
      OR: [
        { requestedDate: { gte: start, lte: end } },
        { approvedDate: { gte: start, lte: end } },
      ],
    },
    include: {
      thesis: {
        include: {
          student: { include: { user: { select: { fullName: true } } } },
        },
      },
    },
    orderBy: [{ requestedDate: "asc" }],
  });

  const busySlots = items
    .map((g) => {
      const slotStart = new Date(effectiveGuidanceDate(g));
      const duration = g.duration || 60;
      const slotEnd = addMinutes(slotStart, duration);
      return {
        id: g.id,
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
        duration,
        status: g.status,
        studentName: g.thesis?.student?.user?.fullName || null,
      };
    })
    .filter((s) => {
      const sStart = new Date(s.start);
      const sEnd = new Date(s.end);
      return sStart <= end && sEnd >= start;
    })
    // C6: slots sit at the effective schedule, so they are ordered by it
    .sort((a, b) => a.start.localeCompare(b.start));

  return { busySlots };
}

// ==================== SESSION SUMMARY ====================

/**
 * Get guidances that need summary submission (accepted + past scheduled time)
 */
export async function getGuidancesNeedingSummaryService(userId) {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Student profile not found");
    err.statusCode = 404;
    throw err;
  }

  const guidances = await getGuidancesNeedingSummary(student.id);
  return {
    guidances: guidances.map((g) => ({
      id: g.id,
      supervisorName: g.supervisor?.user?.fullName || null,
      approvedDate: g.approvedDate,
      approvedDateFormatted: g.approvedDate
        ? formatDateTimeJakarta(g.approvedDate, { withDay: true })
        : null,
      duration: g.duration,
      studentNotes: g.studentNotes,
      milestoneName: g.milestone?.title || null,
    })),
  };
}

/**
 * Submit session summary after guidance
 */
export async function submitSessionSummaryService(
  userId,
  guidanceId,
  { sessionSummary, actionItems },
) {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Student profile not found");
    err.statusCode = 404;
    throw err;
  }

  // Check guidance exists and belongs to student
  const guidance = await getGuidanceByIdForStudent(guidanceId, student.id);
  if (!guidance) {
    const err = new Error("Guidance not found");
    err.statusCode = 404;
    throw err;
  }
  await ensureGuidanceThesisWritable(guidance);

  // K19: a summary is submitted for a scheduled session, or resubmitted after the
  // lecturer asked for a revision (summary_rejected).
  if (!SUMMARY_SUBMITTABLE_STATUSES.includes(guidance.status)) {
    const err = new Error(
      `Ringkasan hanya dapat diisi untuk bimbingan berstatus "${GUIDANCE_STATUS_LABELS.accepted}" atau "${GUIDANCE_STATUS_LABELS.summary_rejected}". Status saat ini: "${GUIDANCE_STATUS_LABELS[guidance.status] ?? guidance.status}".`,
    );
    err.statusCode = 400;
    throw err;
  }

  // Validate required fields
  if (!sessionSummary || sessionSummary.trim().length === 0) {
    const err = new Error("Ringkasan bimbingan wajib diisi");
    err.statusCode = 400;
    throw err;
  }

  const updated = await submitSessionSummary(guidanceId, {
    sessionSummary: sessionSummary.trim(),
    actionItems: actionItems?.trim() || null,
  });

  // Send notification to supervisor
  const supervisorUserId = guidance.supervisor?.user?.id;
  if (supervisorUserId) {
    const studentName = toTitleCaseName(student.user?.fullName || "Mahasiswa");
    const dateFormatted =
      formatDateTimeWib(guidance.approvedDate || guidance.requestedDate, {
        withWeekday: true,
      }) || "";

    await createNotificationsForUsers([supervisorUserId], {
      title: "Catatan Bimbingan Baru",
      message: `${studentName} telah mengisi catatan bimbingan dan menunggu approval Anda`,
    });

    sendFcmToUsers([supervisorUserId], {
      title: "Catatan Bimbingan Baru",
      body: `${studentName} telah mengisi catatan bimbingan`,
      data: {
        type: "thesis-guidance:summary-submitted",
        role: "supervisor",
        guidanceId: String(guidanceId),
        thesisId: String(guidance.thesisId),
        studentName,
        scheduledAtFormatted: dateFormatted,
        playSound: "true",
      },
      dataOnly: true,
    }).catch((e) =>
      console.warn("FCM notify failed (summary submitted):", e?.message || e),
    );
  }

  return {
    guidance: {
      id: updated.id,
      status: updated.status,
      sessionSummary: updated.sessionSummary,
      actionItems: updated.actionItems,
      summarySubmittedAt: updated.summarySubmittedAt,
    },
  };
}

/**
 * Mark guidance session as complete (student can directly complete without waiting for lecturer approval)
 * This is a simplified flow where student marks session done after filling summary
 */
export async function markSessionCompleteService(
  userId,
  guidanceId,
  { sessionSummary, actionItems } = {},
) {
  // Guidance revival correction: the baseline "quick complete" set the session to
  // "completed" without supervisor approval. The official flow is
  // requested -> accepted -> summary_pending (submit-summary) -> completed (supervisor
  // approves the summary), so this path is closed for every caller.
  void userId;
  void guidanceId;
  void sessionSummary;
  void actionItems;
  const err = new Error(
    "Penyelesaian sesi langsung oleh mahasiswa tidak tersedia. Kirim ringkasan bimbingan; sesi selesai setelah disetujui dosen pembimbing.",
  );
  err.statusCode = 410;
  throw err;
}

/**
 * Get completed guidance history for documentation
 */
export async function getCompletedGuidanceHistoryService(userId) {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Student profile not found");
    err.statusCode = 404;
    throw err;
  }

  // Only show completed guidances for the active thesis
  const thesis = await getActiveThesisForStudent(student.id);
  if (!thesis) {
    return { guidances: [] };
  }

  const guidances = await prisma.thesisGuidance.findMany({
    where: {
      thesisId: thesis.id,
      ...TA_PHASE,
      status: "completed",
    },
    include: {
      supervisor: { include: { user: true } },
      milestones: {
        include: { milestone: { select: { id: true, title: true } } },
      },
      thesis: {
        select: {
          title: true,
          student: {
            select: {
              user: { select: { fullName: true, identityNumber: true } },
            },
          },
        },
      },
    },
    orderBy: [{ completedAt: "desc" }, { id: "desc" }],
  });

  return {
    guidances: guidances.map((g) => ({
      id: g.id,
      supervisorName: g.supervisor?.user?.fullName || null,
      approvedDate: g.approvedDate,
      approvedDateFormatted: g.approvedDate
        ? formatDateTimeJakarta(g.approvedDate, { withDay: true })
        : null,
      completedAt: g.completedAt,
      completedAtFormatted: g.completedAt
        ? formatDateTimeJakarta(g.completedAt, { withDay: true })
        : null,
      duration: g.duration,
      studentNotes: g.studentNotes,
      sessionSummary: g.sessionSummary,
      actionItems: g.actionItems,
      milestoneName: g.milestone?.title || null,
      thesisTitle: g.thesis?.title || null,
    })),
  };
}

/**
 * Get single guidance detail for export
 */
export async function getGuidanceForExportService(userId, guidanceId) {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Student profile not found");
    err.statusCode = 404;
    throw err;
  }

  const guidance = await getGuidanceForExport(guidanceId, student.id);
  if (!guidance) {
    const err = new Error("Guidance not found or not completed");
    err.statusCode = 404;
    throw err;
  }

  return {
    guidance: {
      id: guidance.id,
      // Student info
      studentName: guidance.thesis?.student?.user?.fullName || null,
      studentId: guidance.thesis?.student?.user?.identityNumber || null,
      // Supervisor info
      supervisorName: guidance.supervisor?.user?.fullName || null,
      // Schedule info
      approvedDate: guidance.approvedDate,
      approvedDateFormatted: guidance.approvedDate
        ? formatDateTimeJakarta(guidance.approvedDate, { withDay: true })
        : null,
      completedAt: guidance.completedAt,
      completedAtFormatted: guidance.completedAt
        ? formatDateTimeJakarta(guidance.completedAt, { withDay: true })
        : null,
      duration: guidance.duration,
      // Content
      studentNotes: guidance.studentNotes,
      sessionSummary: guidance.sessionSummary,
      actionItems: guidance.actionItems,
      // Milestone & Thesis
      milestoneName: guidance.milestone?.title || null,
      thesisTitle: guidance.thesis?.title || null,
    },
  };
}

/**
 * Get thesis detail for student
 * @param {string} userId
 * @returns {Promise<{thesis: object}>}
 */
export async function getMyThesisDetailService(userId) {
  const student = await getStudentByUserId(userId);
  ensureStudent(student);

  // Try to find active thesis first
  let thesis = await getActiveThesisForStudent(student.id);

  // If no active thesis, fall back to the most recent thesis (including completed/failed)
  // so the frontend can display the appropriate status message
  if (!thesis) {
    thesis = await prisma.thesis.findFirst({
      where: { studentId: student.id, status: { in: POST_PROPOSAL_THESIS_STATUSES } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    if (!thesis) {
      const err = new Error("Active thesis not found for this student");
      err.statusCode = 404;
      throw err;
    }
  }

  // Get thesis with all related data
  const fullThesis = await prisma.thesis.findUnique({
    where: { id: thesis.id },
    include: {
      student: {
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              email: true,
              identityNumber: true,
            },
          },
        },
      },
      thesisTopic: true,
      academicYear: true,
      // Revival adaptation (A2): baseline `thesisProposal` relation no longer exists.
      proposalDocument: true,
      finalProposalVersion: {
        include: {
          document: true,
        },
      },
      thesisSupervisors: {
        // Revival adaptation (A1): show only active supervisors.
        where: { status: "active" },
        include: {
          lecturer: {
            include: {
              user: {
                select: {
                  fullName: true,
                  email: true,
                },
              },
            },
          },
          role: true,
        },
      },
      _count: {
        select: {
          thesisGuidances: { where: TA_PHASE },
          thesisMilestones: { where: TA_PHASE },
        },
      },
    },
  });

  if (!fullThesis) {
    const err = new Error("Thesis not found");
    err.statusCode = 404;
    throw err;
  }

  // Calculate milestone progress
  const milestones = await prisma.thesisMilestone.findMany({
    where: { thesisId: thesis.id, ...TA_PHASE },
    select: { status: true, progressPercentage: true, targetDate: true },
  });

  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter(
    (m) => m.status === "completed",
  ).length;
  const inProgressMilestones = milestones.filter(
    (m) => m.status === "in_progress",
  ).length;
  const overdueMilestones = milestones.filter((m) => {
    if (m.status === "completed") return false;
    if (!m.targetDate) return false;
    return new Date(m.targetDate) < new Date();
  }).length;
  const milestoneProgress =
    totalMilestones > 0
      ? Math.round((completedMilestones / totalMilestones) * 100)
      : 0;

  // Count completed guidances (only status === 'completed')
  const guidanceRows = await prisma.thesisGuidance.findMany({
    where: { thesisId: thesis.id, ...TA_PHASE },
    select: { status: true },
  });
  const completedGuidanceCount = guidanceRows.filter(
    (g) => g.status === "completed",
  ).length;

  // Get per-guidance uploaded documents (file versions), stored on the session rows (K17)
  const guidanceDocuments = await prisma.thesisGuidance.findMany({
    where: { thesisId: thesis.id, ...TA_PHASE, filePath: { not: null } },
    select: {
      id: true,
      requestedDate: true,
      approvedDate: true,
      filePath: true,
      fileName: true,
      fileUploadedAt: true,
    },
    orderBy: { requestedDate: "desc" },
  });
  // "Laporan terbaru" = attachment of the latest TA-phase session that has a file
  const latestReport = await findLatestThesisReport(prisma, thesis.id);

  // Format supervisors
  const supervisors = fullThesis.thesisSupervisors
    .filter((p) => p.role?.name?.toLowerCase().includes("pembimbing"))
    .map((p) => ({
      id: p.lecturerId,
      name: p.lecturer?.user?.fullName || null,
      email: p.lecturer?.user?.email || null,
      identityNumber: p.lecturer?.user?.identityNumber || null,
      role: p.role?.name || null,
    }));

  // Format examiners
  const examiners = fullThesis.thesisSupervisors
    .filter((p) => p.role?.name?.toLowerCase().includes("penguji"))
    .map((p) => ({
      id: p.lecturerId,
      name: p.lecturer?.user?.fullName || null,
      email: p.lecturer?.user?.email || null,
      role: p.role?.name || null,
    }));

  return {
    thesis: {
      id: fullThesis.id,
      title: fullThesis.title,
      status: fullThesis.status,
      rating: fullThesis.rating || null,
      startDate: fullThesis.startDate || null,
      deadlineDate: fullThesis.deadlineDate || null,
      createdAt: fullThesis.createdAt,
      updatedAt: fullThesis.updatedAt,
      // Student info
      student: {
        id: fullThesis.student?.id,
        name: fullThesis.student?.user?.fullName || null,
        nim: fullThesis.student?.user?.identityNumber || null,
        email: fullThesis.student?.user?.email || null,
      },
      // Topic
      topic: fullThesis.thesisTopic
        ? {
            id: fullThesis.thesisTopic.id,
            name: fullThesis.thesisTopic.name,
          }
        : null,
      // Academic year
      academicYear: fullThesis.academicYear
        ? {
            id: fullThesis.academicYear.id,
            name: fullThesis.academicYear.name,
            year: fullThesis.academicYear.year,
            semester: fullThesis.academicYear.semester,
            isActive: fullThesis.academicYear.isActive,
          }
        : null,
      // Document: latest report from the guidance sessions
      document: guidanceDocument(latestReport),
      // Proposal Document (A2: final proposal version, fallback legacy proposal document)
      proposalDocument: (() => {
        const proposalDoc =
          fullThesis.finalProposalVersion?.document ??
          fullThesis.proposalDocument ??
          null;
        if (!proposalDoc) return null;
        return {
          id: proposalDoc.id,
          fileName:
            path.basename(proposalDoc.filePath || "") || proposalDoc.fileName,
          filePath: proposalDoc.filePath,
        };
      })(),
      // Per-guidance uploaded file versions
      uploadedFiles: (guidanceDocuments || []).map((g) => ({
        id: g.id,
        fileName: g.fileName || path.basename(g.filePath || ""),
        filePath: g.filePath,
        uploadedAt: g.fileUploadedAt,
        guidanceDate: g.approvedDate || g.requestedDate,
      })),
      // Participants
      supervisors,
      examiners,
      // Progress stats
      stats: {
        totalGuidances: fullThesis._count.thesisGuidances,
        completedGuidances: completedGuidanceCount,
        totalSessions: fullThesis._count.thesisGuidances,
        totalMilestones: totalMilestones,
        completedMilestones: completedMilestones,
        inProgressMilestones: inProgressMilestones,
        overdueMilestones: overdueMilestones,
        milestoneProgress: milestoneProgress,
      },
      // Seminar approval status
      seminarApproval: (() => {
        const sup1 = fullThesis.thesisSupervisors?.find(
          (p) => p.role?.name === "Pembimbing 1",
        );
        const sup2 = fullThesis.thesisSupervisors?.find(
          (p) => p.role?.name === "Pembimbing 2",
        );
        const s1 = sup1?.seminarReady || false;
        const s2 = sup2?.seminarReady || false;
        return {
          pembimbing1: s1,
          pembimbing2: s2,
          hasPembimbing2: !!sup2,
          isFullyApproved: (sup1 ? s1 : true) && (sup2 ? s2 : true),
        };
      })(),
    },
  };
}

/**
 * Update thesis title (student can update their own thesis title)
 * @param {string} userId
 * @param {string} newTitle
 * @returns {Promise<{thesis: object}>}
 */
export async function updateMyThesisTitleService(userId, newTitle) {
  const { thesis } = await getActiveThesisOrThrow(userId);
  ensureThesisWritable(thesis);

  if (!newTitle || newTitle.trim().length < 10) {
    const err = new Error("Judul tugas akhir minimal 10 karakter");
    err.statusCode = 400;
    throw err;
  }

  const updated = await prisma.thesis.update({
    where: { id: thesis.id },
    data: { title: newTitle.trim() },
    select: {
      id: true,
      title: true,
      updatedAt: true,
    },
  });

  return {
    thesis: {
      id: updated.id,
      title: updated.title,
      updatedAt: updated.updatedAt,
    },
  };
}

/**
 * Get thesis history for student
 * @param {string} userId
 */
export async function getThesisHistoryService(userId) {
  const student = await getStudentByUserId(userId);
  if (!student) {
    const err = new Error("Student profile not found");
    err.statusCode = 404;
    throw err;
  }

  const theses = await getThesisHistory(student.id);

  return {
    theses: theses.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      rating: t.rating || "ONGOING",
      topic: t.thesisTopic?.name || "-",
      academicYear: t.academicYear
        ? `${t.academicYear.year.includes("/") ? t.academicYear.year : `${t.academicYear.year}/${parseInt(t.academicYear.year) + 1}`} ${t.academicYear.semester === "ganjil" ? "Ganjil" : "Genap"}`
        : "-",
      createdAt: t.createdAt,
      stats: {
        guidances: t._count.thesisGuidances,
        completedMilestones: t.status === THESIS_STATUS.FAILED
          ? `0/${t.thesisMilestones?.length || 0}`
          : t.thesisMilestones?.filter((m) => m.status === "completed")
              .length || 0,
      },
      supervisors: (t.thesisSupervisors || []).map((s) => ({
        id: s.lecturerId,
        name: s.lecturer?.user?.fullName || null,
        role: s.role?.name || null,
      })),
    })),
  };
}

/**
 * Propose new thesis (with auto-assigned supervisors from previous thesis)
 * @param {string} userId
 * @param {object} data
 */
export async function proposeThesisService(userId, { title, topicId }) {
  // Revival decision (GUIDANCE_REVIVAL_PLAN e6): the baseline created a new Thesis and
  // copied supervisor rows using fields that no longer exist (`thesisRoleId`,
  // status "assigned"), bypassing the TA-01/TA-02 advisor and quota flow. The active
  // app's block is kept until the Proposal module is rebuilt.
  void userId;
  void title;
  void topicId;
  const err = new Error(
    "Pengajuan thesis langsung sudah tidak difasilitasi. Gunakan alur TA-01/TA-02 melalui pengajuan dosen pembimbing.",
  );
  err.statusCode = 400;
  throw err;
}

// ==================== GENERATE GUIDANCE LOG PDF ====================

/**
 * Generate a PDF log of thesis guidance sessions using the TA-06 DOCX template.
 *
 * Flow:
 *  1. Docxtemplater fills identity placeholders in the DOCX template
 *  2. Gotenberg converts the clean DOCX → PDF (header / identity page)
 *  3. pdf-lib appends table pages + signature directly into the PDF
 *
 * @param {string} userId
 * @param {string[]|undefined} guidanceIds
 * @returns {Promise<{buffer: Buffer, filename: string}>}
 */
export async function generateGuidanceLogPdfService(userId, guidanceIds) {
  const student = await getStudentByUserId(userId);
  ensureStudent(student);

  const thesis = await getActiveThesisForStudent(student.id);
  if (!thesis) {
    const err = new Error("Tugas akhir aktif tidak ditemukan");
    err.statusCode = 404;
    throw err;
  }

  const templatePath = path.join(
    process.cwd(),
    "uploads",
    "sop",
    "logcatatantemplate.docx",
  );
  if (!fs.existsSync(templatePath)) {
    const err = new Error(
      "Template log catatan (TA-06) belum diupload oleh Sekretaris Departemen. Silakan hubungi Sekretaris Departemen untuk mengupload template.",
    );
    err.statusCode = 404;
    throw err;
  }

  // --- Fetch completed guidances ---
  const where = { thesisId: thesis.id, status: "completed" };
  if (guidanceIds && guidanceIds.length > 0) where.id = { in: guidanceIds };

  const guidances = await prisma.thesisGuidance.findMany({
    where,
    include: {
      supervisor: { include: { user: { select: { fullName: true } } } },
    },
    orderBy: [{ approvedDate: "asc" }, { completedAt: "asc" }],
  });

  if (guidances.length === 0) {
    const err = new Error(
      "Tidak ada data bimbingan yang selesai untuk di-generate",
    );
    err.statusCode = 400;
    throw err;
  }

  // --- Gather student & supervisor info ---
  const studentUser = await prisma.user.findUnique({ where: { id: userId } });
  const studentName = toTitleCaseName(studentUser?.fullName || "Mahasiswa");
  const studentNim = studentUser?.identityNumber || "-";

  const supervisors = await getSupervisorsForThesis(thesis.id);
  const sup1 = supervisors.find((p) => p.role?.name === ROLES.PEMBIMBING_1);
  const sup2 = supervisors.find((p) => p.role?.name === ROLES.PEMBIMBING_2);
  const dospem1Name = toTitleCaseName(sup1?.lecturer?.user?.fullName || "-");
  const hasDospem2 = !!sup2 && !!sup2.lecturer?.user?.fullName;
  const dospem2Name = hasDospem2
    ? toTitleCaseName(sup2.lecturer.user.fullName)
    : "-";

  const nip1 = sup1?.lecturer?.user?.identityNumber || "-";
  const nip2 = hasDospem2 ? sup2?.lecturer?.user?.identityNumber || "-" : "-";

  const formatDateId = (date) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  // --- 1. Fill template placeholders with Docxtemplater (NO XML surgery) ---
  //     Then strip "Catatan Asistensi" + signature from DOCX so Gotenberg
  //     only converts the identity/header page. Table + signature will be
  //     appended later by pdf-lib.
  let docxBuffer;
  try {
    const content = await readFile(templatePath);
    const zip = new PizZip(content);

    // Strip signature + empty area AFTER "Catatan Asistensi" heading.
    // Strip "Catatan Asistensi" paragraph and everything after it.
    // Gotenberg only renders the identity/header page.
    // "B. Catatan Asistensi" heading + table + signature → pdf-lib.
    const docXmlFile = zip.file("word/document.xml");
    if (docXmlFile) {
      let docXml = docXmlFile.asText();
      const cataIdx = docXml.toLowerCase().indexOf("catatan");
      if (cataIdx !== -1) {
        // Cut from the <w:p> that contains "Catatan"
        const pStart = docXml.lastIndexOf("<w:p ", cataIdx);
        const bodyEnd = docXml.indexOf("</w:body>");
        if (pStart !== -1 && bodyEnd !== -1) {
          // Extract sectPr (contains header/kop ref + page size)
          const tail = docXml.substring(pStart, bodyEnd);
          const sectMatch = tail.match(/<w:sectPr[\s\S]*<\/w:sectPr>/);
          docXml =
            docXml.substring(0, pStart) +
            (sectMatch ? sectMatch[0] : "") +
            "</w:body></w:document>";
        }
      }
      zip.file("word/document.xml", docXml);
    }

    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });
    doc.render({
      nama: studentName,
      nim: studentNim,
      title: thesis.title || "-",
      dospem1: dospem1Name,
      dospem2: hasDospem2 ? dospem2Name : "-",
      dategenerated: formatDateId(new Date()),
      namapembimbing1: dospem1Name,
      namapembimbing2: hasDospem2 ? dospem2Name : "-",
      nippembimbing1: nip1,
      nippembimbing2: hasDospem2 ? nip2 : "-",
      items: [],
    });

    docxBuffer = doc
      .getZip()
      .generate({ type: "nodebuffer", compression: "DEFLATE" });
  } catch (err) {
    console.error("Guidance log template error:", err);
    throw new Error(
      "Gagal generate dokumen dari template: " + (err.message || err),
    );
  }

  // --- 2. Convert clean DOCX → PDF via Gotenberg (identity / header page) ---
  const basePdfBuffer = await convertDocxToPdf(
    docxBuffer,
    `Log_Bimbingan_${studentNim}.docx`,
  );

  // --- 3. Append guidance table pages + signature using pdf-lib ---
  const tableRows = guidances.map((g, idx) => {
    const parts = [];
    if (g.sessionSummary) parts.push(g.sessionSummary.trim());
    if (g.actionItems) parts.push("Arahan/Saran: " + g.actionItems.trim());
    return {
      no: String(idx + 1),
      tanggal: formatDateId(g.approvedDate || g.completedAt),
      notes: parts.join("\n\n") || "-",
    };
  });

  const pdfBuffer = await addGuidanceTablePages(basePdfBuffer, {
    rows: tableRows,
    dateGenerated: formatDateId(new Date()),
    dospem1Name,
    nip1,
    hasDospem2,
    dospem2Name,
    nip2,
  });

  return {
    buffer: pdfBuffer,
    filename: `Log_Bimbingan_${studentNim}_${new Date().toISOString().slice(0, 10)}.pdf`,
  };
}
