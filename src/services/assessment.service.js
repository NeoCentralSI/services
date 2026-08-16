import prisma from "../config/prisma.js";
import { NotFoundError, BadRequestError, ForbiddenError } from "../utils/errors.js";
import { ROLES } from "../constants/roles.js";
import { CLOSED_THESIS_STATUSES } from "../constants/thesisStatus.js";
import { formatAcademicYearLabel, resolveOperationalAcademicYear } from "../helpers/academicYear.helper.js";
import { syncKadepProposalQueueByThesisId } from "./metopen.service.js";
import { assertAttendanceEligibleForManualReview } from "./metopenAttendance.service.js";
import { createNotificationEventForUsers } from "./notification.service.js";
import {
  getCapForRole,
  getCompositionForAcademicYear,
  resolveAcademicYearIdForThesis,
} from "./metopenScoreComposition.service.js";

const FORM_ROLES = {
  "TA-03A": "supervisor",
  "TA-03B": "default",
};

function getFormRole(formCode) {
  const role = FORM_ROLES[formCode];
  if (!role) {
    throw new BadRequestError(`formCode tidak dikenal: ${formCode}. Gunakan 'TA-03A' atau 'TA-03B'.`);
  }
  return role;
}

function normalizeScoreValue(value, criteriaName) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw new BadRequestError(`Skor ${criteriaName} wajib berupa bilangan bulat`);
  }
  if (numeric < 0) {
    throw new BadRequestError(`Skor ${criteriaName} tidak boleh negatif`);
  }
  return numeric;
}

async function getResearchMethodCriteriaByRole(role, academicYearId) {
  return prisma.metopenAssessmentCriteria.findMany({
    where: {
      role,
      metopenCpmk: { academicYearId },
    },
    select: {
      id: true,
      name: true,
      maxScore: true,
      displayOrder: true,
      metopenAssessmentRubrics: {
        select: {
          id: true,
          minScore: true,
          maxScore: true,
        },
        orderBy: { displayOrder: "asc" },
      },
    },
    orderBy: { displayOrder: "asc" },
  });
}

async function validateResearchMethodScores(formCode, scores, academicYearId) {
  const role = getFormRole(formCode);
  const { cap } = await getCapForRole(role, academicYearId);
  const criteria = await getResearchMethodCriteriaByRole(role, academicYearId);
  if (criteria.length === 0) {
    throw new BadRequestError(`Rubrik ${formCode} belum dikonfigurasi`);
  }

  const criteriaById = new Map(criteria.map((item) => [item.id, item]));
  const seen = new Set();
  const normalizedScores = scores.map((item) => {
    const criteriaId = String(item.criteriaId || "").trim();
    const criteriaItem = criteriaById.get(criteriaId);
    if (!criteriaItem) {
      throw new BadRequestError(`Kriteria penilaian ${criteriaId || "(kosong)"} tidak valid untuk ${formCode}`);
    }
    if (seen.has(criteriaId)) {
      throw new BadRequestError(`Kriteria ${criteriaItem.name ?? criteriaId} dikirim lebih dari satu kali`);
    }
    seen.add(criteriaId);

    const score = normalizeScoreValue(item.score, criteriaItem.name ?? criteriaId);
    if (criteriaItem.maxScore != null && score > criteriaItem.maxScore) {
      throw new BadRequestError(
        `Skor ${criteriaItem.name ?? criteriaId} melebihi batas maksimum ${criteriaItem.maxScore}`,
      );
    }

    const rubricId = item.rubricId ? String(item.rubricId).trim() : null;
    const rubrics = criteriaItem.metopenAssessmentRubrics ?? [];
    let selectedRubricId = null;

    if (rubricId) {
      const selectedRubric = rubrics.find((rubric) => rubric.id === rubricId);
      if (!selectedRubric) {
        throw new BadRequestError(
          `Rubrik ${rubricId} tidak valid untuk kriteria ${criteriaItem.name ?? criteriaId}`,
        );
      }
      if (score < selectedRubric.minScore || score > selectedRubric.maxScore) {
        throw new BadRequestError(
          `Skor ${criteriaItem.name ?? criteriaId} harus berada dalam rentang rubrik ${selectedRubric.minScore}-${selectedRubric.maxScore}`,
        );
      }
      selectedRubricId = selectedRubric.id;
    } else if (rubrics.length > 0) {
      throw new BadRequestError(
        `Rubrik penilaian wajib dipilih untuk kriteria ${criteriaItem.name ?? criteriaId}`,
      );
    }

    return { criteriaId, score, rubricId: selectedRubricId };
  });

  const missing = criteria.filter((item) => !seen.has(item.id));
  if (missing.length > 0) {
    throw new BadRequestError(
      `Semua kriteria ${formCode} wajib dinilai. Belum ada nilai untuk: ${missing
        .map((item) => item.name ?? item.id)
        .join(", ")}`,
    );
  }

  const totalScore = normalizedScores.reduce((acc, item) => acc + item.score, 0);
  if (totalScore > cap) {
    throw new BadRequestError(`Total skor ${formCode} melebihi batas maksimum ${cap} (dihitung: ${totalScore})`);
  }

  return { totalScore, normalizedScores };
}

async function syncProposalQueueAfterScore(thesisId) {
  try {
    await syncKadepProposalQueueByThesisId(thesisId);
  } catch (error) {
    console.warn("[assessment] TA-04 lifecycle sync failed:", error?.message || error);
  }
}

async function findKoordinatorMetopenUserIds() {
  const users = await prisma.user.findMany({
    where: {
      userHasRoles: {
        some: {
          status: "active",
          role: { name: ROLES.KOORDINATOR_METOPEN },
        },
      },
    },
    select: { id: true },
  });
  return users.map((user) => user.id).filter(Boolean);
}

async function getAssessmentNotificationContext(thesisId) {
  return prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      title: true,
      student: {
        select: {
          user: { select: { id: true, fullName: true, identityNumber: true } },
        },
      },
      thesisSupervisors: {
        where: {
          status: "active",
          role: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } },
        },
        select: {
          lecturerId: true,
          role: { select: { name: true } },
          lecturer: {
            select: {
              user: { select: { id: true, fullName: true } },
            },
          },
        },
      },
      researchMethodScores: {
        take: 1,
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          supervisorScore: true,
          lecturerScore: true,
          coSignedAt: true,
          coSignedByLecturerId: true,
          finalScore: true,
          isFinalized: true,
        },
      },
    },
  });
}

function getAssessmentSupervisorUserId(context, roleName) {
  return (
    context?.thesisSupervisors?.find((item) => item.role?.name === roleName)?.lecturer?.user?.id ??
    null
  );
}

async function safeCreateAssessmentNotification(userIds, payload, options, context) {
  try {
    await createNotificationEventForUsers(userIds, payload, options);
  } catch (error) {
    console.error(`[assessment:${context}] gagal mengirim notifikasi:`, error?.message || error);
  }
}

async function notifyTa03Finalized(context, score, event) {
  const studentUserId = context?.student?.user?.id;
  if (!studentUserId) return;

  await safeCreateAssessmentNotification(
    [studentUserId],
    {
      title: "Nilai TA-03 Final",
      message: `Nilai akhir TA-03 untuk "${context.title ?? "proposal Anda"}" sudah final${score?.finalScore != null ? ` (${score.finalScore}/100)` : ""}. Promosi beban aktif menunggu konfirmasi KRS Tugas Akhir bila belum terpenuhi.`,
      type: "simpta_ta03_finalized",
      data: {
        thesisId: context.id,
        scoreId: score?.id ?? null,
        sourceEvent: event,
        route: "/metopel",
      },
    },
    { push: true },
    "ta03_finalized",
  );
}

