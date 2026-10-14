import fs from "fs";
import path from "path";
import * as repo from "../repositories/metopen.repository.js";
import * as ta04BatchRepo from "../repositories/ta04Batch.repository.js";
import * as advisorRequestRepo from "../repositories/advisorRequest.repository.js";
import prisma from "../config/prisma.js";
import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from "../utils/errors.js";
import { ROLES } from "../constants/roles.js";
import { ENV } from "../config/env.js";
import { THESIS_STATUS } from "../constants/thesisStatus.js";

/** Thesis is past the proposal phase (K15: status is the phase marker). */
function isPastProposalPhase(thesis) {
  return Boolean(thesis?.status) && thesis.status !== THESIS_STATUS.PROPOSAL;
}
import { getActiveAcademicYear } from "../helpers/academicYear.helper.js";
import {
  ADVISOR_REQUEST_STATUS,
} from "../constants/advisorRequestStatus.js";
import { AUDIT_ACTIONS, ENTITY_TYPES } from "./auditLog.service.js";
import { syncLecturerQuotaCurrentCount } from "./advisorQuota.service.js";
import { resolveMetopenEligibilityState } from "./metopenEligibility.service.js";
import {
  DEFAULT_TA03A_CAP,
  DEFAULT_TA03B_CAP,
  getCompositionForAcademicYear,
  resolveAcademicYearIdForThesis,
} from "./metopenScoreComposition.service.js";

// ============================================
// Progress & Gate Services
// ============================================

export async function getProgress(thesisId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      proposalStatus: true,
      finalProposalVersionId: true,
      student: {
        select: {
          takingThesisCourse: true,
        },
      },
      thesisSupervisors: {
        where: {
          status: "active",
          role: {
            is: {
              name: {
                in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2],
              },
            },
          },
        },
        select: { id: true },
      },
      researchMethodScores: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          supervisorScore: true,
          lecturerScore: true,
          finalScore: true,
          isFinalized: true,
        },
      },
    },
  });

  if (!thesis) {
    throw new NotFoundError("Thesis tidak ditemukan");
  }

  const score = thesis.researchMethodScores?.[0] ?? null;
  const hasSupervisor = thesis.thesisSupervisors.length > 0;
  const hasFinalProposal = !!thesis.finalProposalVersionId;
  const supervisorScored = score?.supervisorScore != null;
  const lecturerScored = score?.lecturerScore != null;
  const proposalAssessmentComplete = supervisorScored && lecturerScored;
  const takingThesisCourse = thesis.student?.takingThesisCourse === true;

  const milestones = [
    {
      id: "advisor-search",
      title: "Pencarian dosen pembimbing",
      status: hasSupervisor ? "completed" : "not_started",
      weight: 25,
      isGate: false,
    },
    {
      id: "final-proposal",
      title: "Submit proposal final",
      status: hasFinalProposal ? "completed" : "not_started",
      weight: 25,
      isGate: false,
    },
    {
      id: "proposal-assessment",
      title: "Penilaian proposal TA-03A / TA-03B",
      status: proposalAssessmentComplete
        ? "completed"
        : supervisorScored || lecturerScored
          ? "in_progress"
          : "not_started",
      weight: 25,
      isGate: false,
    },
    {
      id: "ta-course-and-ta04",
      title: "Konfirmasi ambil mata kuliah TA dan terbit TA-04",
      status:
        thesis.proposalStatus === "accepted"
          ? "completed"
          : thesis.proposalStatus === "submitted" || takingThesisCourse
            ? "in_progress"
            : "not_started",
      weight: 25,
      isGate: false,
    },
  ];

  const total = milestones.length;
  const completed = milestones.filter((item) => item.status === "completed").length;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    progress,
    totalTasks: total,
    completedTasks: completed,
    gateOpen: true,
    milestones,
  };
}

const METOPEN_PROGRESS_STAFF_ROLES = [
  ROLES.ADMIN,
  ROLES.SEKRETARIS_DEPARTEMEN,
  ROLES.KETUA_DEPARTEMEN,
  ROLES.KOORDINATOR_METOPEN,
  ROLES.GKM,
];

/**
 * Progress Metopen per thesis: pemilik TA, pembimbing, atau staf Metopen/departemen.
 */
export async function getProgressWithAccess(thesisId, userId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: { id: true, studentId: true },
  });
  if (!thesis) throw new NotFoundError("Thesis tidak ditemukan");

  if (thesis.studentId === userId) {
    return getProgress(thesisId);
  }

  const isSupervisor = await prisma.thesisSupervisors.findFirst({
    where: { thesisId, lecturerId: userId },
    select: { id: true },
  });
  if (isSupervisor) {
    return getProgress(thesisId);
  }

  const staffHit = await prisma.userHasRole.findFirst({
    where: {
      userId,
      status: "active",
      role: { name: { in: METOPEN_PROGRESS_STAFF_ROLES } },
    },
    select: { userId: true },
  });
  if (staffHit) {
    return getProgress(thesisId);
  }

  throw new ForbiddenError("Anda tidak memiliki akses ke progress Metopen untuk thesis ini");
}

// ============================================
// Helpers & Eligibility
// ============================================

/**
 * Check if student may access the Metopel guide surface.
 *
 * Active SIMPTA scope no longer gates this page behind Metopen class enrollment.
 * The endpoint is retained so the frontend can decide archive/read-only mode.
 */
export async function checkEligibility(userId) {
  const eligibility = await resolveMetopenEligibilityState(userId);

  return {
    eligibleMetopen: eligibility.eligibleMetopen,
    hasExternalStatus: eligibility.hasExternalStatus,
    hasMetopenCourse: eligibility.eligibleMetopen === true,
    canAccess: eligibility.canAccess,
    canSubmit: eligibility.canSubmit,
    readOnly: eligibility.readOnly,
    hasTakenMetopen: eligibility.hasTakenMetopen === true,
    isMetopenArchive: eligibility.isMetopenArchive === true || eligibility.readOnly,
    thesisPhase: eligibility.thesisPhase,
    source: eligibility.source ?? "db",
    updatedAt: eligibility.updatedAt,
    takingThesisCourse: eligibility.takingThesisCourse,
    hasThesisCourseStatus: eligibility.hasThesisCourseStatus,
    canAccessTugasAkhir: eligibility.canAccessTugasAkhir,
    hasThesisRecord: eligibility.hasThesisRecord,
    hasThesisPassed: eligibility.hasThesisPassed,
    thesisCourseSource: eligibility.thesisCourseEnrollmentSource,
    thesisCourseUpdatedAt: eligibility.thesisCourseEnrollmentUpdatedAt,
  };
}

// ============================================
// Seminar Eligibility Gate (FR-SYS-01)
// ============================================

/**
 * Legacy manual-review queue sync. Kept for deprecated title-report flows only.
 * New TA-04 early-batch lifecycle uses `syncBookingActivationForStudent`.
 */
export async function syncKadepProposalQueueForStudent(userId) {
  const thesis = await repo.findStudentThesis(userId);
  if (!thesis) return { synced: false };
  const result = await tryEnqueueThesisForKadepProposalReview(thesis.id);
  return { synced: result.updated, ...result };
}

/** Backward-compatible export name: after TA-03 writes, run the new promotion/release lifecycle. */
export async function syncKadepProposalQueueByThesisId(thesisId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: { studentId: true },
  });
  if (!thesis) return { synced: false };
  return syncBookingActivationForStudent(thesis.studentId);
}

export function resolveLifecycleScoreDecision(score, takingThesisCourse) {
  if (!score?.isFinalized) {
    return { action: "skip", reason: "scores_not_finalized" };
  }
  if (score.attendanceAutoZeroedAt != null) {
    return { action: "release", reason: "metopen_auto_zeroed" };
  }
  if (score.periodClosedAt != null) {
    return { action: "release", reason: "metopen_period_closed" };
  }
  if (takingThesisCourse === true) {
    return { action: "promote", reason: "ta03_final_and_krs_ta_confirmed" };
  }
  return { action: "skip", reason: "waiting_krs_ta_confirmation" };
}

