/**
 * DEV TOOLS ROUTES — status and dates of Seminar Hasil, Sidang, yudisium periods and yudisium
 * participants, as plain tables.
 * ⚠️ DELETE THIS FILE together with devtools.route.js.
 *
 * Mounted inside devtools.route.js, behind its guard: Admin only, and only outside production
 * unless ENABLE_DEVTOOLS is on. It sits in a subfolder on purpose: app.js mounts every
 * `routes/*.route.js` by itself, which would expose these routes without the guard.
 *
 * A change writes the columns directly: no side effect, no application rule, no notification.
 * Every change is recorded in the activity log with the Admin as actor and DevTools as source.
 */
import express from "express";

import prisma from "../../config/prisma.js";
import { AUDIT_ACTIONS, ENTITY_TYPES, logAudit } from "../../services/auditLog.service.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";

const router = express.Router();

export const EVENT_STATUSES = ["registered", "verified", "examiner_assigned", "scheduled", "passed", "passed_with_revision", "failed", "cancelled"];
export const PARTICIPANT_STATUSES = ["registered", "eligible", "appointed", "rejected", "finalized"];

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;
const DAY = 24 * HOUR;
const WIB_OFFSET = 7 * HOUR;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const actorOf = (req) => req.user?.sub ?? req.user?.id ?? null;
const pad = (n) => String(n).padStart(2, "0");
const clockText = (value) => (value ? `${pad(new Date(value).getUTCHours())}:${pad(new Date(value).getUTCMinutes())}` : null);
const dateText = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);
const clockValue = (hhmm) => new Date(`1970-01-01T${hhmm}:00.000Z`);

function wibSlot(moment) {
  const wib = new Date(moment.getTime() + WIB_OFFSET);
  return {
    date: new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate())),
    clock: `${pad(wib.getUTCHours())}:${pad(wib.getUTCMinutes())}`,
  };
}

/**
 * Schedule columns from a body: `preset` "now" (start five minutes ago, end two hours from
 * now, on the same day) or "past" (yesterday, same clock), or explicit `date`/`startTime`/`endTime`.
 */
export function scheduleFromBody(body, current, now = new Date()) {
  if (body.preset === "now") {
    const start = wibSlot(new Date(now.getTime() - 5 * MINUTE));
    const end = wibSlot(new Date(now.getTime() + 2 * HOUR));
    return { date: start.date, startTime: clockValue(start.clock), endTime: clockValue(end.date.getTime() === start.date.getTime() ? end.clock : "23:59") };
  }
  if (body.preset === "past") {
    return {
      date: new Date(wibSlot(now).date.getTime() - DAY),
      startTime: clockValue(clockText(current.startTime) ?? "09:00"),
      endTime: clockValue(clockText(current.endTime) ?? "11:00"),
    };
  }
  if (body.preset !== undefined) throw new BadRequestError("Pilihan jadwal cepat tidak dikenal.");
  const data = {};
  if (body.date !== undefined) {
    if (body.date === null || body.date === "") data.date = null;
    else if (!DATE.test(String(body.date))) throw new BadRequestError("Tanggal harus berformat YYYY-MM-DD.");
    else data.date = new Date(`${body.date}T00:00:00.000Z`);
  }
  for (const key of ["startTime", "endTime"]) {
    if (body[key] === undefined) continue;
    if (body[key] === null || body[key] === "") data[key] = null;
    else if (!CLOCK.test(String(body[key]))) throw new BadRequestError("Jam harus berformat HH:mm.");
    else data[key] = clockValue(body[key]);
  }
  return data;
}

