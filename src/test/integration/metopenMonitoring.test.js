/**
 * Integration test: Monitoring Koordinator Metopen — end-to-end DB live.
 *
 * Prerequisite: seed `prisma/seed-metopen-monitoring.mjs` SUDAH dijalankan.
 * Test ini TIDAK re-seed skenario edge case; ia memverifikasi behavior service
 * di atas data dummy yang sudah dipopulate.
 *
 * Monitoring wajib period-explicit (KC-20260731-02) dan roster-nya dibangun
 * fail-closed dari `StudentAcademicYearSnapshot`. Karena itu suite ini:
 *   1. me-resolve periode tempat fixture 2399 benar-benar hidup, lalu
 *   2. melengkapi snapshot periode itu untuk mahasiswa fixture bila belum ada,
 *      dan menghapus KEMBALI hanya baris yang ia buat sendiri di `afterAll`
 *      supaya state periode lain / data nyata tidak berubah.
 *
 * Usage:
 *   cd services
 *   node prisma/seed-metopen-monitoring.mjs  # seed pertama kali / refresh state
 *   npx vitest run src/test/integration/metopenMonitoring.test.js
 *
 * IMPORTANT: hits REAL database. Gunakan .env.test untuk environment terisolasi.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import prisma from "../../config/prisma.js";
import { getMetopenMonitoring } from "../../services/metopenMonitoring.service.js";
import { BadRequestError } from "../../utils/errors.js";

const FIXTURE_NIM_PREFIX = "2399";

let monitoringSnapshot = null;
let rowsByNim = new Map();
let unmatchedByNim = new Map();
let fixtureAcademicYearId = null;
/** Hanya snapshot yang DIBUAT test ini yang boleh dihapus lagi. */
let snapshotIdsCreatedByTest = [];

/**
 * Periode fixture = periode advisor request milik mahasiswa 2399 (seed memakai
 * periode aktif saat seed dijalankan, bukan konstanta yang bisa basi).
 */
async function resolveFixtureAcademicYearId() {
  const fixtureRequest = await prisma.thesisAdvisorRequest.findFirst({
    where: { student: { user: { identityNumber: { startsWith: FIXTURE_NIM_PREFIX } } } },
    orderBy: { createdAt: "desc" },
    select: { academicYearId: true },
  });
  if (!fixtureRequest?.academicYearId) {
    throw new Error(
      "[IT-MONITORING] Tidak menemukan advisor request fixture 2399. Run `node prisma/seed-metopen-monitoring.mjs` terlebih dahulu.",
    );
  }
  return fixtureRequest.academicYearId;
}

async function ensureFixtureSnapshots(academicYearId) {
  const students = await prisma.student.findMany({
    where: { user: { identityNumber: { startsWith: FIXTURE_NIM_PREFIX } } },
    select: {
      id: true,
      eligibleMetopen: true,
      researchMethodCompleted: true,
      takingThesisCourse: true,
    },
  });
  if (students.length === 0) {
    throw new Error(
      "[IT-MONITORING] Seed dummy belum dijalankan. Run `node prisma/seed-metopen-monitoring.mjs` terlebih dahulu.",
    );
  }

  const existing = await prisma.studentAcademicYearSnapshot.findMany({
    where: { academicYearId, studentId: { in: students.map((s) => s.id) } },
    select: { studentId: true },
  });
  const existingIds = new Set(existing.map((row) => row.studentId));

  const created = [];
  for (const student of students) {
    if (existingIds.has(student.id)) continue;
    const row = await prisma.studentAcademicYearSnapshot.create({
      data: {
        studentId: student.id,
        academicYearId,
        eligibleMetopen: student.eligibleMetopen ?? true,
        researchMethodCompleted: student.researchMethodCompleted ?? false,
        takingThesisCourse: student.takingThesisCourse ?? null,
        eligibilitySource: "sia",
        eligibilityCapturedAt: new Date(),
        capturedAt: new Date(),
      },
      select: { id: true },
    });
    created.push(row.id);
  }
  return created;
}