function collectLifecycleLecturerIds(request) {
  const ids = new Set();
  if (request?.lecturerId) ids.add(request.lecturerId);
  if (request?.redirectedTo) ids.add(request.redirectedTo);
  for (const supervisor of request?.thesis?.thesisSupervisors ?? []) {
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

/**
 * Idempotent lifecycle sync for early TA-04:
 * - booking_approved + TA-04 issued + TA-03 final non-auto-zero + KRS TA true
 *   => active_official, thesis leaves Metopel phase.
 * - booking_approved + TA-04 issued + finalized auto-zero / period-closed
 *   => released. Lulus yang KRS TA belum true menunggu observasi SIA berikutnya.
 */
export async function syncBookingActivationForStudent(userId, activeAcademicYearId = null) {
  const activeAcademicYear =
    activeAcademicYearId ? { id: activeAcademicYearId } : await getActiveAcademicYear();
  const targetAcademicYearId = activeAcademicYear?.id ?? null;
  if (!userId || !targetAcademicYearId) {
    return { synced: false, promoted: 0, released: 0, skipped: 0 };
  }
  const academicSnapshot = await prisma.studentAcademicYearSnapshot.findUnique({
    where: {
      studentId_academicYearId: {
        studentId: userId,
        academicYearId: targetAcademicYearId,
      },
    },
    select: {
      takingThesisCourse: true,
      thesisCourseSource: true,
      thesisCourseCapturedAt: true,
    },
  });
  if (!academicSnapshot || typeof academicSnapshot.takingThesisCourse !== "boolean") {
    return {
      synced: false,
      promoted: 0,
      released: 0,
      skipped: 0,
      reason: "thesis_course_snapshot_missing",
    };
  }

  const requests = await prisma.thesisAdvisorRequest.findMany({
    where: {
      studentId: userId,
      status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
      thesis: {
        ta04AssignmentIssuedAt: { not: null },
      },
    },
    select: {
      id: true,
      studentId: true,
      lecturerId: true,
      redirectedTo: true,
      academicYearId: true,
      thesisId: true,
      status: true,
      thesis: {
        select: {
          id: true,
          academicYearId: true,
          proposalStatus: true,
          ta04AssignmentIssuedAt: true,
          ta04AssignmentAcademicYearId: true,
          activeAcademicYearId: true,
          researchMethodScores: {
            select: {
              id: true,
              isFinalized: true,
              attendanceAutoZeroedAt: true,
              periodClosedAt: true,
            },
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
          thesisSupervisors: {
            where: { status: "active" },
            select: {
              id: true,
              lecturerId: true,
              status: true,
              role: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });

  if (requests.length === 0) {
    return { synced: false, promoted: 0, released: 0, skipped: 0 };
  }

  let promoted = 0;
  let released = 0;
  let skipped = 0;

  for (const request of requests) {
    if (!request.thesisId || !request.thesis) {
      skipped += 1;
      continue;
    }

    const assignmentAcademicYearId =
      request.thesis.ta04AssignmentAcademicYearId ??
      request.academicYearId ??
      request.thesis.academicYearId ??
      null;
    if (assignmentAcademicYearId && assignmentAcademicYearId === targetAcademicYearId) {
      skipped += 1;
      continue;
    }

    const score = request.thesis?.researchMethodScores?.[0] ?? null;
    const decision = resolveLifecycleScoreDecision(
      score,
      academicSnapshot.takingThesisCourse,
    );
    if (decision.action === "skip") {
      skipped += 1;
      continue;
    }

    const now = new Date();
    const oldAcademicYearId = request.academicYearId ?? request.thesis?.academicYearId ?? null;
    const lecturerIds = collectLifecycleLecturerIds(request);

    if (decision.action === "promote") {
      await prisma.$transaction(async (tx) => {
        await tx.thesis.update({
          where: { id: request.thesisId },
          data: {
            // K15: promotion moves the thesis to the TA phase. proposalStatus stays
            // "accepted" for Metopen compatibility.
            status: THESIS_STATUS.RESEARCH,
            statusChangedAt: now,
            ...(request.thesis.startDate ? {} : { startDate: now }),
            proposalStatus: "accepted",
            activeAcademicYearId: targetAcademicYearId,
            activePromotedAt: now,
            proposalReviewedAt: now,
            proposalReviewedByUserId: null,
            proposalReviewNotes: null,
          },
        });

        await tx.thesisAdvisorRequest.update({
          where: { id: request.id },
          data: {
            status: ADVISOR_REQUEST_STATUS.ACTIVE_OFFICIAL,
            academicYearId: targetAcademicYearId,
            releasedAt: null,
            releaseReason: null,
            releasedAcademicYearId: null,
          },
        });

        await tx.auditLog.create({
          data: {
            userId: null,
            action: AUDIT_ACTIONS.REQUEST_ADVISOR_PROMOTED_TO_ACTIVE,
            entity: ENTITY_TYPES.THESIS_ADVISOR_REQUEST,
            entityId: request.id,
            changes: {
              oldValues: {
                status: request.status,
                academicYearId: oldAcademicYearId,
              },
              newValues: {
                status: ADVISOR_REQUEST_STATUS.ACTIVE_OFFICIAL,
                academicYearId: targetAcademicYearId,
              },
              metadata: {
                actorRole: "system",
                thesisId: request.thesisId,
                reason: decision.reason,
              },
            },
          },
        });

        await syncQuotaForLecturers(
          lecturerIds,
          [oldAcademicYearId, targetAcademicYearId],
          tx,
        );
      }, { isolationLevel: "Serializable" });
      promoted += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.thesis.update({
        where: { id: request.thesisId },
        data: {
          // Release keeps the thesis in the proposal phase (behaviour unchanged; K2 later).
          status: THESIS_STATUS.PROPOSAL,
          proposalStatus: null,
          activeAcademicYearId: null,
          activePromotedAt: null,
          proposalReviewedAt: null,
          proposalReviewedByUserId: null,
          proposalReviewNotes: null,
        },
      });

      await tx.thesisAdvisorRequest.update({
        where: { id: request.id },
        data: {
          status: ADVISOR_REQUEST_STATUS.RELEASED,
          releasedAt: now,
          releaseReason: decision.reason,
          releasedAcademicYearId: targetAcademicYearId,
        },
      });

      await tx.thesisSupervisors.updateMany({
        where: {
          thesisId: request.thesisId,
          status: "active",
        },
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
              releaseReason: decision.reason,
            },
            metadata: {
              actorRole: "system",
              thesisId: request.thesisId,
              academicYearId: targetAcademicYearId,
            },
          },
        },
      });

      await syncQuotaForLecturers(lecturerIds, [oldAcademicYearId], tx);
    }, { isolationLevel: "Serializable" });
    released += 1;
  }

  return {
    synced: promoted + released > 0,
    promoted,
    released,
    skipped,
  };
}

export async function releaseWaitingKrsBookingByAdmin(requestId, actorUserId) {
  const request = await prisma.thesisAdvisorRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      studentId: true,
      lecturerId: true,
      redirectedTo: true,
      academicYearId: true,
      thesisId: true,
      status: true,
      thesis: {
        select: {
          id: true,
          academicYearId: true,
          status: true,
          startDate: true,
          ta04AssignmentIssuedAt: true,
          researchMethodScores: {
            select: {
              id: true,
              isFinalized: true,
              attendanceAutoZeroedAt: true,
              periodClosedAt: true,
            },
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
          thesisSupervisors: {
            where: { status: "active" },
            select: { lecturerId: true },
          },
        },
      },
    },
  });

  if (!request) {
    throw new NotFoundError("Pengajuan pembimbing tidak ditemukan.");
  }
  if (request.status !== ADVISOR_REQUEST_STATUS.BOOKING_APPROVED) {
    throw new BadRequestError("Hanya booking yang masih disetujui yang dapat dilepas Admin.");
  }

  const score = request.thesis?.researchMethodScores?.[0] ?? null;
  const decision = resolveLifecycleScoreDecision(score, false);
  if (decision.reason !== "waiting_krs_ta_confirmation") {
    throw new BadRequestError(
      "Lepas manual hanya untuk mahasiswa yang sudah lulus Metopel dan menunggu konfirmasi KRS TA.",
    );
  }

  const now = new Date();
  const targetAcademicYearId =
    (await getActiveAcademicYear())?.id ?? request.academicYearId ?? request.thesis?.academicYearId ?? null;
  const oldAcademicYearId = request.academicYearId ?? request.thesis?.academicYearId ?? null;
  const lecturerIds = collectLifecycleLecturerIds(request);

  await prisma.$transaction(async (tx) => {
    await tx.thesisAdvisorRequest.update({
      where: { id: request.id },
      data: {
        status: ADVISOR_REQUEST_STATUS.RELEASED,
        releasedAt: now,
        releaseReason: "thesis_course_not_confirmed",
        releasedAcademicYearId: targetAcademicYearId,
      },
    });
    await tx.thesisSupervisors.updateMany({
      where: { thesisId: request.thesisId, status: "active" },
      data: { status: "released", activeRoleKey: null },
    });
    await tx.auditLog.create({
      data: {
        userId: actorUserId ?? null,
        action: AUDIT_ACTIONS.REQUEST_ADVISOR_RELEASED,
        entity: ENTITY_TYPES.THESIS_ADVISOR_REQUEST,
        entityId: request.id,
        changes: {
          oldValues: { status: request.status },
          newValues: {
            status: ADVISOR_REQUEST_STATUS.RELEASED,
            releaseReason: "thesis_course_not_confirmed",
          },
          metadata: {
            actorRole: "admin",
            thesisId: request.thesisId,
            academicYearId: targetAcademicYearId,
            reason: "admin_waiting_krs_release",
          },
        },
      },
    });
    await syncQuotaForLecturers(lecturerIds, [oldAcademicYearId], tx);
  }, { isolationLevel: "Serializable" });

  return {
    requestId: request.id,
    studentId: request.studentId,
    status: ADVISOR_REQUEST_STATUS.RELEASED,
    releaseReason: "thesis_course_not_confirmed",
  };
}

/**
 * Pure read of seminar eligibility (FR-SYS-01). Does **not** run lifecycle sync
 * — safe for GET REST handlers (no hidden writes).
 */
export async function getSeminarEligibilitySnapshot(userId) {
  const thesis = await repo.findStudentThesis(userId);
  if (!thesis) {
    return {
      eligible: false,
      reason: "Tugas Akhir tidak ditemukan",
      scenario: "C",
      canContinueThesis: false,
      seminarLocked: true,
      requirements: {
        metopelPassed: false,
        metopelScore: null,
        proposalAccepted: false,
        proposalStatus: null,
      },
    };
  }

  const rmScore = await prisma.researchMethodScore.findFirst({
    where: { thesisId: thesis.id },
    orderBy: { createdAt: "desc" },
  });
  const computedFinalScore =
    rmScore?.finalScore ??
    (rmScore?.supervisorScore != null && rmScore?.lecturerScore != null
      ? rmScore.supervisorScore + rmScore.lecturerScore
      : null);
  const isFinalized = rmScore?.isFinalized === true;
  const metopelPassed =
    isFinalized && computedFinalScore != null && computedFinalScore >= ENV.METOPEL_PASSING_SCORE;
  const proposalAccepted = thesis.proposalStatus === "accepted";
  const eligible = metopelPassed && proposalAccepted;

  let scenario = "C";
  let canContinueThesis = false;
  let seminarLocked = true;
  let reason = "Mahasiswa harus menyelesaikan penilaian Metopel dan pengesahan judul terlebih dahulu.";

  if (eligible) {
    scenario = "A";
    canContinueThesis = true;
    seminarLocked = false;
    reason = "Lulus Metopel dan judul/proposal telah disahkan. Akses Seminar Hasil terbuka.";
  } else if (!metopelPassed && proposalAccepted) {
    scenario = "B";
    canContinueThesis = true;
    seminarLocked = true;
    reason =
      "Proposal/judul sudah disahkan, tetapi Metopel belum lulus. Mahasiswa boleh melanjutkan pengerjaan TA, namun Seminar Hasil tetap terkunci.";
  } else if (metopelPassed && !proposalAccepted) {
    scenario = "C";
    canContinueThesis = true;
    seminarLocked = true;
    reason = "Metopel sudah lulus, tetapi judul/proposal belum disahkan oleh KaDep.";
  }

  return {
    eligible,
    reason,
    scenario,
    canContinueThesis,
    seminarLocked,
    requirements: {
      metopelPassed,
      metopelScore: computedFinalScore,
      proposalAccepted,
      proposalStatus: thesis.proposalStatus ?? null,
    },
  };
}

/**
 * Check if a student is eligible for Seminar Hasil registration.
 *
 * Side effect: runs early TA-04 promotion/release sync first (jobs/tests/backfill).
 * For HTTP GET, prefer `getSeminarEligibilitySnapshot` + explicit POST sync.
 */
export async function checkSeminarEligibility(userId) {
  await syncBookingActivationForStudent(userId);
  return getSeminarEligibilitySnapshot(userId);
}

/**
 * Status penugasan TA-04 awal untuk mahasiswa (transparansi alur).
 * PDF unsigned tidak diekspos — keputusan = status sistem (KC TA-04 PDF UX).
 */
export async function getStudentProposalApprovalStatus(userId) {
  const thesis = await repo.findStudentThesis(userId);
  if (!thesis) {
    return { thesis: null };
  }

  const row = await prisma.thesis.findUnique({
    where: { id: thesis.id },
    select: {
      id: true,
      title: true,
      status: true,
      proposalStatus: true,
      ta04AssignmentIssuedAt: true,
      ta04AssignmentTitle: true,
      ta04AssignmentSupervisorNames: true,
      activeAcademicYearId: true,
      activePromotedAt: true,
      proposalReviewNotes: true,
      proposalReviewedAt: true,
      finalProposalVersionId: true,
      updatedAt: true,
      student: {
        select: { takingThesisCourse: true },
      },
      thesisSupervisors: {
        where: {
          status: "active",
          role: { name: ROLES.PEMBIMBING_1 },
        },
        select: { id: true },
      },
      advisorRequests: {
        where: { status: "booking_approved" },
        select: { id: true },
      },
    },
  });

  const queueReadiness = await evaluateKadepProposalQueueReadiness(thesis.id);
  const hasActiveP1 = (row?.thesisSupervisors?.length ?? 0) > 0;
  const hasBookedSupervisor = hasActiveP1 && (row?.advisorRequests?.length ?? 0) > 0;
  const ta04Issued = Boolean(row?.ta04AssignmentIssuedAt);
  const hasOfficialSupervisor = hasActiveP1 && ta04Issued;
  const hasFinalProposal = Boolean(row?.finalProposalVersionId);
  const activePromoted = row?.proposalStatus === "accepted" && isPastProposalPhase(row);
  const guidanceGateOpen = hasOfficialSupervisor;
  const guidanceGateReason = !row
    ? null
    : guidanceGateOpen
      ? null
      : !hasBookedSupervisor
      ? "Menunggu booking pembimbing TA-01/TA-02 disetujui."
      : !ta04Issued
        ? "Booking pembimbing sudah disetujui, tetapi TA-04 belum difinalisasi KaDep. Bimbingan proposal yang tercatat sistem belum dapat dimulai."
        : null;
  const canUploadProposal =
    Boolean(row) && !isPastProposalPhase(row) && row.proposalStatus !== "accepted";
  const canUseInformalLog =
    Boolean(row) &&
    guidanceGateOpen &&
    !isPastProposalPhase(row) &&
    row.student?.takingThesisCourse !== true;
  const canSubmitFinalProposal =
    Boolean(row) && guidanceGateOpen && !isPastProposalPhase(row) && row.proposalStatus !== "accepted";
  const ta03GateOpen = Boolean(row) && hasFinalProposal && ta04Issued;
  // FUN-033 / KC-20260709-03: reason must name the unmet TA-03 prerequisite
  // (final proposal + TA-04 issued), not a downstream symptom such as
  // "booking belum disetujui" which is a guidance-gate concern.
  const ta03GateReason = !row
    ? null
    : ta03GateOpen
      ? null
      : !ta04Issued && !hasFinalProposal
        ? "Penilaian menunggu submit proposal final dan penerbitan TA-04 oleh KaDep."
        : !ta04Issued
          ? "TA-04 belum diterbitkan KaDep. Submit proposal final saja belum membuka penilaian."
          : "Proposal final belum disubmit.";
  const activePromotionState = activePromoted
    ? "active_promoted"
    : hasBookedSupervisor && ta04Issued
      ? "booking_ta04_issued"
      : hasBookedSupervisor
        ? "booking_pre_ta04"
        : "pre_booking";

  return {
    thesis: row
      ? {
          ...row,
          // API shape kept for the Metopel UI (archive mode); derived from status (K15).
          isProposal: row.status === THESIS_STATUS.PROPOSAL,
          thesisSupervisors: undefined,
          advisorRequests: undefined,
          student: undefined,
          // PDF cetak hanya untuk KaDep — jangan expose ke mahasiswa.
          titleApprovalDocumentId: null,
          titleApprovalDocument: null,
          hasBookedSupervisor,
          hasOfficialSupervisor,
          canUploadProposal,
          canSubmitFinalProposal,
          canUseInformalLog,
          ta04Issued,
          guidanceGateOpen,
          guidanceGateReason,
          ta03GateOpen,
          ta03GateReason,
          activePromotionState,
          queueReadiness: {
            ready: queueReadiness.ready,
            block: queueReadiness.block ?? null,
            proposalStatus: queueReadiness.proposalStatus ?? row.proposalStatus ?? null,
          },
        }
      : null,
  };
}

/**
 * BR-23 (canon §5.13): Endpoint mahasiswa-side untuk arsip Metopel pasca promosi aktif TA.
 *
 * SIMPTA = Single Source of Truth. Mahasiswa berhak melihat kembali:
 *   1. Substansi pengajuan awal TA-01/TA-02 (latar belakang, tujuan, dst).
 *   2. Detail rubrik TA-03A per CPMK + descriptor + catatan P1 + co-sign P2.
 *   3. Detail rubrik TA-03B per kriteria + descriptor + catatan Koordinator.
 *   4. Status penugasan TA-04 di sistem (tanpa PDF — dokumen cetak dikelola departemen).
 *
 * Endpoint ini READ-ONLY. Tidak mengizinkan modifikasi apa pun.
 */
export async function getStudentArchiveDetail(userId) {
  const thesis = await repo.findStudentThesis(userId);
  if (!thesis) {
    return null;
  }

  // (1) Substansi pengajuan awal — historical submissions
  const advisorRequests = await prisma.thesisAdvisorRequest.findMany({
    where: { studentId: thesis.studentId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      requestType: true,
      status: true,
      proposedTitle: true,
      backgroundSummary: true,
      problemStatement: true,
      proposedSolution: true,
      researchObject: true,
      researchPermitStatus: true,
      justificationText: true,
      createdAt: true,
      lecturer: {
        select: { user: { select: { fullName: true } } },
      },
      topic: { select: { name: true } },
    },
  });

  // (2) + (3) Detail rubrik TA-03A & TA-03B + catatan
  const score = await prisma.researchMethodScore.findUnique({
    where: { thesisId: thesis.id },
    include: {
      researchMethodScoreDetails: {
        include: {
          criteria: {
            include: {
              metopenCpmk: { select: { code: true, description: true } },
            },
          },
          assessmentRubric: {
            select: {
              id: true,
              description: true,
              minScore: true,
              maxScore: true,
              displayOrder: true,
            },
          },
        },
      },
      coSigner: {
        select: { user: { select: { fullName: true } } },
      },
      supervisor: {
        select: { user: { select: { fullName: true } } },
      },
      lecturerAssessor: {
        select: { user: { select: { fullName: true } } },
      },
    },
  });

  // (4) Status penugasan TA-04 — tanpa PDF (keputusan = status sistem)
  const titleApproval = await prisma.thesis.findUnique({
    where: { id: thesis.id },
    select: {
      title: true,
      proposalStatus: true,
      proposalReviewNotes: true,
      proposalReviewedAt: true,
      ta04AssignmentIssuedAt: true,
      ta04AssignmentTitle: true,
    },
  });

  // Bagi detail rubrik berdasarkan diskriminator kanonis `criteria.role`
  // (supervisor → TA-03A, default → TA-03B) — selaras export §5.7.4 dan
  // SupervisorScoreCard. Audit pass 2 F2-6: heuristik nama kriteria dihapus
  // karena rapuh terhadap rename kriteria oleh Sekdep di Kelola Master TA.
  const ta03aDetails = (score?.researchMethodScoreDetails ?? []).filter(
    (d) => d.criteria?.role === "supervisor",
  );

  let ta03aCap = DEFAULT_TA03A_CAP;
  let ta03bCap = DEFAULT_TA03B_CAP;
  try {
    const academicYearId = await resolveAcademicYearIdForThesis(thesis);
    const composition = await getCompositionForAcademicYear(academicYearId);
    ta03aCap = composition.ta03aCap;
    ta03bCap = composition.ta03bCap;
  } catch {
    // Fallback default 75:25 bila tahun akademik thesis belum terikat.
  }

  return {
    thesisId: thesis.id,
    thesisTitle: titleApproval?.ta04AssignmentTitle ?? titleApproval?.title ?? null,
    proposalStatus: titleApproval?.proposalStatus ?? null,
    advisorRequests,
    ta03aCap,
    ta03bCap,
    score: score
      ? {
          supervisorScore: score.supervisorScore,
          lecturerScore: score.lecturerScore,
          finalScore: score.finalScore,
          isFinalized: score.isFinalized,
          coSignedAt: score.coSignedAt,
          coSignNote: score.coSignNote,
          coSignerName: score.coSigner?.user?.fullName ?? null,
          supervisorName: score.supervisor?.user?.fullName ?? null,
          lecturerAssessorName: score.lecturerAssessor?.user?.fullName ?? null,
          // Detail rubrik utuh (FE filter sendiri per role bila perlu)
          details: score.researchMethodScoreDetails ?? [],
          // Hint pembagian: detail terkait TA-03A (heuristik nama kriteria)
          ta03aDetailIds: ta03aDetails.map((d) => `${d.researchMethodScoreId}_${d.assessmentCriteriaId}`),
        }
      : null,
    titleApproval: {
      reviewNotes: titleApproval?.proposalReviewNotes ?? null,
      reviewedAt: titleApproval?.ta04AssignmentIssuedAt ?? titleApproval?.proposalReviewedAt ?? null,
      document: null,
      documentKind: null,
    },
    readOnly: true,
  };
}

/**
 * Formulir TA-04 resmi selalu berbentuk batch per periode sesuai panduan.
 * Dokumen lain yang mungkin tersisa dari data lama tidak dilayani sebagai
 * output resmi dan harus diganti lewat finalisasi batch.
 */
function resolveTitleApprovalDocumentKind(fileName) {
  if (!fileName) return null;
  if (String(fileName).startsWith("TA04_BATCH_")) return "batch";
  return "legacy";
}

function isOfficialTitleApprovalDocument(documentRow) {
  return resolveTitleApprovalDocumentKind(documentRow?.fileName) === "batch";
}

function getTa04BatchEligibilitySnapshot(thesis) {
  // Canon §5.8.1: setelah promosi aktif, thesis keluar dari cohort batch Metopen.
  // Tetap boleh tampil di list sebagai riwayat, tetapi JANGAN dihitung ke
  // tombol sinkron / isi PDF batch (KC-20260709-04).
  if (
    thesis.activePromotedAt ||
    thesis.proposalStatus === "accepted" ||
    isPastProposalPhase(thesis)
  ) {
    return { eligible: false, block: "already_promoted" };
  }

  if (thesis.proposalStatus === "rejected") {
    return { eligible: false, block: "rejected" };
  }

  const hasBooking = (thesis.advisorRequests ?? []).some(
    (request) => request.status === ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
  );
  if (!hasBooking) {
    return { eligible: false, block: "booking_not_approved" };
  }

  const supervisors = thesis.thesisSupervisors ?? [];
  const hasP1 = supervisors.some(
    (supervisor) =>
      supervisor.status === "active" &&
      supervisor.role?.name === ROLES.PEMBIMBING_1,
  );
  if (!hasP1) {
    return { eligible: false, block: "no_active_pembimbing_1" };
  }

  // Masih fase Metopen: TA-04 awal yang sudah terbit tetap anggota cohort.
  // P1 sengaja diverifikasi di atas: dokumen TA-04 tanpa relasi P1 aktif
  // adalah data yang perlu diperbaiki KaDep, bukan otorisasi bimbingan.
  if (thesis.ta04AssignmentIssuedAt) {
    return { eligible: true, block: null };
  }

  return { eligible: true, block: null };
}

function resolveTa04ListSection(thesis, batchEligibility) {
  if (batchEligibility.eligible) return "batch_cohort";
  if (
    thesis.activePromotedAt ||
    thesis.proposalStatus === "accepted" ||
    isPastProposalPhase(thesis)
  ) {
    return "history_active";
  }
  if (thesis.proposalStatus === "rejected") return "history_rejected";
  return "history_other";
}

function looksLikeSupervisorRoleLabel(value) {
  const key = String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u024f]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!key) return false;
  return /^(pembimbing [12]|pembimbing (utama|pendamping)|dosen pembimbing( [12])?)$/.test(key);
}

