import { fetchStudentsFull, hashStudent } from "./sia.client.js";
import { saveStudents, saveSyncStatus, cleanupObsoleteStudents } from "./sia.store.js";
import prisma from "../config/prisma.js";
import {
  normalizeSiaObservation,
} from "./metopenEligibility.service.js";
import { syncBookingActivationForStudent } from "./metopen.service.js";
import { buildRuntimeSnapshotObservationPatch } from "./studentPeriodSnapshot.service.js";
import { getActiveAcademicYear } from "../helpers/academicYear.helper.js";

async function syncBookingLifecycleForStudents(studentIds, academicYearId) {
  const uniqueStudentIds = [...new Set(studentIds.filter(Boolean))];
  if (uniqueStudentIds.length === 0) {
    return { attempted: 0, succeeded: 0 };
  }

  const results = await Promise.allSettled(
    uniqueStudentIds.map((studentId) =>
      syncBookingActivationForStudent(studentId, academicYearId),
    ),
  );

  const failures = [];
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      failures.push(result.reason);
      console.warn(
        `Failed to sync advisor booking lifecycle for student ${uniqueStudentIds[index]}:`,
        result.reason?.message ?? result.reason,
      );
    }
  });
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      `Sinkronisasi lifecycle booking gagal untuk ${failures.length} mahasiswa.`,
    );
  }
  return { attempted: uniqueStudentIds.length, succeeded: uniqueStudentIds.length };
}

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
    periodSnapshotsCreated: 0,
    bookingLifecycleSynced: 0,
    cplFetched: 0,
    cplCreated: 0,
    cplUpdated: 0,
    cplSkippedNoStudent: 0,
    cplSkippedNameMismatch: 0,
    cplSkippedUnknownCode: 0,
    cplUnmatchedCodes: 0,
    cplSkippedProtected: 0,
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

    // Save to Redis cache (non-blocking — sync continues even if Redis fails)
    try {
      const { updated, skipped } = await saveStudents(stamped);
      summary.updated = updated;
      summary.skipped = skipped;
      console.log(`💾 Cache: ${updated} updated, ${skipped} skipped`);
    } catch (redisErr) {
      console.warn("⚠️  Redis cache save failed (continuing sync):", redisErr.message);
    }

    // Batch update database student academic fields
    const dbResult = await updateStudentAcademicBatch(stamped);
    summary.dbUpdated = dbResult.updated;
    summary.periodSnapshotsCreated = dbResult.snapshotsCreated;
    summary.bookingLifecycleSynced = dbResult.lifecycleSynced;
    console.log(`🗄️  Database: ${dbResult.updated} students updated`);

    // Batch upsert student CPL scores from same SIA payload
    const cplResult = await updateStudentCplScoresBatch(stamped);
    summary.cplFetched = cplResult.fetched;
    summary.cplCreated = cplResult.created;
    summary.cplUpdated = cplResult.updated;
    summary.cplSkippedNoStudent = cplResult.skippedNoStudent;
    summary.cplSkippedNameMismatch = cplResult.skippedNameMismatch;
    summary.cplSkippedUnknownCode = cplResult.skippedUnknownCode;
    summary.cplUnmatchedCodes = cplResult.unmatchedCodes;
    summary.cplSkippedProtected = cplResult.skippedProtected;
    if (cplResult.fetched > 0) {
      console.log(
        `📊 CPL scores: fetched=${cplResult.fetched}, created=${cplResult.created}, updated=${cplResult.updated}, noStudent=${cplResult.skippedNoStudent}, nameMismatch=${cplResult.skippedNameMismatch}, unmatchedCode=${cplResult.unmatchedCodes}, protected=${cplResult.skippedProtected}`
      );
    }

    // Cleanup obsolete records (non-blocking — sync continues even if Redis fails)
    try {
      const cleanupResult = await cleanupObsoleteStudents(stamped.map((s) => s.nim));
      summary.cleaned = cleanupResult.cleaned;
      if (cleanupResult.cleaned > 0) {
        console.log(`🧹 Cleaned: ${cleanupResult.cleaned} obsolete records`);
      }
    } catch (cleanupErr) {
      console.warn("⚠️  Redis cleanup failed (continuing sync):", cleanupErr.message);
    }

    console.log(`✅ SIA sync completed in ${Date.now() - startedAt.getTime()}ms`);
  } catch (err) {
    summary.error = err?.message || String(err);
    console.error("❌ SIA sync failed:", err.message);
    throw err;
  } finally {
    summary.durationMs = Date.now() - startedAt.getTime();
    try {
      await saveSyncStatus(summary);
    } catch (statusErr) {
      console.warn("⚠️  Failed to save sync status:", statusErr.message);
    }
  }

  return summary;
}

