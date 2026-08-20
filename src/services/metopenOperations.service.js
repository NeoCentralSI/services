import prisma from "../config/prisma.js";
import { getActiveAcademicYear, formatAcademicYearLabel } from "../helpers/academicYear.helper.js";
import { ADVISOR_REQUEST_STATUS } from "../constants/advisorRequestStatus.js";
import { getSyncStatus } from "./sia.store.js";
import { getPeriodSnapshotCoverage } from "./studentPeriodSnapshot.service.js";
import { resolveLifecycleScoreDecision } from "./metopen.service.js";

function describeStudent(student) {
  return {
    studentId: student?.id ?? null,
    studentName: student?.user?.fullName ?? null,
    identityNumber: student?.user?.identityNumber ?? null,
  };
}

function isPassedMetopenScore(score) {
  return resolveLifecycleScoreDecision(score, false).reason === "waiting_krs_ta_confirmation";
}

function isFailedMetopenScore(score) {
  if (!score) return false;
  return score.attendanceAutoZeroedAt != null || score.periodClosedAt != null;
}

export async function getMetopenSiaOperations() {
  const activeYear = await getActiveAcademicYear();
  const [syncStatus, coverage, waitingRows, exceptionCandidates, corruptTheses] = await Promise.all([
    getSyncStatus().catch(() => ({})),
    getPeriodSnapshotCoverage(activeYear?.id ?? null).catch(() => null),
    prisma.thesisAdvisorRequest.findMany({
      where: {
        status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
        thesis: {
          isProposal: true,
          ta04AssignmentIssuedAt: { not: null },
        },
      },
      select: {
        id: true,
        studentId: true,
        academicYearId: true,
        thesisId: true,
        status: true,
        student: {
          select: {
            id: true,
            takingThesisCourse: true,
            user: { select: { fullName: true, identityNumber: true } },
          },
        },
        thesis: {
          select: {
            id: true,
            academicYearId: true,
            isProposal: true,
            researchMethodScores: {
              take: 1,
              orderBy: { updatedAt: "desc" },
              select: {
                isFinalized: true,
                attendanceAutoZeroedAt: true,
                periodClosedAt: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.thesis.findMany({
      where: {
        isProposal: true,
        researchMethodScores: {
          some: {
            OR: [
              { attendanceAutoZeroedAt: { not: null } },
              { periodClosedAt: { not: null } },
            ],
          },
        },
      },
      select: {
        id: true,
        studentId: true,
        academicYearId: true,
        student: {
          select: {
            id: true,
            takingThesisCourse: true,
            user: { select: { fullName: true, identityNumber: true } },
          },
        },
        researchMethodScores: {
          take: 1,
          orderBy: { updatedAt: "desc" },
          select: {
            isFinalized: true,
            attendanceAutoZeroedAt: true,
            periodClosedAt: true,
            finalScore: true,
          },
        },
        advisorRequests: {
          take: 1,
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            status: true,
            releaseReason: true,
          },
        },
      },
    }),
    prisma.thesis.findMany({
      where: { isProposal: true, academicYearId: null },
      select: {
        id: true,
        studentId: true,
        student: {
          select: {
            id: true,
            user: { select: { fullName: true, identityNumber: true } },
          },
        },
      },
    }),
  ]);

  const studentIds = [
    ...new Set([
      ...waitingRows.map((row) => row.studentId),
      ...exceptionCandidates.map((row) => row.studentId),
    ].filter(Boolean)),
  ];
  const snapshots = activeYear && studentIds.length > 0
    ? await prisma.studentAcademicYearSnapshot.findMany({
      where: {
        academicYearId: activeYear.id,
        studentId: { in: studentIds },
      },
      select: { studentId: true, takingThesisCourse: true },
    })
    : [];
  const snapshotByStudent = new Map(
    snapshots.map((snapshot) => [snapshot.studentId, snapshot.takingThesisCourse]),
  );

  const waitingKrs = waitingRows
    .filter((row) => isPassedMetopenScore(row.thesis?.researchMethodScores?.[0] ?? null))
    .filter((row) => snapshotByStudent.get(row.studentId) !== true)
    .map((row) => ({
      requestId: row.id,
      thesisId: row.thesisId,
      academicYearId: row.academicYearId ?? row.thesis?.academicYearId ?? null,
      takingThesisCourse: snapshotByStudent.has(row.studentId)
        ? snapshotByStudent.get(row.studentId)
        : row.student?.takingThesisCourse ?? null,
      ...describeStudent(row.student),
    }));

  const exceptions = exceptionCandidates
    .filter((row) => {
      const snapshotKrs = snapshotByStudent.get(row.studentId);
      const liveKrs = row.student?.takingThesisCourse;
      const krsTrue = snapshotKrs === true || liveKrs === true;
      if (!krsTrue) return false;
      const request = row.advisorRequests?.[0];
      if (request?.status === ADVISOR_REQUEST_STATUS.ACTIVE_OFFICIAL) return false;
      return isFailedMetopenScore(row.researchMethodScores?.[0] ?? null);
    })
    .map((row) => {
      const score = row.researchMethodScores?.[0] ?? null;
      const request = row.advisorRequests?.[0] ?? null;
      return {
        thesisId: row.id,
        requestId: request?.id ?? null,
        requestStatus: request?.status ?? null,
        releaseReason: request?.releaseReason ?? null,
        periodClosed: Boolean(score?.periodClosedAt),
        attendanceAutoZeroed: Boolean(score?.attendanceAutoZeroedAt),
        finalScore: score?.finalScore ?? null,
        takingThesisCourse: snapshotByStudent.get(row.studentId) ?? row.student?.takingThesisCourse ?? null,
        ...describeStudent(row.student),
      };
    });

  const missingAcademicYear = corruptTheses.map((row) => ({
    thesisId: row.id,
    ...describeStudent(row.student),
  }));

  return {
    activeYear: activeYear
      ? {
        id: activeYear.id,
        label: formatAcademicYearLabel(activeYear),
        year: activeYear.year,
        semester: activeYear.semester,
      }
      : null,
    sync: {
      lastRun: syncStatus?.lastRun ?? null,
      fetched: Number(syncStatus?.fetched ?? 0) || 0,
      dbUpdated: Number(syncStatus?.dbUpdated ?? 0) || 0,
      error: syncStatus?.error || null,
      durationMs: Number(syncStatus?.durationMs ?? 0) || 0,
    },
    coverage: coverage
      ? {
        complete: coverage.complete,
        coverageLabel: coverage.coverageLabel,
        studentsWithSnapshot: coverage.studentsWithSnapshot,
        totalStudents: coverage.totalStudents,
        pendingCreate: coverage.pendingCreate,
      }
      : null,
    waitingKrs,
    exceptions,
    missingAcademicYear,
  };
}