function snapshotLooksLikeRoleLabels(value) {
  if (!value) return false;
  return String(value)
    .split(/[,;/|]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .some((part) => looksLikeSupervisorRoleLabel(part));
}

function liveSupervisorDisplayNames(thesis) {
  const names = (thesis.thesisSupervisors ?? [])
    .filter(
      (supervisor) =>
        supervisor.status === "active" &&
        (supervisor.role?.name === ROLES.PEMBIMBING_1 || supervisor.role?.name === ROLES.PEMBIMBING_2),
    )
    .map((supervisor) => supervisor.lecturer?.user?.fullName)
    .filter((name) => Boolean(name) && !looksLikeSupervisorRoleLabel(name));
  return [...new Set(names)].join(", ");
}

/** FUN-013: snapshot TA-04 tidak boleh merender label peran sebagai nama. */
function resolveTa04SupervisorDisplayNames(thesis) {
  const frozen = thesis.ta04AssignmentSupervisorNames;
  const liveNames = liveSupervisorDisplayNames(thesis);
  if (frozen && !snapshotLooksLikeRoleLabels(frozen)) return frozen;
  return liveNames || frozen || "-";
}

function buildCurrentBatchByThesisId(batches = []) {
  const map = new Map();
  for (const batch of batches) {
    for (const member of batch.members ?? []) {
      if (!map.has(member.thesisId)) {
        map.set(member.thesisId, batch);
      }
    }
  }
  return map;
}

/**
 * Read-only riwayat penilaian TA-03 untuk mahasiswa sejak skor tersedia.
 * Berbeda dari arsip pasca promosi aktif, endpoint ini boleh dipakai sebelum
 * promosi agar mahasiswa tidak kehilangan transparansi setelah TA-03 final.
 */
export async function getStudentAssessmentHistory(userId) {
  return getStudentArchiveDetail(userId);
}

/**
 * Idempotent: sinkronkan promosi/release otomatis lalu kembalikan ringkasan untuk UI.
 */
export async function syncProposalQueueAndSummarizeForStudent(userId) {
  const sync = await syncBookingActivationForStudent(userId);
  const proposal = await getStudentProposalApprovalStatus(userId);
  const eligibility = await getSeminarEligibilitySnapshot(userId);
  return { sync, proposal, eligibility };
}

// ============================================
// Legacy antre KaDep / pengesahan judul manual (deprecated)
// ============================================

/**
 * Evaluate whether a thesis satisfies the 5 canonical prerequisites for
 * Legacy KaDep post-TA-03 promotion review (canon §5.8.1, §5.8.3, §5.10):
 *   1. Pembimbing resmi (P1) aktif di thesis_supervisors
 *   2. Proposal final disubmit (finalProposalVersionId non-null)
 *   3. TA-03A: P1 submit + P2 co-sign bila ada P2 (isFinalized gate)
 *   4. TA-03B: Koordinator submit (lecturerScore non-null)
 *   5. SIA mengonfirmasi students.taking_thesis_course = true
 *
 * Re-validates the 5 prerequisites regardless of current proposalStatus —
 * including thesis already in queue ("submitted"). This closes the post-enqueue
 * degradation gap (audit F-4.4 follow-up): if a "submitted" thesis later loses
 * a prerequisite (e.g. P2 added without co-sign, SIA flips takingThesisCourse,
 * auto-zero applied), the gate reports `ready: false` and `tryEnqueueThesisForKadepProposalReview`
 * performs an automatic dequeue.
 *
 * @returns {{
 *   ready: boolean,
 *   proposalStatus?: string,
 *   currentProposalStatus?: string|null,
 *   block?: string,
 * }}
 * - `proposalStatus`: status refleksi readiness untuk UI (matched to current
 *   status, or "ready" when null+ready). Callers that only need ready/block
 *   (e.g. getStudentProposalApprovalStatus) can ignore currentProposalStatus.
 * - `currentProposalStatus`: status asli thesis di DB ("submitted"|"accepted"
 *   |"rejected"|"revision_in_progress"|null). Dipakai oleh
 *   `tryEnqueueThesisForKadepProposalReview` untuk bedakan enqueue baru vs
 *   dequeue pasca-degradasi.
 */
async function evaluateKadepProposalQueueReadiness(thesisId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      studentId: true,
      title: true,
      proposalStatus: true,
      finalProposalVersionId: true,
    },
  });
  if (!thesis) return { ready: false, block: "no_thesis" };

  const currentProposalStatus = thesis.proposalStatus ?? null;

  // Terminal state: accepted — never re-evaluate, never dequeue.
  if (currentProposalStatus === "accepted") {
    return { ready: true, proposalStatus: "accepted", currentProposalStatus };
  }
  // User-driven non-queueable states — not eligible for enqueue, but not
  // auto-dequeued either (revision/reject flow is owned by reviewer action).
  if (currentProposalStatus === "rejected" || currentProposalStatus === "revision_in_progress") {
    return {
      ready: false,
      proposalStatus: currentProposalStatus,
      currentProposalStatus,
      block: "pending_revision",
    };
  }

  // Re-validate the 5 canonical prerequisites for both "submitted" and null.
  // For "submitted" → if any prerequisite fails, caller (tryEnqueue) dequeues.
  // For null → if any prerequisite fails, caller reports block (no-op).

  const activeSupervisors = await prisma.thesisSupervisors.findMany({
    where: {
      thesisId: thesis.id,
      status: "active",
      role: { is: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } } },
    },
    select: { role: { select: { name: true } } },
  });
  const hasP1Active = activeSupervisors.some((s) => s.role?.name === ROLES.PEMBIMBING_1);
  const hasP2Active = activeSupervisors.some((s) => s.role?.name === ROLES.PEMBIMBING_2);
  if (activeSupervisors.length === 0 || !hasP1Active) {
    return { ready: false, proposalStatus: currentProposalStatus, currentProposalStatus, block: "no_supervisor" };
  }

  if (!thesis.title || !String(thesis.title).trim()) {
    return { ready: false, proposalStatus: currentProposalStatus, currentProposalStatus, block: "no_title" };
  }

  if (!thesis.finalProposalVersionId) {
    return {
      ready: false,
      proposalStatus: currentProposalStatus,
      currentProposalStatus,
      block: "proposal_final_not_submitted",
    };
  }

  const rmScore = await prisma.researchMethodScore.findFirst({
    where: { thesisId: thesis.id },
    orderBy: { createdAt: "desc" },
  });
  if (!rmScore || rmScore.supervisorScore == null || rmScore.lecturerScore == null) {
    return { ready: false, proposalStatus: currentProposalStatus, currentProposalStatus, block: "missing_scores" };
  }
  // BR-20 / FR-SCR-07 (F-4.4): antrean KaDep hanya dibuka setelah siklus
  // penilaian FINAL — P1 submit + P2 co-sign (bila ada P2) + TA-03B.
  // `isFinalized` adalah flag kanonis "siklus selesai" (di-set oleh
  // isScoreReadyToFinalize / publishFinalScore; auto-zero juga isFinalized=true).
  // Tanpa gate ini, thesis ber-P2 yang belum co-sign bisa masuk antrean KaDep
  // secara prematur dan disahkan tanpa konsensus P2.
  //
  // Celah #2 recovery: Jika P2 terminated sebelum co-sign, score stuck
  // isFinalized=false. Dalam kasus ini (P2 tidak aktif + kedua score ada +
  // belum co-sign), auto-finalize agar thesis tidak deadlock permanen.
  if (!rmScore.isFinalized) {
    const canAutoRecover = !hasP2Active
      && rmScore.supervisorScore != null
      && rmScore.lecturerScore != null
      && rmScore.coSignedAt == null;
    if (canAutoRecover) {
      await prisma.researchMethodScore.update({
        where: { id: rmScore.id },
        data: { isFinalized: true, finalizedAt: new Date(), finalizedBy: null },
      });
    } else {
      return {
        ready: false,
        proposalStatus: currentProposalStatus,
        currentProposalStatus,
        block: "scores_not_finalized",
      };
    }
  }
  // Konsistensi co-sign P2 (selaras getPendingTitleReports + reviewTitleReport):
  // `isFinalized` bisa stale true jika P2 ditambahkan setelah finalize P1-only.
  // Re-assert co-sign eksplisit untuk thesis ber-P2 agar dequeue konsisten.
  if (hasP2Active && (rmScore.coSignedAt == null || rmScore.coSignedByLecturerId == null)) {
    return {
      ready: false,
      proposalStatus: currentProposalStatus,
      currentProposalStatus,
      block: "scores_not_finalized",
    };
  }
  // §5.7.3 (BR-28): thesis yang di-auto-zero karena presensi Metopel <75% GAGAL
  // prasyarat Metopel dan WAJIB mengulang kelas — BUKAN dipromosikan ke fase TA. Karena
  // auto-zero menulis `isFinalized=true`, gate isFinalized di atas lolos, jadi
  // blokir eksplisit di sini agar mahasiswa gagal-Metopel tidak ter-enqueue.
  if (rmScore.attendanceAutoZeroedAt != null) {
    return {
      ready: false,
      proposalStatus: currentProposalStatus,
      currentProposalStatus,
      block: "metopel_auto_zeroed",
    };
  }

  const student = await prisma.student.findUnique({
    where: { id: thesis.studentId },
    select: { takingThesisCourse: true },
  });
  if (student?.takingThesisCourse !== true) {
    return {
      ready: false,
      proposalStatus: currentProposalStatus,
      currentProposalStatus,
      block: "ta_course_not_confirmed",
    };
  }

  // All 5 prerequisites satisfied.
  // `proposalStatus` field reflects readiness: "submitted" if already queued
  // (caller treats as no-op enqueue), or "ready" if null (caller enqueues).
  return {
    ready: true,
    proposalStatus: currentProposalStatus === "submitted" ? "submitted" : "ready",
    currentProposalStatus,
  };
}