async function notifyTa03AssessmentProgress(thesisId, event) {
  try {
    const context = await getAssessmentNotificationContext(thesisId);
    if (!context) return;

    const score = context.researchMethodScores?.[0] ?? null;
    const title = context.title ?? "proposal mahasiswa";
    const studentName = context.student?.user?.fullName ?? "Mahasiswa";
    const p1UserId = getAssessmentSupervisorUserId(context, ROLES.PEMBIMBING_1);
    const p2UserId = getAssessmentSupervisorUserId(context, ROLES.PEMBIMBING_2);
    const baseData = {
      thesisId: context.id,
      scoreId: score?.id ?? null,
    };

    if (score?.isFinalized) {
      await notifyTa03Finalized(context, score, event);
      return;
    }

    if (event === "ta03a_submitted") {
      if (p2UserId && !score?.coSignedAt) {
        await safeCreateAssessmentNotification(
          [p2UserId],
          {
            title: "TA-03A Menunggu Co-sign",
            message: `Pembimbing 1 sudah mengisi TA-03A untuk ${studentName}. Co-sign Pembimbing 2 diperlukan sebelum nilai final dikunci.`,
            type: "simpta_ta03a_waiting_cosign",
            data: { ...baseData, route: "/kelola/metopen/ta03a" },
          },
          { push: true },
          event,
        );
      }

      if (score?.lecturerScore == null) {
        const koordinatorIds = await findKoordinatorMetopenUserIds();
        await safeCreateAssessmentNotification(
          koordinatorIds,
          {
            title: "TA-03B Menunggu Penilaian",
            message: `TA-03A untuk ${studentName} sudah masuk. Lengkapi TA-03B untuk "${title}".`,
            type: "simpta_ta03b_waiting_assessment",
            data: { ...baseData, route: "/kelola/metopen/ta03b" },
          },
          { push: true },
          event,
        );
      }
      return;
    }

    if (event === "ta03a_cosigned") {
      if (score?.lecturerScore == null) {
        const koordinatorIds = await findKoordinatorMetopenUserIds();
        await safeCreateAssessmentNotification(
          koordinatorIds,
          {
            title: "TA-03A Sudah Co-sign",
            message: `TA-03A ${studentName} sudah lengkap dengan co-sign. TA-03B masih menunggu penilaian.`,
            type: "simpta_ta03b_waiting_after_cosign",
            data: { ...baseData, route: "/kelola/metopen/ta03b" },
          },
          { push: true },
          event,
        );
      }
      return;
    }

    if (event === "ta03b_submitted") {
      if (score?.supervisorScore == null && p1UserId) {
        await safeCreateAssessmentNotification(
          [p1UserId],
          {
            title: "TA-03A Menunggu Penilaian",
            message: `Koordinator Metopel sudah mengisi TA-03B untuk ${studentName}. TA-03A Pembimbing 1 masih perlu dilengkapi.`,
            type: "simpta_ta03a_waiting_assessment",
            data: { ...baseData, route: "/kelola/metopen/ta03a" },
          },
          { push: true },
          event,
        );
      } else if (p2UserId && !score?.coSignedAt) {
        await safeCreateAssessmentNotification(
          [p2UserId],
          {
            title: "TA-03A Menunggu Co-sign",
            message: `TA-03B untuk ${studentName} sudah masuk. Co-sign Pembimbing 2 masih diperlukan sebelum nilai final dikunci.`,
            type: "simpta_ta03a_waiting_cosign_after_ta03b",
            data: { ...baseData, route: "/kelola/metopen/ta03a" },
          },
          { push: true },
          event,
        );
      }
      return;
    }

    if (event === "ta03_manual_published") {
      await notifyTa03Finalized(context, score, event);
    }
  } catch (error) {
    console.error(`[assessment:${event}] gagal membangun notifikasi TA-03:`, error?.message || error);
  }
}

/**
 * Formula 75:25 (KONTEKS_KANONIS_SIMPTA.md §5.7, BR-10).
 * `finalScore = supervisorScore + lecturerScore` (additive, max 100).
 * Returns null bila salah satu nilai belum tersedia — keduanya wajib hadir
 * sebelum nilai final dianggap lengkap.
 *
 * Diekspor agar dapat diuji unit tanpa harus menjalankan pipeline penuh.
 */
export function calculateFinalScore(scoreRecord) {
  if (scoreRecord?.supervisorScore == null || scoreRecord?.lecturerScore == null) {
    return null;
  }
  return scoreRecord.supervisorScore + scoreRecord.lecturerScore;
}

function isClosedThesisStatus(statusName) {
  return Boolean(statusName) && CLOSED_THESIS_STATUSES.includes(statusName);
}

function assertTa04AssignmentIssuedForScoring(thesis, formCode = "TA-03") {
  if (thesis?.ta04AssignmentIssuedAt) return;
  throw new BadRequestError(
    `Formulir TA-04 awal belum diterbitkan. Penilaian ${formCode} baru boleh dilakukan setelah batch TA-04 awal difinalisasi KaDep.`,
  );
}

/**
 * BR-20 (canon §5.7.1): Detect whether a thesis has Pembimbing 2 in the
 * active thesis_supervisors. When P2 exists, TA-03A finalization requires
 * P2 co-sign (audit trail). When only P1 exists, co-sign is skipped.
 */
async function thesisHasActivePembimbing2(client, thesisId) {
  const p2 = await client.thesisSupervisors.findFirst({
    where: {
      thesisId,
      status: "active",
      role: { name: ROLES.PEMBIMBING_2 },
    },
    select: { id: true },
  });
  return Boolean(p2);
}

/**
 * BR-20 + BR-21: Determine whether the score record is "complete enough" to
 * auto-finalize and trigger TA-04 title report queue.
 *
 * Conditions (all must hold):
 *   - supervisorScore non-null (P1 submitted TA-03A)
 *   - lecturerScore non-null (Koordinator submitted TA-03B)
 *   - if thesis has Pembimbing 2 active in participants:
 *       coSignedAt + coSignedByLecturerId non-null (P2 co-signed)
 *
 * If any condition unmet, score stays in-progress (isFinalized = false) so
 * subsequent legitimate submits/cosigns may complete the cycle.
 */
function isScoreReadyToFinalize(scoreRecord, hasP2) {
  const hasSupervisor = scoreRecord?.supervisorScore != null;
  const hasLecturer = scoreRecord?.lecturerScore != null;
  const hasCoSign = scoreRecord?.coSignedAt != null && scoreRecord?.coSignedByLecturerId != null;

  if (!hasSupervisor || !hasLecturer) return false;
  if (hasP2 && !hasCoSign) return false;
  return true;
}

function buildScoreCompletionFields(scoreRecord, actorUserId, now, { hasP2 } = { hasP2: false }) {
  const finalScore = calculateFinalScore(scoreRecord);
  const ready = isScoreReadyToFinalize(scoreRecord, hasP2);
  return {
    finalScore,
    calculatedAt: now,
    ...(ready
      ? {
          isFinalized: true,
          finalizedBy: actorUserId,
          finalizedAt: now,
        }
      : {}),
  };
}

const RESEARCH_METHOD_SCORE_LOCK_SELECT = {
  id: true,
  supervisorScore: true,
  lecturerScore: true,
  lecturerId: true,
  coSignedAt: true,
  coSignedByLecturerId: true,
  isFinalized: true,
  periodClosedAt: true,
};

/**
 * Lock the score row before computing auto-finalize. Concurrent P2 co-sign and
 * TA-03B submit must both see the other's write or one will leave
 * `isFinalized=false` with complete scores (KC-20260814-06).
 */
async function readResearchMethodScoreForUpdate(tx, thesisId) {
  await tx.$queryRaw`
    SELECT id FROM research_method_scores WHERE thesis_id = ${thesisId} FOR UPDATE
  `;
  return tx.researchMethodScore.findUnique({
    where: { thesisId },
    select: RESEARCH_METHOD_SCORE_LOCK_SELECT,
  });
}

function resolveSupervisorActionStatus(score, isP1) {
  if (score?.periodClosedAt != null) {
    return "period_closed";
  }
  if (score?.attendanceAutoZeroedAt != null) {
    return "auto_zeroed";
  }
  if (score?.isFinalized) {
    return "finalized";
  }
  if (isP1) {
    if (score?.supervisorScore == null) return "p1_pending";
    return "p1_waiting_cosign";
  }
  if (score?.supervisorScore == null) return "p2_waiting_p1";
  if (score?.coSignedAt == null) return "p2_pending_cosign";
  return "p1_waiting_cosign";
}

// ============================================
// Criteria Retrieval
// ============================================

/**
 * Get AssessmentCriteria for a given form code.
 * formCode "TA-03A" → supervisor-role criteria on MetopenCpmk
 * formCode "TA-03B" → default-role criteria on MetopenCpmk
 * Caps come from MetopenScoreComposition for the active/requested academic year.
 */
