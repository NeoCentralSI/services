/**
 * Calendar and Agenda Mendatang of the dashboard. Events come from the data in force (no copy is
 * stored), so a cancelled or rescheduled seminar or defence leaves no old event.
 *
 * Who sees what:
 * - Bimbingan: the student and the lecturer of that session.
 * - Seminar Hasil: the presenting student, Pembimbing 1 and 2, the examiners, Admin, and the
 *   students registered as its audience.
 * - Sidang: the student, Pembimbing 1 and 2, the examiners, Admin (no audience).
 * - Yudisium (the event of a period): everyone.
 * Seminars and defences appear once their schedule is set (status scheduled or later), never when
 * cancelled. Examiners who declined are not participants.
 */
import prisma from "../config/prisma.js";
import { getRoleCategory, ROLE_CATEGORY } from "../constants/roles.js";
import { SCHEDULED_GUIDANCE_STATUSES, effectiveGuidanceDate } from "../constants/guidanceStatus.js";
import { computeEffectiveStatus } from "../utils/seminarStatus.util.js";

/** Seminar and defence statuses that have a schedule in force. */
const SCHEDULED_EVENT_STATUSES = ["scheduled", "passed", "passed_with_revision", "failed"];

const EVENT_STATUS_LABELS = {
  scheduled: "Terjadwal",
  ongoing: "Sedang Berlangsung",
  passed: "Lulus",
  passed_with_revision: "Lulus dengan Revisi",
  failed: "Tidak Lulus",
};
const GUIDANCE_STATUS_LABELS = { accepted: "Diterima", rescheduled: "Diterima" };

export const EVENT_KIND_LABELS = {
  guidance: "Bimbingan",
  seminar: "Seminar Hasil",
  defence: "Sidang",
  yudisium: "Yudisium",
};

const COLORS = { guidance: "#3b82f6", seminar: "#8b5cf6", defence: "#f97316", yudisium: "#059669" };

const pad = (n) => String(n).padStart(2, "0");

/**
 * The instant of a seminar or defence: the stored calendar date (`@db.Date`, UTC midnight of the
 * WIB date) with the stored WIB wall-clock time (`@db.Time`).
 */
export function combineWibDateTime(date, time) {
  if (!date) return null;
  const d = new Date(date);
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (!time) return new Date(`${day}T00:00:00+07:00`).toISOString();
  const t = new Date(time);
  return new Date(`${day}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:00+07:00`).toISOString();
}

const inRange = (startDate, endDate) =>
  startDate && endDate ? { gte: new Date(startDate), lte: new Date(endDate) } : undefined;

/** Who is asking: student and lecturer records, and whether an active role is an Admin one. */
async function resolveViewer(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      student: { select: { id: true } },
      lecturer: { select: { id: true } },
      userHasRoles: { where: { status: "active" }, select: { role: { select: { name: true } } } },
    },
  });
  if (!user) throw Object.assign(new Error("Pengguna tidak ditemukan"), { statusCode: 404 });
  const categories = new Set(user.userHasRoles.map((r) => getRoleCategory(r.role?.name)));
  return {
    userId: user.id,
    studentId: user.student?.id ?? null,
    lecturerId: user.lecturer?.id ?? null,
    isAdmin: categories.has(ROLE_CATEGORY.ADMIN),
    isStudent: !!user.student,
    isLecturer: !!user.lecturer,
  };
}