async function tryEnqueueThesisForKadepProposalReview(thesisId) {
  const readiness = await evaluateKadepProposalQueueReadiness(thesisId);

  // Terminal: accepted — no-op.
  if (readiness.proposalStatus === "accepted") {
    return { updated: false, proposalStatus: "accepted", queued: false };
  }
  // User-driven non-queueable (rejected / revision_in_progress) — no-op.
  if (readiness.proposalStatus === "rejected" || readiness.proposalStatus === "revision_in_progress") {
    return { updated: false, proposalStatus: readiness.proposalStatus, block: readiness.block };
  }

  const currentStatus = readiness.currentProposalStatus;

  if (readiness.ready) {
    // All 5 prerequisites satisfied.
    if (currentStatus === "submitted") {
      // Already queued and still valid — no-op (idempotent).
      return { updated: false, proposalStatus: "submitted", queued: true };
    }
    // Enqueue baru (status null → submitted).
    await prisma.thesis.update({
      where: { id: thesisId },
      data: {
        proposalStatus: "submitted",
        proposalReviewNotes: null,
        proposalReviewedAt: null,
        proposalReviewedByUserId: null,
      },
    });
    return { updated: true, proposalStatus: "submitted", queued: true };
  }

  // !ready: prerequisite(s) fail.
  if (currentStatus === "submitted") {
    // Post-enqueue degradation (audit F-4.4 follow-up): a previously-enqueued
    // thesis lost a prerequisite (e.g. P2 added without co-sign, SIA flipped
    // takingThesisCourse, auto-zero applied). Auto-dequeue to keep KaDep queue
    // consistent with the 5 canonical promotion prerequisites (canon §5.8.1).
    await prisma.thesis.update({
      where: { id: thesisId },
      data: {
        proposalStatus: null,
        proposalReviewNotes: null,
        proposalReviewedAt: null,
        proposalReviewedByUserId: null,
      },
    });
    return {
      updated: false,
      proposalStatus: null,
      dequeued: true,
      block: readiness.block,
    };
  }
  // Not queued yet, not ready — no-op.
  return { updated: false, proposalStatus: null, block: readiness.block };
}