export async function getCriteriaByFormCode(formCode, academicYearId = null) {
  const roleFilter = getFormRole(formCode);
  const resolvedAcademicYearId = requireAcademicYearId(academicYearId);

  const criteria = await prisma.metopenAssessmentCriteria.findMany({
    where: {
      role: roleFilter,
      metopenCpmk: { academicYearId: resolvedAcademicYearId },
    },
    include: {
      metopenCpmk: { select: { id: true, code: true, description: true } },
      metopenAssessmentRubrics: {
        orderBy: { displayOrder: "asc" },
      },
    },
    orderBy: { displayOrder: "asc" },
  });

  const composition = await getCompositionForAcademicYear(resolvedAcademicYearId);

  const cap = roleFilter === "supervisor" ? composition.ta03aCap : composition.ta03bCap;

  return {
    formCode,
    criteria,
    cap,
    ta03aCap: composition.ta03aCap,
    ta03bCap: composition.ta03bCap,
    academicYearId: composition.academicYearId,
  };
}

// ============================================
// Supervisor (TA-03A) Queue & Scoring
// ============================================

/**
 * BR-20 (canon §5.7.1): Antrean penilaian TA-03A untuk dosen pembimbing —
 * mencakup BAIK Pembimbing 1 (master pengisi rubrik) MAUPUN Pembimbing 2
 * (co-sign konsensus). Konsekuensi BR-20: TA-03A adalah konsensus mufakat
 * 1 blok tanda tangan, sehingga kedua pembimbing membutuhkan surface
 * antrean yang setara — P1 untuk submit rubrik, P2 untuk co-sign.
 *
 * Returns thesis dimana:
 * - Lecturer adalah Pembimbing 1 (`actorRole = "P1"`) atau Pembimbing 2 (`actorRole = "P2"`)
 * - Mahasiswa dan thesis aktif di scope proposal SIMPTA
 * - TA-04 awal sudah terbit (`ta04AssignmentIssuedAt` terisi)
 * - Final proposal sudah disubmit
 * - Belum `isFinalized` (auto-finalize akan keluar dari antrean)
 *
 * `actionStatus` per item:
 *   - "p1_pending"        → P1 perlu submit rubrik (P1 surface)
 *   - "p2_pending_cosign" → P1 sudah submit, P2 perlu co-sign (P2 surface)
 *   - "p1_waiting_cosign" → P1 sudah submit, menunggu P2 co-sign (P1 surface, read-only)
 *   - "p2_waiting_p1"     → P2 menunggu P1 submit dulu (P2 surface, read-only)
 *   - "auto_zeroed"       → presensi <75% (BR-28), nilai auto-zero, tidak bisa input manual
 *   - "finalized"         → TA-03A + TA-03B final, masuk riwayat read-only
 *
 * Item dengan `score.isFinalized = true` keluar dari antrean (siklus selesai).
 */
function requireAcademicYearId(value) {
  const academicYearId = typeof value === "string" ? value.trim() : "";
  if (!academicYearId) {
    throw new BadRequestError(
      "academicYearId wajib diisi agar antrean penilaian tidak tercampur lintas periode.",
    );
  }
  return academicYearId;
}

const TA03_EMPTY_REASON = {
  WAITING_TA04: "waiting_ta04",
  WAITING_FINAL_PROPOSAL: "waiting_final_proposal",
  ALL_IN_HISTORY: "all_in_history",
  NONE_IN_SCOPE: "none_in_scope",
};

function isThesisInScoringScope(thesis) {
  if (!thesis) return false;
  if (thesis.student?.status !== "active") return false;
  if (isClosedThesisStatus(thesis.thesisStatus?.name)) return false;
  return true;
}

function hasTa03ScoringPrerequisites(thesis) {
  return Boolean(thesis?.finalProposalVersionId) && Boolean(thesis?.ta04AssignmentIssuedAt);
}

/**
 * Penjelasan gerbang TA-03 untuk dosen/koordinator (FUN-029 / KC-20260709-03).
 * TA-04 disebut lebih dulu supaya antrean kosong tidak menyalahkan proposal
 * final ketika yang belum terbit adalah penugasan resmi.
 */
function resolveTa03GateReason(thesis) {
  if (!isThesisInScoringScope(thesis)) return null;
  if (!thesis.ta04AssignmentIssuedAt) {
    return {
      code: TA03_EMPTY_REASON.WAITING_TA04,
      text: "Penilaian menunggu penerbitan TA-04.",
    };
  }
  if (!thesis.finalProposalVersionId) {
    return {
      code: TA03_EMPTY_REASON.WAITING_FINAL_PROPOSAL,
      text: "Proposal final belum disubmit. Penilaian belum dapat dibuka.",
    };
  }
  return null;
}

function isTa03AHistoryScore(score) {
  if (!score) return false;
  return (
    score.isFinalized === true
    || score.attendanceAutoZeroedAt != null
    || score.periodClosedAt != null
  );
}

function isTa03BHistoryScore(score) {
  if (!score) return false;
  return (
    score.lecturerScore != null
    || score.isFinalized === true
    || score.attendanceAutoZeroedAt != null
    || score.periodClosedAt != null
  );
}

/**
 * BR-29: mutasi TA-03 hanya pada tahun operasional dan skor yang belum
 * ditutup karena ganti periode. Pemilih tahun lama tetap untuk riwayat.
 */
async function findActiveAdminUserIds() {
  const rows = await prisma.userHasRole.findMany({
    where: { status: "active", role: { name: ROLES.ADMIN } },
    select: { userId: true },
  });
  return rows.map((row) => row.userId);
}

async function reportMissingThesisAcademicYear(thesis) {
  try {
    const adminUserIds = await findActiveAdminUserIds();
    if (adminUserIds.length === 0) return;
    await createNotificationEventForUsers(
      adminUserIds,
      {
        title: "Thesis tanpa tahun ajaran",
        message:
          `Thesis ${thesis?.id ?? "(tanpa id)"} tidak terikat academicYearId. ` +
          "Penilaian di tahun baru ditolak sampai Admin memperbaiki data.",
        type: "simpta_thesis_missing_academic_year",
        data: {
          thesisId: thesis?.id ?? null,
          studentId: thesis?.studentId ?? null,
        },
      },
      { push: true },
    );
  } catch (notificationError) {
    console.error(
      "[Assessment] Gagal mengirim laporan thesis tanpa tahun ajaran:",
      notificationError?.message ?? notificationError,
    );
  }
}

async function assertThesisScoringPeriodOpen(thesis, score = null) {
  if (score?.periodClosedAt) {
    throw new ForbiddenError(
      "Periode Metode Penelitian sudah ditutup. Penilaian ini hanya dapat dilihat sebagai arsip.",
    );
  }
  if (!thesis?.academicYearId) {
    await reportMissingThesisAcademicYear(thesis);
    throw new ForbiddenError(
      "Thesis ini tidak terikat tahun ajaran. Penilaian ditolak sampai data diperbaiki Admin.",
    );
  }
  let operational = null;
  try {
    operational = await resolveOperationalAcademicYear();
  } catch {
    operational = null;
  }
  if (operational?.id && thesis.academicYearId !== operational.id) {
    throw new ForbiddenError(
      "Penilaian TA-03 hanya dapat diubah pada tahun ajaran operasional. Periode ini ditampilkan sebagai riwayat.",
    );
  }
}

function assertScorePeriodOpen(score) {
  if (score?.periodClosedAt) {
    throw new ForbiddenError(
      "Periode Metode Penelitian sudah ditutup. Penilaian ini hanya dapat dilihat sebagai arsip.",
    );
  }
}