/**
 * Batch update student academic fields in database (optimized version)
 * Uses single query with updateMany instead of N+1 queries
 */
const parseGpa = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return null;
  return Math.round(parsed * 100) / 100;
};

async function updateStudentAcademicBatch(stamped) {
  const startedAt = new Date();
  const academicYear = await getActiveAcademicYear();
  if (!academicYear) {
    throw new Error(
      "Tidak ada periode akademik yang mencakup waktu sinkronisasi SIA. Snapshot periode dibatalkan.",
    );
  }
  // Prepare updates data
  const updates = stamped
    .map((entry) => {
      const observation = normalizeSiaObservation(entry.data);
      return {
      nim: observation.nim || entry.nim,
      sks: Number(entry.data?.sksCompleted),
      mandatoryCoursesCompleted: Boolean(entry.data?.mandatoryCoursesCompleted),
      mkwuCompleted: Boolean(entry.data?.mkwuCompleted),
      internshipCompleted: Boolean(entry.data?.internshipCompleted),
      kknCompleted: Boolean(entry.data?.kknCompleted),
      researchMethodCompleted: Boolean(entry.data?.researchMethodCompleted),
      eligibleMetopen: observation.eligibleMetopen,
      currentSemester:
        entry.data?.currentSemester === null || entry.data?.currentSemester === undefined
          ? null
          : Number(entry.data.currentSemester),
      gpa: parseGpa(entry.data?.gpa),
      graduationPredicate: entry.data?.graduationPredicate
        ? String(entry.data.graduationPredicate).trim()
        : null,
      takingThesisCourse: observation.takingThesisCourse,
    };
    })
    .filter((e) => e.nim && !Number.isNaN(e.sks));

  if (updates.length === 0) {
    return { updated: 0, snapshotsCreated: 0, lifecycleSynced: 0 };
  }

  let matchedStudentIds = [];
  let batchResult = null;
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
    const matchedUpdates = updates.filter((u) => nimToUserId.has(u.nim));
    matchedStudentIds = matchedUpdates.map((u) => nimToUserId.get(u.nim));
    const updatePromises = matchedUpdates
      .map((u) =>
        prisma.student.updateMany({
          where: { id: nimToUserId.get(u.nim) },
          data: {
            sksCompleted: u.sks,
            mandatoryCoursesCompleted: u.mandatoryCoursesCompleted,
            mkwuCompleted: u.mkwuCompleted,
            internshipCompleted: u.internshipCompleted,
            kknCompleted: u.kknCompleted,
            researchMethodCompleted: u.researchMethodCompleted,
            eligibleMetopen:
              typeof u.eligibleMetopen === "boolean" ? u.eligibleMetopen : undefined,
            metopenEligibilitySource:
              typeof u.eligibleMetopen === "boolean" ? "sia" : undefined,
            metopenEligibilityUpdatedAt:
              typeof u.eligibleMetopen === "boolean" ? startedAt : undefined,
            currentSemester: Number.isNaN(u.currentSemester) ? null : u.currentSemester,
            gpa: u.gpa,
            graduationPredicate: u.graduationPredicate,
            takingThesisCourse: u.takingThesisCourse,
            thesisCourseEnrollmentSource: "sia",
            thesisCourseEnrollmentUpdatedAt: startedAt,
          },
        })
      );

    const candidateSnapshotRows = matchedUpdates.flatMap((u) => {
      const hasEligibility = typeof u.eligibleMetopen === "boolean";
      const hasThesisCourse = typeof u.takingThesisCourse === "boolean";
      if (!hasEligibility && !hasThesisCourse) return [];
      return [{
        studentId: nimToUserId.get(u.nim),
        academicYearId: academicYear.id,
        eligibleMetopen: hasEligibility ? u.eligibleMetopen : null,
        researchMethodCompleted: hasEligibility
          ? u.researchMethodCompleted
          : null,
        takingThesisCourse: hasThesisCourse ? u.takingThesisCourse : null,
        eligibilitySource: hasEligibility ? "sia" : null,
        eligibilityCapturedAt: hasEligibility ? startedAt : null,
        thesisCourseSource: hasThesisCourse ? "sia" : null,
        thesisCourseCapturedAt: hasThesisCourse ? startedAt : null,
        capturedAt: startedAt,
      }];
    });
    const existingSnapshots = candidateSnapshotRows.length > 0
      ? await prisma.studentAcademicYearSnapshot.findMany({
        where: {
          academicYearId: academicYear.id,
          studentId: {
            in: candidateSnapshotRows.map((row) => row.studentId),
          },
        },
        select: {
          id: true,
          studentId: true,
          eligibleMetopen: true,
          takingThesisCourse: true,
        },
      })
      : [];
    const existingSnapshotByStudent = new Map(
      existingSnapshots.map((snapshot) => [snapshot.studentId, snapshot]),
    );
    const snapshotRows = candidateSnapshotRows.filter(
      (row) => !existingSnapshotByStudent.has(row.studentId),
    );
    const snapshotFillOperations = candidateSnapshotRows.flatMap((row) => {
      const existing = existingSnapshotByStudent.get(row.studentId);
      if (!existing) return [];
      const data = buildRuntimeSnapshotObservationPatch(existing, {
        eligibleMetopen: row.eligibleMetopen,
        researchMethodCompleted: row.researchMethodCompleted,
        eligibilitySource: row.eligibilitySource,
        eligibilityCapturedAt: row.eligibilityCapturedAt,
        takingThesisCourse: row.takingThesisCourse,
        thesisCourseSource: row.thesisCourseSource,
        thesisCourseCapturedAt: row.thesisCourseCapturedAt,
        capturedAt: row.capturedAt,
      });
      if (Object.keys(data).length === 0) return [];
      return [prisma.studentAcademicYearSnapshot.update({
        where: { id: existing.id },
        data,
      })];
    });
    const transactionOperations = [...updatePromises];
    if (snapshotRows.length > 0) {
      transactionOperations.push(
        prisma.studentAcademicYearSnapshot.createMany({
          data: snapshotRows,
          skipDuplicates: true,
        }),
      );
    }
    transactionOperations.push(...snapshotFillOperations);

    const results = await prisma.$transaction(transactionOperations);
    const updateResults = results.slice(0, updatePromises.length);
    const totalUpdated = updateResults.reduce((sum, r) => sum + r.count, 0);
    const snapshotsCreated = snapshotRows.length > 0
      ? results[updatePromises.length]?.count ?? 0
      : 0;
    batchResult = {
      updated: totalUpdated,
      snapshotsCreated,
    };
  } catch (err) {
    console.error("❌ Failed to batch update student academic fields:", err.message);
    // Fallback to individual updates if batch fails
    return await updateStudentAcademicIndividual(
      updates,
      startedAt,
      academicYear.id,
    );
  }

  const lifecycle = await syncBookingLifecycleForStudents(
    matchedStudentIds,
    academicYear.id,
  );
  return {
    ...batchResult,
    lifecycleSynced: lifecycle.succeeded,
  };
}