function badRequestForKadepEnqueueBlock(block) {
  if (block === "no_thesis") {
    return new BadRequestError("Tugas Akhir tidak ditemukan");
  }
  if (block === "no_supervisor") {
    return new BadRequestError("Anda harus memiliki dosen pembimbing terlebih dahulu");
  }
  if (block === "no_title") {
    return new BadRequestError("Judul TA belum diisi. Silakan isi judul terlebih dahulu.");
  }
  if (block === "proposal_final_not_submitted") {
    return new BadRequestError(
      "Mahasiswa harus submit proposal final terlebih dahulu sebelum masuk antrean KaDep."
    );
  }
  if (block === "missing_scores") {
    return new BadRequestError(
      "Antre KaDep dibuka setelah nilai TA-03A dan TA-03B tersedia."
    );
  }
  if (block === "scores_not_finalized") {
    return new BadRequestError(
      "Promosi aktif menunggu penilaian TA-03A (termasuk co-sign Pembimbing 2 bila ada) dan TA-03B difinalisasi."
    );
  }
  if (block === "metopel_auto_zeroed") {
    return new BadRequestError(
      "Mahasiswa tidak memenuhi prasyarat presensi Metopel (≥75%) sehingga nilai TA-03 otomatis 0. Promosi aktif tidak dapat diproses; mahasiswa wajib mengulang kelas Metopel."
    );
  }
  if (block === "ta_course_not_confirmed") {
    return new BadRequestError(
      "Promosi aktif hanya dapat diproses setelah data SIA mengonfirmasi mahasiswa sedang mengambil mata kuliah Tugas Akhir."
    );
  }
  return new BadRequestError("Persyaratan belum terpenuhi");
}