function summarizeTa03EmptyQueue({ queueCount, blockedByGate, historyEligibleCount }) {
  if (queueCount > 0) {
    return { emptyReason: null, emptyReasonText: null };
  }
  if (blockedByGate.length > 0) {
    const allProposal = blockedByGate.every(
      (item) => item.gateCode === TA03_EMPTY_REASON.WAITING_FINAL_PROPOSAL,
    );
    if (allProposal) {
      return {
        emptyReason: TA03_EMPTY_REASON.WAITING_FINAL_PROPOSAL,
        emptyReasonText:
          "Penilaian menunggu proposal final. Mahasiswa pada periode ini belum mengajukan proposal final.",
      };
    }
    return {
      emptyReason: TA03_EMPTY_REASON.WAITING_TA04,
      emptyReasonText:
        "Penilaian menunggu penerbitan TA-04. Proposal belum masuk antrean sampai Ketua Departemen menerbitkan TA-04.",
    };
  }
  if (historyEligibleCount > 0) {
    return {
      emptyReason: TA03_EMPTY_REASON.ALL_IN_HISTORY,
      emptyReasonText:
        "Tidak ada proposal yang menunggu dinilai. Proposal yang sudah dinilai atau bernilai otomatis 0 ada di tab Riwayat.",
    };
  }
  return {
    emptyReason: TA03_EMPTY_REASON.NONE_IN_SCOPE,
    emptyReasonText: "Tidak ada mahasiswa pada periode ini yang masuk lingkup penilaian.",
  };
}

function stripGateCode(blockedByGate) {
  return blockedByGate.map(({ gateCode, ...rest }) => {
    void gateCode;
    return rest;
  });
}

const OTHER_PERIOD_THESIS_SELECT = {
  id: true,
  academicYearId: true,
  academicYear: { select: { year: true, semester: true } },
  student: {
    select: {
      status: true,
      user: { select: { id: true, fullName: true, identityNumber: true } },
    },
  },
  thesisStatus: {
    select: { name: true },
  },
};

/**
 * KC-20260814-07: antrean tetap period-scoped (KC-20260731-02). Thesis proposal
 * di tahun lain dikembalikan sebagai petunjuk, bukan dicampur ke `items`.
 */
function groupOtherPeriodHints(theses) {
  const byYear = new Map();
  for (const thesis of theses) {
    if (!isThesisInScoringScope(thesis)) continue;
    const academicYearId = thesis.academicYearId;
    if (!academicYearId) continue;
    if (!byYear.has(academicYearId)) {
      byYear.set(academicYearId, {
        academicYearId,
        periodLabel: formatAcademicYearLabel(thesis.academicYear),
        students: [],
      });
    }
    const group = byYear.get(academicYearId);
    const user = thesis.student?.user;
    if (!user) continue;
    if (group.students.some((student) => student.thesisId === thesis.id)) continue;
    group.students.push({
      fullName: user.fullName ?? "",
      identityNumber: user.identityNumber ?? "",
      thesisId: thesis.id,
    });
  }
  return [...byYear.values()];
}

const SUPERVISOR_SCORING_THESIS_SELECT = {
  id: true,
  title: true,
  finalProposalVersionId: true,
  ta04AssignmentIssuedAt: true,
  student: {
    select: {
      status: true,
      user: { select: { id: true, fullName: true, identityNumber: true } },
    },
  },
  thesisStatus: {
    select: { name: true },
  },
  researchMethodScores: {
    select: {
      id: true,
      supervisorScore: true,
      lecturerScore: true,
      finalScore: true,
      isFinalized: true,
      finalizedAt: true,
      coSignedAt: true,
      coSignedByLecturerId: true,
      coSignNote: true,
      attendanceAutoZeroedAt: true,
      attendanceAutoZeroReason: true,
      periodClosedAt: true,
      periodClosedReason: true,
    },
  },
  thesisSupervisors: {
    where: {
      status: "active",
      role: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } },
    },
    include: {
      role: { select: { name: true } },
      lecturer: {
        select: {
          user: { select: { id: true, fullName: true } },
        },
      },
    },
  },
};

async function findSupervisedThesesForScoring(supervisorUserId, academicYearId) {
  return prisma.thesisSupervisors.findMany({
    where: {
      lecturerId: supervisorUserId,
      status: "active",
      role: {
        name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] },
      },
      thesis: { academicYearId },
    },
    include: {
      role: { select: { name: true } },
      thesis: { select: SUPERVISOR_SCORING_THESIS_SELECT },
    },
    orderBy: { updatedAt: "desc" },
  });
}

async function findSupervisedThesesInOtherPeriods(supervisorUserId, academicYearId) {
  return prisma.thesisSupervisors.findMany({
    where: {
      lecturerId: supervisorUserId,
      status: "active",
      role: {
        name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] },
      },
      thesis: {
        academicYearId: { not: academicYearId },
        isProposal: true,
        student: { status: "active" },
      },
    },
    select: {
      thesis: { select: OTHER_PERIOD_THESIS_SELECT },
    },
  });
}

function mapSupervisorScoringItem(ts, { historyFields = false } = {}) {
  const thesis = ts.thesis;
  const score = thesis.researchMethodScores?.[0] ?? null;
  const isP1 = ts.role?.name === ROLES.PEMBIMBING_1;
  const actorRole = isP1 ? "P1" : "P2";
  const partnerRoleName = isP1 ? ROLES.PEMBIMBING_2 : ROLES.PEMBIMBING_1;
  const partner = (thesis.thesisSupervisors ?? [])
    .find((p) => p.role?.name === partnerRoleName);

  const item = {
    thesisId: thesis.id,
    thesisTitle: thesis.title ?? null,
    student: thesis.student?.user ?? null,
    actorRole,
    actionStatus: resolveSupervisorActionStatus(score, isP1),
    partnerName: partner?.lecturer?.user?.fullName ?? null,
    supervisorScore: score?.supervisorScore ?? null,
    lecturerScore: score?.lecturerScore ?? null,
    finalScore: score?.finalScore ?? null,
    coSignedAt: score?.coSignedAt ?? null,
    attendanceAutoZeroedAt: score?.attendanceAutoZeroedAt ?? null,
    attendanceAutoZeroReason: score?.attendanceAutoZeroReason ?? null,
    periodClosedAt: score?.periodClosedAt ?? null,
    periodClosedReason: score?.periodClosedReason ?? null,
    ta03GateReason: null,
  };

  if (!historyFields) return item;
  return {
    ...item,
    isFinalized: score?.isFinalized ?? false,
    finalizedAt: score?.finalizedAt ?? null,
    coSignNote: score?.coSignNote ?? null,
  };
}

export async function getSupervisorScoringQueue(supervisorUserId, academicYearIdInput) {
  const academicYearId = requireAcademicYearId(academicYearIdInput);
  const [supervisedTheses, otherPeriodRows] = await Promise.all([
    findSupervisedThesesForScoring(supervisorUserId, academicYearId),
    findSupervisedThesesInOtherPeriods(supervisorUserId, academicYearId),
  ]);

  const items = [];
  const blockedByGate = [];
  let historyEligibleCount = 0;

  for (const ts of supervisedTheses) {
    const thesis = ts.thesis;
    if (!isThesisInScoringScope(thesis)) continue;

    const gate = resolveTa03GateReason(thesis);
    if (gate) {
      blockedByGate.push({
        thesisId: thesis.id,
        thesisTitle: thesis.title ?? null,
        student: thesis.student?.user ?? null,
        ta03GateReason: gate.text,
        gateCode: gate.code,
      });
      continue;
    }

    const score = thesis.researchMethodScores?.[0] ?? null;
    if (isTa03AHistoryScore(score)) {
      historyEligibleCount += 1;
      continue;
    }

    items.push(mapSupervisorScoringItem(ts));
  }

  const empty = summarizeTa03EmptyQueue({
    queueCount: items.length,
    blockedByGate,
    historyEligibleCount,
  });

  return {
    items,
    blockedByGate: stripGateCode(blockedByGate),
    otherPeriods: groupOtherPeriodHints(
      otherPeriodRows.map((row) => row.thesis).filter(Boolean),
    ),
    ...empty,
  };
}

/**
 * Riwayat TA-03A memakai thesis set yang sama dengan antrean (mahasiswa aktif,
 * status terbuka, proposal final, TA-04 terbit), lalu hanya mengambil yang
 * sudah finalized atau auto-zero. Bukan definisi ketiga.
 */
export async function getSupervisorScoringHistory(supervisorUserId, academicYearIdInput) {
  const academicYearId = requireAcademicYearId(academicYearIdInput);
  const supervisedTheses = await findSupervisedThesesForScoring(supervisorUserId, academicYearId);

  return supervisedTheses
    .filter((ts) => {
      const thesis = ts.thesis;
      if (!isThesisInScoringScope(thesis)) return false;
      if (!hasTa03ScoringPrerequisites(thesis)) return false;
      return isTa03AHistoryScore(thesis.researchMethodScores?.[0] ?? null);
    })
    .map((ts) => mapSupervisorScoringItem(ts, { historyFields: true }));
}