async function guidanceEvents(viewer, range) {
  const owners = [];
  if (viewer.isStudent) owners.push({ thesis: { studentId: viewer.studentId } });
  if (viewer.isLecturer) owners.push({ supervisorId: viewer.lecturerId });
  if (owners.length === 0) return [];
  const guidances = await prisma.thesisGuidance.findMany({
    where: {
      status: { in: SCHEDULED_GUIDANCE_STATUSES },
      OR: owners,
      ...(range && { AND: [{ OR: [{ requestedDate: range }, { approvedDate: range }] }] }),
    },
    include: {
      supervisor: { include: { user: { select: { id: true, fullName: true } } } },
      thesis: { include: { student: { include: { user: { select: { id: true, fullName: true } } } } } },
    },
  });
  return guidances
    .filter((g) => g.requestedDate)
    .map((g) => {
      const student = g.thesis?.student?.user;
      const lecturer = g.supervisor?.user;
      const asLecturer = viewer.isLecturer && g.supervisorId === viewer.lecturerId;
      const at = effectiveGuidanceDate(g);
      return {
        id: `guidance-${g.id}`,
        kind: "guidance",
        kindLabel: EVENT_KIND_LABELS.guidance,
        type: asLecturer ? "student_guidance" : "guidance_scheduled",
        title: `Bimbingan – ${(asLecturer ? student?.fullName : lecturer?.fullName) ?? "-"}`,
        description: g.studentNotes || "Sesi bimbingan tugas akhir",
        status: "accepted",
        statusLabel: GUIDANCE_STATUS_LABELS[g.status] ?? "Diterima",
        startDate: at,
        endDate: at,
        relatedId: g.id,
        relatedType: "thesis_guidance",
        location: null,
        meetingLink: null,
        participants: [
          student && { userId: student.id, name: student.fullName, role: "student", roleLabel: "Mahasiswa" },
          lecturer && { userId: lecturer.id, name: lecturer.fullName, role: "lecturer", roleLabel: "Dosen Pembimbing" },
        ].filter(Boolean),
        // The copy of the session in the viewer's own Outlook calendar, when it was synced.
        outlookEventId: asLecturer ? g.supervisorCalendarEventId ?? null : g.studentCalendarEventId ?? null,
        detailPath: asLecturer ? `/tugas-akhir/bimbingan/lecturer/session/${g.id}` : `/tugas-akhir/bimbingan/student/session/${g.id}`,
        color: COLORS.guidance,
      };
    });
}

/** Seminars or defences the viewer may see, with their people. */
async function thesisEvents(viewer, range, kind) {
  const model = kind === "seminar" ? prisma.thesisSeminar : prisma.thesisDefence;
  const visible = [];
  if (viewer.isStudent) {
    visible.push({ thesis: { studentId: viewer.studentId } });
    if (kind === "seminar") visible.push({ audiences: { some: { studentId: viewer.studentId } } });
  }
  if (viewer.isLecturer) {
    visible.push({ thesis: { thesisSupervisors: { some: { lecturerId: viewer.lecturerId } } } });
    visible.push({ examiners: { some: { lecturerId: viewer.lecturerId, availabilityStatus: { not: "unavailable" } } } });
  }
  if (!viewer.isAdmin && visible.length === 0) return [];
  const rows = await model.findMany({
    where: {
      status: { in: SCHEDULED_EVENT_STATUSES },
      date: range ?? { not: null },
      // Admin sees every seminar and defence ("OR: [{}]" would match nothing).
      ...(viewer.isAdmin ? {} : { OR: visible }),
    },
    include: {
      room: { select: { name: true } },
      thesis: {
        select: {
          title: true,
          student: { select: { user: { select: { id: true, fullName: true } } } },
          thesisSupervisors: {
            orderBy: { role: { name: "asc" } },
            select: { role: { select: { name: true } }, lecturer: { select: { user: { select: { id: true, fullName: true } } } } },
          },
        },
      },
      examiners: {
        where: { availabilityStatus: { not: "unavailable" } },
        orderBy: { order: "asc" },
        select: { order: true, lecturerId: true },
      },
    },
  });
  const examinerIds = [...new Set(rows.flatMap((r) => r.examiners.map((e) => e.lecturerId)))];
  const examinerUsers = examinerIds.length
    ? await prisma.user.findMany({ where: { id: { in: examinerIds } }, select: { id: true, fullName: true } })
    : [];
  const nameOf = new Map(examinerUsers.map((u) => [u.id, u.fullName]));

  return rows.map((row) => {
    const student = row.thesis?.student?.user;
    const effective = computeEffectiveStatus(row.status, row.date, row.startTime, row.endTime);
    const isExaminer = viewer.isLecturer && row.examiners.some((e) => e.lecturerId === viewer.lecturerId);
    const label = EVENT_KIND_LABELS[kind];
    return {
      id: `${kind}-${row.id}`,
      kind,
      kindLabel: label,
      type: kind === "seminar" ? (isExaminer ? "seminar_as_examiner" : "seminar_scheduled") : (isExaminer ? "defense_as_examiner" : "defense_scheduled"),
      title: `${label} – ${student?.fullName ?? "-"}`,
      description: row.thesis?.title ?? null,
      status: effective,
      statusLabel: EVENT_STATUS_LABELS[effective] ?? effective,
      startDate: combineWibDateTime(row.date, row.startTime),
      endDate: combineWibDateTime(row.date, row.endTime ?? row.startTime),
      relatedId: row.id,
      relatedType: kind === "seminar" ? "thesis_seminar" : "thesis_defence",
      location: row.room?.name ?? (row.meetingLink ? "Daring" : "TBA"),
      meetingLink: row.meetingLink ?? null,
      participants: [
        student && { userId: student.id, name: student.fullName, role: "student", roleLabel: "Mahasiswa" },
        ...(row.thesis?.thesisSupervisors ?? []).map((s) => ({
          userId: s.lecturer?.user?.id,
          name: s.lecturer?.user?.fullName,
          role: "lecturer",
          roleLabel: s.role?.name ?? "Pembimbing",
        })),
        ...row.examiners.map((e) => ({ userId: e.lecturerId, name: nameOf.get(e.lecturerId) ?? "-", role: "lecturer", roleLabel: `Penguji ${e.order}` })),
      ].filter(Boolean),
      outlookEventId: null,
      detailPath: kind === "seminar" ? `/tugas-akhir/seminar-hasil/${row.id}` : `/tugas-akhir/sidang/${row.id}`,
      color: COLORS[kind],
    };
  });
}

