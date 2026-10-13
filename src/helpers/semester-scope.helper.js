/**
 * Semester scope of the monitoring pages (Paket E3): the single source for "this thesis runs
 * in that semester" and "this seminar or defence belongs to that semester". Pure: every
 * monitoring query takes its `where` from here, and the predicates state the same rules for
 * one row.
 */
import { CLOSED_THESIS_STATUSES } from "../constants/thesisStatus.js";

/** `{ start, end }` of a semester; null when the academic year has no start and end date. */
export function getSemesterRange(academicYear) {
  if (!academicYear?.startDate || !academicYear?.endDate) return null;
  return { start: new Date(academicYear.startDate), end: new Date(academicYear.endDate) };
}

/** A date inside the semester, both ends included. */
export function isDateInSemester(value, range) {
  if (value == null) return false;
  const time = new Date(value).getTime();
  return time >= range.start.getTime() && time <= range.end.getTime();
}

/** When a thesis started: `startDate`, else `statusChangedAt`, else `createdAt`. */
export function getThesisStartedAt(thesis) {
  return thesis?.startDate ?? thesis?.statusChangedAt ?? thesis?.createdAt ?? null;
}

/**
 * When a thesis ended. Only Selesai and Gagal have an end: `statusChangedAt`, and for a row
 * that was closed without one, `updatedAt`.
 */
export function getThesisEndedAt(thesis) {
  if (!CLOSED_THESIS_STATUSES.includes(thesis?.status)) return null;
  return thesis.statusChangedAt ?? thesis.updatedAt ?? null;
}

/**
 * A thesis runs in a semester when it started on or before the last day of the semester and
 * had not ended before the semester started. A thesis on leave (BSS) is still running.
 */
export function isThesisRunningInSemester(thesis, range) {
  const startedAt = getThesisStartedAt(thesis);
  if (startedAt == null || new Date(startedAt).getTime() > range.end.getTime()) return false;
  if (!CLOSED_THESIS_STATUSES.includes(thesis.status)) return true;
  const endedAt = getThesisEndedAt(thesis);
  return endedAt != null && new Date(endedAt).getTime() >= range.start.getTime();
}

/** `isThesisRunningInSemester` as a Prisma `where` of the `Thesis` model. */
export function buildThesisRunningInSemesterWhere(range) {
  const startedBy = { lte: range.end };
  const endedFrom = { gte: range.start };
  return {
    AND: [
      {
        OR: [
          { startDate: startedBy },
          { startDate: null, statusChangedAt: startedBy },
          { startDate: null, statusChangedAt: null, createdAt: startedBy },
        ],
      },
      {
        OR: [
          { status: { notIn: CLOSED_THESIS_STATUSES } },
          { statusChangedAt: endedFrom },
          { statusChangedAt: null, updatedAt: endedFrom },
        ],
      },
    ],
  };
}

/**
 * Semester filter of a thesis query. An academic year without dates cannot say what ran in
 * it, so the filter falls back to the semester stored on the thesis (`academicYearId`).
 */
export function buildThesisSemesterWhere(academicYearId, academicYear) {
  const range = getSemesterRange(academicYear);
  return range ? buildThesisRunningInSemesterWhere(range) : { academicYearId };
}

// ── Seminar Hasil and Sidang ────────────────────────────────────────────────────────────

/**
 * The date that places a seminar or defence in a semester: the day it is held (`date`);
 * while it has no schedule, `registeredAt`; else `createdAt`.
 */
export function getEventReferenceDate(event) {
  return event?.date ?? event?.registeredAt ?? event?.createdAt ?? null;
}

/** A seminar or defence belongs to the semester its reference date falls in. */
export function isEventInSemester(event, range) {
  return isDateInSemester(getEventReferenceDate(event), range);
}

/** `isEventInSemester` as a Prisma `where` of `ThesisSeminar` / `ThesisDefence`. */
export function buildEventInSemesterWhere(range) {
  const inRange = { gte: range.start, lte: range.end };
  return {
    OR: [
      { date: inRange },
      { date: null, registeredAt: inRange },
      { date: null, registeredAt: null, createdAt: inRange },
    ],
  };
}

/**
 * Semester filter of a seminar or defence query. Without semester dates it falls back to
 * the semester stored on the thesis, like the thesis filter.
 */
export function buildEventSemesterWhere(academicYearId, academicYear) {
  const range = getSemesterRange(academicYear);
  return range ? buildEventInSemesterWhere(range) : { thesis: { academicYearId } };
}