/**
 * Submit TA-03A scores (Pembimbing, max 75 total).
 * Rule 5.8 + canonical co-advisor scope: TA-03A is input by Pembimbing 1.
 * @param {string} thesisId
 * @param {string} supervisorUserId
 * @param {{ scores: Array<{ criteriaId: string, score: number, rubricId?: string }> }} data
 */
export async function submitSupervisorScore(thesisId, supervisorUserId, data) {
  const { scores } = data;
  if (!Array.isArray(scores) || scores.length === 0) {
    throw new BadRequestError("scores wajib berupa array tidak kosong");
  }

  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      academicYearId: true,
      ta04AssignmentAcademicYearId: true,
      finalProposalVersionId: true,
      ta04AssignmentIssuedAt: true,
      student: {
        select: { status: true },
      },
      thesisStatus: {
        select: { name: true },
      },
      thesisSupervisors: {
        where: { lecturerId: supervisorUserId, status: "active" },
        include: { role: { select: { name: true } } },
      },
      researchMethodScores: {
        take: 1,
        select: { periodClosedAt: true },
      },
    },
  });

  if (!thesis) throw new NotFoundError("Thesis tidak ditemukan");

  if (thesis.student?.status !== "active") {
    throw new ForbiddenError("Mahasiswa tidak aktif. Penilaian TA-03A hanya boleh dilakukan untuk mahasiswa aktif.");
  }

  if (isClosedThesisStatus(thesis.thesisStatus?.name)) {
    throw new ForbiddenError("Thesis ini tidak berada pada antrean penilaian TA-03A aktif");
  }

  if (!thesis.finalProposalVersionId) {
    throw new BadRequestError(
      "Mahasiswa belum submit proposal final. Penilaian TA-03A hanya boleh dilakukan pada proposal final yang sudah diajukan."
    );
  }
  assertTa04AssignmentIssuedForScoring(thesis, "TA-03A");
  await assertThesisScoringPeriodOpen(thesis, thesis.researchMethodScores?.[0] ?? null);

  const isSupervisor = thesis.thesisSupervisors.some((ts) =>
    ts.role?.name === ROLES.PEMBIMBING_1
  );
  if (!isSupervisor) {
    throw new ForbiddenError("Hanya Pembimbing 1 yang dapat menginput nilai TA-03A untuk thesis ini");
  }

  // BR-28 (canon §5.7.3): presensi <75% memicu auto-zero permanen dan gate
  // menolak submit dengan 403 (audit SIMPTA-FUN-018), bukan membalas sukses.
  await assertAttendanceEligibleForManualReview(thesisId, supervisorUserId);

  const academicYearId = await resolveAcademicYearIdForThesis(thesis);
  const { totalScore, normalizedScores } = await validateResearchMethodScores(
    "TA-03A",
    scores,
    academicYearId,
  );

  const scoreRecord = await prisma.$transaction(async (tx) => {
    const existing = await readResearchMethodScoreForUpdate(tx, thesisId);
    assertScorePeriodOpen(existing);
    if (existing?.isFinalized) {
      // BR-21 (canon §5.7.2): Immutable post-submit. Penolakan tegas — bukan
      // BadRequest ringan — supaya UI bisa tampilkan banner finalitas yang
      // tidak ambigu. Sumber: audit P0-08, Q2 2026-05-10.
      throw new ForbiddenError(
        "Penilaian sudah final dan tidak dapat direvisi. " +
          "Revisi proposal hanya berlaku di fase bimbingan informal pra-submit-final.",
      );
    }
    if (existing?.supervisorScore != null) {
      throw new ForbiddenError(
        "Penilaian TA-03A sudah disubmit dan tidak dapat ditimpa diam-diam. " +
          "Koreksi nilai harus melalui prosedur koreksi/admin yang memiliki audit trail.",
      );
    }

    const hasP2 = await thesisHasActivePembimbing2(tx, thesisId);

    const now = new Date();
    let nextScoreRecord;
    if (existing) {
      nextScoreRecord = await tx.researchMethodScore.update({
        where: { thesisId },
        data: {
          supervisorId: supervisorUserId,
          supervisorScore: totalScore,
          ...buildScoreCompletionFields(
            {
              supervisorScore: totalScore,
              lecturerScore: existing.lecturerScore,
              coSignedAt: existing.coSignedAt,
              coSignedByLecturerId: existing.coSignedByLecturerId,
            },
            supervisorUserId,
            now,
            { hasP2 },
          ),
        },
      });
    } else {
      nextScoreRecord = await tx.researchMethodScore.create({
        data: {
          thesisId,
          supervisorId: supervisorUserId,
          supervisorScore: totalScore,
          ...buildScoreCompletionFields(
            {
              supervisorScore: totalScore,
              lecturerScore: null,
              coSignedAt: null,
              coSignedByLecturerId: null,
            },
            supervisorUserId,
            now,
            { hasP2 },
          ),
        },
      });
    }

    for (const s of normalizedScores) {
      await tx.researchMethodScoreDetail.upsert({
        where: {
          researchMethodScoreId_assessmentCriteriaId: {
            researchMethodScoreId: nextScoreRecord.id,
            assessmentCriteriaId: s.criteriaId,
          },
        },
        create: {
          researchMethodScoreId: nextScoreRecord.id,
          assessmentCriteriaId: s.criteriaId,
          score: s.score,
          assessmentRubricId: s.rubricId ?? null,
        },
        update: {
          score: s.score,
          assessmentRubricId: s.rubricId ?? null,
        },
      });
    }

    return nextScoreRecord;
  });

  await syncProposalQueueAfterScore(thesisId);
  await notifyTa03AssessmentProgress(thesisId, "ta03a_submitted");
  return scoreRecord;
}

// ============================================
// TA-03A — Co-sign Pembimbing 2 (BR-20)
// ============================================

/**
 * BR-20 (canon §5.7.1, audit Q1+OQ-1a 2026-05-10):
 * Pembimbing 2 melakukan co-sign atas penilaian TA-03A yang sudah diisi
 * Pembimbing 1. Co-sign tidak mengubah skor — hanya menambah audit trail
 * (siapa, kapan, catatan opsional). Sebagai catatan: secara akademik nilai
 * TA-03A adalah konsensus mufakat satu blok tanda tangan, bukan rata-rata.
 *
 * Constraint:
 * - Hanya akun dengan role `Pembimbing 2` aktif pada thesis ini yang boleh.
 * - Score record harus sudah ada (P1 sudah submit) dengan `supervisorScore` non-null.
 * - Tidak boleh setelah `isFinalized = true` (BR-21 immutability).
 *
 * @param {string} thesisId
 * @param {string} coSignerUserId  — userId Pembimbing 2 yang co-sign
 * @param {{ note?: string|null }} data
 */