/**
 * Legacy / idempotent hook: same as sistem otomatis. Panduan tidak mewajibkan aksi
 * mahasiswa terpisah; endpoint tetap ada agar klien lama tidak rusak.
 *
 * Side effect: if the thesis was previously "submitted" but a prerequisite has
 * since degraded (e.g. P2 added without co-sign), this call auto-dequeues it
 * (resets proposalStatus to null) and throws with the block reason — so the
 * student UI refresh shows the correct "Belum Masuk Antrean" state instead of
 * a stale "Menunggu Review KaDep".
 */
export async function submitTitleReport(userId) {
  const thesis = await repo.findStudentThesis(userId);
  if (!thesis) throw new NotFoundError("Tugas Akhir tidak ditemukan");

  if (thesis.proposalStatus === "accepted") {
    throw new BadRequestError("Judul TA sudah disetujui");
  }

  const result = await tryEnqueueThesisForKadepProposalReview(thesis.id);
  if (result.queued) {
    return { thesisId: thesis.id, title: thesis.title, proposalStatus: "submitted" };
  }
  throw badRequestForKadepEnqueueBlock(result.block);
}

/**
 * Legacy KaDep manual title review - DISABLED.
 * Happy path: Batch TA-04 Awal + automatic promotion/release (canon v3.0 §5.8 / §5.10).
 */
