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
    cplUnchanged: 0,
    cplSkippedMissingEnrollmentYear: 0,
    cplSkippedNoCurriculum: 0,
    cplSkippedAmbiguousCurriculum: 0,
    cplSkippedMissingDescription: 0,
    cplSkippedDescriptionMismatch: 0,
    cplSkippedNoActiveVersion: 0,
    cplSkippedAmbiguousActiveVersion: 0,
    cplSkippedMultipleExistingVersions: 0,
    cplSkippedInvalidScore: 0,
    cplSkippedInvalidTimestamp: 0,
    cplSkippedStaleData: 0,
    cplSkippedTimestampConflict: 0,
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
    summary.cplUnchanged = cplResult.unchanged;
    summary.cplSkippedMissingEnrollmentYear = cplResult.skippedMissingEnrollmentYear;
    summary.cplSkippedNoCurriculum = cplResult.skippedNoCurriculum;
    summary.cplSkippedAmbiguousCurriculum = cplResult.skippedAmbiguousCurriculum;
    summary.cplSkippedMissingDescription = cplResult.skippedMissingDescription;
    summary.cplSkippedDescriptionMismatch = cplResult.skippedDescriptionMismatch;
    summary.cplSkippedNoActiveVersion = cplResult.skippedNoActiveVersion;
    summary.cplSkippedAmbiguousActiveVersion = cplResult.skippedAmbiguousActiveVersion;
    summary.cplSkippedMultipleExistingVersions = cplResult.skippedMultipleExistingVersions;
    summary.cplSkippedInvalidScore = cplResult.skippedInvalidScore;
    summary.cplSkippedInvalidTimestamp = cplResult.skippedInvalidTimestamp;
    summary.cplSkippedStaleData = cplResult.skippedStaleData;
    summary.cplSkippedTimestampConflict = cplResult.skippedTimestampConflict;
    if (cplResult.fetched > 0) {
      console.log(
        `📊 CPL scores: fetched=${cplResult.fetched}, created=${cplResult.created}, updated=${cplResult.updated}, unchanged=${cplResult.unchanged}, noStudent=${cplResult.skippedNoStudent}, noCurriculum=${cplResult.skippedNoCurriculum}, unmatchedCode=${cplResult.unmatchedCodes}, descriptionMismatch=${cplResult.skippedDescriptionMismatch}, protected=${cplResult.skippedProtected}`
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
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const normalizeCode = (value) =>
  String(value || "")
    .normalize("NFKC")
    .trim()
    .toUpperCase();

const normalizeDescription = normalizeName;

const parseInputAt = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const emptyCplResult = (fetched = 0) => ({
  fetched,
  created: 0,
  updated: 0,
  unchanged: 0,
  skippedNoStudent: 0,
  skippedNameMismatch: 0,
  skippedMissingEnrollmentYear: 0,
  skippedNoCurriculum: 0,
  skippedAmbiguousCurriculum: 0,
  skippedMissingDescription: 0,
  skippedUnknownCode: 0,
  unmatchedCodes: 0,
  skippedDescriptionMismatch: 0,
  skippedNoActiveVersion: 0,
  skippedAmbiguousActiveVersion: 0,
  skippedMultipleExistingVersions: 0,
  skippedInvalidScore: 0,
  skippedInvalidTimestamp: 0,
  skippedStaleData: 0,
  skippedTimestampConflict: 0,
  skippedProtected: 0,
});

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

  if (rawRows.length === 0) return emptyCplResult();

  const result = emptyCplResult(rawRows.length);

  const nims = [...new Set(rawRows.map((item) => item.nim).filter(Boolean))];
  const users = await prisma.user.findMany({
    where: { identityNumber: { in: nims } },
    select: {
      id: true,
      identityNumber: true,
      fullName: true,
      student: { select: { id: true, enrollmentYear: true } },
    },
  });

  const nimToUser = new Map(
    users
      .filter((user) => user.student)
      .map((user) => [user.identityNumber, user])
  );

  const curricula = await prisma.curriculum.findMany({
    select: { id: true, name: true, startYear: true, endYear: true },
  });

  const cpls = await prisma.cpl.findMany({
    select: {
      id: true,
      curriculumId: true,
      code: true,
      description: true,
      version: true,
      isActive: true,
    },
  });

  const cplById = new Map(cpls.map((cpl) => [cpl.id, cpl]));
  const cplsByCurriculumAndCode = new Map();
  for (const cpl of cpls) {
    const key = `${cpl.curriculumId}::${normalizeCode(cpl.code)}`;
    const versions = cplsByCurriculumAndCode.get(key) || [];
    versions.push(cpl);
    cplsByCurriculumAndCode.set(key, versions);
  }

  const studentIds = [...new Set(users.filter((user) => user.student).map((user) => user.id))];
  const cplIds = cpls.map((cpl) => cpl.id);
  const existingScores = studentIds.length && cplIds.length
    ? await prisma.studentCplScore.findMany({
        where: { studentId: { in: studentIds }, cplId: { in: cplIds } },
        select: {
          studentId: true,
          cplId: true,
          score: true,
          inputAt: true,
          source: true,
          status: true,
        },
      })
    : [];

  const scoresByStudentLogicalCpl = new Map();
  for (const score of existingScores) {
    const cpl = cplById.get(score.cplId);
    if (!cpl) continue;
    const key = `${score.studentId}::${cpl.curriculumId}::${normalizeCode(cpl.code)}`;
    const scores = scoresByStudentLogicalCpl.get(key) || [];
    scores.push(score);
    scoresByStudentLogicalCpl.set(key, scores);
  }

  const writes = [];
  for (const item of rawRows) {
    const user = nimToUser.get(item.nim);
    if (!user) {
      result.skippedNoStudent += 1;
      continue;
    }

    const incomingName = normalizeName(item.name);
    const dbName = normalizeName(user.fullName);
    if (incomingName && dbName && incomingName !== dbName) {
      result.skippedNameMismatch += 1;
      continue;
    }

    const enrollmentYear = user.student?.enrollmentYear;
    if (!Number.isInteger(enrollmentYear)) {
      result.skippedMissingEnrollmentYear += 1;
      continue;
    }

    const matchingCurricula = curricula.filter(
      (curriculum) =>
        curriculum.startYear <= enrollmentYear &&
        (curriculum.endYear === null || curriculum.endYear >= enrollmentYear)
    );
    if (matchingCurricula.length === 0) {
      result.skippedNoCurriculum += 1;
      continue;
    }
    if (matchingCurricula.length > 1) {
      result.skippedAmbiguousCurriculum += 1;
      continue;
    }

    const curriculum = matchingCurricula[0];
    const cplCode = normalizeCode(item.row?.code);
    const versions = cplsByCurriculumAndCode.get(`${curriculum.id}::${cplCode}`) || [];
    if (!cplCode || versions.length === 0) {
      result.skippedUnknownCode += 1;
      result.unmatchedCodes += 1;
      continue;
    }

    const incomingDescription = normalizeDescription(item.row?.description);
    if (!incomingDescription) {
      result.skippedMissingDescription += 1;
      continue;
    }

    const parsedScore = Number(item.row?.score);
    if (!Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > 100) {
      result.skippedInvalidScore += 1;
      continue;
    }

    const inputAt = parseInputAt(item.row?.inputAt);
    if (!inputAt) {
      result.skippedInvalidTimestamp += 1;
      continue;
    }

    const logicalKey = `${user.id}::${curriculum.id}::${cplCode}`;
    const logicalScores = scoresByStudentLogicalCpl.get(logicalKey) || [];
    if (logicalScores.length > 1) {
      result.skippedMultipleExistingVersions += 1;
      continue;
    }

    let selectedCpl;
    let existing;
    if (logicalScores.length === 1) {
      existing = logicalScores[0];
      selectedCpl = cplById.get(existing.cplId);
    } else {
      const activeVersions = versions.filter((version) => version.isActive);
      if (activeVersions.length === 0) {
        result.skippedNoActiveVersion += 1;
        continue;
      }
      if (activeVersions.length > 1) {
        result.skippedAmbiguousActiveVersion += 1;
        continue;
      }
      selectedCpl = activeVersions[0];
    }

    if (normalizeDescription(selectedCpl.description) !== incomingDescription) {
      result.skippedDescriptionMismatch += 1;
      continue;
    }

    if (!existing) {
      result.created += 1;
      writes.push({
        type: "create",
        studentId: user.id,
        cplId: selectedCpl.id,
        score: parsedScore,
        inputAt,
      });
      continue;
    }

    if (existing.source !== "SIA" || existing.status !== "calculated") {
      result.skippedProtected += 1;
      continue;
    }

    const storedInputAt = existing.inputAt ? new Date(existing.inputAt) : null;
    if (storedInputAt && inputAt < storedInputAt) {
      result.skippedStaleData += 1;
      continue;
    }

    if (storedInputAt && inputAt.getTime() === storedInputAt.getTime()) {
      if (Number(existing.score) === parsedScore) result.unchanged += 1;
      else result.skippedTimestampConflict += 1;
      continue;
    }

    result.updated += 1;
    writes.push({
      type: "update",
      studentId: user.id,
      cplId: selectedCpl.id,
      score: parsedScore,
      inputAt,
    });
  }

  if (writes.length === 0) return result;

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

  return result;
}