export async function coSignSupervisorScore(thesisId, coSignerUserId, data = {}) {
  const note = typeof data?.note === "string" ? data.note.trim() : null;

  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      academicYearId: true,
      ta04AssignmentIssuedAt: true,
      student: { select: { status: true } },
      thesisStatus: { select: { name: true } },
      thesisSupervisors: {
        where: {
          lecturerId: coSignerUserId,
          status: "active",
          role: { name: ROLES.PEMBIMBING_2 },
        },
        select: { id: true },
      },
      researchMethodScores: {
        take: 1,
        select: { periodClosedAt: true },
      },
    },
  });

  if (!thesis) throw new NotFoundError("Thesis tidak ditemukan");
  if (thesis.thesisSupervisors.length === 0) {
    throw new ForbiddenError(
      "Hanya Pembimbing 2 yang aktif pada thesis ini yang berhak melakukan co-sign TA-03A",
    );
  }
  if (thesis.student?.status !== "active") {
    throw new ForbiddenError(
      "Mahasiswa tidak aktif. Co-sign TA-03A hanya boleh untuk mahasiswa aktif.",
    );
  }
  if (isClosedThesisStatus(thesis.thesisStatus?.name)) {
    throw new ForbiddenError("Thesis ini tidak berada pada antrean penilaian TA-03A aktif");
  }
  assertTa04AssignmentIssuedForScoring(thesis, "TA-03A");
  await assertThesisScoringPeriodOpen(thesis, thesis.researchMethodScores?.[0] ?? null);

  // BR-28 (canon §5.7.3): Re-cek presensi Metopel ≥75% saat co-sign P2.
  // Bila presensi mahasiswa berubah (mis. import attendance baru) antara submit
  // P1 dan co-sign P2, co-sign harus mengikuti state attendance terbaru: jika
  // <75%, auto-zero diterapkan dan gate menolak co-sign dengan 403
  // (audit SIMPTA-FUN-018 — sebelumnya dibalas 200 dengan badan sukses).
  await assertAttendanceEligibleForManualReview(thesisId, coSignerUserId);

  return prisma.$transaction(async (tx) => {
    const existing = await readResearchMethodScoreForUpdate(tx, thesisId);
    assertScorePeriodOpen(existing);
    if (!existing) {
      throw new BadRequestError(
        "Pembimbing 1 belum mengisi TA-03A. Co-sign baru bisa dilakukan setelah Pembimbing 1 submit.",
      );
    }
    if (existing.supervisorScore == null) {
      throw new BadRequestError(
        "Skor TA-03A oleh Pembimbing 1 belum tersedia. Co-sign baru bisa dilakukan setelah Pembimbing 1 submit.",
      );
    }
    if (existing.isFinalized) {
      throw new ForbiddenError(
        "Penilaian sudah final dan tidak dapat direvisi. Co-sign sudah tercatat sebelumnya.",
      );
    }

    const now = new Date();
    const updated = await tx.researchMethodScore.update({
      where: { thesisId },
      data: {
        coSignedByLecturerId: coSignerUserId,
        coSignedAt: now,
        coSignNote: note && note.length > 0 ? note : null,
        ...buildScoreCompletionFields(
          {
            supervisorScore: existing.supervisorScore,
            lecturerScore: existing.lecturerScore,
            coSignedAt: now,
            coSignedByLecturerId: coSignerUserId,
          },
          coSignerUserId,
          now,
          // Sampai di sini kita sudah pasti P2 ada (lihat guard tahap awal),
          // jadi requirement co-sign terpenuhi via field di atas.
          { hasP2: true },
        ),
      },
    });

    return updated;
  });
}

// Re-exported wrapper supaya signature service tetap konsisten dengan
// pattern submit lainnya: jalankan service then sync proposal queue.
async function syncAfterCoSign(thesisId) {
  await syncProposalQueueAfterScore(thesisId);
}

export async function coSignSupervisorScoreAndSync(thesisId, coSignerUserId, data) {
  const result = await coSignSupervisorScore(thesisId, coSignerUserId, data);
  await syncAfterCoSign(thesisId);
  await notifyTa03AssessmentProgress(thesisId, "ta03a_cosigned");
  return result;
}

// ============================================
// Metopen Lecturer (TA-03B) Queue & Scoring
// ============================================

const METOPEN_SCORING_THESIS_SELECT = {
  id: true,
  title: true,
  finalProposalVersionId: true,
  ta04AssignmentIssuedAt: true,
  student: {
    select: {
      status: true,
      user: { select: { id: true, fullName: true, identityNumber: true } },
    },
  },
  thesisStatus: {
    select: { name: true },
  },
  researchMethodScores: {
    select: {
      id: true,
      supervisorScore: true,
      lecturerScore: true,
      finalScore: true,
      isFinalized: true,
      finalizedAt: true,
      coSignedAt: true,
      attendanceAutoZeroedAt: true,
      attendanceAutoZeroReason: true,
      periodClosedAt: true,
      periodClosedReason: true,
    },
  },
  thesisSupervisors: {
    where: {
      status: "active",
      role: { name: ROLES.PEMBIMBING_1 },
    },
    select: {
      lecturer: {
        select: {
          user: { select: { fullName: true } },
        },
      },
    },
  },
};

async function findMetopenThesesForScoring(academicYearId) {
  return prisma.thesis.findMany({
    where: {
      academicYearId,
      student: { status: "active" },
      OR: [
        { thesisStatusId: null },
        { thesisStatus: { name: { notIn: CLOSED_THESIS_STATUSES } } },
      ],
    },
    select: METOPEN_SCORING_THESIS_SELECT,
    orderBy: { updatedAt: "desc" },
  });
}

async function findMetopenThesesInOtherPeriods(academicYearId) {
  return prisma.thesis.findMany({
    where: {
      academicYearId: { not: academicYearId },
      isProposal: true,
      student: { status: "active" },
      OR: [
        { thesisStatusId: null },
        { thesisStatus: { name: { notIn: CLOSED_THESIS_STATUSES } } },
      ],
    },
    select: OTHER_PERIOD_THESIS_SELECT,
  });
}

function mapMetopenScoringItem(thesis, { historyFields = false } = {}) {
  const score = thesis.researchMethodScores?.[0] ?? null;
  const item = {
    thesisId: thesis.id,
    thesisTitle: thesis.title ?? null,
    student: thesis.student?.user ?? null,
    supervisorName: thesis.thesisSupervisors?.[0]?.lecturer?.user?.fullName ?? null,
    supervisorScore: score?.supervisorScore ?? null,
    lecturerScore: score?.lecturerScore ?? null,
    attendanceAutoZeroedAt: score?.attendanceAutoZeroedAt ?? null,
    attendanceAutoZeroReason: score?.attendanceAutoZeroReason ?? null,
    periodClosedAt: score?.periodClosedAt ?? null,
    periodClosedReason: score?.periodClosedReason ?? null,
    ta03GateReason: null,
  };
  if (!historyFields) return item;
  return {
    ...item,
    finalScore: score?.finalScore ?? null,
    isFinalized: score?.isFinalized ?? false,
    finalizedAt: score?.finalizedAt ?? null,
    coSignedAt: score?.coSignedAt ?? null,
  };
}

/**
 * Get theses queued for TA-03B scoring by the authenticated Koordinator Matkul Metopen.
 *
 * Design rationale (Canon §5.7, Q-5 / BR-19):
 * - Hanya 1 role/orang (`ROLES.KOORDINATOR_METOPEN`) yang berwenang menilai
 *   TA-03B walau pengampu mata kuliah Metopen di lapangan bisa lebih dari 1.
 * - Antrean dan riwayat berbasis peran, bukan per-`lecturerUserId`.
 * - Ownership write tetap dilindungi di `submitMetopenScore` lewat
 *   `existingScore.lecturerId !== lecturerUserId` check (single-author lock).
 *
 * Gerbang TA-04 tidak dilonggarkan: item antrean tetap mensyaratkan
 * `ta04AssignmentIssuedAt` + proposal final. Thesis yang tertahan gerbang
 * dikembalikan di `blockedByGate` (FUN-029), bukan sebagai baris siap dinilai.
 */
export async function getMetopenScoringQueue(lecturerUserId, academicYearIdInput) {
  void lecturerUserId;
  const academicYearId = requireAcademicYearId(academicYearIdInput);
  const [theses, otherPeriodTheses] = await Promise.all([
    findMetopenThesesForScoring(academicYearId),
    findMetopenThesesInOtherPeriods(academicYearId),
  ]);

  const items = [];
  const blockedByGate = [];
  let historyEligibleCount = 0;

  for (const thesis of theses) {
    if (!isThesisInScoringScope(thesis)) continue;

    const gate = resolveTa03GateReason(thesis);
    if (gate) {
      blockedByGate.push({
        thesisId: thesis.id,
        thesisTitle: thesis.title ?? null,
        student: thesis.student?.user ?? null,
        ta03GateReason: gate.text,
        gateCode: gate.code,
      });
      continue;
    }

    const score = thesis.researchMethodScores?.[0] ?? null;
    if (isTa03BHistoryScore(score)) {
      historyEligibleCount += 1;
      continue;
    }

    items.push(mapMetopenScoringItem(thesis));
  }

  const empty = summarizeTa03EmptyQueue({
    queueCount: items.length,
    blockedByGate,
    historyEligibleCount,
  });

  return {
    items,
    blockedByGate: stripGateCode(blockedByGate),
    otherPeriods: groupOtherPeriodHints(otherPeriodTheses),
    ...empty,
  };
}