export async function reviewTitleReport(thesisId, action, notes, reviewedBy) {
  void thesisId;
  void action;
  void notes;
  void reviewedBy;
  throw new BadRequestError(
    "Review TA-04 manual sudah dinonaktifkan. Gunakan Finalisasi / Perbarui Formulir TA-04 pada tab Batch TA-04 Awal. Promosi beban aktif berjalan otomatis setelah TA-03 final dan konfirmasi KRS Tugas Akhir dari SIA.",
  );
}

export async function approveRevisionAfterKadepReject(thesisId, lecturerUserId, notes) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: { id: true, proposalStatus: true, studentId: true },
  });
  if (!thesis) throw new NotFoundError("Tugas Akhir tidak ditemukan");
  if (thesis.proposalStatus !== "revision_in_progress") {
    throw new BadRequestError(
      "Telaah revisi hanya dapat dilakukan pada proposal berstatus 'revision_in_progress'.",
    );
  }

  const isSupervisor = await prisma.thesisSupervisors.count({
    where: {
      thesisId,
      status: "active",
      lecturer: { userId: lecturerUserId },
      role: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } },
    },
  });
  if (isSupervisor === 0) {
    throw new ForbiddenError("Hanya pembimbing aktif yang dapat menelaah revisi pasca-KaDep");
  }

  await prisma.thesis.update({
    where: { id: thesisId },
    data: {
      proposalStatus: null,
      proposalReviewNotes: notes?.trim() || null,
      proposalReviewedAt: null,
      proposalReviewedByUserId: null,
    },
  });

  const result = await syncKadepProposalQueueByThesisId(thesisId);

  return { thesisId, reQueued: result.synced, proposalStatus: result.synced ? "submitted" : null };
}

/**
 * Legacy pending manual-review queue - always empty.
 * KaDep UI no longer exposes Review TA-04 Manual; use Batch TA-04 Awal.
 */
export async function getPendingTitleReports({ academicYearId } = {}) {
  void academicYearId;
  return [];
}

