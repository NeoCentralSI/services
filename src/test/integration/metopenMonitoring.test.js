/**
 * Integration test: Monitoring Koordinator Metopen — end-to-end DB live.
 *
 * Prerequisite: seed `prisma/seed-metopen-monitoring.mjs` SUDAH dijalankan.
 * Test ini TIDAK re-seed; ia memverifikasi behavior service di atas data dummy
 * yang sudah dipopulate.
 *
 * Usage:
 *   cd services
 *   node prisma/seed-metopen-monitoring.mjs  # seed pertama kali / refresh state
 *   npx vitest run --config vitest.integration.config.js src/test/integration/metopenMonitoring.test.js
 *
 * IMPORTANT: hits REAL database. Gunakan .env.test untuk environment terisolasi.
 */

import { describe, it, expect, beforeAll } from "vitest";
import prisma from "../../config/prisma.js";
import { getMetopenMonitoring } from "../../services/metopenMonitoring.service.js";

let monitoringSnapshot = null;
let rowsByNim = new Map();
let unmatchedByNim = new Map();

describe("IT: Metopen Monitoring service — edge case end-to-end", () => {
  beforeAll(async () => {
    // Pastikan ada minimal 1 mahasiswa dummy NIM 2399 (seed sudah jalan).
    const hasSeed = await prisma.student.findFirst({
      where: { user: { identityNumber: { startsWith: "2399" } } },
      select: { id: true },
    });
    if (!hasSeed) {
      throw new Error(
        "[IT-MONITORING] Seed dummy belum dijalankan. Run `node prisma/seed-metopen-monitoring.mjs` terlebih dahulu.",
      );
    }

    monitoringSnapshot = await getMetopenMonitoring();
    rowsByNim = new Map(
      monitoringSnapshot.students.map((row) => [row.identityNumber, row]),
    );
    unmatchedByNim = new Map(
      monitoringSnapshot.unmatchedRecords.map((row) => [row.identityNumber, row]),
    );
  }, 60000);

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
    ["2399000008", "active_official"],
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

  it("stats summary: agregasi numeric akurat berdasarkan 19 edge case", () => {
    const { stats } = monitoringSnapshot;
    // Minimal numbers (mungkin lebih dari ini kalau ada data lain di DB):
    expect(stats.totalEligibleSia).toBeGreaterThanOrEqual(19);
    expect(stats.unmatchedInImport).toBeGreaterThanOrEqual(1);
    expect(stats.advisorByCategory.no_advisor).toBeGreaterThanOrEqual(1);
    expect(stats.advisorByCategory.pending_review).toBeGreaterThanOrEqual(2);
    expect(stats.advisorByCategory.pending_kadep).toBeGreaterThanOrEqual(2);
    expect(stats.advisorByCategory.active_pre_ta04).toBeGreaterThanOrEqual(2);
    expect(stats.advisorByCategory.active_official).toBeGreaterThanOrEqual(2);
    expect(stats.advisorByCategory.rejected).toBeGreaterThanOrEqual(2);
    expect(stats.advisorByCategory.withdrawn).toBeGreaterThanOrEqual(1);
    expect(stats.scoreByCompleteness.published).toBeGreaterThanOrEqual(1);
    expect(stats.scoreByCompleteness.auto_zero).toBeGreaterThanOrEqual(2);
    expect(stats.scoreByCompleteness.complete_pending).toBeGreaterThanOrEqual(1);
  });
});
