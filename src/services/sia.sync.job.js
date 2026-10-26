/**
 * SIA sync (K45). SIA reports the running semester only; NeoCentral keeps the history in its
 * semester snapshots. Steps, each on the normalized records of `sia.normalize.js`:
 *   1. academic data (SKS, course flags, semester, cohort) and GPA;
 *   2. student status, through `applyStudentStatusChange` (K40), so Cuti and Drop Out act on the
 *      thesis as when the Admin changes them;
 *   3. semester flags (taking Metode Penelitian / Tugas Akhir), only when SIA's `period` is the
 *      running academic year of NeoCentral; flags the Admin set by hand stay (K36);
 *   4. CPL scores (manual scores stay).
 * The sync only writes data (decisions 12–13): moving a thesis on is never done here. One failed
 * student never stops the others.
 */
import { fetchAcademicRecords, hashStudent } from "./sia.client.js";
import { saveStudents, saveSyncStatus, cleanupObsoleteStudents } from "./sia.store.js";
import prisma from "../config/prisma.js";
import { applySiaEnrollments } from "./research-method/eligibility.service.js";
import { resolveOperationalAcademicYear } from "../helpers/academicYear.helper.js";
import { isSiaConfigured } from "../helpers/sia-availability.helper.js";
import { normalizeSiaResponse } from "./sia.normalize.js";
import { announceStudentStatusChange, applyStudentStatusChange } from "./thesisLifecycle.service.js";

const emptySummary = (startedAt) => ({
  lastRun: startedAt,
  period: "",
  fetched: 0,
  notFound: 0,
  updated: 0,
  skipped: 0,
  dbUpdated: 0,
  gpaChanged: 0,
  statusChanged: 0,
  failedStudents: 0,
  periodFlagsCreated: 0,
  periodFlagsUpdated: 0,
  periodFlagsKeptAdmin: 0,
  periodFlagsSkipped: 0,
  periodMismatch: "",
  periodFlagsError: "",
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
});

const periodLabel = (p) => (p ? `${p.academicYear} ${p.semester}` : "tidak diketahui");

