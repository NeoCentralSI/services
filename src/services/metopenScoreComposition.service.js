import { BadRequestError, NotFoundError } from "../utils/errors.js";
import * as repo from "../repositories/metopenScoreComposition.repository.js";

export {
  DEFAULT_TA03A_CAP,
  DEFAULT_TA03B_CAP,
} from "../repositories/metopenScoreComposition.repository.js";

/**
 * Map assessment role → composition field.
 * @param {"supervisor"|"default"} role
 * @param {{ ta03aCap: number, ta03bCap: number }} composition
 */
export function capForRole(role, composition) {
  if (role === "supervisor") return composition.ta03aCap;
  if (role === "default") return composition.ta03bCap;
  return null;
}

/**
 * Resolve caps for an academic year. Auto-creates default 75:25 if missing.
 * @returns {Promise<{ academicYearId: string, ta03aCap: number, ta03bCap: number, isLocked: boolean, finalizedScoreCount: number }>}
 */
export async function getCompositionForAcademicYear(academicYearId) {
  if (!academicYearId) {
    throw new BadRequestError("academicYearId wajib diisi untuk komposisi penilaian TA-03");
  }

  const academicYear = await repo.findAcademicYearById(academicYearId);
  if (!academicYear) {
    throw new NotFoundError("Tahun akademik tidak ditemukan");
  }

  const composition = await repo.ensureDefaultComposition(academicYearId);
  const finalizedScoreCount = await repo.countFinalizedScoresForAcademicYear(academicYearId);

  return {
    academicYearId: composition.academicYearId,
    ta03aCap: composition.ta03aCap,
    ta03bCap: composition.ta03bCap,
    isLocked: finalizedScoreCount > 0,
    finalizedScoreCount,
    academicYear: {
      id: academicYear.id,
      year: academicYear.year,
      semester: academicYear.semester,
      isActive: academicYear.isActive,
    },
  };
}

/**
 * Resolve academic year for scoring from the thesis/TA-04 record itself.
 * Never falls back to the current period because that can mix historical
 * rubrics into an older thesis.
 */
export async function resolveAcademicYearIdForThesis(thesis) {
  const direct = thesis?.academicYearId || thesis?.ta04AssignmentAcademicYearId || null;
  if (direct) return direct;

  throw new BadRequestError(
    "Tahun akademik thesis belum ditetapkan. Tidak dapat menentukan komposisi penilaian TA-03.",
  );
}

/**
 * Resolve academic year for criteria admin from its mandatory CPMK period.
 */
export async function resolveAcademicYearIdForCpmk(cpmk) {
  if (cpmk?.academicYearId) return cpmk.academicYearId;
  throw new BadRequestError(
    "Tahun akademik CPMK belum ditetapkan.",
  );
}

/**
 * Cap for a role in a given academic year.
 */
export async function getCapForRole(role, academicYearId) {
  const composition = await getCompositionForAcademicYear(academicYearId);
  const cap = capForRole(role, composition);
  if (cap == null) {
    throw new BadRequestError(`Role penilaian tidak dikenal: ${role}`);
  }
  return { cap, composition };
}

export async function assertCompositionEditable(academicYearId) {
  const finalizedScoreCount = await repo.countFinalizedScoresForAcademicYear(academicYearId);
  if (finalizedScoreCount > 0) {
    throw new BadRequestError(
      `Komposisi penilaian tidak dapat diubah karena sudah ada ${finalizedScoreCount} nilai TA-03 yang final pada tahun akademik ini.`,
    );
  }
}

/**
 * Update composition for an AY.
 * Guards: sum=100, freeze finalized, Σ criteria ≤ new caps.
 */
export async function updateCompositionForAcademicYear(academicYearId, { ta03aCap, ta03bCap }) {
  const academicYear = await repo.findAcademicYearById(academicYearId);
  if (!academicYear) {
    throw new NotFoundError("Tahun akademik tidak ditemukan");
  }

  await assertCompositionEditable(academicYearId);

  if (ta03aCap + ta03bCap !== 100) {
    throw new BadRequestError(
      `Jumlah TA-03A (${ta03aCap}) + TA-03B (${ta03bCap}) harus tepat 100`,
    );
  }

  const includeNullAyCpmks = academicYear.isActive === true;
  const supervisorTotal = await repo.getCriteriaTotalScoreForAcademicYear(
    "supervisor",
    academicYearId,
    { includeNullAyCpmks },
  );
  const defaultTotal = await repo.getCriteriaTotalScoreForAcademicYear(
    "default",
    academicYearId,
    { includeNullAyCpmks },
  );

  // When criteria are still global (no AY on CPMK), also check global totals
  // against the active year's composition so we don't leave invalid config.
  let effectiveSupervisorTotal = supervisorTotal;
  let effectiveDefaultTotal = defaultTotal;
  if (includeNullAyCpmks && supervisorTotal === 0 && defaultTotal === 0) {
    effectiveSupervisorTotal = await repo.getGlobalCriteriaTotalScore("supervisor");
    effectiveDefaultTotal = await repo.getGlobalCriteriaTotalScore("default");
  }

  if (effectiveSupervisorTotal > ta03aCap) {
    throw new BadRequestError(
      `Tidak dapat menurunkan batas TA-03A menjadi ${ta03aCap}: total skor kriteria pembimbing saat ini ${effectiveSupervisorTotal}. Kurangi skor kriteria terlebih dahulu.`,
    );
  }
  if (effectiveDefaultTotal > ta03bCap) {
    throw new BadRequestError(
      `Tidak dapat menurunkan batas TA-03B menjadi ${ta03bCap}: total skor kriteria koordinator saat ini ${effectiveDefaultTotal}. Kurangi skor kriteria terlebih dahulu.`,
    );
  }

  const updated = await repo.upsertComposition(academicYearId, { ta03aCap, ta03bCap });

  return {
    academicYearId: updated.academicYearId,
    ta03aCap: updated.ta03aCap,
    ta03bCap: updated.ta03bCap,
    isLocked: false,
    finalizedScoreCount: 0,
    academicYear: {
      id: academicYear.id,
      year: academicYear.year,
      semester: academicYear.semester,
      isActive: academicYear.isActive,
    },
  };
}

/**
 * Ensure default composition row exists when a new academic year is created.
 */
export async function ensureCompositionForNewAcademicYear(academicYearId) {
  return repo.ensureDefaultComposition(academicYearId);
}
