import {
  getStudentByUserId,
  getActiveThesisForStudent,
  getSupervisorsForThesis,
  listGuidancesForThesis,
  getGuidanceByIdForStudent,
  createGuidance,
  updateGuidanceRequestedDate,
  updateGuidanceById,
  listActivityLogsByStudent,
  listGuidanceHistoryByStudent,
  listProgressComponents,
  getCompletionsForThesis,
  upsertStudentCompletions,
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

async function getOrCreateDocumentType(name = "Thesis") {
  let dt = await prisma.documentType.findFirst({ where: { name } });
  if (!dt) {
    dt = await prisma.documentType.create({ data: { name } });
  }
  return dt;
}

// Schema baru: tambah activityType untuk ThesisActivityLog
async function logThesisActivity(thesisId, userId, activity, notes, activityType = "other") {
  try {
    await prisma.thesisActivityLog.create({
      data: {
        thesisId,
        userId,
        activity,
        activityType,
        notes: notes || "",
      },
    });
  } catch (e) {
    console.error("Failed to create thesis activity log:", e?.message || e);
  }
}

function ensureStudent(student) {
  if (!student) {
    const err = new Error("Student profile not found for this user");
    err.statusCode = 404;
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
    type: g.type || "online",
    location: g.location || null,
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
  // Schema baru: gunakan requestedDate/approvedDate
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
    type: guidance.type || "online",
    location: guidance.location || null,
    supervisorId: guidance.supervisorId || null,
    supervisorName: guidance?.supervisor?.user?.fullName || null,
    meetingUrl: guidance.meetingUrl || null,
    notes: guidance.studentNotes || null,
    supervisorFeedback: guidance.supervisorFeedback || null,
    rejectionReason: guidance.rejectionReason || null,
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
  } catch {}
  return { guidance: flat };
}

export async function requestGuidanceService(userId, guidanceDate, studentNotes, file, meetingUrl, supervisorId, options = {}) {
  const { type = "online", duration = 60, location = null, milestoneId = null, documentUrl = null } = options;
  let { student, thesis } = await getActiveThesisOrThrow(userId);
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

  // === VALIDASI MILESTONE - WAJIB UNTUK BIMBINGAN ===
  // Check if thesis has milestones
  const milestones = await prisma.thesisMilestone.findMany({
    where: { thesisId: thesis.id },
  });

  if (milestones.length === 0) {
    const err = new Error("Anda belum memiliki milestone. Buat milestone terlebih dahulu sebelum mengajukan bimbingan.");
    err.statusCode = 400;
    throw err;
  }

  // Check for milestones with progress (in_progress or revision_needed)
  const activeOrPendingMilestones = milestones.filter(
    (m) => m.status === "in_progress" || m.status === "revision_needed" || m.status === "pending_review"
  );

  // Either:
  // 1. Must have at least one active milestone, OR
  // 2. Must specify a milestone to work on (which will become active)
  if (activeOrPendingMilestones.length === 0 && !milestoneId) {
    const err = new Error("Tidak ada milestone yang sedang dikerjakan. Pilih milestone yang akan dibahas untuk melanjutkan pengajuan bimbingan.");
    err.statusCode = 400;
    throw err;
  }

  // Validate milestoneId if provided
  let selectedMilestoneId = null;
  let milestoneName = null;
  if (milestoneId) {
    const milestone = await prisma.thesisMilestone.findFirst({
      where: { id: milestoneId, thesisId: thesis.id },
    });
    if (!milestone) {
      const err = new Error("Milestone tidak ditemukan atau bukan milik thesis ini");
      err.statusCode = 400;
      throw err;
    }
    selectedMilestoneId = milestoneId;
    milestoneName = milestone.title;

    // Auto-update milestone status to in_progress if not started
    if (milestone.status === "not_started") {
      await prisma.thesisMilestone.update({
        where: { id: milestoneId },
        data: {
          status: "in_progress",
          startedAt: new Date(),
        },
      });
    }
  }
  
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
    selectedSupervisorId = sup1?.lecturerId || sup2?.lecturerId || null;
  }
  if (!selectedSupervisorId) {
    const err = new Error("No supervisor assigned to this thesis");
    err.statusCode = 400;
    throw err;
  }

  // Schema baru: tidak perlu createGuidanceSchedule, requestedDate langsung di ThesisGuidance
  const created = await createGuidance({
    thesisId: thesis.id,
    requestedDate: guidanceDate, // Schema baru
    supervisorId: selectedSupervisorId,
    milestoneId: selectedMilestoneId, // Link to milestone
    studentNotes: studentNotes || `Request guidance on ${guidanceDate.toISOString()}`,
    supervisorFeedback: "",
    meetingUrl: meetingUrl || "",
    documentUrl: documentUrl || null, // Link dokumen yang akan dibahas
    type: type || "online",
    duration: duration || 60,
    location: location || null,
    status: "requested",
  });

  const milestoneInfo = milestoneName ? ` untuk milestone "${milestoneName}"` : "";
  await logThesisActivity(thesis.id, userId, "request-guidance", `Requested at ${guidanceDate.toISOString()}${milestoneInfo}`, "guidance");

  try {
    const supervisorsUserIds = supervisors.map((p) => p?.lecturer?.user?.id).filter(Boolean);
    const dateStr =
      formatDateTimeJakarta(guidanceDate, { withDay: true }) ||
      (guidanceDate instanceof Date ? guidanceDate.toISOString() : String(guidanceDate));
    const notifMessage = milestoneName
      ? `${studentName} mengajukan bimbingan untuk milestone "${milestoneName}". Jadwal: ${dateStr}`
      : `${studentName} mengajukan bimbingan. Jadwal: ${dateStr}`;
    await createNotificationsForUsers(supervisorsUserIds, {
      title: "Permintaan bimbingan baru",
      message: notifMessage,
    });
  } catch (e) {
    console.warn("Notify (DB) failed (guidance request):", e?.message || e);
  }

  try {
    const supUserIds = supervisors.map((p) => p?.lecturer?.user?.id).filter(Boolean);
    console.log(`[Guidance] Sending FCM requested -> supervisors=${supUserIds.join(',')} guidanceId=${created.id}`);
    // Schema baru: gunakan requestedDate
    const data = {
      type: "thesis-guidance:requested",
      role: "supervisor",
      guidanceId: String(created.id),
      thesisId: String(thesis.id),
      milestoneId: selectedMilestoneId || "",
      milestoneName: milestoneName || "",
      scheduledAt: created?.requestedDate ? new Date(created.requestedDate).toISOString() : "",
      scheduledAtFormatted: formatDateTimeJakarta(created?.requestedDate, { withDay: true }) || "",
      supervisorId: String(selectedSupervisorId),
      playSound: "true",
    };
    await sendFcmToUsers(supUserIds, {
      title: "Permintaan bimbingan baru",
      body: `${studentName} mengajukan bimbingan. Jadwal: ${
        data.scheduledAtFormatted || formatDateTimeJakarta(guidanceDate, { withDay: true }) || "-"
      }`,
      data,
      dataOnly: true,
    });
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

      await logThesisActivity(thesis.id, userId, "upload-thesis-document", `Uploaded ${file.originalname}`, "submission");
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
    type: created?.type || "online",
    supervisorId: created.supervisorId || null,
    supervisorName: sup?.lecturer?.user?.fullName || null,
    meetingUrl: created.meetingUrl || null,
    notes: created.studentNotes || null,
    supervisorFeedback: created.supervisorFeedback || null,
  };
  return { guidance: flat };
}