function pageOf(query) {
  const pageSize = Math.min(Math.max(Number(query.pageSize) || 10, 1), 100);
  const page = Math.max(Number(query.page) || 1, 1);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

const studentSearch = (search) =>
  search ? { user: { OR: [{ fullName: { contains: search } }, { identityNumber: { contains: search } }] } } : undefined;

const meta = ({ page, pageSize }, total) => ({ page, pageSize, total, totalPages: Math.max(Math.ceil(total / pageSize), 1) });

// ─── Seminar Hasil and Sidang ──────────────────────────────────────────────────────────────

const EVENT_MODELS = { seminars: { model: "thesisSeminar", scope: "seminar", label: "Seminar" }, defences: { model: "thesisDefence", scope: "defence", label: "Sidang" } };
const EVENT_SELECT = {
  id: true,
  status: true,
  date: true,
  startTime: true,
  endTime: true,
  thesisId: true,
  thesis: { select: { student: { select: { user: { select: { fullName: true, identityNumber: true } } } } } },
};
const eventRow = (row) => ({
  id: row.id,
  status: row.status,
  date: dateText(row.date),
  startTime: clockText(row.startTime),
  endTime: clockText(row.endTime),
  studentName: row.thesis?.student?.user?.fullName ?? null,
  studentNim: row.thesis?.student?.user?.identityNumber ?? null,
});

for (const [path, config] of Object.entries(EVENT_MODELS)) {
  router.get(`/${path}`, async (req, res, next) => {
    try {
      const search = String(req.query.search ?? "").trim();
      const status = String(req.query.status ?? "").trim();
      if (status && !EVENT_STATUSES.includes(status)) throw new BadRequestError("Status tidak dikenal.");
      const paging = pageOf(req.query);
      const where = { ...(status ? { status } : {}), ...(search ? { thesis: { student: studentSearch(search) } } : {}) };
      const [rows, total] = await Promise.all([
        prisma[config.model].findMany({ where, select: EVENT_SELECT, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip: paging.skip, take: paging.take }),
        prisma[config.model].count({ where }),
      ]);
      res.json({ success: true, data: rows.map(eventRow), meta: meta(paging, total) });
    } catch (err) {
      next(err);
    }
  });

  // body: { status?, date?, startTime?, endTime? } or { preset: "now" | "past" }
  router.patch(`/${path}/:id`, async (req, res, next) => {
    try {
      const existing = await prisma[config.model].findUnique({ where: { id: req.params.id }, select: EVENT_SELECT });
      if (!existing) throw new NotFoundError(`${config.label} tidak ditemukan.`);
      const body = req.body ?? {};
      const data = scheduleFromBody(body, existing);
      if (body.status !== undefined) {
        if (!EVENT_STATUSES.includes(body.status)) throw new BadRequestError("Status tidak dikenal.");
        data.status = body.status;
      }
      if (Object.keys(data).length === 0) throw new BadRequestError("Tidak ada yang diubah.");
      const updated = await prisma[config.model].update({ where: { id: existing.id }, data, select: EVENT_SELECT });
      const before = eventRow(existing);
      const after = eventRow(updated);
      const keys = ["status", "date", "startTime", "endTime"].filter((key) => before[key] !== after[key]);
      const pick = (row) => Object.fromEntries(keys.map((key) => [key === "status" ? "eventStatus" : key, row[key]]));
      await logAudit({
        actorUserId: actorOf(req),
        action: AUDIT_ACTIONS.DEVTOOLS_DATA_CHANGED,
        entityType: ENTITY_TYPES.THESIS,
        entityId: existing.thesisId,
        oldValues: pick(before),
        newValues: pick(after),
        metadata: { source: "devtools", operation: "update", scope: config.scope },
      });
      res.json({ success: true, data: after, message: `${config.label} diperbarui` });
    } catch (err) {
      next(err);
    }
  });
}

// ─── Yudisium periods ──────────────────────────────────────────────────────────────────────

const PERIOD_FIELDS = ["registrationOpenDate", "registrationCloseDate", "eventDate"];
const PERIOD_SELECT = { id: true, name: true, registrationOpenDate: true, registrationCloseDate: true, eventDate: true };

router.get("/yudisium-periods", async (req, res, next) => {
  try {
    const search = String(req.query.search ?? "").trim();
    const paging = pageOf(req.query);
    const where = search ? { name: { contains: search } } : {};
    const [rows, total] = await Promise.all([
      prisma.yudisium.findMany({ where, select: PERIOD_SELECT, orderBy: [{ registrationOpenDate: "desc" }, { createdAt: "desc" }], skip: paging.skip, take: paging.take }),
      prisma.yudisium.count({ where }),
    ]);
    res.json({ success: true, data: rows, meta: meta(paging, total) });
  } catch (err) {
    next(err);
  }
});

// body: { registrationOpenDate?, registrationCloseDate?, eventDate? } as ISO timestamps; null clears
router.patch("/yudisium-periods/:id", async (req, res, next) => {
  try {
    const existing = await prisma.yudisium.findUnique({ where: { id: req.params.id }, select: PERIOD_SELECT });
    if (!existing) throw new NotFoundError("Periode yudisium tidak ditemukan.");
    const data = {};
    for (const field of PERIOD_FIELDS) {
      const raw = req.body?.[field];
      if (raw === undefined) continue;
      if (raw === null || raw === "") { data[field] = null; continue; }
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) throw new BadRequestError("Tanggal tidak valid.");
      data[field] = date;
    }
    if (Object.keys(data).length === 0) throw new BadRequestError("Tidak ada tanggal yang diubah.");
    const updated = await prisma.yudisium.update({ where: { id: existing.id }, data, select: PERIOD_SELECT });
    const pick = (row) => Object.fromEntries(Object.keys(data).map((key) => [key, row[key]]));
    await logAudit({
      actorUserId: actorOf(req),
      action: AUDIT_ACTIONS.DEVTOOLS_DATA_CHANGED,
      entityType: ENTITY_TYPES.YUDISIUM,
      entityId: existing.id,
      oldValues: pick(existing),
      newValues: pick(updated),
      metadata: { source: "devtools", operation: "update", scope: "yudisium" },
    });
    res.json({ success: true, data: updated, message: "Periode yudisium diperbarui" });
  } catch (err) {
    next(err);
  }
});

