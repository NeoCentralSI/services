import prisma from "../config/prisma.js";
import { ConflictError } from "../utils/errors.js";

/**
 * Get current date/time. Comparisons use absolute instants; academic year
 * windows in DB are stored as DateTime boundaries.
 * @returns {Date}
 */
export function getCurrentDateWIB() {
  return new Date();
}

/**
 * Check if an academic year is currently active based on date range.
 * @param {Object} academicYear
 * @returns {boolean}
 */
export function isWithinDateRange(academicYear) {
  if (!academicYear?.startDate || !academicYear?.endDate) return false;

  const now = getCurrentDateWIB();
  const start = new Date(academicYear.startDate);
  const end = new Date(academicYear.endDate);

  return now >= start && now <= end;
}

/**
 * Resolve exactly one date-window period. Ambiguous overlaps fail closed.
 * @param {Date} now
 * @param {Object} client
 * @returns {Promise<Object|null>}
 */
async function findDateWindowAcademicYear(now = getCurrentDateWIB(), client = prisma) {
  const matches = await client.academicYear.findMany({
    where: {
      startDate: { lte: now },
      endDate: { gte: now },
    },
    orderBy: [{ startDate: "desc" }, { createdAt: "asc" }],
    take: 2,
  });

  if (matches.length > 1) {
    throw new ConflictError(
      "Konfigurasi tahun akademik overlap. Perbaiki rentang tanggal sebelum melanjutkan operasi SIMPTA.",
    );
  }
  return matches[0] ?? null;
}

/**
 * Date-window active year (startDate <= now <= endDate).
 * @returns {Promise<Object|null>}
 */
export async function getActiveAcademicYear(client = prisma) {
  return findDateWindowAcademicYear(getCurrentDateWIB(), client);
}

/**
 * Operational year used by quota/catalog/admin pickers.
 * Prefer date-window match; during calendar gaps fall back to DB isActive flag
 * so lecturer inbox and admin Kuota Bimbingan stay on the same cohort.
 * @returns {Promise<Object|null>}
 */
export async function resolveOperationalAcademicYear(client = prisma) {
  const byDate = await findDateWindowAcademicYear(getCurrentDateWIB(), client);
  if (byDate) return byDate;

  const flagged = await client.academicYear.findMany({
    where: { isActive: true },
    orderBy: [{ startDate: "desc" }, { createdAt: "asc" }],
    take: 2,
  });
  if (flagged.length > 1) {
    throw new ConflictError(
      "Lebih dari satu tahun akademik ditandai aktif. Perbaiki konfigurasi sebelum melanjutkan operasi SIMPTA.",
    );
  }
  return flagged[0] ?? null;
}

/**
 * Sync persisted isActive flags from date windows.
 * If no year covers today, keep the previous operational flag (or nearest
 * past year) so UAT/admin surfaces do not go fully "Tidak Aktif".
 * @returns {Promise<{ activeId: string|null, updated: number }>}
 */
export async function syncAcademicYearActiveFlags() {
  const years = await prisma.academicYear.findMany({
    orderBy: [{ startDate: "desc" }, { createdAt: "asc" }],
  });

  const inWindow = years.filter((ay) => isWithinDateRange(ay));
  if (inWindow.length > 1) {
    throw new ConflictError(
      "Konfigurasi tahun akademik overlap. Sinkronisasi periode dibatalkan.",
    );
  }
  let activeId = inWindow[0]?.id ?? null;

  if (!activeId) {
    const flagged = years.filter((ay) => ay.isActive);
    if (flagged.length > 1) {
      throw new ConflictError(
        "Lebih dari satu tahun akademik ditandai aktif. Sinkronisasi periode dibatalkan.",
      );
    }
    activeId = flagged[0]?.id ?? null;
  }

  if (!activeId) {
    const now = getCurrentDateWIB();
    const past = years
      .filter((ay) => ay.endDate && new Date(ay.endDate) < now)
      .sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
    activeId = past[0]?.id ?? years[0]?.id ?? null;
  }

  if (!activeId) return { activeId: null, updated: 0 };

  const changed = years.filter((ay) => ay.isActive !== (ay.id === activeId)).length;
  await prisma.$transaction([
    prisma.academicYear.updateMany({
      where: {
        OR: [
          { isActive: true },
          { activeKey: { not: null } },
        ],
      },
      data: { isActive: false, activeKey: null },
    }),
    prisma.academicYear.update({
      where: { id: activeId },
      data: { isActive: true, activeKey: "ACTIVE" },
    }),
  ]);

  return { activeId, updated: changed };
}

/**
 * Ensure UAT/dev environments have a year covering "today".
 * Extends the operational year's endDate up to the day before the next
 * year's startDate (or +45 days) when a calendar gap would leave HELPER_ACTIVE null.
 * @returns {Promise<Object|null>}
 */
export async function ensureOperationalAcademicYearWindow() {
  await syncAcademicYearActiveFlags();
  return resolveOperationalAcademicYear();
}

/**
 * @returns {Promise<Array>}
 */
export async function getAcademicYearsWithStatus() {
  const [academicYears, operational] = await Promise.all([
    prisma.academicYear.findMany({
      orderBy: [{ startDate: "desc" }, { createdAt: "asc" }],
    }),
    resolveOperationalAcademicYear(),
  ]);

  return academicYears.map((ay) => ({
    ...ay,
    isActive: ay.id === operational?.id,
  }));
}

/**
 * @returns {Promise<string|null>}
 */
export async function getActiveAcademicYearId() {
  const active = await resolveOperationalAcademicYear();
  return active?.id || null;
}

/**
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function isActiveAcademicYear(id) {
  if (!id) return false;
  const active = await resolveOperationalAcademicYear();
  return active?.id === id;
}

/**
 * @param {Object} academicYear
 * @returns {string}
 */
export function formatAcademicYearLabel(academicYear) {
  if (!academicYear) return "-";
  const semester = academicYear.semester === "ganjil" ? "Ganjil" : "Genap";
  return `${academicYear.year || ""} ${semester}`.trim();
}
