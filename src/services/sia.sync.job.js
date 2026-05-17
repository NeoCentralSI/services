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
    if (cplResult.fetched > 0) {
      console.log(
        `📊 CPL scores: fetched=${cplResult.fetched}, created=${cplResult.created}, updated=${cplResult.updated}, noStudent=${cplResult.skippedNoStudent}, nameMismatch=${cplResult.skippedNameMismatch}, unmatchedCode=${cplResult.unmatchedCodes}, protected=${cplResult.skippedProtected}`
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