/**
 * Fallback: Individual updates if batch update fails
 */
async function updateStudentAcademicIndividual(
  updates,
  updatedAt = new Date(),
  academicYearId,
) {
  let updated = 0;
  let snapshotsCreated = 0;
  const updatedStudentIds = [];
  for (const {
    nim,
    sks,
    mandatoryCoursesCompleted,
    mkwuCompleted,
    internshipCompleted,
    kknCompleted,
    researchMethodCompleted,
    eligibleMetopen,
    currentSemester,
    gpa,
    graduationPredicate,
    takingThesisCourse,
  } of updates) {
    try {
      const user = await prisma.user.findUnique({
        where: { identityNumber: nim },
        select: { id: true },
      });
      if (!user) continue;

      const created = await prisma.$transaction(async (tx) => {
        await tx.student.update({
          where: { id: user.id },
          data: {
            sksCompleted: sks,
            mandatoryCoursesCompleted,
            mkwuCompleted,
            internshipCompleted,
            kknCompleted,
            researchMethodCompleted,
            eligibleMetopen:
              typeof eligibleMetopen === "boolean" ? eligibleMetopen : undefined,
            metopenEligibilitySource:
              typeof eligibleMetopen === "boolean" ? "sia" : undefined,
            metopenEligibilityUpdatedAt:
              typeof eligibleMetopen === "boolean" ? updatedAt : undefined,
            currentSemester: Number.isNaN(currentSemester) ? null : currentSemester,
            gpa,
            graduationPredicate,
            takingThesisCourse,
            thesisCourseEnrollmentSource: "sia",
            thesisCourseEnrollmentUpdatedAt: updatedAt,
          },
        });
        const hasEligibility = typeof eligibleMetopen === "boolean";
        const hasThesisCourse = typeof takingThesisCourse === "boolean";
        if (!hasEligibility && !hasThesisCourse) {
          return 0;
        }
        const existing = await tx.studentAcademicYearSnapshot.findUnique({
          where: {
            studentId_academicYearId: {
              studentId: user.id,
              academicYearId,
            },
          },
        });
        if (!existing) {
          await tx.studentAcademicYearSnapshot.create({
            data: {
              studentId: user.id,
              academicYearId,
              eligibleMetopen: hasEligibility ? eligibleMetopen : null,
              researchMethodCompleted: hasEligibility
                ? researchMethodCompleted
                : null,
              takingThesisCourse: hasThesisCourse
                ? takingThesisCourse
                : null,
              eligibilitySource: hasEligibility ? "sia" : null,
              eligibilityCapturedAt: hasEligibility ? updatedAt : null,
              thesisCourseSource: hasThesisCourse ? "sia" : null,
              thesisCourseCapturedAt: hasThesisCourse ? updatedAt : null,
              capturedAt: updatedAt,
            },
          });
          return 1;
        }
        const fillData = buildRuntimeSnapshotObservationPatch(existing, {
          eligibleMetopen: hasEligibility ? eligibleMetopen : null,
          researchMethodCompleted: hasEligibility ? researchMethodCompleted : null,
          eligibilitySource: hasEligibility ? "sia" : null,
          eligibilityCapturedAt: hasEligibility ? updatedAt : null,
          takingThesisCourse: hasThesisCourse ? takingThesisCourse : null,
          thesisCourseSource: hasThesisCourse ? "sia" : null,
          thesisCourseCapturedAt: hasThesisCourse ? updatedAt : null,
          capturedAt: updatedAt,
        });
        if (Object.keys(fillData).length > 0) {
          await tx.studentAcademicYearSnapshot.update({
            where: { id: existing.id },
            data: fillData,
          });
        }
        return 0;
      });
      snapshotsCreated += created;
      updatedStudentIds.push(user.id);
      updated++;
    } catch (err) {
      console.warn(`⚠️  Failed to update student academic fields for NIM ${nim}:`, err.message);
    }
  }
  const lifecycle = await syncBookingLifecycleForStudents(
    updatedStudentIds,
    academicYearId,
  );
  return {
    updated,
    snapshotsCreated,
    lifecycleSynced: lifecycle.succeeded,
  };
}

