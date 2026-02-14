import {
  getStudentByUserId,
  getActiveThesisForStudent,
  getSupervisorsForThesis,
  listGuidancesForThesis,
  getGuidanceByIdForStudent,
  createGuidance,
  updateGuidanceRequestedDate,
  updateGuidanceById,
  listGuidanceHistoryByStudent,
  listMilestones,
  listMilestoneTemplates,
  createMilestonesDirectly,
  submitSessionSummary,
  getCompletedGuidanceHistory,
  getGuidanceForExport,
  getGuidancesNeedingSummary,
  getThesisHistory,
} from "../../repositories/thesisGuidance/student.guidance.repository.js";

import prisma from "../../config/prisma.js";
import { sendFcmToUsers } from "../../services/push.service.js";
import { createNotificationsForUsers } from "../notification.service.js";
import { formatDateTimeJakarta } from "../../utils/date.util.js";
import { toTitleCaseName } from "../../utils/global.util.js";
import { deleteCalendarEvent } from "../outlook-calendar.service.js";
import { ROLES, isSupervisorRole, ROLE_CATEGORY } from "../../constants/roles.js";
import { getActiveAcademicYear } from "../../helpers/academicYear.helper.js";
import fs from "fs";
import path from "path";
import { promisify } from "util";
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);

async function ensureThesisAcademicYear(thesis) {
  if (thesis.academicYearId) return thesis;

  // First, try to use the active academic year
  let current = await getActiveAcademicYear();

  // Fallback to date-based lookup if no active year is set
  if (!current) {
    const now = new Date();
    current = await prisma.academicYear.findFirst({
      where: {
        OR: [
          { AND: [{ startDate: { lte: now } }, { endDate: { gte: now } }] },
          { startDate: { lte: now } },
          { endDate: { gte: now } },
        ],
      },
      orderBy: [
        { year: "desc" },
        { startDate: "desc" },
      ],
    });
  }

  if (current) {
    await prisma.thesis.update({ where: { id: thesis.id }, data: { academicYearId: current.id } });
    return { ...thesis, academicYearId: current.id };
  }
  return thesis;
}

function addMinutes(date, minutes = 0) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() + (minutes || 0));
  return d;
}

async function ensureSupervisorAvailability({ supervisorId, start, durationMinutes = 60, excludeGuidanceId } = {}) {
  if (!supervisorId || !start) return;
  const startDate = new Date(start);
  const endDate = addMinutes(startDate, durationMinutes);

  const conflicts = await prisma.thesisGuidance.findMany({
    where: {
      supervisorId,
      status: { in: ["requested", "accepted"] },
      ...(excludeGuidanceId ? { id: { not: excludeGuidanceId } } : {}),
    },
    include: {
      thesis: { include: { student: { include: { user: { select: { fullName: true } } } } } },
    },
  });

  // Use requestedDate as the scheduled slot time (not approvedDate which is the approval timestamp)
  const hit = conflicts.find((g) => {
    const slotStart = new Date(g.requestedDate);
    const slotEnd = addMinutes(slotStart, g.duration || 60);
    return startDate < slotEnd && endDate > slotStart;
  });

  if (hit) {
    const studentName = hit.thesis?.student?.user?.fullName || "mahasiswa lain";
    const conflictDate = formatDateTimeJakarta(hit.requestedDate, { withDay: true }) || "jadwal lain";
    const err = new Error(`Jadwal bentrok dengan ${studentName} pada ${conflictDate}. Pilih waktu lain.`);
    err.statusCode = 400;
    throw err;
  }
}

async function getOrCreateDocumentType(name = "Thesis") {
  let dt = await prisma.documentType.findFirst({ where: { name } });
  if (!dt) {
    dt = await prisma.documentType.create({ data: { name } });
  }
  return dt;
}


function ensureStudent(student) {
  if (!student) {
    const err = new Error("Student profile not found for this user");
    err.statusCode = 404;
    throw err;
  }
}