describe("IT: Metopen Monitoring service — edge case end-to-end", () => {
  beforeAll(async () => {
    fixtureAcademicYearId = await resolveFixtureAcademicYearId();
    snapshotIdsCreatedByTest = await ensureFixtureSnapshots(fixtureAcademicYearId);

    monitoringSnapshot = await getMetopenMonitoring({
      academicYearId: fixtureAcademicYearId,
    });
    rowsByNim = new Map(
      monitoringSnapshot.students.map((row) => [row.identityNumber, row]),
    );
    unmatchedByNim = new Map(
      monitoringSnapshot.unmatchedRecords.map((row) => [row.identityNumber, row]),
    );
  }, 120000);

  afterAll(async () => {
    if (snapshotIdsCreatedByTest.length === 0) return;
    await prisma.studentAcademicYearSnapshot.deleteMany({
      where: { id: { in: snapshotIdsCreatedByTest } },
    });
  }, 60000);

  it("kontrak periode: request tanpa academicYearId ditolak (KC-20260731-02)", async () => {
    await expect(getMetopenMonitoring()).rejects.toThrow(BadRequestError);
    await expect(getMetopenMonitoring({ academicYearId: "   " })).rejects.toThrow(
      /academicYearId wajib diisi/,
    );
  });

  it("snapshot dasar: menyajikan stats + attendanceImport + students[] + unmatchedRecords[]", () => {
    expect(monitoringSnapshot).toBeTruthy();
    expect(monitoringSnapshot.stats).toBeDefined();
    expect(Array.isArray(monitoringSnapshot.students)).toBe(true);
    expect(Array.isArray(monitoringSnapshot.unmatchedRecords)).toBe(true);
    // 19 mahasiswa eligible Metopen minimal (bisa lebih kalau DB sudah ada
    // data lain). Asumsi minimal 19 dari seed.
    expect(monitoringSnapshot.stats.totalEligibleSia).toBeGreaterThanOrEqual(19);
  });

  it("EC01 (no advisor): NIM 2399000001 → statusCategory='no_advisor'", () => {
    const row = rowsByNim.get("2399000001");
    expect(row).toBeDefined();
    expect(row.advisorRequest.statusCategory).toBe("no_advisor");
    expect(row.score.completeness).toBe("none");
  });

  it.each([
    ["2399000002", "pending_review"],
    ["2399000003", "pending_review"],
    ["2399000004", "pending_kadep"],
    ["2399000005", "pending_kadep"],
    ["2399000006", "active_pre_ta04"],
    ["2399000007", "active_pre_ta04"],
    ["2399000008", "active_pre_ta04"],
    ["2399000009", "rejected"],
    ["2399000010", "rejected"],
    ["2399000011", "withdrawn"],
  ])("EC02-EC11 advisor status mapping: NIM %s → category '%s'", (nim, expectedCategory) => {
    const row = rowsByNim.get(nim);
    expect(row, `NIM ${nim} should exist in students[]`).toBeDefined();
    expect(row.advisorRequest.statusCategory).toBe(expectedCategory);
  });

  it("EC04 (Path C): forwardedToKadepAt + forwardedByLecturer info terisi", () => {
    const row = rowsByNim.get("2399000004");
    expect(row.advisorRequest.routeType).toBe("escalated");
    expect(row.advisorRequest.forwardedToKadepAt).not.toBeNull();
  });

  it("EC05 (TA-02 dept): routeType='dept', requestType='ta_02', tanpa target lecturer", () => {
    const row = rowsByNim.get("2399000005");
    expect(row.advisorRequest.routeType).toBe("dept");
    expect(row.advisorRequest.requestType).toBe("ta_02");
    expect(row.advisorRequest.targetLecturerName).toBeNull();
  });

  it("EC07 (Overquota Sah): acceptedOverNormal=true terexposing", () => {
    const row = rowsByNim.get("2399000007");
    expect(row.advisorRequest.acceptedOverNormal).toBe(true);
  });

  it("EC08 (dual supervisor + partial TA-03A): P1 dan P2 terisi, score presentasi/konten ada", () => {
    const row = rowsByNim.get("2399000008");
    expect(row.supervisors.pembimbing1.fullName).toBeTruthy();
    expect(row.supervisors.pembimbing2.fullName).toBeTruthy();
    expect(row.score.presentasi).toBe(18);
    expect(row.score.proposalKonten).toBe(32);
    expect(row.score.proposalStruktur).toBeNull();
    expect(row.score.kemampuanRespon).toBeNull();
    expect(row.score.completeness).toBe("partial_ta03a");
  });

  it("EC12 (TA-03A only): 3 bucket TA-03A terisi, struktur null, completeness partial_ta03a", () => {
    const row = rowsByNim.get("2399000012");
    expect(row.score.presentasi).toBe(18);
    expect(row.score.proposalKonten).toBe(35);
    expect(row.score.kemampuanRespon).toBe(12);
    expect(row.score.proposalStruktur).toBeNull();
    expect(row.score.completeness).toBe("partial_ta03a");
  });

  it("EC13 (TA-03B only): hanya proposalStruktur terisi, completeness partial_ta03b", () => {
    const row = rowsByNim.get("2399000013");
    expect(row.score.proposalStruktur).toBe(20);
    expect(row.score.presentasi).toBeNull();
    expect(row.score.proposalKonten).toBeNull();
    expect(row.score.kemampuanRespon).toBeNull();
    expect(row.score.completeness).toBe("partial_ta03b");
  });

  it("EC14 (complete pending): 4 bucket terisi tapi belum publish (finalScore=null, completeness complete_pending)", () => {
    const row = rowsByNim.get("2399000014");
    expect(row.score.presentasi).toBe(19);
    expect(row.score.proposalKonten).toBe(38);
    expect(row.score.proposalStruktur).toBe(22);
    expect(row.score.kemampuanRespon).toBe(13);
    expect(row.score.finalScore).toBeNull();
    expect(row.score.completeness).toBe("complete_pending");
  });

  it("EC15 (published final): finalScore=92, isFinalized=true, completeness published", () => {
    const row = rowsByNim.get("2399000015");
    expect(row.score.finalScore).toBe(92);
    expect(row.score.isFinalized).toBe(true);
    expect(row.score.completeness).toBe("published");
  });

  it("EC16 (auto-zero): semua bucket = 0, completeness auto_zero, finalScore=0", () => {
    const row = rowsByNim.get("2399000016");
    expect(row.attendance?.isEligible).toBe(false);
    expect(row.score.presentasi).toBe(0);
    expect(row.score.proposalKonten).toBe(0);
    expect(row.score.proposalStruktur).toBe(0);
    expect(row.score.kemampuanRespon).toBe(0);
    expect(row.score.finalScore).toBe(0);
    expect(row.score.completeness).toBe("auto_zero");
    expect(row.score.attendanceAutoZeroedAt).not.toBeNull();
  });

  it("EC17 (borderline 75%): attendance.isEligible=true, advisor active, score belum (auto-zero TIDAK kena)", () => {
    const row = rowsByNim.get("2399000017");
    expect(row.attendance?.isEligible).toBe(true);
    expect(row.attendance?.attendancePercentage).toBeCloseTo(0.75, 4);
    expect(row.score.completeness).toBe("none");
  });

  it("EC18 (borderline 74.99%): attendance.isEligible=false → auto-zero kena", () => {
    const row = rowsByNim.get("2399000018");
    expect(row.attendance?.isEligible).toBe(false);
    expect(row.attendance?.attendancePercentage).toBeCloseTo(0.7499, 4);
    expect(row.score.completeness).toBe("auto_zero");
  });

  it("EC19 (missing from import): attendance=null, isInImport=false, advisor tetap muncul", () => {
    const row = rowsByNim.get("2399000019");
    expect(row.isInImport).toBe(false);
    expect(row.attendance).toBeNull();
    expect(row.advisorRequest.status).not.toBe("none"); // Has pending request
  });

  it("EC20 (unmatched): muncul di unmatchedRecords[] dengan identityNumber 9999900099", () => {
    const row = unmatchedByNim.get("9999900099");
    expect(row).toBeDefined();
    expect(row.isMatched).toBe(false);
    expect(row.attendance?.attendancePercentage).toBeCloseTo(1.0, 4);
  });

  it("roster terisi: tidak ada sebab kosong, snapshot count konsisten dengan students[]", () => {
    const { roster, students } = monitoringSnapshot;
    expect(roster.isEmpty).toBe(false);
    expect(roster.reasonCode).toBeNull();
    expect(roster.reason).toBeNull();
    expect(roster.snapshotEligible).toBe(students.length);
    expect(roster.periodLabel).toMatch(/(Ganjil|Genap)/);
  });

  it("sebab roster kosong: periode tanpa snapshot SIA mengembalikan 'sia_snapshot_missing', bukan pesan generik", async () => {
    const periodWithoutSnapshot = await prisma.academicYear.findFirst({
      where: { studentSnapshots: { none: {} } },
      select: { id: true },
    });
    if (!periodWithoutSnapshot) {
      throw new Error(
        "[IT-MONITORING] Butuh minimal 1 periode akademik tanpa snapshot SIA untuk menguji sebab roster kosong.",
      );
    }

    const out = await getMetopenMonitoring({ academicYearId: periodWithoutSnapshot.id });
    expect(out.students).toHaveLength(0);
    expect(out.roster.isEmpty).toBe(true);
    expect(out.roster.reasonCode).toBe("sia_snapshot_missing");
    expect(out.roster.snapshotTotal).toBe(0);
    expect(out.roster.reason).toContain("snapshot kelayakan SIA");
    expect(out.roster.actionHint).toContain("sinkronisasi data SIA");
  }, 60000);

  it("stats vs attendanceImport: satu payload tidak boleh saling membantah", () => {
    const { stats, attendanceImport } = monitoringSnapshot;
    expect(attendanceImport).not.toBeNull();
    expect(stats.import).not.toBeNull();

    expect(stats.import.totalRows).toBe(attendanceImport.totalRows);
    expect(stats.import.matchedRows).toBe(attendanceImport.matchedRows);
    expect(stats.import.eligibleRows).toBe(attendanceImport.eligibleRows);
    expect(stats.import.ineligibleRows).toBe(attendanceImport.ineligibleRows);
    expect(stats.import.autoZeroedCount).toBe(attendanceImport.autoZeroedCount);
    expect(stats.import.unmatchedRows).toBe(stats.unmatchedInImport);
    // Baris cocok dipecah menjadi yang ada di roster vs di luar roster, supaya
    // angka import yang lebih besar dari roster punya penjelasan.
    expect(stats.import.matchedInRoster).toBe(stats.totalInImport);
    expect(stats.import.matchedInRoster + stats.import.matchedOutsideRoster).toBe(
      stats.import.matchedRows,
    );
  });

  it("rekonsiliasi impor presensi: total = cocok + tidak dikenal = memenuhi + tidak memenuhi", () => {
    const { rowBreakdown } = monitoringSnapshot.attendanceImport;
    expect(rowBreakdown.countersMatchRecords).toBe(true);
    expect(rowBreakdown.matchedRows + rowBreakdown.unmatchedRows).toBe(rowBreakdown.totalRows);
    expect(rowBreakdown.eligibleRows + rowBreakdown.ineligibleRows).toBe(rowBreakdown.totalRows);
    expect(rowBreakdown.matchedEligibleRows + rowBreakdown.matchedIneligibleRows).toBe(
      rowBreakdown.matchedRows,
    );
    expect(rowBreakdown.unmatchedEligibleRows + rowBreakdown.unmatchedIneligibleRows).toBe(
      rowBreakdown.unmatchedRows,
    );
    // Auto-zero adalah subset baris cocok yang di bawah ambang.
    expect(monitoringSnapshot.attendanceImport.autoZeroedCount).toBeLessThanOrEqual(
      rowBreakdown.matchedIneligibleRows,
    );
  });

  it("periode impor presensi: label file yang beda periode terbaca di payload", () => {
    const { periodScope } = monitoringSnapshot.attendanceImport;
    expect(periodScope.requestedAcademicYearId).toBe(fixtureAcademicYearId);
    expect(periodScope.attachedToRequestedPeriod).toBe(true);
    if (periodScope.matchesRequestedPeriod === false) {
      expect(periodScope.mismatchReason).toContain(periodScope.sourceFileLabel);
      expect(periodScope.mismatchReason).toContain(periodScope.periodLabel);
    } else {
      expect(periodScope.mismatchReason).toBeNull();
    }
  });

  it("stats summary: agregasi numeric akurat berdasarkan 19 edge case", () => {
    const { stats } = monitoringSnapshot;
    // Minimal numbers (mungkin lebih dari ini kalau ada data lain di DB):
    expect(stats.totalEligibleSia).toBeGreaterThanOrEqual(19);
    expect(stats.unmatchedInImport).toBeGreaterThanOrEqual(1);
    expect(stats.advisorByCategory.no_advisor).toBeGreaterThanOrEqual(1);
    expect(stats.advisorByCategory.pending_review).toBeGreaterThanOrEqual(2);
    expect(stats.advisorByCategory.pending_kadep).toBeGreaterThanOrEqual(2);
    expect(stats.advisorByCategory.active_pre_ta04).toBeGreaterThanOrEqual(2);
    // Roster kini period-scoped: hanya kohort periode ini yang dihitung, jadi
    // batas bawah mengikuti jumlah promosi `active_official` di kohort fixture
    // (EC15), bukan seluruh mahasiswa `active_official` lintas periode.
    expect(stats.advisorByCategory.active_official).toBeGreaterThanOrEqual(1);
    expect(stats.advisorByCategory.rejected).toBeGreaterThanOrEqual(2);
    expect(stats.advisorByCategory.withdrawn).toBeGreaterThanOrEqual(1);
    expect(stats.scoreByCompleteness.published).toBeGreaterThanOrEqual(1);
    expect(stats.scoreByCompleteness.auto_zero).toBeGreaterThanOrEqual(2);
    expect(stats.scoreByCompleteness.complete_pending).toBeGreaterThanOrEqual(1);
  });

  it("stats summary = rekap ulang students[]: tidak ada kategori yang menyimpang dari barisnya", () => {
    const { stats, students } = monitoringSnapshot;
    const advisorFromRows = {};
    const scoreFromRows = {};
    for (const row of students) {
      const category = row.advisorRequest.statusCategory;
      advisorFromRows[category] = (advisorFromRows[category] ?? 0) + 1;
      const completeness = row.score.completeness;
      scoreFromRows[completeness] = (scoreFromRows[completeness] ?? 0) + 1;
    }

    for (const [category, count] of Object.entries(stats.advisorByCategory)) {
      expect(count, `advisorByCategory.${category}`).toBe(advisorFromRows[category] ?? 0);
    }
    for (const [completeness, count] of Object.entries(stats.scoreByCompleteness)) {
      expect(count, `scoreByCompleteness.${completeness}`).toBe(
        scoreFromRows[completeness] ?? 0,
      );
    }
    expect(
      Object.values(stats.advisorByCategory).reduce((sum, n) => sum + n, 0),
    ).toBe(stats.totalEligibleSia);
    expect(stats.totalInImport + stats.missingFromImport).toBe(stats.totalEligibleSia);
    expect(stats.attendanceEligible + stats.attendanceIneligible).toBe(stats.totalInImport);
  });
});
