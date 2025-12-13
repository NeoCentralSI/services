import {
  getStudentByUserId,
  getActiveThesisForStudent,
  getSupervisorsForThesis,
  listGuidancesForThesis,
  getGuidanceByIdForStudent,
  createGuidanceSchedule,
  createGuidance,
  updateGuidanceScheduleDate,
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
import fs from "fs";
import path from "path";
import { promisify } from "util";
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

async function ensureThesisAcademicYear(thesis) {
  if (thesis.academicYearId) return thesis;
  const now = new Date();
  const current = await prisma.academicYear.findFirst({
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

async function logThesisActivity(thesisId, userId, activity, notes) {
  try {
    await prisma.thesisActivityLog.create({
      data: {
        thesisId,
        userId,
        activity,
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

export async function listMyGuidancesService(userId, status) {
  const { thesis } = await getActiveThesisOrThrow(userId);
  const rows = await listGuidancesForThesis(thesis.id, status);
  rows.sort((a, b) => {
    const at = a?.schedule?.guidanceDate ? new Date(a.schedule.guidanceDate).getTime() : 0;
    const bt = b?.schedule?.guidanceDate ? new Date(b.schedule.guidanceDate).getTime() : 0;
    if (bt !== at) return bt - at;
    return String(b.id).localeCompare(String(a.id));
  });
  const items = rows.map((g) => ({
    id: g.id,
    status: g.status,
    scheduledAt: g?.schedule?.guidanceDate || null,
    scheduledAtFormatted: g?.schedule?.guidanceDate ? formatDateTimeJakarta(g.schedule.guidanceDate, { withDay: true }) : null,
    schedule: g?.schedule
      ? { id: g.schedule.id, guidanceDate: g.schedule.guidanceDate, guidanceDateFormatted: formatDateTimeJakarta(g.schedule.guidanceDate, { withDay: true }) }
      : null,
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
  const flat = {
    id: guidance.id,
    status: guidance.status,
    scheduledAt: guidance?.schedule?.guidanceDate || null,
    scheduledAtFormatted: guidance?.schedule?.guidanceDate ? formatDateTimeJakarta(guidance.schedule.guidanceDate, { withDay: true }) : null,
    schedule: guidance?.schedule
      ? { id: guidance.schedule.id, guidanceDate: guidance.schedule.guidanceDate, guidanceDateFormatted: formatDateTimeJakarta(guidance.schedule.guidanceDate, { withDay: true }) }
      : null,
    supervisorId: guidance.supervisorId || null,
    supervisorName: guidance?.supervisor?.user?.fullName || null,
    meetingUrl: guidance.meetingUrl || null,
    notes: guidance.studentNotes || null,
    supervisorFeedback: guidance.supervisorFeedback || null,
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

export async function requestGuidanceService(userId, guidanceDate, studentNotes, file, meetingUrl, supervisorId) {
  let { student, thesis } = await getActiveThesisOrThrow(userId);
  thesis = await ensureThesisAcademicYear(thesis);
  
  // Get student name for notifications - convert to Title Case
  const studentUser = await prisma.user.findUnique({ where: { id: userId } });
  const studentName = toTitleCaseName(studentUser?.fullName || "Mahasiswa");
  
  // Check if there's any pending request (status: requested)
  const pendingRequest = await prisma.thesisGuidance.findFirst({
    where: {
      thesisId: thesis.id,
      status: "requested",
    },
    include: {
      schedule: true,
    },
  });
  
  if (pendingRequest) {
    const dateStr = pendingRequest?.schedule?.guidanceDate 
      ? formatDateTimeJakarta(new Date(pendingRequest.schedule.guidanceDate), { withDay: true })
      : "belum ditentukan";
    const err = new Error(`Anda masih memiliki pengajuan bimbingan yang belum direspon oleh dosen (jadwal: ${dateStr}). Tunggu hingga dosen menyetujui atau menolak pengajuan sebelumnya.`);
    err.statusCode = 400;
    throw err;
  }
  
  const supervisors = await getSupervisorsForThesis(thesis.id);
  const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, "");
  const sup1 = supervisors.find((p) => norm(p.role?.name) === "pembimbing1");
  const sup2 = supervisors.find((p) => norm(p.role?.name) === "pembimbing2");
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

  const schedule = await createGuidanceSchedule(guidanceDate);
  const created = await createGuidance({
    thesisId: thesis.id,
    scheduleId: schedule.id,
    supervisorId: selectedSupervisorId,
    studentNotes: studentNotes || `Request guidance on ${guidanceDate.toISOString()}`,
    supervisorFeedback: "",
    meetingUrl: meetingUrl || "",
    status: "requested",
  });

  await logThesisActivity(thesis.id, userId, "request-guidance", `Requested at ${guidanceDate.toISOString()}`);

  try {
    const supervisorsUserIds = supervisors.map((p) => p?.lecturer?.user?.id).filter(Boolean);
    const dateStr =
      formatDateTimeJakarta(guidanceDate, { withDay: true }) ||
      (guidanceDate instanceof Date ? guidanceDate.toISOString() : String(guidanceDate));
    await createNotificationsForUsers(supervisorsUserIds, {
      title: "Permintaan bimbingan baru",
      message: `${studentName} mengajukan bimbingan. Jadwal: ${dateStr}`,
    });
  } catch (e) {
    console.warn("Notify (DB) failed (guidance request):", e?.message || e);
  }

  try {
    const supUserIds = supervisors.map((p) => p?.lecturer?.user?.id).filter(Boolean);
    console.log(`[Guidance] Sending FCM requested -> supervisors=${supUserIds.join(',')} guidanceId=${created.id}`);
    const data = {
      type: "thesis-guidance:requested",
      role: "supervisor",
      guidanceId: String(created.id),
      thesisId: String(thesis.id),
      scheduledAt: schedule?.guidanceDate ? new Date(schedule.guidanceDate).toISOString() : "",
      scheduledAtFormatted: formatDateTimeJakarta(schedule?.guidanceDate, { withDay: true }) || "",
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
      const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
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

      await logThesisActivity(thesis.id, userId, "upload-thesis-document", `Uploaded ${file.originalname}`);
    } catch (err) {
      console.error("Failed to store uploaded thesis file:", err.message || err);
    }
  }

  const supMap = new Map(supervisors.map((p) => [p.lecturerId, p]));
  const sup = supMap.get(selectedSupervisorId);
  const flat = {
    id: created.id,
    status: created.status,
    scheduledAt: schedule?.guidanceDate || null,
    scheduledAtFormatted: schedule?.guidanceDate ? formatDateTimeJakarta(schedule.guidanceDate, { withDay: true }) : null,
    scheduleId: schedule?.id || null,
    schedule: schedule ? { id: schedule.id, guidanceDate: schedule.guidanceDate, guidanceDateFormatted: formatDateTimeJakarta(schedule.guidanceDate, { withDay: true }) } : null,
    supervisorId: created.supervisorId || null,
    supervisorName: sup?.lecturer?.user?.fullName || null,
    meetingUrl: created.meetingUrl || null,
    notes: created.studentNotes || null,
    supervisorFeedback: created.supervisorFeedback || null,
  };
  return { guidance: flat };
}

export async function rescheduleGuidanceService(userId, guidanceId, guidanceDate, studentNotes) {
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
      data: {
        studentCalendarEventId: null,
        supervisorCalendarEventId: null,
      },
    });
  } catch (e) {
    console.error("Failed to delete old calendar events:", e?.message || e);
  }
  
  // update schedule date
  if (guidance.scheduleId) {
    await updateGuidanceScheduleDate(guidance.scheduleId, guidanceDate);
  } else {
    const schedule = await createGuidanceSchedule(guidanceDate);
    await updateGuidanceById(guidance.id, { scheduleId: schedule.id });
  }
  const updated = await updateGuidanceById(guidance.id, {
    studentNotes: studentNotes || guidance.studentNotes || "",
    supervisorFeedback: "", // back to pending
  });
  await logThesisActivity(guidance.thesisId, userId, "reschedule-guidance", `New date ${guidanceDate.toISOString()}`);
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
    scheduledAt: updated?.schedule?.guidanceDate || null,
    scheduledAtFormatted: updated?.schedule?.guidanceDate ? formatDateTimeJakarta(updated.schedule.guidanceDate, { withDay: true }) : null,
    schedule: updated?.schedule
      ? { id: updated.schedule.id, guidanceDate: updated.schedule.guidanceDate, guidanceDateFormatted: formatDateTimeJakarta(updated.schedule.guidanceDate, { withDay: true }) }
      : null,
    supervisorId: updated.supervisorId || null,
    supervisorName: null,
    meetingUrl: updated.meetingUrl || null,
    notes: updated.studentNotes || null,
    supervisorFeedback: updated.supervisorFeedback || null,
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
  await logThesisActivity(guidance.thesisId, userId, "delete-guidance-request", reason || "");
  
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
  await logThesisActivity(guidance.thesisId, userId, "update-student-notes", studentNotes || "");
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
      role: "supervisor",
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
      data: { ...data, role: "student" } 
    });
  } catch (e) {
    console.warn("FCM notify failed (notes updated):", e?.message || e);
  }
  const flat = {
    id: updated.id,
    status: updated.status,
    scheduledAt: updated?.schedule?.guidanceDate || null,
    schedule: updated?.schedule
      ? { id: updated.schedule.id, guidanceDate: updated.schedule.guidanceDate }
      : null,
    supervisorId: updated.supervisorId || null,
    supervisorName: null,
    meetingUrl: updated.meetingUrl || null,
    notes: updated.studentNotes || null,
    supervisorFeedback: updated.supervisorFeedback || null,
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
    scheduledAt: g?.schedule?.guidanceDate || null,
    scheduledAtFormatted: g?.schedule?.guidanceDate ? formatDateTimeJakarta(g.schedule.guidanceDate, { withDay: true }) : null,
    schedule: g?.schedule
      ? { id: g.schedule.id, guidanceDate: g.schedule.guidanceDate, guidanceDateFormatted: formatDateTimeJakarta(g.schedule.guidanceDate, { withDay: true }) }
      : null,
    supervisorId: g.supervisorId || null,
    supervisorName: g?.supervisor?.user?.fullName || null,
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