// ─── Yudisium participants ─────────────────────────────────────────────────────────────────

const PARTICIPANT_SELECT = {
  id: true,
  status: true,
  yudisium: { select: { id: true, name: true } },
  thesis: { select: { studentId: true, student: { select: { user: { select: { fullName: true, identityNumber: true } } } } } },
};
const participantRow = (row) => ({
  id: row.id,
  status: row.status,
  periodId: row.yudisium?.id ?? null,
  periodName: row.yudisium?.name ?? null,
  studentName: row.thesis?.student?.user?.fullName ?? null,
  studentNim: row.thesis?.student?.user?.identityNumber ?? null,
});

router.get("/yudisium-participants", async (req, res, next) => {
  try {
    const search = String(req.query.search ?? "").trim();
    const status = String(req.query.status ?? "").trim();
    if (status && !PARTICIPANT_STATUSES.includes(status)) throw new BadRequestError("Status tidak dikenal.");
    const paging = pageOf(req.query);
    const where = { ...(status ? { status } : {}), ...(search ? { thesis: { student: studentSearch(search) } } : {}) };
    const [rows, total] = await Promise.all([
      prisma.yudisiumParticipant.findMany({ where, select: PARTICIPANT_SELECT, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip: paging.skip, take: paging.take }),
      prisma.yudisiumParticipant.count({ where }),
    ]);
    res.json({ success: true, data: rows.map(participantRow), meta: meta(paging, total) });
  } catch (err) {
    next(err);
  }
});

router.patch("/yudisium-participants/:id", async (req, res, next) => {
  try {
    const status = req.body?.status;
    if (!PARTICIPANT_STATUSES.includes(status)) throw new BadRequestError("Status tidak dikenal.");
    const existing = await prisma.yudisiumParticipant.findUnique({ where: { id: req.params.id }, select: PARTICIPANT_SELECT });
    if (!existing) throw new NotFoundError("Peserta yudisium tidak ditemukan.");
    const updated = await prisma.yudisiumParticipant.update({ where: { id: existing.id }, data: { status }, select: PARTICIPANT_SELECT });
    await logAudit({
      actorUserId: actorOf(req),
      action: AUDIT_ACTIONS.DEVTOOLS_DATA_CHANGED,
      entityType: ENTITY_TYPES.STUDENT,
      entityId: existing.thesis?.studentId ?? null,
      oldValues: { participantStatus: existing.status },
      newValues: { participantStatus: status },
      metadata: { source: "devtools", operation: "update", scope: "yudisium" },
    });
    res.json({ success: true, data: participantRow(updated), message: "Status peserta diperbarui" });
  } catch (err) {
    next(err);
  }
});

export default router;
