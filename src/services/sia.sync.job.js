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

    // Save to Redis cache
    const { updated, skipped } = await saveStudents(stamped);
    summary.updated = updated;
    summary.skipped = skipped;
    console.log(`💾 Cache: ${updated} updated, ${skipped} skipped`);

    // Batch update database student academic fields
    const dbResult = await updateStudentAcademicBatch(stamped);
    summary.dbUpdated = dbResult.updated;
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
  // Prepare updates data
  const updates = stamped
    .map((entry) => ({
      nim: entry.nim,
      sks: Number(entry.data?.sksCompleted),
      mandatoryCoursesCompleted: Boolean(entry.data?.mandatoryCoursesCompleted),
      mkwuCompleted: Boolean(entry.data?.mkwuCompleted),
      internshipCompleted: Boolean(entry.data?.internshipCompleted),
      kknCompleted: Boolean(entry.data?.kknCompleted),
      researchMethodCompleted: Boolean(entry.data?.researchMethodCompleted),
      currentSemester:
        entry.data?.currentSemester === null || entry.data?.currentSemester === undefined
          ? null
          : Number(entry.data.currentSemester),
      gpa: parseGpa(entry.data?.gpa),
      graduationPredicate: entry.data?.graduationPredicate
        ? String(entry.data.graduationPredicate).trim()
        : null,
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
            researchMethodCompleted: u.researchMethodCompleted,
            currentSemester: Number.isNaN(u.currentSemester) ? null : u.currentSemester,
            gpa: u.gpa,
            graduationPredicate: u.graduationPredicate,
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
  for (const {
    nim,
    sks,
    mandatoryCoursesCompleted,
    mkwuCompleted,
    internshipCompleted,
    kknCompleted,
    researchMethodCompleted,
    currentSemester,
    gpa,
    graduationPredicate,
  } of updates) {
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
          researchMethodCompleted,
          currentSemester: Number.isNaN(currentSemester) ? null : currentSemester,
          gpa,
          graduationPredicate,
        },
      });
      updated++;
    } catch (err) {
      console.warn(`⚠️  Failed to update student academic fields for NIM ${nim}:`, err.message);
    }
  }
  return { updated };
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
