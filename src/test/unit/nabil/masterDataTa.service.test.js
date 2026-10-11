/**
 * Unit Tests — Module 14: Data Master Tugas Akhir (Paket B, K21)
 *
 * Real service + lifecycle rules (thesisLifecycle.service) against the in-memory Prisma
 * stand-in, so the rules are checked on real rows:
 * one open thesis per student, K15 transitions, `failed` (reason, released supervisors,
 * cancelled open sessions), `on_leave` (previous status + start date, return only to it),
 * activity level derived (never an input), P1/P2 rules, replaced supervisors kept as "released",
 * and per-row import errors.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { store, resetDb, callsTo } from "./helpers/fakePrisma.js";

vi.mock("../../../config/prisma.js", async () => ({
  default: (await import("./helpers/fakePrisma.js")).prismaFake,
}));
// Quota recount reads the quota tables; its behaviour is covered elsewhere.
vi.mock("../../../utils/quotaSync.js", () => ({ syncQuotaCount: vi.fn().mockResolvedValue(undefined) }));

const {
  getAllThesesMasterData,
  createThesisMasterData,
  updateThesisMasterData,
  importThesesMasterData,
  parseThesisStatusCell,
} = await import("../../../services/masterDataTa.service.js");
const { THESIS_STATUS_TRANSITIONS, SYSTEM_CANCEL_REASON } = await import("../../../services/thesisLifecycle.service.js");

const lecturer = (id, fullName) => ({ id, user: { id: `u-${id}`, fullName } });

function buildState() {
  return {
    userRole: [
      { id: "r-p1", name: "Pembimbing 1" },
      { id: "r-p2", name: "Pembimbing 2" },
    ],
    academicYear: [{ id: "ay-1", year: "2026/2027", semester: "ganjil", isActive: true }],
    thesisTopic: [{ id: "topic-ml", name: "Machine Learning" }],
    lecturer: [lecturer("L1", "Dr. Satu"), lecturer("L2", "Dr. Dua"), lecturer("L3", "Dr. Tiga")],
    student: [
      { id: "S1", user: { identityNumber: "2211520001", fullName: "Mahasiswa Satu" } },
      { id: "S2", user: { identityNumber: "2211520002", fullName: "Mahasiswa Dua" } },
      { id: "S3", user: { identityNumber: "2211520003", fullName: "Mahasiswa Tiga" } },
    ],
    thesis: [
      // S1: running TA with P1 + P2 and open sessions
      { id: "T1", studentId: "S1", status: "research", rating: "SLOW", academicYearId: "ay-1", thesisTopicId: "topic-ml", title: "TA Satu" },
      // S3: proposal-phase thesis
      { id: "T3", studentId: "S3", status: "proposal", rating: "ONGOING", academicYearId: "ay-1", thesisTopicId: null, title: null },
    ],
    thesisSupervisors: [
      { id: "ts-1", thesisId: "T1", lecturerId: "L1", roleId: "r-p1", status: "active", activeRoleKey: "T1:r-p1" },
      { id: "ts-2", thesisId: "T1", lecturerId: "L2", roleId: "r-p2", status: "active", activeRoleKey: "T1:r-p2" },
    ],
    thesisGuidance: [
      { id: "g-req", thesisId: "T1", status: "requested" },
      { id: "g-acc", thesisId: "T1", status: "accepted" },
      { id: "g-sum", thesisId: "T1", status: "summary_pending" },
      { id: "g-rev", thesisId: "T1", status: "summary_rejected" },
      { id: "g-done", thesisId: "T1", status: "completed" },
      { id: "g-old", thesisId: "T1", status: "rescheduled" },
    ],
    auditLog: [],
  };
}

const thesisRow = (id) => store.state.thesis.find((t) => t.id === id);
// The in-memory store does not apply schema defaults; `status` defaults to "active".
const supRows = (thesisId) =>
  store.state.thesisSupervisors
    .filter((s) => s.thesisId === thesisId)
    .map((s) => ({ ...s, status: s.status ?? "active" }));
const guidance = (id) => store.state.thesisGuidance.find((g) => g.id === id);

beforeEach(() => {
  resetDb(buildState());
});

describe("getAllThesesMasterData", () => {
  it("maps rows with the derived activity level (only for a research thesis)", async () => {
    const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    store.state.thesis = [
      { id: "A", status: "completed", updatedAt: daysAgo(90), student: { user: {} }, thesisSupervisors: [] },
      // Edited yesterday (updatedAt), last completed session 90 days ago: the edit is not activity.
      {
        id: "B", status: "research", startDate: daysAgo(200), updatedAt: daysAgo(1), student: { user: {} }, thesisSupervisors: [],
        thesisGuidances: [{ status: "completed", phase: "research", approvedDate: daysAgo(90), completedAt: daysAgo(90) }],
      },
      { id: "C", status: "research", startDate: daysAgo(10), updatedAt: daysAgo(1), student: { user: {} }, thesisSupervisors: [] },
    ];
    const result = await getAllThesesMasterData();
    expect(result.find((r) => r.id === "A").activityLevel).toBeNull();
    expect(result.find((r) => r.id === "B").activityLevel).toBe("slow");
    expect(result.find((r) => r.id === "B").supervisionClock.evaluationDue).toBe("six_month");
    expect(result.find((r) => r.id === "C").activityLevel).toBe("active");
    expect(result[0]).not.toHaveProperty("rating");
  });
});

describe("K21 tambah TA", () => {
  it("membuat TA research dengan P1/P2 dan tahun ajaran aktif; rating/tenggat dari input diabaikan", async () => {
    const thesis = await createThesisMasterData(
      { studentId: "S2", title: "TA Dua", thesisTopicId: "topic-ml", pembimbing1: "L1", pembimbing2: "L3", rating: "AT_RISK", deadlineDate: "2030-01-01" },
      { actorUserId: "admin" },
    );
    expect(thesis).toMatchObject({ status: "research", academicYearId: "ay-1", thesisTopicId: "topic-ml" });
    expect(thesis).not.toHaveProperty("rating");
    expect(thesis).not.toHaveProperty("deadlineDate");
    expect(thesis.statusChangedAt).toBeInstanceOf(Date);
    expect(supRows(thesis.id).map((s) => [s.lecturerId, s.roleId, s.status])).toEqual([
      ["L1", "r-p1", "active"],
      ["L3", "r-p2", "active"],
    ]);
    expect(callsTo("auditLog", "create")).toHaveLength(1);
  });

  it("menolak TA kedua yang terbuka untuk mahasiswa yang sama (400) dan tidak menulis apa pun", async () => {
    await expect(createThesisMasterData({ studentId: "S1", pembimbing1: "L1" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(createThesisMasterData({ studentId: "S3", pembimbing1: "L1" })).rejects.toThrow(/Proposal/);
    expect(callsTo("thesis", "create")).toHaveLength(0);
  });

  it("P1 wajib dan P1 tidak boleh sama dengan P2", async () => {
    await expect(createThesisMasterData({ studentId: "S2" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(createThesisMasterData({ studentId: "S2", pembimbing1: "L1", pembimbing2: "L1" })).rejects.toMatchObject({ statusCode: 400 });
    expect(callsTo("thesis", "create")).toHaveLength(0);
  });

  it("topik yang tidak ada ditolak (400)", async () => {
    await expect(createThesisMasterData({ studentId: "S2", pembimbing1: "L1", thesisTopicId: "nope" })).rejects.toThrow(/Topik/);
  });

  it("TA baru tidak bisa langsung on_leave; failed butuh alasan", async () => {
    await expect(createThesisMasterData({ studentId: "S2", pembimbing1: "L1", status: "on_leave" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(createThesisMasterData({ studentId: "S2", pembimbing1: "L1", status: "failed" })).rejects.toThrow(/Alasan penghentian/);
  });

  it("TA lama yang sudah selesai tidak menghalangi TA baru", async () => {
    thesisRow("T1").status = "completed";
    const thesis = await createThesisMasterData({ studentId: "S1", pembimbing1: "L3" });
    expect(thesis.status).toBe("research");
  });
});

describe("K21/K15 ubah status", () => {
  it("tabel transisi K15", () => {
    expect(THESIS_STATUS_TRANSITIONS).toEqual({
      proposal: ["research", "on_leave", "failed"],
      research: ["on_leave", "completed", "failed"],
      on_leave: ["proposal", "research", "failed"],
      completed: [],
      failed: [],
    });
  });

  it("menolak transisi yang tidak diizinkan (400), tanpa menulis", async () => {
    await expect(updateThesisMasterData("T3", { status: "completed" })).rejects.toMatchObject({ statusCode: 400 });
    thesisRow("T1").status = "completed";
    await expect(updateThesisMasterData("T1", { status: "research" })).rejects.toThrow(/tidak dapat diubah lagi/);
    expect(callsTo("thesis", "update")).toHaveLength(0);
  });

  it("ke failed tanpa alasan ditolak (400): pembimbing dan sesi tidak tersentuh", async () => {
    await expect(updateThesisMasterData("T1", { status: "failed" })).rejects.toMatchObject({ statusCode: 400 });
    expect(thesisRow("T1").status).toBe("research");
    expect(supRows("T1").every((s) => s.status === "active")).toBe(true);
    expect(guidance("g-acc").status).toBe("accepted");
  });

  it("ke failed dengan alasan: kolom penghentian terisi, pembimbing released, sesi terbuka dibatalkan sistem", async () => {
    await updateThesisMasterData(
      "T1",
      { status: "failed", terminationReason: "dropped_out", terminationNote: "Tidak aktif 2 semester" },
      { actorUserId: "admin" },
    );
    const t = thesisRow("T1");
    expect(t).toMatchObject({ status: "failed", terminationReason: "dropped_out", terminationNote: "Tidak aktif 2 semester", terminatedByUserId: "admin" });
    expect(t.terminatedAt).toBeInstanceOf(Date);
    expect(t.statusChangedAt).toBeInstanceOf(Date);
    expect(supRows("T1").map((s) => [s.status, s.activeRoleKey])).toEqual([["released", null], ["released", null]]);
    for (const id of ["g-req", "g-acc", "g-sum", "g-rev", "g-old"]) {
      expect(guidance(id)).toMatchObject({ status: "cancelled", cancelledBy: "system", cancelReason: SYSTEM_CANCEL_REASON });
    }
    expect(guidance("g-done").status).toBe("completed");
    const audit = store.state.auditLog.find((a) => a.action === "THESIS_STATUS_CHANGED");
    expect(audit.changes.oldValues.status).toBe("research");
    expect(audit.changes.newValues).toMatchObject({ status: "failed", terminationReason: "dropped_out" });
  });

  it("alasan penghentian juga diterima dalam bentuk label", async () => {
    await updateThesisMasterData("T1", { status: "failed", terminationReason: "Mengundurkan diri" });
    expect(thesisRow("T1").terminationReason).toBe("withdrawn");
  });

  it("ke on_leave mencatat status sebelumnya dan tanggal mulai; kembali hanya ke status itu", async () => {
    await updateThesisMasterData("T1", { status: "on_leave" });
    expect(thesisRow("T1")).toMatchObject({ status: "on_leave", statusBeforeLeave: "research" });
    expect(thesisRow("T1").leaveStartedAt).toBeInstanceOf(Date);
    // pembimbing tetap melekat
    expect(supRows("T1").every((s) => s.status === "active")).toBe(true);

    await expect(updateThesisMasterData("T1", { status: "proposal" })).rejects.toThrow(/status sebelumnya/);
    await expect(updateThesisMasterData("T1", { status: "completed" })).rejects.toMatchObject({ statusCode: 400 });

    await updateThesisMasterData("T1", { status: "research" });
    expect(thesisRow("T1")).toMatchObject({ status: "research", statusBeforeLeave: null, leaveStartedAt: null });
  });

  it("startDate bisa diubah lewat data master; rating dari input diabaikan", async () => {
    await updateThesisMasterData("T1", { title: "Baru", rating: "ONGOING", startDate: "2025-01-15T00:00:00.000Z" });
    expect(thesisRow("T1")).toMatchObject({ title: "Baru", startDate: new Date("2025-01-15T00:00:00.000Z") });
    expect(thesisRow("T1").rating).toBe("SLOW"); // untouched fixture value, never written
  });

  it("kembali dari BSS menambah lama cuti ke totalLeaveDays", async () => {
    const leaveStartedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000 - 60_000);
    Object.assign(thesisRow("T1"), { status: "on_leave", statusBeforeLeave: "research", leaveStartedAt });
    await updateThesisMasterData("T1", { status: "research" });
    expect(thesisRow("T1")).toMatchObject({ status: "research", leaveStartedAt: null });
    expect(thesisRow("T1").totalLeaveDays).toEqual({ increment: 30 });
  });
});

describe("K21 topik dan pembimbing", () => {
  it("mengganti P2: relasi lama menjadi released (tidak dihapus), yang baru active", async () => {
    await updateThesisMasterData("T1", { pembimbing1: "L1", pembimbing2: "L3" });
    const rows = supRows("T1");
    expect(rows.find((s) => s.lecturerId === "L2")).toMatchObject({ status: "released", activeRoleKey: null });
    expect(rows.find((s) => s.lecturerId === "L3")).toMatchObject({ status: "active", roleId: "r-p2" });
    expect(rows.find((s) => s.lecturerId === "L1")).toMatchObject({ status: "active", roleId: "r-p1" });
    expect(callsTo("thesisSupervisors", "delete")).toHaveLength(0);
    expect(callsTo("thesisSupervisors", "deleteMany")).toHaveLength(0);
  });

  it("P1 = P2 ditolak; pembimbing TA yang sudah berakhir tidak bisa diubah", async () => {
    await expect(updateThesisMasterData("T1", { pembimbing1: "L1", pembimbing2: "L1" })).rejects.toMatchObject({ statusCode: 400 });
    thesisRow("T1").status = "completed";
    await expect(updateThesisMasterData("T1", { pembimbing1: "L3" })).rejects.toMatchObject({ statusCode: 400 });
  });

  it("topik bisa diisi dan diubah", async () => {
    await updateThesisMasterData("T3", { thesisTopicId: "topic-ml" });
    expect(thesisRow("T3").thesisTopicId).toBe("topic-ml");
  });
});

describe("K21 impor", () => {
  const row = (extra) => ({ NIM: "2211520002", "Pembimbing 1": "Dr. Satu", ...extra });

  it("baris gagal dilaporkan per baris, baris lain tetap diproses; kolom Aktivitas diabaikan", async () => {
    const result = await importThesesMasterData([
      row({ "Topik": "Machine Learning", "Aktivitas": "Berisiko", "Status": "Penelitian" }), // baris 2: buat baru
      { NIM: "2211520001", "Status": "Selesai" }, // baris 3: S1 research -> completed (boleh)
      { NIM: "9999999999" }, // baris 4: NIM tidak ada
      row({ NIM: "2211520003", "Status": "Gagal" }), // baris 5: S3 proposal -> failed tanpa alasan
      { NIM: "2211520003", "Status": "Entah" }, // baris 6: status tidak dikenal
      { NIM: "2211520003", "Pembimbing 1": "Dr. Tidak Ada" }, // baris 7: dosen tidak ada
    ]);
    expect(result).toMatchObject({ success: 1, updated: 1, failed: 4, ignoredColumns: ["Aktivitas"] });
    expect(result.errors.map((e) => e.split(":")[0])).toEqual(["Baris 4", "Baris 5", "Baris 6", "Baris 7"]);
    expect(result.errors[1]).toMatch(/Alasan penghentian/);

    const created = store.state.thesis.find((t) => t.studentId === "S2");
    expect(created).toMatchObject({ status: "research", thesisTopicId: "topic-ml" });
    expect(thesisRow("T1").status).toBe("completed");
    expect(thesisRow("T3").status).toBe("proposal");
  });

  it("impor status Gagal dengan alasan memakai aturan yang sama (pembimbing dilepas)", async () => {
    const result = await importThesesMasterData([{ NIM: "2211520001", "Status": "Gagal", "Alasan Penghentian": "Drop out" }]);
    expect(result).toMatchObject({ updated: 1, failed: 0 });
    expect(thesisRow("T1")).toMatchObject({ status: "failed", terminationReason: "dropped_out" });
    expect(supRows("T1").every((s) => s.status === "released")).toBe(true);
  });
});

describe("import cell parsing", () => {
  it("parses status from enum value, Indonesian label, or legacy name", () => {
    expect(parseThesisStatusCell("on_leave")).toBe("on_leave");
    expect(parseThesisStatusCell("Penelitian")).toBe("research");
    expect(parseThesisStatusCell("Berhenti Studi Sementara (BSS)")).toBe("on_leave");
    expect(parseThesisStatusCell("Lulus")).toBe("completed");
    expect(parseThesisStatusCell("-")).toBeNull();
    expect(parseThesisStatusCell("entah")).toBeNull();
  });
});
