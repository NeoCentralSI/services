/**
 * DEV TOOLS — helpers shared by the Seminar Hasil, Sidang TA and Yudisium tools.
 * ⚠️ DELETE THIS DIRECTORY (services/devtools/) together with routes/devtools*.route.js.
 *
 * DevTools writes straight to the database, sends no notification or email, and records every
 * write in the audit log with the Admin as actor and "devtools" as source.
 */
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import prisma from "../../config/prisma.js";
import { AUDIT_ACTIONS, logAudit } from "../auditLog.service.js";
import { BadRequestError, ConflictError, NotFoundError } from "../../utils/errors.js";

export const DEVTOOLS_SOURCE = "devtools";

export const HOUR = 60 * 60 * 1000;
export const MINUTE = 60 * 1000;
export const DAY = 24 * HOUR;
const WIB_OFFSET = 7 * HOUR;

export { BadRequestError, ConflictError, NotFoundError };

/** One audit row per DevTools write: the Admin as actor, "devtools" as source. */
export function logDevtoolsChange({ actorUserId, entityType, entityId, operation, scope = null, oldValues = null, newValues = null, details = null }) {
  return logAudit({
    actorUserId: actorUserId ?? null,
    action: AUDIT_ACTIONS.DEVTOOLS_DATA_CHANGED,
    entityType,
    entityId,
    oldValues,
    newValues,
    metadata: { source: DEVTOOLS_SOURCE, operation, ...(scope ? { scope } : {}), ...(details ? { details } : {}) },
  });
}

// ─── Time, the way the seminar and defence modules store it ─────────────────────────────────

/** A moment as WIB wall-clock parts. */
export function wibParts(moment) {
  const wib = new Date(moment.getTime() + WIB_OFFSET);
  return {
    date: new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate())),
    hours: wib.getUTCHours(),
    minutes: wib.getUTCMinutes(),
  };
}

/** `HH:mm` → the `@db.Time` value (1970-01-01, read in UTC). */
export function clockValue(hhmm) {
  return new Date(`1970-01-01T${hhmm}:00.000Z`);
}

export function clockText(value) {
  if (!value) return null;
  const d = new Date(value);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

const pad = (n) => String(n).padStart(2, "0");

/** `@db.Date` value of a calendar day `YYYY-MM-DD`. */
export function calendarDate(text) {
  return new Date(`${text}T00:00:00.000Z`);
}

export function calendarText(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : null;
}

/** The start of an event (calendar date + WIB clock) as an absolute moment. */
export function eventStart(date, startTime) {
  if (!date || !startTime) return null;
  const d = new Date(date);
  const t = new Date(startTime);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), t.getUTCHours() - 7, t.getUTCMinutes()));
}

/**
 * Schedule columns for a window that starts `startOffsetMs` from now and lasts `durationMs`.
 * The end is kept on the same calendar day.
 */
export function scheduleAround(now, startOffsetMs, durationMs) {
  const start = wibParts(new Date(now.getTime() + startOffsetMs));
  const startMinutes = start.hours * 60 + start.minutes;
  const endMinutes = Math.min(startMinutes + Math.round(durationMs / MINUTE), 23 * 60 + 59);
  return {
    date: start.date,
    startTime: clockValue(`${pad(start.hours)}:${pad(start.minutes)}`),
    endTime: clockValue(`${pad(Math.floor(endMinutes / 60))}:${pad(endMinutes % 60)}`),
  };
}

// ─── Files ─────────────────────────────────────────────────────────────────────────────────

/** A small one-page PDF that stands in for an uploaded document. */
export async function buildSamplePdf(title, lines = []) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  page.drawText(String(title).slice(0, 80), { x: 56, y: 770, size: 16, font: bold, color: rgb(0.1, 0.1, 0.1) });
  page.drawText("Dokumen contoh untuk uji coba (DevTools NeoCentral)", { x: 56, y: 745, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  lines.slice(0, 20).forEach((line, index) => {
    page.drawText(String(line).slice(0, 90), { x: 56, y: 710 - index * 18, size: 11, font });
  });
  return Buffer.from(await doc.save());
}

/** Writes a sample PDF under `uploads/…` and returns the file columns the modules store. */
export async function writeSamplePdf(relativeDir, fileName, title, lines = []) {
  const buffer = await buildSamplePdf(title, lines);
  const relativePath = path.posix.join(relativeDir, fileName);
  await fs.mkdir(path.resolve(process.cwd(), relativeDir), { recursive: true });
  await fs.writeFile(path.resolve(process.cwd(), relativePath), buffer);
  return {
    filePath: relativePath,
    fileName,
    mimeType: "application/pdf",
    fileSize: buffer.length,
    fileHash: crypto.createHash("sha256").update(buffer).digest("hex"),
  };
}

/** Removes uploaded files; a file that is already gone is fine. */
export async function removeFiles(relativePaths) {
  for (const relativePath of relativePaths.filter(Boolean)) {
    await fs.unlink(path.resolve(process.cwd(), relativePath)).catch(() => {});
  }
}

// ─── Official documents with a verification QR ─────────────────────────────────────────────

/**
 * Current official documents of a source. A revoked document still verifies, with the status
 * "Dokumen telah dicabut"; the next download issues a new version, as in the modules.
 */
export function countCurrentOfficialDocuments(client, sourceId, kinds) {
  return client.officialGeneratedDocument.count({
    where: { sourceId, status: "current", ...(kinds ? { documentKind: { in: kinds } } : {}) },
  });
}

export async function revokeOfficialDocuments(client, sourceId, kinds, now = new Date()) {
  const result = await client.officialGeneratedDocument.updateMany({
    where: { sourceId, status: "current", ...(kinds ? { documentKind: { in: kinds } } : {}) },
    data: { status: "revoked", revokedAt: now },
  });
  return result.count ?? 0;
}

// ─── Lookups ───────────────────────────────────────────────────────────────────────────────

/** The lecturer acting for the department where a module stores a lecturer (GKM, Kadep). */
export async function findLecturerWithRole(client, roleName) {
  const row = await client.userHasRole.findFirst({
    where: { status: "active", role: { name: roleName }, user: { lecturer: { isNot: null } } },
    select: { userId: true },
    orderBy: { userId: "asc" },
  });
  return row?.userId ?? null;
}

export async function requireStudent(studentId, client = prisma) {
  const student = await client.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      status: true,
      sksCompleted: true,
      researchMethodCompleted: true,
      mandatoryCoursesCompleted: true,
      mkwuCompleted: true,
      internshipCompleted: true,
      kknCompleted: true,
      user: { select: { fullName: true, identityNumber: true } },
    },
  });
  if (!student) throw new NotFoundError("Mahasiswa tidak ditemukan");
  return student;
}

/** The student's current thesis: the latest one that has not failed. */
export function findCurrentThesis(client, studentId) {
  return client.thesis.findFirst({
    where: { studentId, status: { in: ["proposal", "research", "completed"] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, title: true, status: true, studentId: true },
  });
}

export function parseDateInput(value, label) {
  if (value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestError(`${label} bukan tanggal yang valid.`);
  return date;
}

export { prisma };