function ensureThesisActive(thesis) {
  const status = thesis?.thesisStatus?.name;
  if (status === "Dibatalkan" || status === "Gagal") {
    const err = new Error("Tugas akhir ini tidak aktif. Silakan daftar judul baru.");
    err.statusCode = 400;
    throw err;
  }
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

// Schema baru: gunakan requestedDate/approvedDate langsung, bukan schedule relation
export async function listMyGuidancesService(userId, status) {
  const { thesis } = await getActiveThesisOrThrow(userId);
  // List guidances even if thesis is archived/cancelled (for history view)
  const rows = await listGuidancesForThesis(thesis.id, status);
  rows.sort((a, b) => {
    // Schema baru: gunakan requestedDate bukan schedule.guidanceDate
    const at = a?.requestedDate ? new Date(a.requestedDate).getTime() : 0;
    const bt = b?.requestedDate ? new Date(b.requestedDate).getTime() : 0;
    if (bt !== at) return bt - at;
    return String(b.id).localeCompare(String(a.id));
  });
  const items = rows.map((g) => ({
    id: g.id,
    status: g.status,
    // Schema baru: gunakan requestedDate/approvedDate
    scheduledAt: g.approvedDate || g.requestedDate || null,
    scheduledAtFormatted: (g.approvedDate || g.requestedDate)
      ? formatDateTimeJakarta(g.approvedDate || g.requestedDate, { withDay: true })
      : null,
    requestedDate: g.requestedDate || null,
    approvedDate: g.approvedDate || null,
    duration: g.duration || 60,
    supervisorId: g.supervisorId || null,
    supervisorName: g?.supervisor?.user?.fullName || null,
  }));
  let doc = null;
  try {
    const t = await prisma.thesis.findUnique({ where: { id: thesis.id }, include: { document: true } });
    if (t?.document) {
      doc = {
        id: t.document.id,
        fileName: t.document.fileName,
        filePath: t.document.filePath, // relative path served under /uploads
      };
    }
  } catch (e) {
    console.warn("Failed to load thesis document:", e?.message || e);
  }
  const withDoc = items.map((it) => ({ ...it, document: doc }));
  return { count: withDoc.length, items: withDoc };
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
  const milestoneTitles = (guidance.milestones || []).map((m) => m.milestone?.title).filter(Boolean);

  const flat = {
    id: guidance.id,
    status: guidance.status,
    scheduledAt: guidance.approvedDate || guidance.requestedDate || null,
    scheduledAtFormatted: (guidance.approvedDate || guidance.requestedDate)
      ? formatDateTimeJakarta(guidance.approvedDate || guidance.requestedDate, { withDay: true })
      : null,
    requestedDate: guidance.requestedDate || null,
    approvedDate: guidance.approvedDate || null,
    duration: guidance.duration || 60,
    supervisorId: guidance.supervisorId || null,
    supervisorName: guidance?.supervisor?.user?.fullName || null,
    notes: guidance.studentNotes || null,
    supervisorFeedback: guidance.supervisorFeedback || null,
    rejectionReason: guidance.rejectionReason || null,
    milestoneIds,
    milestoneTitles,
  };
  // attach thesis document
  try {
    const t = await prisma.thesis.findUnique({ where: { id: guidance.thesisId }, include: { document: true } });
    if (t?.document) {
      flat.document = {
        id: t.document.id,
        fileName: t.document.fileName,
        filePath: t.document.filePath,
      };
    }
  } catch { }
  return { guidance: flat };
}

export async function requestGuidanceService(userId, guidanceDate, studentNotes, file, supervisorId, options = {}) {
  const {
    duration = 60,
    milestoneId = null,
    milestoneIds = [],
    documentUrl = null,
  } = options;

  // DEBUG: Log received options
  console.log("[requestGuidanceService] options received:", JSON.stringify(options, null, 2));
  console.log("[requestGuidanceService] milestoneIds:", milestoneIds);
  console.log("[requestGuidanceService] milestoneId:", milestoneId);

  let { student, thesis } = await getActiveThesisOrThrow(userId);
  ensureThesisActive(thesis);
  thesis = await ensureThesisAcademicYear(thesis);

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
      ? formatDateTimeJakarta(new Date(pendingRequest.requestedDate), { withDay: true })
      : "belum ditentukan";
    const err = new Error(`Anda masih memiliki pengajuan bimbingan yang belum direspon oleh dosen (jadwal: ${dateStr}). Tunggu hingga dosen menyetujui atau menolak pengajuan sebelumnya.`);
    err.statusCode = 400;
    throw err;
  }

  // === MILESTONE SELECTION (OPTIONAL) ===
  // Milestone is now optional - student can request guidance without specifying milestone
  const milestones = await prisma.thesisMilestone.findMany({
    where: { thesisId: thesis.id },
  });

  // Collect requested milestone IDs (if any provided)
  const requestedMilestoneIds = Array.from(
    new Set([
      ...(Array.isArray(milestoneIds) ? milestoneIds.filter(Boolean) : []),
      milestoneId || null,
    ].filter(Boolean))
  );

  // Validate milestoneIds if provided (optional)
  const validMilestones = [];
  for (const mid of requestedMilestoneIds) {
    const m = await prisma.thesisMilestone.findFirst({
      where: { id: mid, thesisId: thesis.id },
    });
    if (!m) {
      const err = new Error("Milestone tidak ditemukan atau bukan milik thesis ini");
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
    const allowed = supervisors.some((s) => s.lecturerId === selectedSupervisorId);
    if (!allowed) {
      const err = new Error("Invalid supervisorId for this thesis");
      err.statusCode = 400;
      throw err;
    }
  } else {
    // Placeholder - verified in next step - verified in next step: Pembimbing 1 -> Pembimbing 2 -> first available supervisor
    selectedSupervisorId = sup1?.lecturerId || sup2?.lecturerId || supervisors[0]?.lecturerId || null;
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

  // Schema baru: tidak perlu createGuidanceSchedule, requestedDate langsung di ThesisGuidance
  const guidanceData = {
    thesisId: thesis.id,
    requestedDate: guidanceDate, // Schema baru
    supervisorId: selectedSupervisorId,
    studentNotes: studentNotes || "",
    supervisorFeedback: "",
    documentUrl: documentUrl || null, // Link dokumen yang akan dibahas
    duration: duration || 60,
    status: "requested",
  };
  // Link milestones through junction table
  if (validMilestones.length > 0) {
    guidanceData.milestones = {
      create: validMilestones.map((m) => ({ milestoneId: m.id })),
    };
  }
  const created = await createGuidance(guidanceData);

  try {
    // Only notify the selected supervisor, not all supervisors
    const selectedSupervisor = supervisors.find((p) => p.lecturerId === selectedSupervisorId);
    const supervisorUserId = selectedSupervisor?.lecturer?.user?.id;
    if (supervisorUserId) {
      const dateStr =
        formatDateTimeJakarta(guidanceDate, { withDay: true }) ||
        (guidanceDate instanceof Date ? guidanceDate.toISOString() : String(guidanceDate));
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
    const selectedSupervisor = supervisors.find((p) => p.lecturerId === selectedSupervisorId);
    const supUserId = selectedSupervisor?.lecturer?.user?.id;
    if (supUserId) {
      console.log(`[Guidance] Sending FCM requested -> supervisor=${supUserId} guidanceId=${created.id}`);
      // Schema baru: gunakan requestedDate
      const data = {
        type: "thesis-guidance:requested",
        role: "supervisor",
        guidanceId: String(created.id),
        thesisId: String(thesis.id),
        milestoneId: selectedMilestoneId || "",
        milestoneName: milestoneNames[0] || "",
        scheduledAt: created?.requestedDate ? new Date(created.requestedDate).toISOString() : "",
        scheduledAtFormatted: formatDateTimeJakarta(created?.requestedDate, { withDay: true }) || "",
        supervisorId: String(selectedSupervisorId),
        playSound: "true",
      };
      await sendFcmToUsers([supUserId], {
        title: "Permintaan bimbingan baru",
        body: `${studentName} mengajukan bimbingan. Jadwal: ${data.scheduledAtFormatted || formatDateTimeJakarta(guidanceDate, { withDay: true }) || "-"
          }`,
        data,
        dataOnly: true,
      });
    }
  } catch (e) {
    console.warn("FCM notify failed (guidance request):", e?.message || e);
  }

  if (file && file.buffer) {
    try {
      const uploadsRoot = path.join(process.cwd(), "uploads", "thesis", thesis.id);
      await mkdir(uploadsRoot, { recursive: true });

      // Delete old file and document if exists
      if (thesis.documentId && thesis.document?.filePath) {
        try {
          const oldFilePath = path.join(process.cwd(), thesis.document.filePath);
          await unlink(oldFilePath);
          await prisma.document.delete({ where: { id: thesis.documentId } });
        } catch (delErr) {
          // Ignore if old file doesn't exist or deletion fails
          console.warn("Could not delete old document:", delErr.message);
        }
      }

      const safeName = `thesis-document.pdf`; // Simple fixed name, always overwrite
      const filePath = path.join(uploadsRoot, safeName);
      await writeFile(filePath, file.buffer);

      const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");

      const docType = await getOrCreateDocumentType("Thesis");
      const doc = await prisma.document.create({
        data: {
          userId: userId,
          documentTypeId: docType.id,
          filePath: relPath,
          fileName: file.originalname,
        },
      });

      await prisma.thesis.update({ where: { id: thesis.id }, data: { documentId: doc.id } });
    } catch (err) {
      console.error("Failed to store uploaded thesis file:", err.message || err);
    }
  }

  const supMap = new Map(supervisors.map((p) => [p.lecturerId, p]));
  const sup = supMap.get(selectedSupervisorId);
  // Schema baru: gunakan requestedDate
  const flat = {
    id: created.id,
    status: created.status,
    scheduledAt: created?.requestedDate || null,
    scheduledAtFormatted: created?.requestedDate ? formatDateTimeJakarta(created.requestedDate, { withDay: true }) : null,
    requestedDate: created?.requestedDate || null,
    approvedDate: created?.approvedDate || null,
    duration: created?.duration || 60,
    supervisorId: created.supervisorId || null,
    supervisorName: sup?.lecturer?.user?.fullName || null,
    notes: created.studentNotes || null,
    supervisorFeedback: created.supervisorFeedback || null,
  };
  return { guidance: flat };
}

export async function rescheduleGuidanceService(userId, guidanceId, guidanceDate, studentNotes, options = {}) {
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
    include: { thesisStatus: true }
  });
  ensureThesisActive(thesis);

  if (guidance.status === "accepted" || guidance.status === "rejected") {
    const err = new Error("Cannot reschedule an accepted or rejected guidance");
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
      await deleteCalendarEvent(guidance.supervisor.user.id, guidance.supervisorCalendarEventId);
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
    const supervisorsUserIds = supervisors.map((p) => p?.lecturer?.user?.id).filter(Boolean);
    const dateStr = formatDateTimeJakarta(guidanceDate, { withDay: true }) || (guidanceDate instanceof Date ? guidanceDate.toISOString() : String(guidanceDate));
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
    const supUserIds = supervisors.map((p) => p?.lecturer?.user?.id).filter(Boolean);
    const dateFormatted = formatDateTimeJakarta(guidanceDate, { withDay: true }) || (guidanceDate instanceof Date ? guidanceDate.toISOString() : String(guidanceDate));
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
      data
    });
    // Student notification removed - frontend shows local toast instead
  } catch (e) {
    console.warn("FCM notify failed (guidance reschedule):", e?.message || e);
  }
  const flat = {
    id: updated.id,
    status: updated.status,
    requestedDate: updated.requestedDate || null,
    requestedDateFormatted: updated.requestedDate ? formatDateTimeJakarta(updated.requestedDate, { withDay: true }) : null,
    approvedDate: updated.approvedDate || null,
    approvedDateFormatted: updated.approvedDate ? formatDateTimeJakarta(updated.approvedDate, { withDay: true }) : null,
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

  // Only allow canceling "requested" status
  if (guidance.status !== "requested") {
    const err = new Error("Can only cancel pending guidance requests");
    err.statusCode = 400;
    throw err;
  }

  // Delete calendar events if they exist
  try {
    if (guidance.studentCalendarEventId) {
      await deleteCalendarEvent(userId, guidance.studentCalendarEventId);
    }
    if (guidance.supervisorCalendarEventId && guidance.supervisor?.user?.id) {
      await deleteCalendarEvent(guidance.supervisor.user.id, guidance.supervisorCalendarEventId);
    }
  } catch (e) {
    console.error("Failed to delete calendar events:", e?.message || e);
    // Don't fail if calendar deletion fails
  }

  // Get student name for notifications
  const studentUser = await prisma.user.findUnique({ where: { id: userId } });
  const studentName = toTitleCaseName(studentUser?.fullName || "Mahasiswa");

  // Send FCM notification to supervisor
  try {
    if (guidance.supervisor?.user?.id) {
      const supervisorUserId = guidance.supervisor.user.id;
      const dateStr = guidance.requestedDate
        ? formatDateTimeJakarta(new Date(guidance.requestedDate), { withDay: true })
        : "belum ditentukan";

      // Persist notification
      await createNotificationsForUsers([supervisorUserId], {
        title: "Pengajuan bimbingan dibatalkan",
        message: `${studentName} membatalkan pengajuan bimbingan untuk ${dateStr}${reason ? `. Alasan: ${reason}` : ""}`,
      });

      // Send FCM
      const data = {
        type: "thesis-guidance:cancelled",
        role: ROLE_CATEGORY.LECTURER,
        thesisId: String(guidance.thesisId),
        studentName: String(studentName),
        scheduledAt: guidance.requestedDate ? new Date(guidance.requestedDate).toISOString() : "",
        reason: reason || "",
        playSound: "true",
      };
      await sendFcmToUsers([supervisorUserId], {
        title: "Pengajuan bimbingan dibatalkan",
        body: `${studentName} membatalkan pengajuan untuk ${dateStr}`,
        data,
        dataOnly: true,
      });
    }
  } catch (e) {
    console.warn("FCM notify failed (guidance cancelled):", e?.message || e);
  }

  // Delete the guidance record
  await prisma.thesisGuidance.delete({
    where: { id: guidance.id }
  });

  return { success: true, message: "Guidance request deleted successfully" };
}

