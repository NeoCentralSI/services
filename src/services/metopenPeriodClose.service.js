import prisma from "../config/prisma.js";
import { BadRequestError, NotFoundError } from "../utils/errors.js";
import { ROLES } from "../constants/roles.js";
import { ADVISOR_REQUEST_STATUS } from "../constants/advisorRequestStatus.js";
import {
  IN_FLIGHT_CLOSE_STATUSES,
  IN_FLIGHT_RELEASE_STATUSES,
  METOPEN_PERIOD_CLOSED_REASON,
} from "../constants/metopenPeriodClose.js";
import { formatAcademicYearLabel } from "../helpers/academicYear.helper.js";
import { syncLecturerQuotaCurrentCount } from "./advisorQuota.service.js";
import { AUDIT_ACTIONS, ENTITY_TYPES } from "./auditLog.service.js";
import { createNotificationEventForUsers } from "./notification.service.js";

const IN_FLIGHT_STATUSES = [...IN_FLIGHT_RELEASE_STATUSES, ...IN_FLIGHT_CLOSE_STATUSES];
const RELEASE_SET = new Set(IN_FLIGHT_RELEASE_STATUSES);
const CLOSE_SET = new Set(IN_FLIGHT_CLOSE_STATUSES);

export function assertDevtoolsMetopenPeriodCloseAllowed({ isActive, dryRun, force }) {
  if (!dryRun && isActive && !force) {
    throw new BadRequestError(
      "Tahun ajaran aktif tidak boleh ditutup tanpa force dan konfirmasi kedua.",
    );
  }
}

function collectLecturerIds(request, supervisors = []) {
  const ids = new Set();
  if (request?.lecturerId) ids.add(request.lecturerId);
  if (request?.redirectedTo) ids.add(request.redirectedTo);
  for (const supervisor of supervisors) {
    if (supervisor.lecturerId) ids.add(supervisor.lecturerId);
  }
  return [...ids];
}

async function syncQuotaForLecturers(lecturerIds, academicYearIds, tx) {
  const uniqueLecturerIds = [...new Set(lecturerIds.filter(Boolean))];
  const uniqueAcademicYearIds = [...new Set(academicYearIds.filter(Boolean))];
  for (const lecturerId of uniqueLecturerIds) {
    for (const academicYearId of uniqueAcademicYearIds) {
      await syncLecturerQuotaCurrentCount(lecturerId, academicYearId, { client: tx });
    }
  }
}

async function findActiveUserIdsByRole(roleName) {
  const rows = await prisma.userHasRole.findMany({
    where: { status: "active", role: { name: roleName } },
    select: { userId: true },
  });
  return rows.map((row) => row.userId);
}

function describeStudent(thesis) {
  return {
    studentId: thesis.studentId,
    studentName: thesis.student?.user?.fullName ?? null,
    identityNumber: thesis.student?.user?.identityNumber ?? null,
    eligibleMetopen: thesis.student?.eligibleMetopen ?? null,
  };
}

function resolveScoreAction(thesis) {
  const score = thesis.researchMethodScores?.[0] ?? null;
  const scoringOpen = Boolean(thesis.ta04AssignmentIssuedAt) || Boolean(score);
  if (!scoringOpen) return "no_score";
  if (score?.periodClosedAt) return "already_period_closed";
  if (score?.isFinalized && score?.attendanceAutoZeroedAt) return "keep_auto_zero";
  if (score?.isFinalized) return "keep_finalized";
  return "zero_and_finalize";
}

function resolveWarningCohort(thesis, scoreAction) {
  if (scoreAction !== "zero_and_finalize") return null;
  return thesis.finalProposalVersionId ? "ungraded_final" : "no_final_proposal";
}

function planRequestAction(request, scoreAction) {
  if (scoreAction === "keep_finalized") {
    return { nextStatus: null, skipReason: "ta03_already_final_pass" };
  }
  if (RELEASE_SET.has(request.status)) {
    const releaseReason = scoreAction === "keep_auto_zero"
      ? "metopen_auto_zeroed"
      : METOPEN_PERIOD_CLOSED_REASON;
    return { nextStatus: ADVISOR_REQUEST_STATUS.RELEASED, releaseReason };
  }
  if (CLOSE_SET.has(request.status)) {
    return { nextStatus: ADVISOR_REQUEST_STATUS.CLOSED, releaseReason: null };
  }
  return { nextStatus: null, skipReason: "not_in_flight" };
}