export async function getKadepTitleReportHistory({ academicYearId } = {}) {
  const theses = await prisma.thesis.findMany({
    where: {
      AND: [
        // Masih fase Metopen — bukan beban aktif TA / arsip.
        { status: THESIS_STATUS.PROPOSAL },
        {
          OR: [
            { proposalStatus: null },
            { proposalStatus: { notIn: ["accepted", "rejected"] } },
          ],
        },
        { activePromotedAt: null },
        {
          advisorRequests: {
            some: {
              status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
              ...(academicYearId ? { academicYearId } : {}),
            },
          },
        },
        academicYearId
          ? {
              OR: [
                { academicYearId },
                { ta04AssignmentAcademicYearId: academicYearId },
                {
                  advisorRequests: {
                    some: {
                      status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
                      academicYearId,
                    },
                  },
                },
              ],
            }
          : {},
      ],
    },
    include: {
      academicYear: { select: { id: true, year: true, semester: true } },
      ta04AssignmentAcademicYear: { select: { id: true, year: true, semester: true } },
      activeAcademicYear: { select: { id: true, year: true, semester: true } },
      finalProposalVersion: { select: { id: true } },
      thesisTopic: {
        select: {
          id: true,
          name: true,
          scienceGroup: { select: { id: true, name: true } },
        },
      },
      student: {
        select: {
          takingThesisCourse: true,
          user: { select: { fullName: true, identityNumber: true } },
        },
      },
      advisorRequests: {
        where: {
          status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
          ...(academicYearId ? { academicYearId } : {}),
        },
        select: {
          id: true,
          status: true,
          academicYearId: true,
          proposedTitle: true,
          createdAt: true,
          academicYear: { select: { id: true, year: true, semester: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      thesisSupervisors: {
        where: { status: "active" },
        include: {
          lecturer: { include: { user: { select: { fullName: true } } } },
          role: { select: { name: true } },
        },
      },
      researchMethodScores: {
        select: {
          supervisorScore: true,
          lecturerScore: true,
          isFinalized: true,
          attendanceAutoZeroedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      titleApprovalDocument: { select: { id: true, fileName: true } },
      proposalReviewedBy: { select: { fullName: true } },
      ta04BatchMembers: { select: { id: true, batchId: true } },
    },
    orderBy: [
      { ta04AssignmentIssuedAt: "desc" },
      { updatedAt: "desc" },
    ],
  });

  const academicYearIds = theses
    .map(
      (t) =>
        t.ta04AssignmentAcademicYear?.id ??
        t.academicYear?.id ??
        t.advisorRequests?.[0]?.academicYear?.id ??
        t.advisorRequests?.[0]?.academicYearId,
    )
    .filter(Boolean);
  const currentBatches = await ta04BatchRepo.findCurrentTa04BatchesByAcademicYears(academicYearIds);
  const currentBatchByThesisId = buildCurrentBatchByThesisId(currentBatches);

  return theses.map((t) => {
    const currentBatch = currentBatchByThesisId.get(t.id) ?? null;
    const pointerDocumentKind = resolveTitleApprovalDocumentKind(t.titleApprovalDocument?.fileName);
    const documentKind = currentBatch
      ? "batch"
      : pointerDocumentKind === "batch"
        ? "stale_batch"
        : pointerDocumentKind;
    const batchEligibility = getTa04BatchEligibilitySnapshot(t);
    const listSection = resolveTa04ListSection(t, batchEligibility);
    const resolvedAcademicYear =
      t.ta04AssignmentAcademicYear ??
      t.academicYear ??
      t.advisorRequests?.[0]?.academicYear ??
      null;
    const requestTitle =
      t.advisorRequests?.find((r) => r.proposedTitle)?.proposedTitle ?? null;
    const topicName = t.thesisTopic?.name ?? null;
    const topicScienceGroupName = t.thesisTopic?.scienceGroup?.name ?? null;
    const displayTitle =
      t.ta04AssignmentTitle ??
      t.title ??
      requestTitle ??
      null;

    return {
      thesisId: t.id,
      title: displayTitle,
      topicName,
      topicScienceGroupName,
      studentName: t.student?.user?.fullName ?? "-",
      studentNim: t.student?.user?.identityNumber ?? "-",
      supervisors: resolveTa04SupervisorDisplayNames(t),
      proposalStatus: t.proposalStatus,
      // API shape kept for the Metopen UI; derived from status (K15).
      isProposal: t.status === THESIS_STATUS.PROPOSAL,
      ta04AssignmentIssuedAt: t.ta04AssignmentIssuedAt,
      activeAcademicYear: t.activeAcademicYear,
      activePromotedAt: t.activePromotedAt,
      reviewedAt: t.ta04AssignmentIssuedAt ?? t.proposalReviewedAt,
      reviewedByName: t.proposalReviewedBy?.fullName ?? null,
      reviewNotes: t.proposalReviewNotes,
      academicYear: resolvedAcademicYear,
      titleApprovalDocument: currentBatch
        ? currentBatch.document
        : documentKind
          ? t.titleApprovalDocument
          : null,
      documentKind,
      ta04BatchEligible: batchEligibility.eligible,
      ta04BatchBlock: batchEligibility.block,
      repairRequired:
        batchEligibility.block === "no_active_pembimbing_1" ||
        (Boolean(t.ta04AssignmentIssuedAt) && (t.ta04BatchMembers?.length ?? 0) === 0),
      listSection,
      ta04Batch: currentBatch
        ? {
            id: currentBatch.id,
            documentId: currentBatch.documentId,
            version: currentBatch.version,
            cohortHash: currentBatch.cohortHash,
            memberCount: currentBatch.members?.length ?? 0,
          }
        : null,
    };
  });
}

/**
 * Legacy compatibility export.
 * Formulir TA-04 resmi tidak lagi dibuat per thesis. Dokumen resmi hanya
 * diterbitkan melalui finalisasi batch periode di advisorRequest.service.js.
 */
export async function generateTitleApprovalLetter(thesisId) {
  void thesisId;
  return null;
}

/**
 * Legacy compatibility export. Tidak menghasilkan dokumen per mahasiswa.
 */
export async function generateTitleApprovalLetterWithRetry(thesisId, { attempts = 3 } = {}) {
  void thesisId;
  void attempts;
  return { ok: true, document: null };
}

/**
 * Daftar booking TA-01/TA-02 yang belum terhubung ke Formulir TA-04 awal
 * batch resmi. Dokumen lama non-batch diperlakukan belum resmi.
 */
export async function getAcceptedThesesMissingApprovalDocument({ academicYearId } = {}) {
  const theses = await prisma.thesis.findMany({
    where: {
      ...(academicYearId ? { academicYearId } : {}),
      advisorRequests: {
        some: {
          status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
          ...(academicYearId ? { academicYearId } : {}),
        },
      },
    },
    select: {
      id: true,
      title: true,
      proposalStatus: true,
      ta04AssignmentIssuedAt: true,
      ta04AssignmentTitle: true,
      ta04AssignmentSupervisorNames: true,
      advisorRequests: {
        where: { status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED },
        select: { id: true, status: true },
      },
      finalProposalVersionId: true,
      proposalReviewedAt: true,
      academicYear: { select: { id: true, year: true, semester: true } },
      student: {
        select: {
          takingThesisCourse: true,
          user: { select: { fullName: true, identityNumber: true } },
        },
      },
      thesisSupervisors: {
        where: { status: "active" },
        select: {
          status: true,
          role: { select: { name: true } },
        },
      },
      researchMethodScores: {
        select: {
          supervisorScore: true,
          lecturerScore: true,
          isFinalized: true,
          attendanceAutoZeroedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      titleApprovalDocument: { select: { id: true, fileName: true, filePath: true } },
    },
    orderBy: [{ ta04AssignmentIssuedAt: "desc" }, { updatedAt: "desc" }],
  });

  const academicYearIds = theses.map((t) => t.academicYear?.id).filter(Boolean);
  const currentBatches = await ta04BatchRepo.findCurrentTa04BatchesByAcademicYears(academicYearIds);
  const currentBatchByThesisId = buildCurrentBatchByThesisId(currentBatches);

  return theses
    .filter((t) => getTa04BatchEligibilitySnapshot(t).eligible)
    .filter((t) => !currentBatchByThesisId.has(t.id))
    .map((t) => ({
      thesisId: t.id,
      title: t.ta04AssignmentTitle ?? t.title ?? null,
      studentName: t.student?.user?.fullName ?? "-",
      studentNim: t.student?.user?.identityNumber ?? "-",
      approvedAt: t.ta04AssignmentIssuedAt ?? t.proposalReviewedAt,
      academicYear: t.academicYear,
    }));
}

/**
 * Regenerasi dokumen per mahasiswa tidak lagi menjadi jalur resmi. Formulir TA-04
 * harus diterbitkan lewat finalisasi batch periode agar satu dokumen resmi
 * memuat seluruh mahasiswa pada semester tersebut.
 */
export async function regenerateTitleApprovalLetter(thesisId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: { id: true },
  });
  if (!thesis) throw new NotFoundError("Tugas Akhir tidak ditemukan");
  throw new BadRequestError(
    "Formulir TA-04 hanya diterbitkan melalui finalisasi batch periode. Gunakan aksi finalisasi/perbarui batch pada riwayat TA-04.",
  );
}

/**
 * Unduh PDF TA-04 untuk mahasiswa dinonaktifkan (KC TA-04 PDF UX).
 * Keputusan KaDep = status sistem; PDF unsigned hanya artefak cetak KaDep.
 */
export async function getTitleApprovalDocumentForStudent(_userId) {
  throw new ForbiddenError(
    "Dokumen cetak TA-04 dikelola departemen. Status penugasan pembimbing tersedia di overview Metopel.",
  );
}

/**
 * KaDep mengunduh Formulir TA-04 PDF untuk thesis yang sudah terhubung ke batch.
 * KaDep adalah approver tunggal (BR-24) sekaligus penandatangan SK — mengunduh
 * dokumen kerja pengesahan adalah bagian workflow KaDep, BUKAN surface arsip
 * dosen baru (OQ-2.3 v2.4 tetap dijaga: arsip surface §5.13 = mahasiswa-only).
 */
export async function getTitleApprovalDocumentForKadep(thesisId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      ta04AssignmentIssuedAt: true,
      academicYearId: true,
      ta04AssignmentAcademicYearId: true,
    },
  });
  if (!thesis) throw new NotFoundError("Tugas Akhir tidak ditemukan");
  if (!thesis.ta04AssignmentIssuedAt) {
    throw new NotFoundError("Formulir TA-04 hanya tersedia untuk thesis yang sudah masuk batch TA-04 awal.");
  }

  const batch = await ta04BatchRepo.findCurrentTa04BatchForThesis(thesisId);
  if (!batch?.document || !isOfficialTitleApprovalDocument(batch.document)) {
    throw new NotFoundError(
      "Formulir TA-04 belum tersedia untuk thesis ini. Finalisasi batch periode terlebih dahulu.",
    );
  }

  // FR-TA04-08 / KC-20260727-02: tolak unduh PDF lama saat cohort batch partial.
  const academicYearId =
    batch.academicYearId ?? thesis.ta04AssignmentAcademicYearId ?? thesis.academicYearId;
  if (academicYearId) {
    const eligibleTheses = await advisorRequestRepo.findThesesWithSupervisors(academicYearId);
    const memberIds = new Set((batch.members ?? []).map((member) => member.thesisId));
    const missingCount = eligibleTheses.filter((item) => !memberIds.has(item.id)).length;
    if (missingCount > 0) {
      throw new BadRequestError(
        `Formulir TA-04 periode ini belum diperbarui (${missingCount} mahasiswa belum masuk dokumen batch). Jalankan Perbarui Formulir TA-04 terlebih dahulu sebelum mengunduh.`,
      );
    }
  }

  return resolveTitleApprovalDocumentPath(batch.document);
}

/**
 * Helper: resolve document.filePath (relative, mis.
 * "uploads/documents/ta04/TA04_BATCH_...pdf") ke absolute path yang aman
 * untuk di-stream. Anti path-traversal: resolved path wajib berada di bawah
 * <cwd>/uploads. Verifikasi file eksis di disk.
 */
function resolveTitleApprovalDocumentPath(documentRow) {
  const relativePath = String(documentRow.filePath || "").trim();
  if (!relativePath) {
    throw new NotFoundError("Path Formulir TA-04 tidak valid");
  }

  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  const absolutePath = path.resolve(process.cwd(), relativePath);
  if (!absolutePath.startsWith(uploadsRoot + path.sep)) {
    throw new NotFoundError("Akses Formulir TA-04 ditolak (path di luar folder uploads)");
  }
  if (!fs.existsSync(absolutePath)) {
    throw new NotFoundError("File Formulir TA-04 tidak ditemukan di disk");
  }

  return {
    absolutePath,
    fileName: documentRow.fileName || path.basename(absolutePath),
  };
}