const normalizeName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const normalizeCode = (value) =>
  String(value || "")
    .trim()
    .toUpperCase();

const parseInputAt = (value) => {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

/**
 * Batch upsert student CPL scores from SIA payload.
 * Matching strategy:
 * - Student by NIM (users.identityNumber -> students.id)
 * - Name as validation guard (must match normalized string)
 * - CPL by code (cpls.code)
 */
async function updateStudentCplScoresBatch(stamped) {
  const rawRows = [];

  for (const entry of stamped) {
    const nim = entry?.nim;
    const name = entry?.data?.name;
    const cplScores = Array.isArray(entry?.data?.cplScores) ? entry.data.cplScores : [];

    for (const scoreRow of cplScores) {
      rawRows.push({ nim, name, row: scoreRow });
    }
  }

  if (rawRows.length === 0) {
    return {
      fetched: 0,
      created: 0,
      updated: 0,
      skippedNoStudent: 0,
      skippedNameMismatch: 0,
      skippedUnknownCode: 0,
      unmatchedCodes: 0,
      skippedProtected: 0,
    };
  }

  const nims = [...new Set(rawRows.map((item) => item.nim).filter(Boolean))];
  const users = await prisma.user.findMany({
    where: { identityNumber: { in: nims } },
    select: { id: true, identityNumber: true, fullName: true },
  });

  const studentIds = users.map((user) => user.id);
  const students = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    select: { id: true },
  });
  const existingStudentIdSet = new Set(students.map((student) => student.id));

  const nimToUser = new Map(
    users
      .filter((user) => existingStudentIdSet.has(user.id))
      .map((user) => [user.identityNumber, user])
  );

  const cpls = await prisma.cpl.findMany({
    where: { isActive: true, code: { not: null } },
    select: { id: true, code: true },
  });
  const codeToCplId = new Map(cpls.map((cpl) => [normalizeCode(cpl.code), cpl.id]));

  let skippedNoStudent = 0;
  let skippedNameMismatch = 0;
  let skippedUnknownCode = 0;

  const candidates = [];
  for (const item of rawRows) {
    const user = nimToUser.get(item.nim);
    if (!user) {
      skippedNoStudent += 1;
      continue;
    }

    const incomingName = normalizeName(item.name);
    const dbName = normalizeName(user.fullName);
    if (incomingName && dbName && incomingName !== dbName) {
      skippedNameMismatch += 1;
      continue;
    }

    const cplCode = normalizeCode(item.row?.code);
    const cplId = codeToCplId.get(cplCode);
    if (!cplId) {
      skippedUnknownCode += 1;
      continue;
    }

    const parsedScore = Number(item.row?.score);
    if (!Number.isFinite(parsedScore)) {
      continue;
    }

    candidates.push({
      studentId: user.id,
      cplId,
      score: Math.round(parsedScore),
      inputAt: parseInputAt(item.row?.inputAt),
    });
  }

  if (candidates.length === 0) {
    return {
      fetched: rawRows.length,
      created: 0,
      updated: 0,
      skippedNoStudent,
      skippedNameMismatch,
      skippedUnknownCode,
      unmatchedCodes: skippedUnknownCode,
      skippedProtected: 0,
    };
  }

  // Deduplicate by studentId+cplId; keep latest inputAt.
  const dedupedMap = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.studentId}::${candidate.cplId}`;
    const existing = dedupedMap.get(key);
    if (!existing || candidate.inputAt > existing.inputAt) {
      dedupedMap.set(key, candidate);
    }
  }
  const deduped = [...dedupedMap.values()];

  const targetStudentIds = [...new Set(deduped.map((item) => item.studentId))];
  const targetCplIds = [...new Set(deduped.map((item) => item.cplId))];
  const existingScores = await prisma.studentCplScore.findMany({
    where: {
      studentId: { in: targetStudentIds },
      cplId: { in: targetCplIds },
    },
    select: { studentId: true, cplId: true, source: true, status: true },
  });

  const existingScoreMap = new Map(
    existingScores.map((row) => [`${row.studentId}::${row.cplId}`, row])
  );

  let skippedProtected = 0;
  let created = 0;
  let updated = 0;
  const writes = [];
  for (const item of deduped) {
    const key = `${item.studentId}::${item.cplId}`;
    const existing = existingScoreMap.get(key);

    if (!existing) {
      created += 1;
      writes.push({
        type: "create",
        studentId: item.studentId,
        cplId: item.cplId,
        score: item.score,
        inputAt: item.inputAt,
      });
      continue;
    }

    const isProtected =
      existing.status === "verified" ||
      existing.status === "finalized";
    if (isProtected) {
      skippedProtected += 1;
      continue;
    }

    const canOverwrite = 
      (existing.source === "SIA" && existing.status === "calculated") || 
      existing.source === "manual";
    if (!canOverwrite) {
      skippedProtected += 1;
      continue;
    }


    updated += 1;
    writes.push({
      type: "update",
      studentId: item.studentId,
      cplId: item.cplId,
      score: item.score,
      inputAt: item.inputAt,
    });
  }

  if (writes.length === 0) {
    return {
      fetched: rawRows.length,
      created,
      updated: 0,
      skippedNoStudent,
      skippedNameMismatch,
      skippedUnknownCode,
      unmatchedCodes: skippedUnknownCode,
      skippedProtected,
    };
  }

  const chunkSize = 200;
  for (let i = 0; i < writes.length; i += chunkSize) {
    const chunk = writes.slice(i, i + chunkSize);
    await prisma.$transaction(
      chunk.map((row) =>
        row.type === "create"
          ? prisma.studentCplScore.create({
              data: {
                studentId: row.studentId,
                cplId: row.cplId,
                score: row.score,
                source: "SIA",
                status: "calculated",
                inputAt: row.inputAt,
              },
            })
          : prisma.studentCplScore.update({
              where: {
                studentId_cplId: {
                  studentId: row.studentId,
                  cplId: row.cplId,
                },
              },
              data: {
                score: row.score,
                source: "SIA",
                status: "calculated",
                inputAt: row.inputAt,
              },
            })
      )
    );
  }

  return {
    fetched: rawRows.length,
    created,
    updated,
    skippedNoStudent,
    skippedNameMismatch,
    skippedUnknownCode,
    unmatchedCodes: skippedUnknownCode,
    skippedProtected,
  };
}
