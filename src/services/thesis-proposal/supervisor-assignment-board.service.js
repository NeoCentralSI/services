import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";
import {
  ACCEPTED_STATUSES,
  SUPERVISOR_REQUEST_ROUTE as ROUTE,
  SUPERVISOR_REQUEST_STATUS as S,
  WAITING_KADEP_STATUSES,
} from "../../constants/thesis-proposal.js";
import { formatAcademicYearLabel, resolveOperationalAcademicYear } from "../../helpers/academicYear.helper.js";
import { uploadUrl } from "../../helpers/guidanceFile.helper.js";
import { NotFoundError } from "../../utils/errors.js";
import * as assignmentRepo from "../../repositories/thesis-proposal/supervisor-assignment.repository.js";
import { REQUEST_INCLUDE } from "../../repositories/thesis-proposal/supervisor-request.repository.js";
import { getSupervisor2KadepQueueService } from "../thesisGuidance/supervisor2.service.js";
import { getAssignmentOverview } from "./supervisor-assignment.service.js";
import { mapRequest } from "./supervisor-request.service.js";
import { getLecturerLoads } from "./supervision-quota.service.js";

/**
 * Paket P9 (5): Tugas Akhir → Penetapan, panel "Penetapan". One row per student of the chosen
 * semester, merging the old tabs: the cohort of the Penetapan Pembimbing, the requests through the
 * department and over the hard limit, and the Pembimbing 2 requests waiting for the Head of
 * Department. Each row carries one "Pengajuan" state (what waits for a decision, else the latest
 * decision) and one "Penetapan" state (in the current version or not). Read for Kadep, Sekdep and
 * Admin; only the Head of Department decides (the decision endpoints are unchanged).
 */

/** The "Pengajuan" column, in the order the rows are listed. */
export const BOARD_SUBMISSION = Object.freeze({
  DEPARTMENT_WAITING: "department_waiting",
  OVER_QUOTA_WAITING: "over_quota_waiting",
  SUPERVISOR2_WAITING: "supervisor2_waiting",
  APPROVED: "approved",
  REVISION_REQUESTED: "revision_requested",
  REJECTED: "rejected",
  OTHER: "other",
});
const ORDER = Object.values(BOARD_SUBMISSION);
const WAITING = new Set([BOARD_SUBMISSION.DEPARTMENT_WAITING, BOARD_SUBMISSION.OVER_QUOTA_WAITING, BOARD_SUBMISSION.SUPERVISOR2_WAITING]);
const KADEP_ROUTES = [ROUTE.DEPARTMENT, ROUTE.OVER_QUOTA];
const APPROVED_STATUSES = new Set([...ACCEPTED_STATUSES, S.ASSIGNED]);

async function resolveYear(academicYearId) {
  const year = academicYearId
    ? await prisma.academicYear.findUnique({ where: { id: academicYearId } })
    : await resolveOperationalAcademicYear();
  if (!year) throw new NotFoundError("Tahun ajaran tidak ditemukan.");
  return year;
}

function submissionOf(request) {
  if (!request) return BOARD_SUBMISSION.OTHER;
  if (WAITING_KADEP_STATUSES.includes(request.status)) {
    return request.route === ROUTE.OVER_QUOTA ? BOARD_SUBMISSION.OVER_QUOTA_WAITING : BOARD_SUBMISSION.DEPARTMENT_WAITING;
  }
  if (APPROVED_STATUSES.has(request.status)) return BOARD_SUBMISSION.APPROVED;
  if (request.status === S.REVISION_REQUESTED) return BOARD_SUBMISSION.REVISION_REQUESTED;
  if (request.status === S.REJECTED_BY_KADEP || request.status === S.REJECTED_BY_LECTURER) return BOARD_SUBMISSION.REJECTED;
  return BOARD_SUBMISSION.OTHER;
}

/** The Pembimbing 2 requests waiting for the Head of Department, each in its thesis's period. */
async function supervisor2OfPeriod(year, viewerUserId, operationalId) {
  const kadep = await assignmentRepo.findActiveUserByRole(ROLES.KETUA_DEPARTEMEN);
  const kadepUserId = kadep?.id ?? viewerUserId;
  if (!kadepUserId) return [];
  const requests = await getSupervisor2KadepQueueService(kadepUserId);
  if (requests.length === 0) return [];
  const periods = await prisma.thesisSupervisorRequest.findMany({
    where: { thesisId: { in: requests.map((r) => r.thesisId) }, status: { in: [...APPROVED_STATUSES] } },
    select: { thesisId: true, academicYearId: true },
    orderBy: { createdAt: "desc" },
  });
  const periodOf = new Map();
  for (const row of periods) if (!periodOf.has(row.thesisId)) periodOf.set(row.thesisId, row.academicYearId);
  return requests.filter((r) => (periodOf.get(r.thesisId) ?? operationalId) === year.id);
}