/**
 * Riwayat TA-03B berbasis peran Koordinator (BR-19), bukan `lecturerId`
 * personal. Filter thesis sama dengan antrean; yang membedakan hanya
 * sudah dinilai / finalized / auto-zero.
 */
export async function getMetopenScoringHistory(lecturerUserId, academicYearIdInput) {
  void lecturerUserId;
  const academicYearId = requireAcademicYearId(academicYearIdInput);
  const theses = await findMetopenThesesForScoring(academicYearId);

  return theses
    .filter((thesis) => {
      if (!isThesisInScoringScope(thesis)) return false;
      if (!hasTa03ScoringPrerequisites(thesis)) return false;
      return isTa03BHistoryScore(thesis.researchMethodScores?.[0] ?? null);
    })
    .map((thesis) => mapMetopenScoringItem(thesis, { historyFields: true }));
}

/**
 * Submit TA-03B scores (Koordinator Matkul Metopen, max 25 total).
 * TA-03B is parallel to TA-03A. Final score is computed only after both scores exist.
 * @param {string} thesisId
 * @param {string} lecturerUserId
 * @param {{ scores: Array<{ criteriaId: string, score: number, rubricId?: string }> }} data
 */
export async function submitMetopenScore(thesisId, lecturerUserId, data) {
  const { scores } = data;
  if (!Array.isArray(scores) || scores.length === 0) {
    throw new BadRequestError("scores wajib berupa array tidak kosong");
  }

  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      academicYearId: true,
      ta04AssignmentAcademicYearId: true,
      finalProposalVersionId: true,
      ta04AssignmentIssuedAt: true,
      student: {
        select: { status: true },
      },
      thesisStatus: {
        select: { name: true },
      },
      researchMethodScores: {
        take: 1,
        select: { periodClosedAt: true },
      },
    },
  });

  if (!thesis) throw new NotFoundError("Thesis tidak ditemukan");

  if (thesis.student?.status !== "active") {
    throw new ForbiddenError("Mahasiswa tidak aktif. Penilaian TA-03B hanya boleh dilakukan untuk mahasiswa aktif.");
  }

  if (isClosedThesisStatus(thesis.thesisStatus?.name)) {
    throw new ForbiddenError("Thesis ini tidak berada pada antrean penilaian TA-03B aktif");
  }

  if (!thesis.finalProposalVersionId) {
    throw new BadRequestError(
      "Mahasiswa belum submit proposal final. Penilaian TA-03B hanya boleh dilakukan pada proposal final yang sudah diajukan."
    );
  }
  assertTa04AssignmentIssuedForScoring(thesis, "TA-03B");
  await assertThesisScoringPeriodOpen(thesis, thesis.researchMethodScores?.[0] ?? null);

  // BR-28 (canon §5.7.3): presensi <75% memicu auto-zero permanen dan gate
  // menolak submit dengan 403 (audit SIMPTA-FUN-018), bukan membalas sukses.
  await assertAttendanceEligibleForManualReview(thesisId, lecturerUserId);

  const academicYearId = await resolveAcademicYearIdForThesis(thesis);
  const { totalScore, normalizedScores } = await validateResearchMethodScores(
    "TA-03B",
    scores,
    academicYearId,
  );

  const scoreRecord = await prisma.$transaction(async (tx) => {
    const existingScore = await readResearchMethodScoreForUpdate(tx, thesisId);
    assertScorePeriodOpen(existingScore);
    if (existingScore?.isFinalized) {
      // BR-21 (canon §5.7.2): Immutable post-submit. Tegakkan 403 — ini
      // mengikuti BR-20+BR-21 v2.0 yang menggantikan BadRequest ringan v1.0.
      throw new ForbiddenError(
        "Penilaian sudah final dan tidak dapat direvisi. " +
          "Membuka revisi pasca-submit akan merusak integritas state TA-04 (Beban Aktif vs Booking).",
      );
    }
    if (existingScore?.lecturerScore != null && existingScore.lecturerId !== lecturerUserId) {
      throw new ForbiddenError("Nilai TA-03B hanya dapat diperbarui oleh Koordinator Metopen yang menginput nilai");
    }
    if (existingScore?.lecturerScore != null) {
      throw new ForbiddenError(
        "Penilaian TA-03B sudah disubmit dan tidak dapat ditimpa diam-diam. " +
          "Koreksi nilai harus melalui prosedur koreksi/admin yang memiliki audit trail.",
      );
    }

    const hasP2 = await thesisHasActivePembimbing2(tx, thesisId);

    const now = new Date();
    let nextScoreRecord;
    if (existingScore) {
      nextScoreRecord = await tx.researchMethodScore.update({
        where: { id: existingScore.id },
        data: {
          lecturerId: lecturerUserId,
          lecturerScore: totalScore,
          ...buildScoreCompletionFields(
            {
              supervisorScore: existingScore.supervisorScore,
              lecturerScore: totalScore,
              coSignedAt: existingScore.coSignedAt,
              coSignedByLecturerId: existingScore.coSignedByLecturerId,
            },
            lecturerUserId,
            now,
            { hasP2 },
          ),
        },
      });
    } else {
      nextScoreRecord = await tx.researchMethodScore.create({
        data: {
          thesisId,
          lecturerId: lecturerUserId,
          lecturerScore: totalScore,
          ...buildScoreCompletionFields(
            {
              supervisorScore: null,
              lecturerScore: totalScore,
              coSignedAt: null,
              coSignedByLecturerId: null,
            },
            lecturerUserId,
            now,
            { hasP2 },
          ),
        },
      });
    }

    for (const s of normalizedScores) {
      await tx.researchMethodScoreDetail.upsert({
        where: {
          researchMethodScoreId_assessmentCriteriaId: {
            researchMethodScoreId: nextScoreRecord.id,
            assessmentCriteriaId: s.criteriaId,
          },
        },
        create: {
          researchMethodScoreId: nextScoreRecord.id,
          assessmentCriteriaId: s.criteriaId,
          score: s.score,
          assessmentRubricId: s.rubricId ?? null,
        },
        update: {
          score: s.score,
          assessmentRubricId: s.rubricId ?? null,
        },
      });
    }

    return nextScoreRecord;
  });

  await syncProposalQueueAfterScore(thesisId);
  await notifyTa03AssessmentProgress(thesisId, "ta03b_submitted");
  return scoreRecord;
}

/**
 * Publish/finalize the final score for a thesis manually.
 *
 * Note v2.0: Sebagian besar finalisasi sekarang otomatis (`buildScoreCompletionFields`
 * di submit/cosign). Endpoint ini tetap disediakan sebagai fallback eksplisit
 * untuk Koordinator Metopen jika cycle perlu di-publish manual (mis. tidak ada
 * P2 di thesis tapi auto-trigger meleset karena sequence aneh).
 *
 * Constraint BR-20: Bila thesis punya P2 aktif, co-sign HARUS sudah ada
 * sebelum publish. Bila P2 tidak ada, langsung publish.
 */
