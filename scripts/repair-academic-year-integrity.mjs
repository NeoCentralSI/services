import prisma from "../src/config/prisma.js";

const APPLY = process.argv.includes("--apply");

function periodLabel(row) {
  return `${row.year ?? "<null>"} ${row.semester} (${row.id})`;
}

function compareCanonicalCandidate(left, right) {
  const leftComplete = Number(Boolean(left.startDate && left.endDate));
  const rightComplete = Number(Boolean(right.startDate && right.endDate));
  if (leftComplete !== rightComplete) return rightComplete - leftComplete;
  if (left.isActive !== right.isActive) return Number(right.isActive) - Number(left.isActive);
  return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
}

async function assertNoUniqueChildConflict(tx, delegateName, duplicateId, canonicalId, uniqueFields) {
  const delegate = tx[delegateName];
  const duplicateRows = await delegate.findMany({ where: { academicYearId: duplicateId } });

  for (const duplicateRow of duplicateRows) {
    const where = { academicYearId: canonicalId };
    for (const field of uniqueFields) where[field] = duplicateRow[field];
    const canonicalRow = await delegate.findFirst({ where });
    if (!canonicalRow) continue;

    throw new Error(
      `Tidak dapat menggabungkan periode: konflik ${delegateName} untuk ${JSON.stringify(where)}`,
    );
  }
}

async function mergeSingletonConfig(tx, delegateName, duplicateId, canonicalId, comparableFields) {
  const duplicateRow = await tx[delegateName].findUnique({
    where: { academicYearId: duplicateId },
  });
  if (!duplicateRow) return;

  const canonicalRow = await tx[delegateName].findUnique({
    where: { academicYearId: canonicalId },
  });
  if (!canonicalRow) {
    await tx[delegateName].update({
      where: { academicYearId: duplicateId },
      data: { academicYearId: canonicalId },
    });
    return;
  }

  const same = comparableFields.every((field) => duplicateRow[field] === canonicalRow[field]);
  if (!same) {
    throw new Error(
      `Konfigurasi ${delegateName} berbeda antara periode duplikat; gabungan otomatis dibatalkan`,
    );
  }
  await tx[delegateName].delete({ where: { academicYearId: duplicateId } });
}

async function mergeLecturerQuotas(tx, duplicateId, canonicalId) {
  const rows = await tx.lecturerSupervisionQuota.findMany({
    where: { academicYearId: duplicateId },
  });

  for (const row of rows) {
    const existing = await tx.lecturerSupervisionQuota.findUnique({
      where: {
        lecturerId_academicYearId: {
          lecturerId: row.lecturerId,
          academicYearId: canonicalId,
        },
      },
    });
    if (!existing) {
      await tx.lecturerSupervisionQuota.update({
        where: { id: row.id },
        data: { academicYearId: canonicalId },
      });
      continue;
    }

    const same =
      existing.quotaMax === row.quotaMax &&
      existing.quotaSoftLimit === row.quotaSoftLimit &&
      existing.currentCount === row.currentCount &&
      (existing.notes ?? null) === (row.notes ?? null);
    if (!same) {
      throw new Error(
        `Kuota dosen ${row.lecturerId} berbeda pada periode duplikat; gabungan otomatis dibatalkan`,
      );
    }
    await tx.lecturerSupervisionQuota.delete({ where: { id: row.id } });
  }
}

async function mergeAcademicYear(duplicate, canonical) {
  await prisma.$transaction(async (tx) => {
    await mergeSingletonConfig(
      tx,
      "metopenScoreComposition",
      duplicate.id,
      canonical.id,
      ["ta03aCap", "ta03bCap"],
    );
    await mergeSingletonConfig(
      tx,
      "supervisionQuotaDefault",
      duplicate.id,
      canonical.id,
      ["quotaMax", "quotaSoftLimit"],
    );
    await mergeLecturerQuotas(tx, duplicate.id, canonical.id);

    await assertNoUniqueChildConflict(
      tx,
      "thesisCpmk",
      duplicate.id,
      canonical.id,
      ["code"],
    );
    await assertNoUniqueChildConflict(
      tx,
      "thesisSeminarRequirement",
      duplicate.id,
      canonical.id,
      ["code"],
    );
    await assertNoUniqueChildConflict(
      tx,
      "thesisDefenceRequirement",
      duplicate.id,
      canonical.id,
      ["code"],
    );
    await assertNoUniqueChildConflict(
      tx,
      "ta04Batch",
      duplicate.id,
      canonical.id,
      ["version"],
    );

    const simpleUpdates = [
      ["cpmk", "academicYearId"],
      ["thesisCpmk", "academicYearId"],
      ["metopenCpmk", "academicYearId"],
      ["thesisSeminarRequirement", "academicYearId"],
      ["thesisDefenceRequirement", "academicYearId"],
      ["yudisium", "academicYearId"],
      ["internshipProposal", "academicYearId"],
      ["internshipGuidanceQuestion", "academicYearId"],
      ["internshipGuidanceLecturerCriteria", "academicYearId"],
      ["internshipCpmk", "academicYearId"],
      ["ta04Batch", "academicYearId"],
      ["metopenAttendanceImport", "academicYearId"],
    ];

    for (const [delegateName, field] of simpleUpdates) {
      await tx[delegateName].updateMany({
        where: { [field]: duplicate.id },
        data: { [field]: canonical.id },
      });
    }

    await tx.thesis.updateMany({
      where: { academicYearId: duplicate.id },
      data: { academicYearId: canonical.id },
    });
    await tx.thesis.updateMany({
      where: { ta04AssignmentAcademicYearId: duplicate.id },
      data: { ta04AssignmentAcademicYearId: canonical.id },
    });
    await tx.thesis.updateMany({
      where: { activeAcademicYearId: duplicate.id },
      data: { activeAcademicYearId: canonical.id },
    });
    await tx.thesisAdvisorRequest.updateMany({
      where: { academicYearId: duplicate.id },
      data: { academicYearId: canonical.id },
    });
    await tx.thesisAdvisorRequest.updateMany({
      where: { releasedAcademicYearId: duplicate.id },
      data: { releasedAcademicYearId: canonical.id },
    });

    await tx.academicYear.delete({ where: { id: duplicate.id } });
  });
}

