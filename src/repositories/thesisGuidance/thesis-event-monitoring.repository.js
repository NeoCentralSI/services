/**
 * Read-only queries of the Seminar Hasil and Sidang monitoring tabs (Paket E3). The
 * seminar and defence modules own these tables; nothing is written here.
 */
import prisma from "../../config/prisma.js";
import { EVENT_KIND } from "../../constants/thesis-event-monitoring.js";
import { buildEventSemesterWhere } from "../../helpers/semester-scope.helper.js";
import { buildReadyToRegisterWhere } from "../../helpers/thesis-event-monitoring.helper.js";
import { thesesInSemester } from "./monitoring.repository.js";

const STUDENT_SELECT = { select: { user: { select: { fullName: true, identityNumber: true } } } };

const EVENT_SELECT = {
  id: true,
  thesisId: true,
  status: true,
  date: true,
  startTime: true,
  endTime: true,
  registeredAt: true,
  verifiedAt: true,
  resultFinalizedAt: true,
  revisionFinalizedAt: true,
  finalScore: true,
  createdAt: true,
  room: { select: { name: true } },
  thesis: { select: { title: true, student: STUDENT_SELECT } },
  examiners: {
    orderBy: { order: "asc" },
    select: {
      order: true,
      availabilityStatus: true,
      lecturer: { select: { user: { select: { fullName: true } } } },
    },
  },
};

/**
 * Seminars or defences of the semester, latest first; all of them for "Semua Semester"
 * (`semester` null). `semester` comes from `findSemester` of the monitoring repository.
 */
export function findEvents(kind, semester) {
  const args = {
    where: semester ? buildEventSemesterWhere(semester.academicYearId, semester.academicYear) : {},
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  };
  if (kind === EVENT_KIND.DEFENCE) {
    return prisma.thesisDefence.findMany({ ...args, select: { ...EVENT_SELECT, grade: true } });
  }
  return prisma.thesisSeminar.findMany({ ...args, select: EVENT_SELECT });
}

/**
 * "Siap Mendaftar": theses ready to register for the seminar or the defence, among those
 * running in the semester.
 */
export function findThesesReadyToRegister(kind, semester) {
  return prisma.thesis.findMany({
    where: thesesInSemester(buildReadyToRegisterWhere(kind), semester),
    select: {
      id: true,
      title: true,
      student: STUDENT_SELECT,
      thesisSupervisors: {
        where: { status: "active", role: { name: { in: ["Pembimbing 1", "Pembimbing 2"] } } },
        select: {
          lecturer: { select: { user: { select: { fullName: true } } } },
          role: { select: { name: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}
