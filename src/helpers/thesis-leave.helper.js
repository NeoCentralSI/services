/**
 * Leave check for write actions on a thesis (guidance, milestones, readiness). A thesis is
 * paused while its student is on leave (`students.student_status = bss`); see
 * `isThesisOnLeave` in `constants/thesisStatus.js`.
 */
import prisma from "../config/prisma.js";
import { isThesisOnLeave } from "../constants/thesisStatus.js";

/** Reasons shown when an action is blocked because the student is on leave. */
export const ON_LEAVE_STUDENT_REASON =
  "Anda sedang cuti. Bimbingan dan milestone tidak dapat diubah selama cuti.";
export const ON_LEAVE_LECTURER_REASON =
  "Mahasiswa sedang cuti. Bimbingan dan milestone tidak dapat diubah selama cuti.";

/**
 * True when the thesis is paused by a leave. Reads the student status from the database when
 * the given row does not carry it.
 */
export async function isThesisPausedByLeave(thesis, client = prisma) {
  if (!thesis?.id && !thesis?.studentId) return false;
  if (thesis.student?.status !== undefined) return isThesisOnLeave(thesis);
  const row = await client.thesis.findUnique({
    where: { id: thesis.id },
    select: { status: true, leaveStartedAt: true, student: { select: { status: true } } },
  });
  return isThesisOnLeave(row);
}

/** Throws 403 with `message` when the thesis is paused by a leave. */
export async function assertThesisNotOnLeave(thesis, message = ON_LEAVE_LECTURER_REASON, client = prisma) {
  if (await isThesisPausedByLeave(thesis, client)) {
    const err = new Error(message);
    err.statusCode = 403;
    throw err;
  }
}