export async function publishFinalScore(thesisId, actorUserId) {
  const preGate = await prisma.researchMethodScore.findUnique({
    where: { thesisId },
    select: {
      id: true,
      lecturerId: true,
      supervisorScore: true,
      lecturerScore: true,
      isFinalized: true,
      periodClosedAt: true,
    },
  });
  if (!preGate) throw new NotFoundError("Data penilaian tidak ditemukan");
  if (preGate.lecturerId !== actorUserId) {
    throw new ForbiddenError(
      "Nilai akhir TA-03 hanya dapat dipublikasikan oleh Koordinator Metopen yang menginput TA-03B",
    );
  }
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: { id: true, academicYearId: true, ta04AssignmentIssuedAt: true },
  });
  if (!thesis) throw new NotFoundError("Thesis tidak ditemukan");
  assertTa04AssignmentIssuedForScoring(thesis, "TA-03");
  await assertThesisScoringPeriodOpen(thesis, preGate);

  // BR-28 (canon §5.7.3): Re-cek presensi sebelum publish final.
  // Mencegah publish nilai pada mahasiswa yang seharusnya auto-zero karena
  // import attendance terbaru. Auto-zero dijalankan repository bila skor belum
  // finalized, lalu publish ditolak dengan 403 (audit SIMPTA-FUN-018).
  if (!preGate.isFinalized) {
    await assertAttendanceEligibleForManualReview(thesisId, actorUserId);
  }

  return prisma.$transaction(async (tx) => {
    const scoreRecord = await readResearchMethodScoreForUpdate(tx, thesisId);
    assertScorePeriodOpen(scoreRecord);
    if (!scoreRecord) throw new NotFoundError("Data penilaian tidak ditemukan");
    if (scoreRecord.supervisorScore == null || scoreRecord.lecturerScore == null) {
      throw new BadRequestError("Kedua nilai TA-03A dan TA-03B harus tersedia sebelum dapat dipublikasikan");
    }
    if (scoreRecord.lecturerId !== actorUserId) {
      throw new ForbiddenError(
        "Nilai akhir TA-03 hanya dapat dipublikasikan oleh Koordinator Metopen yang menginput TA-03B",
      );
    }
    if (scoreRecord.isFinalized) {
      // BR-21: Tetap 403 — finalisasi sudah terjadi, tidak boleh diulang.
      throw new ForbiddenError("Nilai sudah dipublikasikan sebelumnya dan tidak dapat diubah");
    }

    const hasP2 = await thesisHasActivePembimbing2(tx, thesisId);
    if (hasP2 && (scoreRecord.coSignedAt == null || scoreRecord.coSignedByLecturerId == null)) {
      throw new BadRequestError(
        "Pembimbing 2 belum melakukan co-sign atas penilaian TA-03A. Publish hanya bisa setelah co-sign tercatat.",
      );
    }

    const finalScore = calculateFinalScore(scoreRecord);
    const now = new Date();
    const updated = await tx.researchMethodScore.update({
      where: { thesisId },
      data: {
        isFinalized: true,
        finalizedBy: actorUserId,
        finalizedAt: now,
        finalScore,
      },
    });
    return updated;
  }).then(async (updated) => {
    await syncProposalQueueAfterScore(thesisId);
    await notifyTa03AssessmentProgress(thesisId, "ta03_manual_published");
    return updated;
  });
}

async function getScoreRecordWithDetails(thesisId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      academicYearId: true,
      ta04AssignmentAcademicYearId: true,
    },
  });

  const record = await prisma.researchMethodScore.findUnique({
    where: { thesisId },
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
      // BR-20: expose co-signer identitas agar UI bisa tampilkan nama P2.
      coSigner: {
        select: {
          id: true,
          user: { select: { id: true, fullName: true } },
        },
      },
      attendanceRecord: {
        select: {
          id: true,
          identityNumber: true,
          studentName: true,
          presentCount: true,
          absentCount: true,
          sickCount: true,
          permitCount: true,
          totalMeetings: true,
          attendancePercentage: true,
          isEligible: true,
          import: {
            select: {
              id: true,
              classCode: true,
              courseName: true,
              semesterLabel: true,
              thresholdPercent: true,
              uploadedAt: true,
            },
          },
        },
      },
    },
  });

  let composition = { ta03aCap: 75, ta03bCap: 25, academicYearId: null };
  try {
    if (thesis) {
      const academicYearId = await resolveAcademicYearIdForThesis(thesis);
      composition = await getCompositionForAcademicYear(academicYearId);
    }
  } catch {
    // keep defaults
  }

  if (!record) {
    return {
      thesisId,
      supervisorScore: null,
      lecturerScore: null,
      finalScore: null,
      isFinalized: false,
      researchMethodScoreDetails: [],
      ta03aCap: composition.ta03aCap,
      ta03bCap: composition.ta03bCap,
      academicYearId: composition.academicYearId,
    };
  }

  return {
    ...record,
    ta03aCap: composition.ta03aCap,
    ta03bCap: composition.ta03bCap,
    academicYearId: composition.academicYearId,
  };
}

/**
 * Expose mode pembimbing pada thesis ini agar UI dapat menentukan apakah
 * akun yang sedang membuka card adalah P1 (full edit), P2 (read+cosign),
 * atau bukan pembimbing aktif (read-only ringkasan).
 *
 * Output: { role: "P1" | "P2" | null, hasP2: boolean }
 */
async function classifySupervisorRole(thesisId, lecturerUserId) {
  const ts = await prisma.thesisSupervisors.findFirst({
    where: {
      thesisId,
      lecturerId: lecturerUserId,
      status: "active",
      role: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } },
    },
    select: { role: { select: { name: true } } },
  });
  const hasP2Active = await prisma.thesisSupervisors.findFirst({
    where: {
      thesisId,
      status: "active",
      role: { name: ROLES.PEMBIMBING_2 },
    },
    select: { id: true },
  });
  let role = null;
  if (ts?.role?.name === ROLES.PEMBIMBING_1) role = "P1";
  else if (ts?.role?.name === ROLES.PEMBIMBING_2) role = "P2";
  return { role, hasP2: Boolean(hasP2Active) };
}

export async function getSupervisorContextForThesis(thesisId, lecturerUserId) {
  return classifySupervisorRole(thesisId, lecturerUserId);
}

/**
 * Get scores for a specific thesis after proving the actor is an active thesis supervisor.
 */
export async function getScoresByThesisForSupervisor(thesisId, supervisorUserId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      finalProposalVersionId: true,
      thesisSupervisors: {
        where: {
          lecturerId: supervisorUserId,
          status: "active",
          role: {
            name: {
              in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2],
            },
          },
        },
        select: { id: true },
      },
    },
  });

  if (!thesis) throw new NotFoundError("Thesis tidak ditemukan");
  if (thesis.thesisSupervisors.length === 0) {
    throw new ForbiddenError("Anda bukan pembimbing aktif untuk thesis ini");
  }

  // Opsi C (read-only arsip): pembimbing tetap boleh MEMBACA nilai TA-03A/TA-03B
  // walau mahasiswa non-aktif atau thesis sudah selesai/ditutup. Keamanan dijaga
  // oleh cek keanggotaan pembimbing di atas. Immutability tulis (BR-21) tetap
  // ditegakkan terpisah di jalur submit/co-sign/publish, bukan di jalur baca ini.

  if (!thesis.finalProposalVersionId) {
    throw new ForbiddenError("Proposal final belum tersedia untuk penilaian TA-03A");
  }

  return getScoreRecordWithDetails(thesisId);
}

/**
 * Get scores for a specific thesis for Koordinator Matkul Metopen.
 *
 * The active flow has no Metopen class roster. Before TA-03B is submitted,
 * Koordinator Matkul Metopen access follows the global TA-03B queue (final proposal exists).
 * After TA-03B is submitted, only the lecturer who submitted it may read it.
 */
export async function getScoresByThesisForMetopenLecturer(thesisId, lecturerUserId) {
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      finalProposalVersionId: true,
      student: {
        select: { status: true },
      },
      thesisStatus: {
        select: { name: true },
      },
      researchMethodScores: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          lecturerId: true,
          lecturerScore: true,
          attendanceAutoZeroedAt: true,
        },
      },
    },
  });

  if (!thesis) throw new NotFoundError("Thesis tidak ditemukan");

  if (thesis.student?.status !== "active") {
    throw new ForbiddenError("Mahasiswa ini tidak berada pada antrean penilaian TA-03B aktif");
  }

  if (isClosedThesisStatus(thesis.thesisStatus?.name)) {
    throw new ForbiddenError("Thesis ini tidak berada pada antrean penilaian TA-03B aktif");
  }

  const score = thesis.researchMethodScores?.[0] ?? null;
  const isAutoZero = score?.attendanceAutoZeroedAt != null;
  if (score?.lecturerScore != null && !isAutoZero && score.lecturerId !== lecturerUserId) {
    throw new ForbiddenError("Nilai TA-03B hanya dapat dilihat oleh Koordinator Metopen yang menginput nilai");
  }

  if (!thesis.finalProposalVersionId && score?.lecturerScore == null) {
    throw new ForbiddenError("Proposal final belum tersedia untuk penilaian TA-03B");
  }

  return getScoreRecordWithDetails(thesisId);
}

/**
 * Internal/backward-compatible read without actor checks. Do not call this directly from routes.
 */
export async function getScoresByThesis(thesisId) {
  return getScoreRecordWithDetails(thesisId);
}