/**
 * @param {string|null} academicYearId the chosen semester (default: the operational one)
 * @param {string|null} viewerUserId used only when no active Head of Department is found
 */
export async function getAssignmentBoard(academicYearId = null, viewerUserId = null) {
  const year = await resolveYear(academicYearId);
  const operational = await resolveOperationalAcademicYear();
  const operationalId = operational?.id ?? null;
  const [overview, kadepRequests, supervisor2] = await Promise.all([
    getAssignmentOverview(year.id),
    prisma.thesisSupervisorRequest.findMany({
      where: {
        academicYearId: year.id,
        route: { in: KADEP_ROUTES },
        OR: [{ status: { in: WAITING_KADEP_STATUSES } }, { reviewedAt: { not: null } }],
      },
      select: { studentId: true },
    }),
    supervisor2OfPeriod(year, viewerUserId, operationalId),
  ]);

  const cohortByStudent = new Map(overview.entries.map((entry) => [entry.studentId, entry]));
  const studentIds = [...new Set([...cohortByStudent.keys(), ...kadepRequests.map((r) => r.studentId), ...supervisor2.map((r) => r.studentId)])].filter(Boolean);
  const supervisor2ByStudent = new Map(supervisor2.map((r) => [r.studentId, r]));

  const [requests, students, theses, attempts] = studentIds.length
    ? await Promise.all([
      prisma.thesisSupervisorRequest.findMany({
        where: { academicYearId: year.id, studentId: { in: studentIds } },
        include: REQUEST_INCLUDE,
        orderBy: { createdAt: "desc" },
      }),
      prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, user: { select: { fullName: true, identityNumber: true } } } }),
      prisma.thesis.findMany({
        where: { studentId: { in: studentIds } },
        select: {
          id: true,
          studentId: true,
          title: true,
          status: true,
          thesisSupervisors: {
            where: { status: "active" },
            select: { lecturerId: true, role: { select: { name: true } }, lecturer: { select: { user: { select: { fullName: true } } } } },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.researchMethodAssessment.findMany({
        where: { academicYearId: year.id, thesis: { studentId: { in: studentIds } } },
        select: { thesisId: true, proposalFileName: true, proposalFilePath: true, proposalSubmittedAt: true, finalScore: true, isFinalized: true, result: true },
      }),
    ])
    : [[], [], [], []];

  const requestsByStudent = new Map();
  for (const request of requests) {
    const list = requestsByStudent.get(request.studentId) ?? [];
    list.push(request);
    requestsByStudent.set(request.studentId, list);
  }
  const thesisByStudent = new Map();
  for (const thesis of theses) if (!thesisByStudent.has(thesis.studentId)) thesisByStudent.set(thesis.studentId, thesis);
  const studentById = new Map(students.map((s) => [s.id, s]));
  const attemptByThesis = new Map(attempts.map((a) => [a.thesisId, a]));

  // Loads of every lecturer shown (supervisors and candidates), against the chosen semester's limits.
  const lecturerIds = new Set();
  for (const thesis of theses) for (const row of thesis.thesisSupervisors) lecturerIds.add(row.lecturerId);
  for (const request of requests) if (request.lecturerId) lecturerIds.add(request.lecturerId);
  for (const request of supervisor2) if (request.lecturerId) lecturerIds.add(request.lecturerId);
  const [loads, intake] = lecturerIds.size
    ? await Promise.all([
      getLecturerLoads([...lecturerIds], year.id),
      prisma.lecturer.findMany({ where: { id: { in: [...lecturerIds] } }, select: { id: true, acceptingRequests: true } }),
    ])
    : [new Map(), []];
  const closedIntake = new Set(intake.filter((l) => l.acceptingRequests === false).map((l) => l.id));
  const loadOf = (lecturerId) => {
    const load = lecturerId ? loads.get(lecturerId) : null;
    return load ? { activeCount: load.activeCount, softLimit: load.softLimit, hardLimit: load.hardLimit, level: load.level } : null;
  };
  // The intake switch of a lecturer ("Menerima pengajuan baru"); a closed one cannot be approved as Pembimbing 2.
  const person = (lecturerId, fullName, role) => ({ lecturerId, fullName, role, load: loadOf(lecturerId), acceptingRequests: !closedIntake.has(lecturerId) });

  const version = overview.currentBatch?.version ?? null;
  const rows = studentIds.map((studentId) => {
    const own = requestsByStudent.get(studentId) ?? [];
    const cohort = cohortByStudent.get(studentId) ?? null;
    const waitingKadep = own.find((r) => KADEP_ROUTES.includes(r.route) && WAITING_KADEP_STATUSES.includes(r.status)) ?? null;
    const p2 = supervisor2ByStudent.get(studentId) ?? null;
    const main = waitingKadep
      ?? (cohort ? own.find((r) => r.id === cohort.requestId) : null)
      ?? own.find((r) => KADEP_ROUTES.includes(r.route) && r.reviewedAt)
      ?? own[0]
      ?? null;
    const submission = waitingKadep ? submissionOf(waitingKadep) : p2 ? BOARD_SUBMISSION.SUPERVISOR2_WAITING : submissionOf(main);
    const thesis = thesisByStudent.get(studentId) ?? null;
    const student = studentById.get(studentId);
    const supervisors = (thesis?.thesisSupervisors ?? [])
      .map((row) => person(row.lecturerId, row.lecturer?.user?.fullName ?? null, row.role?.name ?? null))
      .sort((a, b) => String(a.role).localeCompare(String(b.role)));
    let candidate = null;
    if (waitingKadep?.route === ROUTE.OVER_QUOTA && waitingKadep.lecturer) {
      candidate = person(waitingKadep.lecturerId, waitingKadep.lecturer.user?.fullName ?? null, ROLES.PEMBIMBING_1);
    } else if (!waitingKadep && p2) {
      candidate = person(p2.lecturerId, p2.lecturerName, ROLES.PEMBIMBING_2);
    }
    const attempt = thesis ? attemptByThesis.get(thesis.id) : null;
    const request = main ? mapRequest(main, operationalId) : null;
    if (request && waitingKadep?.route === ROUTE.OVER_QUOTA) {
      const load = loadOf(waitingKadep.lecturerId);
      request.lecturerLoad = load ? { ...load, projectedCount: load.activeCount + 1, overBy: Math.max(0, load.activeCount + 1 - load.hardLimit) } : null;
    }
    return {
      studentId,
      thesisId: cohort?.thesisId ?? thesis?.id ?? null,
      student: { fullName: student?.user?.fullName ?? cohort?.studentName ?? null, identityNumber: student?.user?.identityNumber ?? cohort?.studentNim ?? null },
      title: cohort?.title ?? thesis?.title ?? main?.proposedTitle ?? p2?.thesisTitle ?? null,
      supervisors,
      candidate,
      submission,
      waiting: WAITING.has(submission),
      requestStatus: main?.status ?? null,
      assignment: { inCohort: Boolean(cohort), assigned: Boolean(cohort?.inCurrentBatch), version: cohort?.inCurrentBatch ? version : null },
      request,
      supervisor2Request: p2 ? { ...p2, lecturerLoad: loadOf(p2.lecturerId) } : null,
      history: own.filter((r) => r.id !== main?.id).map((r) => mapRequest(r, operationalId)),
      proposal: attempt?.proposalFilePath
        ? { fileName: attempt.proposalFileName, url: uploadUrl(attempt.proposalFilePath), submittedAt: attempt.proposalSubmittedAt }
        : null,
      requestedAt: waitingKadep?.createdAt ?? p2?.requestedAt ?? main?.createdAt ?? null,
    };
  });

  rows.sort((a, b) => {
    const byState = ORDER.indexOf(a.submission) - ORDER.indexOf(b.submission);
    if (byState) return byState;
    if (a.waiting) return new Date(a.requestedAt ?? 0) - new Date(b.requestedAt ?? 0);
    // Then the students not yet in the current version, by NIM.
    return Number(a.assignment.assigned) - Number(b.assignment.assigned)
      || String(a.student.identityNumber ?? "").localeCompare(String(b.student.identityNumber ?? ""));
  });

  return {
    academicYear: { ...overview.academicYear, label: formatAcademicYearLabel(year), isOperational: year.id === operationalId },
    rows,
    counts: {
      waiting: rows.filter((row) => row.waiting).length,
      cohort: overview.entries.length,
    },
    currentBatch: overview.currentBatch,
    batches: overview.batches,
    upToDate: overview.upToDate,
    needsIssue: overview.needsIssue,
    newCount: overview.newCount,
  };
}
