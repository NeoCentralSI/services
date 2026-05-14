import prisma from "../config/prisma.js";
import { NotFoundError, BadRequestError, ForbiddenError } from "../utils/errors.js";
import { ROLES } from "../constants/roles.js";
import { CLOSED_THESIS_STATUSES } from "../constants/thesisStatus.js";
import { syncKadepProposalQueueByThesisId } from "./metopen.service.js";

const RESEARCH_METHOD_APPLIES_TO = ["proposal", "metopen"];
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
  return prisma.assessmentCriteria.findMany({
    where: {
      appliesTo: { in: RESEARCH_METHOD_APPLIES_TO },
      role,
      isActive: true,
      isDeleted: false,
      cpmk: { type: "research_method" },
    },
    select: {
      id: true,
      name: true,
      maxScore: true,
      displayOrder: true,
      assessmentRubrics: {
        where: { isDeleted: false },
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
    const rubrics = criteriaItem.assessmentRubrics ?? [];
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
    console.warn("[assessment] syncKadepProposalQueueByThesisId failed:", error?.message || error);
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

/**
 * BR-20 (canon §5.7.1): Detect whether a thesis has Pembimbing 2 in the
 * active thesis_participants. When P2 exists, TA-03A finalization requires
 * P2 co-sign (audit trail). When only P1 exists, co-sign is skipped.
 */
async function thesisHasActivePembimbing2(client, thesisId) {
  const p2 = await client.thesisParticipant.findFirst({
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

  const criteria = await prisma.assessmentCriteria.findMany({
    where: {
      appliesTo: { in: RESEARCH_METHOD_APPLIES_TO },
      role: roleFilter,
      isActive: true,
      isDeleted: false,
      cpmk: { type: "research_method" },
    },
    include: {
      cpmk: { select: { id: true, code: true, description: true } },
      assessmentRubrics: {
        where: { isDeleted: false },
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
 * Get theses queued for TA-03A scoring by the authenticated supervisor.
 * Returns theses where:
 * - Lecturer is Pembimbing 1
 * - Student and thesis are still active in the current proposal scope
 * - Final proposal has been submitted
 * - ResearchMethodScore does not have supervisorScore yet
 */
export async function getSupervisorScoringQueue(supervisorUserId) {
  const supervisedTheses = await prisma.thesisParticipant.findMany({
    where: {
      lecturerId: supervisorUserId,
      status: "active",
      role: {
        name: ROLES.PEMBIMBING_1,
      },
    },
    include: {
      thesis: {
        select: {
          id: true,
          title: true,
          finalProposalVersionId: true,
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
            },
          },
        },
      },
    },
  });

  return supervisedTheses
    .filter((ts) => {
      const score = ts.thesis?.researchMethodScores?.[0];
      return (
        ts.thesis?.student?.status === "active"
        && !isClosedThesisStatus(ts.thesis?.thesisStatus?.name)
        && !!ts.thesis?.finalProposalVersionId
        && score?.supervisorScore == null
      );
    })
    .map((ts) => ({
      thesisId: ts.thesis?.id,
      thesisTitle: ts.thesis?.title ?? null,
      student: ts.thesis?.student?.user ?? null,
      supervisorScore: ts.thesis?.researchMethodScores?.[0]?.supervisorScore ?? null,
    }));
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

  const isSupervisor = thesis.thesisSupervisors.some((ts) =>
    ts.role?.name === ROLES.PEMBIMBING_1
  );
  if (!isSupervisor) {
    throw new ForbiddenError("Hanya Pembimbing 1 yang dapat menginput nilai TA-03A untuk thesis ini");
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
          assessmentRubricId: s.rubricId,
          score: s.score,
        },
        update: {
          assessmentRubricId: s.rubricId,
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

  return prisma.$transaction(async (tx) => {
    const thesis = await tx.thesis.findUnique({
      where: { id: thesisId },
      select: {
        id: true,
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
          assessmentRubricId: s.rubricId,
          score: s.score,
        },
        update: {
          assessmentRubricId: s.rubricId,
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
          assessmentRubric: true,
          criteria: {
            include: {
              cpmk: { select: { code: true, description: true } },
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
  const ts = await prisma.thesisParticipant.findFirst({
    where: {
      thesisId,
      lecturerId: lecturerUserId,
      status: "active",
      role: { name: { in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2] } },
    },
    select: { role: { select: { name: true } } },
  });
  const hasP2Active = await prisma.thesisParticipant.findFirst({
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
      student: {
        select: { status: true },
      },
      thesisStatus: {
        select: { name: true },
      },
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

  if (thesis.student?.status !== "active") {
    throw new ForbiddenError("Mahasiswa ini tidak berada pada antrean penilaian TA-03A aktif");
  }

  if (isClosedThesisStatus(thesis.thesisStatus?.name)) {
    throw new ForbiddenError("Thesis ini tidak berada pada antrean penilaian TA-03A aktif");
  }

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
  if (score?.lecturerScore != null && score.lecturerId !== lecturerUserId) {
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