export async function runSiaSync({ siaConfigured = isSiaConfigured() } = {}) {
  // Without SIA_BASE_URL nothing is read; one log line, no error, nothing stored.
  if (!siaConfigured) {
    console.log("⏭️  Sinkronisasi SIA dilewati: SIA_BASE_URL kosong (SIA belum tersedia).");
    return { skipped: true, reason: "not_configured", message: "Sinkronisasi SIA dilewati: alamat SIA belum diatur." };
  }
  const startedAt = new Date();
  const summary = emptySummary(startedAt);

  try {
    console.log("🔄 Starting SIA sync...");
    const raw = await fetchAcademicRecords(3);
    const { period, students: records } = normalizeSiaResponse(raw);
    summary.period = periodLabel(period);
    summary.fetched = records.length;
    console.log(`✅ Fetched ${records.length} students from SIA (${summary.period})`);

    // Cache of SIA's own records (non-blocking).
    try {
      const stamped = raw.data.map((row) => ({ nim: String(row?.nim ?? ""), data: row, hash: hashStudent(row), fetchedAt: startedAt.toISOString() })).filter((r) => r.nim);
      const { updated, skipped } = await saveStudents(stamped);
      summary.updated = updated;
      summary.skipped = skipped;
    } catch (redisErr) {
      console.warn("⚠️  Redis cache save failed (continuing sync):", redisErr.message);
    }

    const users = await prisma.user.findMany({
      where: { identityNumber: { in: records.map((r) => r.nim) }, student: { isNot: null } },
      select: { id: true, identityNumber: true, student: { select: { status: true, gpa: true } } },
    });
    const userOf = new Map(users.map((u) => [u.identityNumber, u]));
    summary.notFound = records.filter((r) => !userOf.has(r.nim)).length;

    // 1 + 2: academic data, GPA and status, one student at a time.
    const academic = await applyAcademicRecords(records, userOf);
    summary.dbUpdated = academic.updated;
    summary.gpaChanged = academic.gpaChanged;
    summary.statusChanged = academic.statusChanged;
    summary.failedStudents = academic.failed;

    // 3: semester flags, only for NeoCentral's running semester.
    try {
      const flags = await syncPeriodFlags(period, records, startedAt);
      summary.periodFlagsCreated = flags.created;
      summary.periodFlagsUpdated = flags.updated;
      summary.periodFlagsKeptAdmin = flags.keptAdmin;
      summary.periodFlagsSkipped = flags.skipped;
      summary.periodMismatch = flags.mismatch ?? "";
    } catch (flagErr) {
      summary.periodFlagsError = flagErr?.message || String(flagErr);
      console.warn("⚠️  Semester flags from SIA failed (continuing sync):", summary.periodFlagsError);
    }

    // 4: CPL scores.
    const cplResult = await updateStudentCplScoresBatch(records);
    for (const [key, value] of Object.entries(cplResult)) {
      const field = `cpl${key[0].toUpperCase()}${key.slice(1)}`;
      if (field in summary) summary[field] = value;
    }

    try {
      const cleanupResult = await cleanupObsoleteStudents(records.map((r) => r.nim));
      summary.cleaned = cleanupResult.cleaned;
    } catch (cleanupErr) {
      console.warn("⚠️  Redis cleanup failed (continuing sync):", cleanupErr.message);
    }

    console.log(
      `✅ SIA sync: ${summary.fetched} mahasiswa, ${summary.notFound} tidak ditemukan, ${summary.statusChanged} status berubah, ` +
      `${summary.gpaChanged} IPK berubah, penanda semester ${summary.periodFlagsSkipped ? `dilewati (${summary.periodMismatch})` : `${summary.periodFlagsCreated + summary.periodFlagsUpdated} ditulis`}`,
    );
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

/** The fields of a record that are written to `students` (null = not sent, left alone). */
function academicData(record) {
  const data = {};
  for (const key of ["sksCompleted", "currentSemester", "enrollmentYear", "gpa"]) {
    if (record[key] !== null) data[key] = record[key];
  }
  for (const key of ["mandatoryCoursesCompleted", "mkwuCompleted", "internshipCompleted", "kknCompleted", "researchMethodCompleted"]) {
    if (record[key] !== null) data[key] = record[key];
  }
  return data;
}

/**
 * Academic data, GPA and status of every student SIA lists. GPA and status have no manual mark in
 * NeoCentral, so SIA's value wins (K45). Each student is written apart: a failure is counted and
 * the next student goes on.
 */
export async function applyAcademicRecords(records, userOf, { client = prisma } = {}) {
  const result = { updated: 0, gpaChanged: 0, statusChanged: 0, failed: 0 };
  for (const record of records) {
    const user = userOf.get(record.nim);
    if (!user) continue;
    try {
      const data = academicData(record);
      if (Object.keys(data).length > 0) {
        await client.student.update({ where: { id: user.id }, data });
        result.updated += 1;
        if (data.gpa !== undefined && Number(user.student?.gpa ?? NaN) !== data.gpa) result.gpaChanged += 1;
      }
      if (record.studentStatus && record.studentStatus !== user.student?.status) {
        const change = await client.$transaction((tx) => applyStudentStatusChange(tx, user.id, record.studentStatus, { source: "sia" }));
        if (change.changed) {
          result.statusChanged += 1;
          await announceStudentStatusChange(change);
        }
      }
    } catch (err) {
      result.failed += 1;
      console.warn(`⚠️  SIA sync failed for NIM ${record.nim}:`, err.message);
    }
  }
  return result;
}

/**
 * Semester flags from the current courses. SIA's `period` must be NeoCentral's running academic
 * year; otherwise the flags are skipped (and counted) while the other data still went in.
 */
export async function syncPeriodFlags(period, records, capturedAt) {
  const withFlags = records.filter((r) => r.takesResearchMethod !== null || r.takesThesis !== null);
  const year = await resolveOperationalAcademicYear();
  const same = year && period && year.year === period.academicYear && year.semester === period.semester;
  if (!same) {
    return {
      created: 0,
      updated: 0,
      keptAdmin: 0,
      skipped: withFlags.length,
      mismatch: `data SIA ${periodLabel(period)}, NeoCentral ${year ? `${year.year} ${year.semester}` : "tanpa tahun ajaran aktif"}`,
    };
  }
  const rows = withFlags.map((r) => ({
    nim: r.nim,
    ...(r.takesResearchMethod !== null && { takesResearchMethod: r.takesResearchMethod }),
    ...(r.takesThesis !== null && { takesThesis: r.takesThesis }),
  }));
  const result = await applySiaEnrollments(year.id, rows, { capturedAt });
  return { created: result.created, updated: result.updated, keptAdmin: result.keptAdmin ?? 0, skipped: 0, mismatch: "" };
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
export async function updateStudentCplScoresBatch(records) {
  const rawRows = [];

  for (const record of records) {
    for (const scoreRow of record.cplScores) {
      rawRows.push({ nim: record.nim, name: record.name, row: scoreRow });
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

    // The description is optional in the contract; when sent it must match (a guard against a
    // code that means another CPL).
    const incomingDescription = item.row?.description ? normalizeDescription(item.row.description) : null;

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

    if (incomingDescription && normalizeDescription(selectedCpl.description) !== incomingDescription) {
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