async function notifyPeriodClosed(year, summary) {
  const [kadepIds, coordinatorIds] = await Promise.all([
    findActiveUserIdsByRole(ROLES.KETUA_DEPARTEMEN),
    findActiveUserIdsByRole(ROLES.KOORDINATOR_METOPEN),
  ]);
  const targets = [...new Set([...kadepIds, ...coordinatorIds, ...summary.supervisorUserIds])];
  if (targets.length === 0) return;
  const label = formatAcademicYearLabel(year);
  await createNotificationEventForUsers(
    targets,
    {
      title: "Periode Metode Penelitian ditutup",
      message:
        `Penilaian in-flight ${label} ditutup: ${summary.zeroed} nilai 0 ` +
        `(${summary.ungradedFinal ?? 0} sudah submit final belum dinilai, ` +
        `${summary.noFinalProposal ?? 0} belum submit final), ` +
        `${summary.released} booking dilepas, ${summary.closed} pengajuan ditutup.`,
      type: "simpta_metopen_period_closed",
      data: {
        closedAcademicYearId: year.id,
        zeroed: summary.zeroed,
        ungradedFinal: summary.ungradedFinal ?? 0,
        noFinalProposal: summary.noFinalProposal ?? 0,
        released: summary.released,
        closed: summary.closed,
      },
    },
    { push: true },
  );
}

/**
 * BR-29: close unfinished Metopel theses when an academic year leaves
 * operational status. Idempotent. Does not mutate eligible_metopen.
 */
