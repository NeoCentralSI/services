import prisma from "../config/prisma.js";
import { resolveOperationalAcademicYear } from "../helpers/academicYear.helper.js";
import { syncAllLecturerQuotaCurrentCounts } from "../services/advisorQuota.service.js";

/**
 * Scheduled overwrite of LecturerSupervisionQuota.currentCount.
 *
 * Does not increment or decrement. Reuses syncAllLecturerQuotaCurrentCounts
 * (absolute snapshot write) so a second run with unchanged data is a no-op
 * besides rewriting the same numbers (SIMPTA-FUN-010).
 */
export async function runQuotaCurrentCountSyncJob() {
  const started = new Date();
  console.log(`[quota-sync] Job started at ${started.toISOString()}`);

  const yearIds = new Set();
  const operational = await resolveOperationalAcademicYear();
  if (operational?.id) yearIds.add(operational.id);

  const quotaYears = await prisma.lecturerSupervisionQuota.findMany({
    distinct: ["academicYearId"],
    select: { academicYearId: true },
  });
  for (const row of quotaYears) {
    if (row.academicYearId) yearIds.add(row.academicYearId);
  }

  if (yearIds.size === 0) {
    console.log("[quota-sync] No academic year to sync.");
    return { synced: false, reason: "no-academic-year", years: [] };
  }

  const years = [];
  for (const academicYearId of yearIds) {
    const details = await syncAllLecturerQuotaCurrentCounts(academicYearId);
    const repaired = details.filter((row) => row.drift !== 0);
    years.push({
      academicYearId,
      recalculated: details.length,
      repairedCount: repaired.length,
    });
    console.log(
      `[quota-sync] ${academicYearId}: ${details.length} rows, ${repaired.length} repaired`,
    );
  }

  return { synced: true, years };
}