async function main() {
  const years = await prisma.academicYear.findMany({
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
  });

  const groups = new Map();
  for (const year of years) {
    const key = `${year.year ?? "<null>"}::${year.semester}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(year);
    groups.set(key, bucket);
  }

  const duplicatePlans = [];
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const sorted = [...rows].sort(compareCanonicalCandidate);
    duplicatePlans.push({
      canonical: sorted[0],
      duplicates: sorted.slice(1),
    });
  }

  const nullBoundaries = years.filter(
    (year) => !year.year || !year.startDate || !year.endDate,
  );
  const activeRows = years.filter((year) => year.isActive);

  const dated = years
    .filter((year) => year.startDate && year.endDate)
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  const overlaps = [];
  for (let index = 1; index < dated.length; index += 1) {
    const previous = dated[index - 1];
    const current = dated[index];
    if (new Date(previous.endDate) >= new Date(current.startDate)) {
      overlaps.push({ previous, current });
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        duplicateGroups: duplicatePlans.map((plan) => ({
          canonical: periodLabel(plan.canonical),
          duplicates: plan.duplicates.map(periodLabel),
        })),
        nullBoundaries: nullBoundaries.map(periodLabel),
        activeRows: activeRows.map(periodLabel),
        overlaps: overlaps.map(({ previous, current }) => ({
          previous: periodLabel(previous),
          previousEnd: previous.endDate,
          current: periodLabel(current),
          currentStart: current.startDate,
        })),
      },
      null,
      2,
    ),
  );

  if (!APPLY) return;

  for (const plan of duplicatePlans) {
    for (const duplicate of plan.duplicates) {
      await mergeAcademicYear(duplicate, plan.canonical);
      console.log(
        `Merged duplicate ${periodLabel(duplicate)} -> ${periodLabel(plan.canonical)}`,
      );
    }
  }

  const remaining = await prisma.academicYear.findMany({
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
  });
  const invalid = remaining.filter(
    (year) => !year.year || !year.startDate || !year.endDate,
  );
  if (invalid.length > 0) {
    throw new Error(
      `Masih ada periode tanpa identitas/tanggal lengkap: ${invalid.map(periodLabel).join(", ")}`,
    );
  }

  const activeCandidates = remaining.filter((year) => year.isActive);
  if (activeCandidates.length > 1) {
    const winner = [...activeCandidates].sort(compareCanonicalCandidate)[0];
    await prisma.academicYear.updateMany({
      where: { id: { not: winner.id }, isActive: true },
      data: { isActive: false },
    });
    console.log(`Kept single active period: ${periodLabel(winner)}`);
  }

  const ordered = [...remaining].sort(
    (a, b) => new Date(a.startDate) - new Date(b.startDate),
  );
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (new Date(previous.endDate) < new Date(current.startDate)) continue;

    const repairedEnd = new Date(new Date(current.startDate).getTime() - 1);
    if (repairedEnd < new Date(previous.startDate)) {
      throw new Error(
        `Overlap ${periodLabel(previous)} dan ${periodLabel(current)} tidak dapat diperbaiki otomatis`,
      );
    }
    await prisma.academicYear.update({
      where: { id: previous.id },
      data: { endDate: repairedEnd },
    });
    console.log(
      `Adjusted ${periodLabel(previous)} endDate to ${repairedEnd.toISOString()} before ${periodLabel(current)}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