export async function closeUnfinishedMetopenForYear(closedAcademicYearId, { dryRun = false } = {}) {
  const yearId = typeof closedAcademicYearId === "string" ? closedAcademicYearId.trim() : "";
  if (!yearId) {
    throw new BadRequestError("closedAcademicYearId wajib diisi.");
  }

  const year = await prisma.academicYear.findUnique({ where: { id: yearId } });
  if (!year) throw new NotFoundError("Tahun ajaran tidak ditemukan.");

  const theses = await prisma.thesis.findMany({
    where: {
      academicYearId: yearId,
      isProposal: true,
    },
    select: {
      id: true,
      studentId: true,
      academicYearId: true,
      ta04AssignmentIssuedAt: true,
      finalProposalVersionId: true,
      researchMethodScores: {
        take: 1,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          isFinalized: true,
          attendanceAutoZeroedAt: true,
          periodClosedAt: true,
        },
      },
      advisorRequests: {
        where: { status: { in: IN_FLIGHT_STATUSES } },
        select: {
          id: true,
          status: true,
          lecturerId: true,
          redirectedTo: true,
          academicYearId: true,
          studentId: true,
          thesisId: true,
        },
      },
      thesisSupervisors: {
        where: { status: "active" },
        select: { id: true, lecturerId: true },
      },
      student: {
        select: {
          id: true,
          eligibleMetopen: true,
          user: { select: { id: true, fullName: true, identityNumber: true } },
        },
      },
    },
  });

  const items = [];
  for (const thesis of theses) {
    const scoreAction = resolveScoreAction(thesis);
    const student = describeStudent(thesis);
    const requests = thesis.advisorRequests ?? [];

    if (scoreAction === "keep_finalized" && requests.length === 0) {
      items.push({
        thesisId: thesis.id,
        ...student,
        requestId: null,
        currentStatus: null,
        nextStatus: null,
        scoreAction,
        skipReason: "ta03_already_final_pass",
        hasFinalProposal: Boolean(thesis.finalProposalVersionId),
        warningCohort: resolveWarningCohort(thesis, scoreAction),
      });
      continue;
    }

    if (requests.length === 0) {
      if (scoreAction === "zero_and_finalize" || scoreAction === "already_period_closed") {
        items.push({
          thesisId: thesis.id,
          ...student,
          requestId: null,
          currentStatus: null,
          nextStatus: null,
          scoreAction,
          hasFinalProposal: Boolean(thesis.finalProposalVersionId),
          warningCohort: resolveWarningCohort(thesis, scoreAction),
        });
      }
      continue;
    }

    for (const request of requests) {
      const plan = planRequestAction(request, scoreAction);
      items.push({
        thesisId: thesis.id,
        ...student,
        requestId: request.id,
        currentStatus: request.status,
        nextStatus: plan.nextStatus,
        releaseReason: plan.releaseReason ?? null,
        scoreAction,
        skipReason: plan.skipReason ?? null,
        hasFinalProposal: Boolean(thesis.finalProposalVersionId),
        warningCohort: resolveWarningCohort(thesis, scoreAction),
      });
    }
  }

  const counts = {
    examined: theses.length,
    zeroed: new Set(
      items
        .filter((item) => item.scoreAction === "zero_and_finalize")
        .map((item) => item.thesisId),
    ).size,
    ungradedFinal: new Set(
      items
        .filter((item) => item.warningCohort === "ungraded_final")
        .map((item) => item.thesisId),
    ).size,
    noFinalProposal: new Set(
      items
        .filter((item) => item.warningCohort === "no_final_proposal")
        .map((item) => item.thesisId),
    ).size,
    released: items.filter((item) => item.nextStatus === ADVISOR_REQUEST_STATUS.RELEASED).length,
    closed: items.filter((item) => item.nextStatus === ADVISOR_REQUEST_STATUS.CLOSED).length,
    skipped: items.filter((item) => item.skipReason).length,
  };

  if (dryRun) {
    return {
      dryRun: true,
      closedAcademicYearId: yearId,
      yearLabel: formatAcademicYearLabel(year),
      items,
      counts,
    };
  }

  const now = new Date();
  const supervisorUserIds = new Set();
  const mutatedThesisIds = new Set();

  for (const thesis of theses) {
    const scoreAction = resolveScoreAction(thesis);
    const requests = thesis.advisorRequests ?? [];
    const actionable = items.filter((item) => item.thesisId === thesis.id && !item.skipReason);
    if (actionable.length === 0 && scoreAction !== "zero_and_finalize") continue;

    await prisma.$transaction(async (tx) => {
      if (scoreAction === "zero_and_finalize") {
        const existing = await tx.researchMethodScore.findUnique({
          where: { thesisId: thesis.id },
        });
        const zeroFields = {
          supervisorScore: 0,
          lecturerScore: 0,
          finalScore: 0,
          isFinalized: true,
          finalizedBy: null,
          finalizedAt: now,
          calculatedAt: now,
          periodClosedAt: now,
          periodClosedReason: METOPEN_PERIOD_CLOSED_REASON,
        };
        if (existing) {
          await tx.researchMethodScore.update({
            where: { thesisId: thesis.id },
            data: zeroFields,
          });
        } else {
          await tx.researchMethodScore.create({
            data: {
              thesisId: thesis.id,
              ...zeroFields,
            },
          });
        }
      }

      for (const request of requests) {
        const plan = planRequestAction(request, scoreAction);
        if (!plan.nextStatus) continue;

        if (plan.nextStatus === ADVISOR_REQUEST_STATUS.RELEASED) {
          await tx.thesisAdvisorRequest.update({
            where: { id: request.id },
            data: {
              status: ADVISOR_REQUEST_STATUS.RELEASED,
              releasedAt: now,
              releaseReason: plan.releaseReason,
              releasedAcademicYearId: yearId,
            },
          });
          await tx.thesisSupervisors.updateMany({
            where: { thesisId: thesis.id, status: "active" },
            data: { status: "released", activeRoleKey: null },
          });
          await tx.auditLog.create({
            data: {
              userId: null,
              action: AUDIT_ACTIONS.REQUEST_ADVISOR_RELEASED,
              entity: ENTITY_TYPES.THESIS_ADVISOR_REQUEST,
              entityId: request.id,
              changes: {
                oldValues: { status: request.status },
                newValues: {
                  status: ADVISOR_REQUEST_STATUS.RELEASED,
                  releaseReason: plan.releaseReason,
                },
                metadata: {
                  actorRole: "system",
                  thesisId: thesis.id,
                  academicYearId: yearId,
                  reason: METOPEN_PERIOD_CLOSED_REASON,
                },
              },
            },
          });
          await syncQuotaForLecturers(
            collectLecturerIds(request, thesis.thesisSupervisors),
            [request.academicYearId ?? thesis.academicYearId],
            tx,
          );
        } else if (plan.nextStatus === ADVISOR_REQUEST_STATUS.CLOSED) {
          await tx.thesisAdvisorRequest.update({
            where: { id: request.id },
            data: { status: ADVISOR_REQUEST_STATUS.CLOSED },
          });
          await tx.auditLog.create({
            data: {
              userId: null,
              action: AUDIT_ACTIONS.REQUEST_ADVISOR_CANCELLED,
              entity: ENTITY_TYPES.THESIS_ADVISOR_REQUEST,
              entityId: request.id,
              changes: {
                oldValues: { status: request.status },
                newValues: { status: ADVISOR_REQUEST_STATUS.CLOSED },
                metadata: {
                  actorRole: "system",
                  thesisId: thesis.id,
                  academicYearId: yearId,
                  reason: METOPEN_PERIOD_CLOSED_REASON,
                },
              },
            },
          });
        }
      }
    }, { isolationLevel: "Serializable" });

    mutatedThesisIds.add(thesis.id);
    for (const supervisor of thesis.thesisSupervisors ?? []) {
      if (supervisor.lecturerId) supervisorUserIds.add(supervisor.lecturerId);
    }
  }

  const summary = {
    ...counts,
    supervisorUserIds: [...supervisorUserIds],
    mutatedThesisIds: [...mutatedThesisIds],
  };

  try {
    if (summary.zeroed + summary.released + summary.closed > 0) {
      await notifyPeriodClosed(year, summary);
    }
  } catch (notificationError) {
    console.error(
      "[MetopenPeriodClose] Notifikasi tutup periode gagal:",
      notificationError?.message ?? notificationError,
    );
  }

  return {
    dryRun: false,
    closedAcademicYearId: yearId,
    yearLabel: formatAcademicYearLabel(year),
    items,
    counts: summary,
  };
}

export { METOPEN_PERIOD_CLOSED_REASON };