export async function updateStudentNotesService(userId, guidanceId, studentNotes) {
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
  const updated = await updateGuidanceById(guidance.id, { studentNotes: studentNotes || "" });
  // Persist notifications
  try {
    const supervisors = await getSupervisorsForThesis(guidance.thesisId);
    const supervisorsUserIds = supervisors.map((p) => p?.lecturer?.user?.id).filter(Boolean);
    const preview = (studentNotes || "").slice(0, 120);
    await createNotificationsForUsers(supervisorsUserIds, {
      title: "Catatan mahasiswa diperbarui",
      message: preview ? `${studentName} memperbarui catatan: ${preview}` : `${studentName} memperbarui catatan bimbingan`,
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
    const supUserIds = supervisors.map((p) => p?.lecturer?.user?.id).filter(Boolean);
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
      body: preview ? `${studentName}: ${preview}${studentNotes.length > 100 ? '...' : ''}` : `${studentName} memperbarui catatan`,
      data
    });
    await sendFcmToUsers([userId], {
      title: "Catatan diperbarui",
      body: preview ? `${preview}${studentNotes.length > 100 ? '...' : ''}` : "Catatan berhasil diperbarui",
      data: { ...data, role: ROLE_CATEGORY.STUDENT }
    });
  } catch (e) {
    console.warn("FCM notify failed (notes updated):", e?.message || e);
  }
  const flat = {
    id: updated.id,
    status: updated.status,
    requestedDate: updated.requestedDate || null,
    requestedDateFormatted: updated.requestedDate ? formatDateTimeJakarta(updated.requestedDate, { withDay: true }) : null,
    approvedDate: updated.approvedDate || null,
    approvedDateFormatted: updated.approvedDate ? formatDateTimeJakarta(updated.approvedDate, { withDay: true }) : null,
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

  // 1. Get existing milestones
  let milestones = await listMilestones(thesis.id);

  // 2. If empty AND thesis has a topic, seed from topic-specific templates
  if (milestones.length === 0 && thesis.thesisTopicId) {
    const templates = await listMilestoneTemplates(thesis.thesisTopicId);
    if (templates.length > 0) {
      await createMilestonesDirectly(thesis.id, templates);
      milestones = await listMilestones(thesis.id);
    }
  }

  // 3. Transform to legacy format for frontend compatibility
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

export async function completeProgressComponentsService(userId, componentIds, completedAt) {
  const { thesis } = await getActiveThesisOrThrow(userId);
  ensureThesisActive(thesis);
  const when = completedAt || new Date();

  // Update status to completed for the given milestone IDs
  const result = await prisma.thesisMilestone.updateMany({
    where: {
      id: { in: componentIds },
      thesisId: thesis.id,
    },
    data: {
      status: "completed",
      completedAt: when,
      progressPercentage: 100,
    },
  });

  return { thesisId: thesis.id, updated: result.count };
}

export async function guidanceHistoryService(userId) {
  const student = await getStudentByUserId(userId);
  ensureStudent(student);
  const rows = await listGuidanceHistoryByStudent(student.id);
  const items = rows.map((g) => ({
    id: g.id,
    status: g.status,
    requestedDate: g.requestedDate || null,
    requestedDateFormatted: g.requestedDate ? formatDateTimeJakarta(g.requestedDate, { withDay: true }) : null,
    approvedDate: g.approvedDate || null,
    approvedDateFormatted: g.approvedDate ? formatDateTimeJakarta(g.approvedDate, { withDay: true }) : null,
    supervisorId: g.supervisorId || null,
    supervisorName: g?.supervisor?.user?.fullName || null,
    duration: g.duration || null,
    completedAt: g.completedAt || null,
  }));
  return { count: items.length, items };
}

export async function listSupervisorsService(userId) {
  const { thesis } = await getActiveThesisOrThrow(userId);
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

export async function getSupervisorAvailabilityService(userId, supervisorId, rangeStart, rangeEnd) {
  // Ensure caller is a valid student (same role check as other student endpoints)
  await getActiveThesisOrThrow(userId);

  if (!supervisorId) {
    const err = new Error("supervisorId wajib diisi");
    err.statusCode = 400;
    throw err;
  }

  const start = rangeStart ? new Date(rangeStart) : new Date();
  const end = rangeEnd ? new Date(rangeEnd) : addMinutes(new Date(), 14 * 24 * 60);

  // Use only requestedDate for slot filtering (requestedDate is the scheduled time)
  const items = await prisma.thesisGuidance.findMany({
    where: {
      supervisorId,
      status: { in: ["requested", "accepted"] },
      requestedDate: { gte: start, lte: end },
    },
    include: {
      thesis: { include: { student: { include: { user: { select: { fullName: true } } } } } },
    },
    orderBy: [
      { requestedDate: "asc" },
    ],
  });

  // Use requestedDate as the slot time (not approvedDate which is approval timestamp)
  const busySlots = items
    .map((g) => {
      const slotStart = new Date(g.requestedDate);
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
    });

  return { busySlots };
}

// Public variant (no auth). Use cautiously: expose busy slots only.
export async function getSupervisorAvailabilityPublic(supervisorId, rangeStart, rangeEnd) {
  if (!supervisorId) {
    const err = new Error("supervisorId wajib diisi");
    err.statusCode = 400;
    throw err;
  }

  const start = rangeStart ? new Date(rangeStart) : new Date();
  const end = rangeEnd ? new Date(rangeEnd) : addMinutes(new Date(), 14 * 24 * 60);

  // Use only requestedDate for slot filtering (requestedDate is the scheduled time)
  const items = await prisma.thesisGuidance.findMany({
    where: {
      supervisorId,
      status: { in: ["requested", "accepted"] },
      requestedDate: { gte: start, lte: end },
    },
    include: {
      thesis: { include: { student: { include: { user: { select: { fullName: true } } } } } },
    },
    orderBy: [
      { requestedDate: "asc" },
    ],
  });

  // Use requestedDate as the slot time (not approvedDate which is approval timestamp)
  const busySlots = items
    .map((g) => {
      const slotStart = new Date(g.requestedDate);
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
    });

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
      approvedDateFormatted: g.approvedDate ? formatDateTimeJakarta(g.approvedDate, { withDay: true }) : null,
      duration: g.duration,
      studentNotes: g.studentNotes,
      milestoneName: g.milestone?.title || null,
    })),
  };
}

