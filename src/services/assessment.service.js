import prisma from "../config/prisma.js";
import { NotFoundError, BadRequestError, ForbiddenError } from "../utils/errors.js";
import { ROLES } from "../constants/roles.js";
import { CLOSED_THESIS_STATUSES } from "../constants/thesisStatus.js";
import { syncKadepProposalQueueByThesisId } from "./metopen.service.js";
import { assertAttendanceEligibleForManualReview } from "./metopenAttendance.service.js";

const FORM_CONFIG = {
  "TA-03A": { role: "supervisor", cap: 75 },
  "TA-03B": { role: "default", cap: 25 },
};

function getFormConfig(formCode) {
  const config = FORM_CONFIG[formCode];
  if (!config) {
    throw new BadRequestError(`formCode tidak dikenal: ${formCode}. Gunakan 'TA-03A' atau 'TA-03B'.`);
  }
  return config;
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

async function getResearchMethodCriteriaByRole(role) {
  return prisma.metopenAssessmentCriteria.findMany({
    where: {
      role,
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

async function validateResearchMethodScores(formCode, scores) {
  const { role, cap } = getFormConfig(formCode);
  const criteria = await getResearchMethodCriteriaByRole(role);
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

function resolveSupervisorActionStatus(score, isP1) {
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
 * formCode "TA-03A" → supervisor-role proposal criteria for research_method CPMK
 * formCode "TA-03B" → default-role proposal criteria for research_method CPMK
 */
export async function getCriteriaByFormCode(formCode) {
  const { role: roleFilter } = getFormConfig(formCode);

  const criteria = await prisma.metopenAssessmentCriteria.findMany({
    where: {
      role: roleFilter,
    },
    include: {
      metopenCpmk: { select: { id: true, code: true, description: true } },
      metopenAssessmentRubrics: {
        orderBy: { displayOrder: "asc" },
      },
    },
    orderBy: { displayOrder: "asc" },
  });

  return { formCode, criteria };
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
export async function getSupervisorScoringQueue(supervisorUserId) {
  const supervisedTheses = await prisma.thesisSupervisors.findMany({
    where: {
      lecturerId: supervisorUserId,
      status: "active",
      role: {
        name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] },
      },
    },
    include: {
      role: { select: { name: true } },
      thesis: {
        select: {
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
              coSignedAt: true,
              coSignedByLecturerId: true,
              attendanceAutoZeroedAt: true,
              attendanceAutoZeroReason: true,
            },
          },
          // Schema note: tabel DB `thesis_supervisors` diekspos sebagai
          // relasi `thesisSupervisors` pada model Thesis.
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
        },
      },
    },
  });

  return supervisedTheses
    .filter((ts) => {
      const thesis = ts.thesis;
      if (!thesis) return false;
      const score = thesis.researchMethodScores?.[0];
      // Thesis siklus penilaian sudah selesai → keluarkan dari antrean
      if (score?.isFinalized) return false;
      return (
        thesis.student?.status === "active"
        && !isClosedThesisStatus(thesis.thesisStatus?.name)
        && !!thesis.finalProposalVersionId
        && !!thesis.ta04AssignmentIssuedAt
      );
    })
    .map((ts) => {
      const thesis = ts.thesis;
      const score = thesis.researchMethodScores?.[0] ?? null;
      const isP1 = ts.role?.name === ROLES.PEMBIMBING_1;
      const actorRole = isP1 ? "P1" : "P2";

      // Lookup partner pembimbing supaya FE bisa menampilkan
      // "Co-pembimbing: Bu A" dsb. tanpa query terpisah. Field relasi di
      // Prisma di-alias `thesisSupervisors` (legacy name) meski tabel di DB
      // bernama `thesis_supervisors`.
      const partnerRoleName = isP1 ? ROLES.PEMBIMBING_2 : ROLES.PEMBIMBING_1;
      const partner = (thesis.thesisSupervisors ?? [])
        .find((p) => p.role?.name === partnerRoleName);
      const partnerName = partner?.lecturer?.user?.fullName ?? null;

      return {
        thesisId: thesis.id,
        thesisTitle: thesis.title ?? null,
        student: thesis.student?.user ?? null,
        actorRole,
        actionStatus: resolveSupervisorActionStatus(score, isP1),
        partnerName,
        supervisorScore: score?.supervisorScore ?? null,
        lecturerScore: score?.lecturerScore ?? null,
        finalScore: score?.finalScore ?? null,
        coSignedAt: score?.coSignedAt ?? null,
        attendanceAutoZeroedAt: score?.attendanceAutoZeroedAt ?? null,
        attendanceAutoZeroReason: score?.attendanceAutoZeroReason ?? null,
      };
    });
}

/**
 * Riwayat penilaian TA-03A untuk pembimbing. Queue aktif hanya berisi siklus
 * yang belum selesai; endpoint ini tetap mengembalikan skor yang sudah pernah
 * masuk agar pembimbing punya surface read-only setelah submit/finalisasi.
 */
export async function getSupervisorScoringHistory(supervisorUserId) {
  const supervisedTheses = await prisma.thesisSupervisors.findMany({
    where: {
      lecturerId: supervisorUserId,
      status: "active",
      role: {
        name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] },
      },
    },
    include: {
      role: { select: { name: true } },
      thesis: {
        select: {
          id: true,
          title: true,
          finalProposalVersionId: true,
          student: {
            select: {
              user: { select: { id: true, fullName: true, identityNumber: true } },
            },
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
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return supervisedTheses
    .filter((ts) => {
      const thesis = ts.thesis;
      if (!thesis?.finalProposalVersionId) return false;
      const score = thesis.researchMethodScores?.[0];
      if (!score) return false;
      return (
        score.supervisorScore != null ||
        score.lecturerScore != null ||
        score.isFinalized === true ||
        score.attendanceAutoZeroedAt != null
      );
    })
    .map((ts) => {
      const thesis = ts.thesis;
      const score = thesis.researchMethodScores?.[0] ?? null;
      const isP1 = ts.role?.name === ROLES.PEMBIMBING_1;
      const actorRole = isP1 ? "P1" : "P2";
      const partnerRoleName = isP1 ? ROLES.PEMBIMBING_2 : ROLES.PEMBIMBING_1;
      const partner = (thesis.thesisSupervisors ?? [])
        .find((p) => p.role?.name === partnerRoleName);

      return {
        thesisId: thesis.id,
        thesisTitle: thesis.title ?? null,
        student: thesis.student?.user ?? null,
        actorRole,
        actionStatus: resolveSupervisorActionStatus(score, isP1),
        partnerName: partner?.lecturer?.user?.fullName ?? null,
        supervisorScore: score?.supervisorScore ?? null,
        lecturerScore: score?.lecturerScore ?? null,
        finalScore: score?.finalScore ?? null,
        isFinalized: score?.isFinalized ?? false,
        finalizedAt: score?.finalizedAt ?? null,
        coSignedAt: score?.coSignedAt ?? null,
        coSignNote: score?.coSignNote ?? null,
        attendanceAutoZeroedAt: score?.attendanceAutoZeroedAt ?? null,
        attendanceAutoZeroReason: score?.attendanceAutoZeroReason ?? null,
      };
    });
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

  const isSupervisor = thesis.thesisSupervisors.some((ts) =>
    ts.role?.name === ROLES.PEMBIMBING_1
  );
  if (!isSupervisor) {
    throw new ForbiddenError("Hanya Pembimbing 1 yang dapat menginput nilai TA-03A untuk thesis ini");
  }

  const attendanceGate = await assertAttendanceEligibleForManualReview(thesisId, supervisorUserId);
  if (!attendanceGate.allowed) {
    return attendanceGate.scoreRecord;
  }

  const { totalScore, normalizedScores } = await validateResearchMethodScores("TA-03A", scores);

  const scoreRecord = await prisma.$transaction(async (tx) => {
    const existing = await tx.researchMethodScore.findUnique({ where: { thesisId } });
    if (existing?.isFinalized) {
      // BR-21 (canon §5.7.2): Immutable post-submit. Penolakan tegas — bukan
      // BadRequest ringan — supaya UI bisa tampilkan banner finalitas yang
      // tidak ambigu. Sumber: audit P0-08, Q2 2026-05-10.
      throw new ForbiddenError(
        "Penilaian sudah final dan tidak dapat direvisi (canon §5.7.2). " +
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
        },
        update: {
          score: s.score,
        },
      });
    }

    return nextScoreRecord;
  });

  await syncProposalQueueAfterScore(thesisId);
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

  // BR-28 (canon v2.2 §5.7.x): Re-cek presensi Metopel ≥75% saat co-sign P2.
  // Bila presensi mahasiswa berubah (mis. import attendance baru) antara submit
  // P1 dan co-sign P2, co-sign harus mengikuti state attendance terbaru: jika
  // <75%, auto-zero direterapkan dan co-sign dibatalkan.
  const attendanceGate = await assertAttendanceEligibleForManualReview(thesisId, coSignerUserId);
  if (!attendanceGate.allowed) {
    return {
      ...attendanceGate.scoreRecord,
      _autoZeroed: true,
      _autoZeroReason: "Presensi Metopel mahasiswa <75%. Nilai otomatis di-nol-kan (BR-28). Co-sign tidak dapat dilanjutkan.",
    };
  }

  return prisma.$transaction(async (tx) => {
    const existing = await tx.researchMethodScore.findUnique({
      where: { thesisId },
      select: {
        id: true,
        supervisorScore: true,
        lecturerScore: true,
        coSignedByLecturerId: true,
        coSignedAt: true,
        isFinalized: true,
      },
    });
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
        "Penilaian sudah final dan tidak dapat direvisi (canon §5.7.2). Co-sign sudah tercatat sebelumnya.",
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
  return result;
}

// ============================================
// Metopen Lecturer (TA-03B) Queue & Scoring
// ============================================

/**
 * Get theses queued for TA-03B scoring by the authenticated Koordinator Matkul Metopen.
 *
 * Design rationale (Canon §5.7, Q-5):
 * - Hanya 1 role/orang (`ROLES.KOORDINATOR_METOPEN`) yang berwenang menilai
 *   TA-03B walau pengampu mata kuliah Metopen di lapangan bisa lebih dari 1.
 * - Antrean dikembalikan global per scope SIMPTA aktif (semua thesis yang
 *   butuh TA-03B), bukan per-`lecturerUserId`. Tidak ada partisi per-koordinator
 *   karena memang hanya satu yang berwenang.
 * - Ownership write tetap dilindungi di `submitMetopenScore` lewat
 *   `existingScore.lecturerId !== lecturerUserId` check (single-author lock):
 *   bila ada >1 user dengan role yang sama secara tidak sengaja, hanya yang
 *   pertama submit yang bisa update.
 *
 * Returns theses where:
 * - TA-03B lecturer score not yet submitted
 * - Early TA-04 assignment has been issued
 * - Student has an active proposal/thesis record in the current SIMPTA scope
 */
export async function getMetopenScoringQueue(lecturerUserId) {
  // Sengaja diabaikan; lihat rationale pada JSDoc di atas.
  void lecturerUserId;

  const theses = await prisma.thesis.findMany({
    where: {
      AND: [
        {
          OR: [
            { thesisStatusId: null },
            { thesisStatus: { name: { notIn: ["Dibatalkan", "Gagal", "Selesai", "Lulus", "Drop Out"] } } },
          ],
        },
        {
          OR: [
            { researchMethodScores: { none: {} } },
            { researchMethodScores: { some: { lecturerScore: null } } },
          ],
        },
      ],
      finalProposalVersionId: { not: null },
      ta04AssignmentIssuedAt: { not: null },
      student: { status: "active" },
    },
    select: {
      id: true,
      title: true,
      student: {
        select: {
          user: { select: { id: true, fullName: true, identityNumber: true } },
        },
      },
      researchMethodScores: {
        select: {
          id: true,
          supervisorScore: true,
          lecturerScore: true,
          finalScore: true,
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
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  return theses.map((thesis) => ({
    thesisId: thesis.id,
    thesisTitle: thesis.title ?? null,
    student: thesis.student?.user ?? null,
    supervisorName: thesis.thesisSupervisors?.[0]?.lecturer?.user?.fullName ?? null,
    supervisorScore: thesis.researchMethodScores?.[0]?.supervisorScore ?? null,
    lecturerScore: thesis.researchMethodScores?.[0]?.lecturerScore ?? null,
  }));
}

/**
 * Riwayat penilaian TA-03B untuk Koordinator Metopen. Queue aktif sengaja
 * tidak menampilkan proposal yang sudah punya `lecturerScore`; endpoint ini
 * menjadi daftar read-only untuk proposal yang sudah dinilai / auto-zero.
 */
export async function getMetopenScoringHistory(lecturerUserId) {
  const theses = await prisma.thesis.findMany({
    where: {
      finalProposalVersionId: { not: null },
      student: { status: "active" },
      researchMethodScores: {
        some: {
          OR: [
            { lecturerId: lecturerUserId, lecturerScore: { not: null } },
            { attendanceAutoZeroedAt: { not: null } },
          ],
        },
      },
    },
    select: {
      id: true,
      title: true,
      student: {
        select: {
          user: { select: { id: true, fullName: true, identityNumber: true } },
        },
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
    },
    orderBy: { updatedAt: "desc" },
  });

  return theses.map((thesis) => {
    const score = thesis.researchMethodScores?.[0] ?? null;
    return {
      thesisId: thesis.id,
      thesisTitle: thesis.title ?? null,
      student: thesis.student?.user ?? null,
      supervisorName: thesis.thesisSupervisors?.[0]?.lecturer?.user?.fullName ?? null,
      supervisorScore: score?.supervisorScore ?? null,
      lecturerScore: score?.lecturerScore ?? null,
      finalScore: score?.finalScore ?? null,
      isFinalized: score?.isFinalized ?? false,
      finalizedAt: score?.finalizedAt ?? null,
      coSignedAt: score?.coSignedAt ?? null,
      attendanceAutoZeroedAt: score?.attendanceAutoZeroedAt ?? null,
      attendanceAutoZeroReason: score?.attendanceAutoZeroReason ?? null,
    };
  });
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
      finalProposalVersionId: true,
      ta04AssignmentIssuedAt: true,
      student: {
        select: { status: true },
      },
      thesisStatus: {
        select: { name: true },
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

  const attendanceGate = await assertAttendanceEligibleForManualReview(thesisId, lecturerUserId);
  if (!attendanceGate.allowed) {
    return attendanceGate.scoreRecord;
  }

  const { totalScore, normalizedScores } = await validateResearchMethodScores("TA-03B", scores);

  const scoreRecord = await prisma.$transaction(async (tx) => {
    const existingScore = await tx.researchMethodScore.findUnique({
      where: { thesisId },
      select: {
        id: true,
        supervisorScore: true,
        lecturerId: true,
        lecturerScore: true,
        coSignedAt: true,
        coSignedByLecturerId: true,
        isFinalized: true,
      },
    });
    if (existingScore?.isFinalized) {
      // BR-21 (canon §5.7.2): Immutable post-submit. Tegakkan 403 — ini
      // mengikuti BR-20+BR-21 v2.0 yang menggantikan BadRequest ringan v1.0.
      throw new ForbiddenError(
        "Penilaian sudah final dan tidak dapat direvisi (canon §5.7.2). " +
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
        },
        update: {
          score: s.score,
        },
      });
    }

    return nextScoreRecord;
  });

  await syncProposalQueueAfterScore(thesisId);
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
    select: { id: true, ta04AssignmentIssuedAt: true },
  });
  if (!thesis) throw new NotFoundError("Thesis tidak ditemukan");
  assertTa04AssignmentIssuedForScoring(thesis, "TA-03");

  // BR-28 (canon v2.2 §5.7.x): Re-cek presensi sebelum publish final.
  // Mencegah publish nilai pada mahasiswa yang seharusnya auto-zero karena
  // import attendance terbaru. Auto-zero akan dijalankan repository bila
  // skor belum finalized.
  if (!preGate.isFinalized) {
    const attendanceGate = await assertAttendanceEligibleForManualReview(thesisId, actorUserId);
    if (!attendanceGate.allowed) {
      return attendanceGate.scoreRecord;
    }
  }

  return prisma.$transaction(async (tx) => {
    const scoreRecord = await tx.researchMethodScore.findUnique({ where: { thesisId } });
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
      throw new ForbiddenError("Nilai sudah dipublikasikan sebelumnya dan tidak dapat diubah (canon §5.7.2)");
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
    return updated;
  });
}

async function getScoreRecordWithDetails(thesisId) {
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
  return record;
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