export async function rescheduleGuidanceService(userId, guidanceId, guidanceDate, studentNotes, options = {}) {
  const { type, duration, location } = options;
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
  if (guidance.status === "accepted" || guidance.status === "rejected") {
    const err = new Error("Cannot reschedule an accepted or rejected guidance");
    err.statusCode = 400;
    throw err;
  }
  
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
  if (type !== undefined) updateData.type = type;
  if (duration !== undefined) updateData.duration = duration;
  if (location !== undefined) updateData.location = location;
  
  const updated = await updateGuidanceById(guidance.id, updateData);
  await logThesisActivity(guidance.thesisId, userId, "reschedule-guidance", `New date ${guidanceDate.toISOString()}`, "guidance");
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
    meetingUrl: updated.meetingUrl || null,
    notes: updated.studentNotes || null,
    supervisorFeedback: updated.supervisorFeedback || null,
    type: updated.type || null,
    duration: updated.duration || null,
    location: updated.location || null,
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
  
  // Log activity before deleting
  await logThesisActivity(guidance.thesisId, userId, "delete-guidance-request", reason || "", "guidance");
  
  // Delete the guidance record (no notifications needed)
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
  await logThesisActivity(guidance.thesisId, userId, "update-student-notes", studentNotes || "", "guidance");
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
    meetingUrl: updated.meetingUrl || null,
    notes: updated.studentNotes || null,
    supervisorFeedback: updated.supervisorFeedback || null,
    type: updated.type || null,
    duration: updated.duration || null,
    location: updated.location || null,
  };
  return { guidance: flat };
}

export async function getMyProgressService(userId) {
  const { thesis } = await getActiveThesisOrThrow(userId);
  const components = await listProgressComponents();
  const completions = await getCompletionsForThesis(thesis.id);
  const byComponent = new Map(completions.map((c) => [c.componentId, c]));
  const items = components.map((c) => ({
    componentId: c.id,
    name: c.name,
    description: c.description,
    completedAt: byComponent.get(c.id)?.completedAt || null,
    validatedBySupervisor: Boolean(byComponent.get(c.id)?.validatedBySupervisor),
  }));
  return { thesisId: thesis.id, components: items };
}

export async function completeProgressComponentsService(userId, componentIds, completedAt) {
  const { thesis } = await getActiveThesisOrThrow(userId);
  const result = await upsertStudentCompletions(thesis.id, componentIds, completedAt);
  return { thesisId: thesis.id, ...result };
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
    type: g.type || null,
    duration: g.duration || null,
    location: g.location || null,
    completedAt: g.completedAt || null,
  }));
  return { count: items.length, items };
}

export async function activityLogService(userId) {
  const student = await getStudentByUserId(userId);
  ensureStudent(student);
  const items = await listActivityLogsByStudent(student.id);
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
  return { thesisId: thesis.id, supervisors };
}