/**
 * Submit session summary after guidance
 */
export async function submitSessionSummaryService(userId, guidanceId, { sessionSummary, actionItems }) {
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

  // Can only submit summary for accepted guidance
  if (guidance.status !== "accepted") {
    const err = new Error("Guidance harus berstatus 'accepted' untuk mengisi catatan");
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
    const dateFormatted = formatDateTimeJakarta(guidance.approvedDate || guidance.requestedDate, { withDay: true }) || "";

    await createNotificationsForUsers(
      [supervisorUserId],
      {
        title: "Catatan Bimbingan Baru",
        message: `${studentName} telah mengisi catatan bimbingan dan menunggu approval Anda`,
      }
    );

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
    }).catch((e) => console.warn("FCM notify failed (summary submitted):", e?.message || e));
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
export async function markSessionCompleteService(userId, guidanceId, { sessionSummary, actionItems }) {
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

  // Can only complete for accepted or summary_pending guidance
  if (!["accepted", "summary_pending"].includes(guidance.status)) {
    const err = new Error("Hanya bimbingan dengan status 'accepted' atau 'summary_pending' yang dapat diselesaikan");
    err.statusCode = 400;
    throw err;
  }

  // Validate required fields
  if (!sessionSummary || sessionSummary.trim().length === 0) {
    const err = new Error("Ringkasan bimbingan wajib diisi");
    err.statusCode = 400;
    throw err;
  }

  // Directly mark as completed (skip summary_pending phase)
  const updated = await prisma.thesisGuidance.update({
    where: { id: guidanceId },
    data: {
      sessionSummary: sessionSummary.trim(),
      actionItems: actionItems?.trim() || null,
      summarySubmittedAt: new Date(),
      status: "completed",
      completedAt: new Date(),
    },
  });

  // Notify supervisor that session is completed
  const supervisorUserId = guidance.supervisor?.user?.id;
  if (supervisorUserId) {
    const studentName = toTitleCaseName(student.user?.fullName || "Mahasiswa");
    const dateFormatted = formatDateTimeJakarta(guidance.approvedDate || guidance.requestedDate, { withDay: true }) || "";

    await createNotificationsForUsers(
      [supervisorUserId],
      {
        title: "Sesi Bimbingan Selesai",
        message: `${studentName} telah menyelesaikan sesi bimbingan${dateFormatted ? ` pada ${dateFormatted}` : ""}`,
      }
    );

    sendFcmToUsers([supervisorUserId], {
      title: "Sesi Bimbingan Selesai",
      body: `${studentName} telah menyelesaikan sesi bimbingan`,
      data: {
        type: "thesis-guidance:completed",
        role: "supervisor",
        guidanceId: String(guidanceId),
        thesisId: String(guidance.thesisId),
        studentName,
        playSound: "true",
      },
      dataOnly: true,
    }).catch((e) => console.warn("FCM notify failed (session completed):", e?.message || e));
  }

  return {
    guidance: {
      id: updated.id,
      status: updated.status,
      sessionSummary: updated.sessionSummary,
      actionItems: updated.actionItems,
      completedAt: updated.completedAt,
    },
  };
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

  const guidances = await getCompletedGuidanceHistory(student.id);
  return {
    guidances: guidances.map((g) => ({
      id: g.id,
      supervisorName: g.supervisor?.user?.fullName || null,
      approvedDate: g.approvedDate,
      approvedDateFormatted: g.approvedDate ? formatDateTimeJakarta(g.approvedDate, { withDay: true }) : null,
      completedAt: g.completedAt,
      completedAtFormatted: g.completedAt ? formatDateTimeJakarta(g.completedAt, { withDay: true }) : null,
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
      approvedDateFormatted: guidance.approvedDate ? formatDateTimeJakarta(guidance.approvedDate, { withDay: true }) : null,
      completedAt: guidance.completedAt,
      completedAtFormatted: guidance.completedAt ? formatDateTimeJakarta(guidance.completedAt, { withDay: true }) : null,
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
  const { student, thesis } = await getActiveThesisOrThrow(userId);

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
            }
          }
        }
      },
      thesisTopic: true,
      thesisStatus: true,
      academicYear: true,
      document: true,
      thesisSupervisors: {
        include: {
          lecturer: {
            include: {
              user: {
                select: {
                  fullName: true,
                  email: true,
                }
              }
            }
          },
          role: true,
        }
      },
      _count: {
        select: {
          thesisGuidances: true,
          thesisMilestones: true,
        }
      }
    }
  });

  if (!fullThesis) {
    const err = new Error("Thesis not found");
    err.statusCode = 404;
    throw err;
  }

  // Calculate milestone progress
  const milestones = await prisma.thesisMilestone.findMany({
    where: { thesisId: thesis.id },
    select: { status: true, progressPercentage: true, targetDate: true }
  });

  const totalMilestones = milestones.length;
  const completedMilestones = milestones.filter(m => m.status === 'completed').length;
  const inProgressMilestones = milestones.filter(m => m.status === 'in_progress').length;
  const overdueMilestones = milestones.filter(m => {
    if (m.status === 'completed') return false;
    if (!m.targetDate) return false;
    return new Date(m.targetDate) < new Date();
  }).length;
  const milestoneProgress = totalMilestones > 0
    ? Math.round((completedMilestones / totalMilestones) * 100)
    : 0;

  // Format supervisors
  const supervisors = fullThesis.thesisSupervisors
    .filter(p => p.role?.name?.toLowerCase().includes('pembimbing'))
    .map(p => ({
      id: p.lecturerId,
      name: p.lecturer?.user?.fullName || null,
      email: p.lecturer?.user?.email || null,
      identityNumber: p.lecturer?.user?.identityNumber || null,
      role: p.role?.name || null,
    }));

  // Format examiners
  const examiners = fullThesis.thesisSupervisors
    .filter(p => p.role?.name?.toLowerCase().includes('penguji'))
    .map(p => ({
      id: p.lecturerId,
      name: p.lecturer?.user?.fullName || null,
      email: p.lecturer?.user?.email || null,
      role: p.role?.name || null,
    }));

  return {
    thesis: {
      id: fullThesis.id,
      title: fullThesis.title,
      status: fullThesis.thesisStatus?.name || 'aktif',
      rating: fullThesis.rating || null,
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
      topic: fullThesis.thesisTopic ? {
        id: fullThesis.thesisTopic.id,
        name: fullThesis.thesisTopic.name,
      } : null,
      // Academic year
      academicYear: fullThesis.academicYear ? {
        id: fullThesis.academicYear.id,
        name: fullThesis.academicYear.name,
        year: fullThesis.academicYear.year,
        semester: fullThesis.academicYear.semester,
        isActive: fullThesis.academicYear.isActive,
      } : null,
      // Document
      document: fullThesis.document ? {
        id: fullThesis.document.id,
        fileName: fullThesis.document.fileName,
        filePath: fullThesis.document.filePath,
      } : null,
      // Participants
      supervisors,
      examiners,
      // Progress stats
      stats: {
        totalGuidances: fullThesis._count.thesisGuidances,
        totalSessions: fullThesis._count.thesisGuidances,
        totalMilestones: totalMilestones,
        completedMilestones: completedMilestones,
        inProgressMilestones: inProgressMilestones,
        overdueMilestones: overdueMilestones,
        milestoneProgress: milestoneProgress,
      },
      // Seminar approval status
      seminarApproval: (() => {
        const sup1 = fullThesis.thesisSupervisors?.find((p) => p.role?.name === "Pembimbing 1");
        const sup2 = fullThesis.thesisSupervisors?.find((p) => p.role?.name === "Pembimbing 2");
        const s1 = sup1?.seminarReady || false;
        const s2 = sup2?.seminarReady || false;
        return {
          pembimbing1: s1,
          pembimbing2: s2,
          hasPembimbing2: !!sup2,
          isFullyApproved: (sup1 ? s1 : true) && (sup2 ? s2 : true),
        };
      })(),
    }
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
    }
  });

  return {
    thesis: {
      id: updated.id,
      title: updated.title,
      updatedAt: updated.updatedAt,
    }
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
      status: t.thesisStatus?.name || "Unknown",
      topic: t.thesisTopic?.name || "-",
      academicYear: t.academicYear
        ? `${t.academicYear.year}/${t.academicYear.year + 1} ${t.academicYear.semester === "ganjil" ? "Ganjil" : "Genap"}`
        : "-",
      createdAt: t.createdAt,
      stats: {
        guidances: t._count.thesisGuidances,
        completedMilestones: ["Dibatalkan", "Gagal"].includes(t.thesisStatus?.name)
          ? `0/${t._count.thesisMilestones}`
          : t._count.thesisMilestones,
      },
    })),
  };
}
