import { fetchStudentsFull, hashStudent } from "./sia.client.js";
import { saveStudents, saveSyncStatus, cleanupObsoleteStudents } from "./sia.store.js";
import prisma from "../config/prisma.js";

/**
 * Main SIA sync job - fetches student data and updates cache + database
 */
export async function runSiaSync() {
  const startedAt = new Date();
  let summary = {
    lastRun: startedAt,
    fetched: 0,
    updated: 0,
    skipped: 0,
    dbUpdated: 0,
    cleaned: 0,
    error: "",
    durationMs: 0,
  };

  try {
    console.log("🔄 Starting SIA sync...");
    
    // Fetch with retry logic
    const data = await fetchStudentsFull(3);
    summary.fetched = Array.isArray(data) ? data.length : 0;
    console.log(`✅ Fetched ${summary.fetched} students from SIA`);

    // Prepare data with hash for change detection
    const stamped = data.map((student) => ({
      nim: student.nim,
      data: student,
      hash: hashStudent(student),
      fetchedAt: startedAt.toISOString(),
    }));

    // Save to Redis cache
    const { updated, skipped } = await saveStudents(stamped);
    summary.updated = updated;
    summary.skipped = skipped;
    console.log(`💾 Cache: ${updated} updated, ${skipped} skipped`);

    // Batch update database student academic fields
    const dbResult = await updateStudentAcademicBatch(stamped);
    summary.dbUpdated = dbResult.updated;
    console.log(`🗄️  Database: ${dbResult.updated} students updated`);

    // Cleanup obsolete records
    const cleanupResult = await cleanupObsoleteStudents(stamped.map((s) => s.nim));
    summary.cleaned = cleanupResult.cleaned;
    if (cleanupResult.cleaned > 0) {
      console.log(`🧹 Cleaned: ${cleanupResult.cleaned} obsolete records`);
    }

    console.log(`✅ SIA sync completed in ${Date.now() - startedAt.getTime()}ms`);
  } catch (err) {
    summary.error = err?.message || String(err);
    console.error("❌ SIA sync failed:", err.message);
    throw err;
  } finally {
    summary.durationMs = Date.now() - startedAt.getTime();
    await saveSyncStatus(summary);
  }
}

/**
 * Batch update student academic fields in database (optimized version)
 * Uses single query with updateMany instead of N+1 queries
 */
async function updateStudentAcademicBatch(stamped) {
  // Prepare updates data
  const updates = stamped
    .map((entry) => ({
      nim: entry.nim,
      sks: Number(entry.data?.sksCompleted),
      mandatoryCoursesCompleted: Boolean(entry.data?.mandatoryCoursesCompleted),
      mkwuCompleted: Boolean(entry.data?.mkwuCompleted),
      internshipCompleted: Boolean(entry.data?.internshipCompleted),
      kknCompleted: Boolean(entry.data?.kknCompleted),
      currentSemester:
        entry.data?.currentSemester === null || entry.data?.currentSemester === undefined
          ? null
          : Number(entry.data.currentSemester),
    }))
    .filter((e) => e.nim && !Number.isNaN(e.sks));

  if (updates.length === 0) {
    return { updated: 0 };
  }

  try {
    // Get all matching users in one query
    const nims = updates.map((u) => u.nim);
    const users = await prisma.user.findMany({
      where: { identityNumber: { in: nims } },
      select: { id: true, identityNumber: true },
    });

    // Create NIM -> userId map
    const nimToUserId = new Map(users.map((u) => [u.identityNumber, u.id]));

    // Batch update with transaction
    const updatePromises = updates
      .filter((u) => nimToUserId.has(u.nim))
      .map((u) =>
        prisma.student.updateMany({
          where: { id: nimToUserId.get(u.nim) },
          data: {
            skscompleted: u.sks,
            mandatoryCoursesCompleted: u.mandatoryCoursesCompleted,
            mkwuCompleted: u.mkwuCompleted,
            internshipCompleted: u.internshipCompleted,
            kknCompleted: u.kknCompleted,
            currentSemester: Number.isNaN(u.currentSemester) ? null : u.currentSemester,
          },
        })
      );

    const results = await prisma.$transaction(updatePromises);
    const totalUpdated = results.reduce((sum, r) => sum + r.count, 0);

    return { updated: totalUpdated };
  } catch (err) {
    console.error("❌ Failed to batch update student academic fields:", err.message);
    // Fallback to individual updates if batch fails
    return await updateStudentAcademicIndividual(updates);
  }
}

/**
 * Fallback: Individual updates if batch update fails
 */
async function updateStudentAcademicIndividual(updates) {
  let updated = 0;
  for (const { nim, sks, mandatoryCoursesCompleted, mkwuCompleted, internshipCompleted, kknCompleted, currentSemester } of updates) {
    try {
      const user = await prisma.user.findUnique({
        where: { identityNumber: nim },
        select: { id: true },
      });
      if (!user) continue;

      await prisma.student.update({
        where: { id: user.id },
        data: {
          skscompleted: sks,
          mandatoryCoursesCompleted,
          mkwuCompleted,
          internshipCompleted,
          kknCompleted,
          currentSemester: Number.isNaN(currentSemester) ? null : currentSemester,
        },
      });
      updated++;
    } catch (err) {
      console.warn(`⚠️  Failed to update student academic fields for NIM ${nim}:`, err.message);
    }
  }
  return { updated };
}