async function yudisiumEvents(viewer, range) {
  const periods = await prisma.yudisium.findMany({
    where: { eventDate: range ?? { not: null } },
    select: { id: true, name: true, eventDate: true, room: { select: { name: true } } },
  });
  return periods.map((p) => ({
    id: `yudisium-${p.id}`,
    kind: "yudisium",
    kindLabel: EVENT_KIND_LABELS.yudisium,
    type: "yudisium_event",
    title: `Yudisium – ${p.name}`,
    description: null,
    status: null,
    statusLabel: null,
    startDate: p.eventDate,
    endDate: p.eventDate,
    relatedId: p.id,
    relatedType: "yudisium",
    location: p.room?.name ?? null,
    meetingLink: null,
    participants: [],
    outlookEventId: null,
    // Staff open the period; a student their own Yudisium page; nobody else has a page for it.
    detailPath: viewer.isAdmin || viewer.isLecturer ? `/yudisium/${p.id}` : viewer.isStudent ? "/yudisium" : null,
    color: COLORS.yudisium,
  }));
}

/**
 * Events of the viewer between two dates (all events in force when no range is given), sorted by
 * time. `userRole` is kept for the callers; the viewer's records and roles decide.
 */
export async function getMyCalendarEvents(userId, _userRole, filters = {}) {
  const { startDate, endDate, types } = filters;
  const viewer = await resolveViewer(userId);
  const range = inRange(startDate, endDate);
  const lists = await Promise.all([
    guidanceEvents(viewer, range),
    thesisEvents(viewer, range, "seminar"),
    thesisEvents(viewer, range, "defence"),
    yudisiumEvents(viewer, range),
  ]);
  let events = lists.flat();
  if (types?.length && !types.includes("all")) events = events.filter((e) => types.includes(e.type) || types.includes(e.kind));
  events.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  return { events };
}

/** Agenda Mendatang: the same events, from now on, the first `limit`. */
export async function getUpcomingEvents(userId, userRole, days = 90, limit = 5) {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + days);
  const { events } = await getMyCalendarEvents(userId, userRole, { startDate: now.toISOString(), endDate: end.toISOString() });
  return { events: events.filter((e) => new Date(e.endDate ?? e.startDate) >= now).slice(0, limit) };
}

/** Counts for the dashboard: today, the next 7 days, this month. */
export async function getEventStatistics(userId, userRole) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const next7Days = new Date(now);
  next7Days.setDate(next7Days.getDate() + 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const week = await getMyCalendarEvents(userId, userRole, { startDate: todayStart.toISOString(), endDate: next7Days.toISOString() });
  const month = await getMyCalendarEvents(userId, userRole, { startDate: monthStart.toISOString(), endDate: monthEnd.toISOString() });
  return {
    todayEvents: week.events.filter((e) => new Date(e.startDate) <= todayEnd).length,
    upcomingEvents: week.events.length,
    completedThisMonth: month.events.filter((e) => e.kind === "guidance").length,
    pendingActions: 0,
  };
}
