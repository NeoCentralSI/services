/**
 * Guidance revival — correction round regression tests (service level).
 *
 * Real services + real repositories; only Prisma is replaced by an in-memory store
 * that evaluates the actual `where` filters (see helpers/fakePrisma.js). Side-effect
 * integrations (FCM, calendar, in-app notification rows) are stubbed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildState } from "./helpers/guidanceFixtures.js";
import { store, resetDb, callsTo } from "./helpers/fakePrisma.js";

vi.mock("../../../config/prisma.js", async () => ({
  default: (await import("./helpers/fakePrisma.js")).prismaFake,
}));
vi.mock("../../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }),
}));
vi.mock("../../../repositories/notification.repository.js", async (importOriginal) => ({
  ...(await importOriginal()),
  createNotification: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../../services/outlook-calendar.service.js", () => ({
  createGuidanceCalendarEvent: vi.fn().mockResolvedValue({ supervisorEventId: null, studentEventId: null }),
  deleteCalendarEvent: vi.fn().mockResolvedValue(undefined),
}));

const student = await import("../../../services/thesisGuidance/student.guidance.service.js");
const lecturer = await import("../../../services/thesisGuidance/lecturer.guidance.service.js");
const milestone = await import("../../../services/thesisGuidance/milestone.service.js");
const monitoring = await import("../../../services/thesisGuidance/monitoring.service.js");

const guidanceRow = (id) => store.state.thesisGuidance.find((g) => g.id === id);
const milestoneRow = (id) => store.state.thesisMilestone.find((m) => m.id === id);

beforeEach(() => {
  resetDb(buildState());
});

describe("1. Sesi tidak bisa diselesaikan mahasiswa tanpa persetujuan pembimbing", () => {
  it("markSessionCompleteService ditolak 410 dan tidak menulis ke database", async () => {
    await expect(
      student.markSessionCompleteService("stu1", "g-acc", { sessionSummary: "Selesai sendiri" }),
    ).rejects.toMatchObject({ statusCode: 410 });
    expect(guidanceRow("g-acc").status).toBe("accepted");
    expect(callsTo("thesisGuidance", "update")).toHaveLength(0);
  });

  it("alur resmi: pengajuan → disetujui P1 → ringkasan → disetujui P1 → completed", async () => {
    await lecturer.approveGuidanceService("p1", "g-req", {});
    expect(guidanceRow("g-req").status).toBe("accepted");

    await student.submitSessionSummaryService("stu1", "g-req", { sessionSummary: "Bahas bab 2" });
    expect(guidanceRow("g-req").status).toBe("summary_pending");

    await lecturer.approveSessionSummaryService("p1", "g-req");
    expect(guidanceRow("g-req").status).toBe("completed");
  });

  it("pembimbing 2 aktif dapat menyetujui ringkasan sesinya sendiri", async () => {
    await lecturer.approveSessionSummaryService("p2", "g-pend-p2");
    expect(guidanceRow("g-pend-p2").status).toBe("completed");
  });
});

describe("2. Milestone tidak bisa diselesaikan langsung oleh mahasiswa", () => {
  it("PATCH /student/progress/complete (service) ditolak 410 tanpa updateMany", async () => {
    await expect(
      student.completeProgressComponentsService("stu1", ["m-progress"], new Date()),
    ).rejects.toMatchObject({ statusCode: 410 });
    expect(milestoneRow("m-progress").status).toBe("in_progress");
    expect(callsTo("thesisMilestone", "updateMany")).toHaveLength(0);
  });

  it("jalur dosen /lecturer/progress/:id/approve juga ditutup (410), termasuk untuk P1", async () => {
    await expect(
      lecturer.approveStudentProgressComponentsService("p1", "stu1", ["tpl-1"]),
    ).rejects.toMatchObject({ statusCode: 410 });
    expect(callsTo("thesisMilestone", "updateMany")).toHaveLength(0);
  });

  it("progres 100% dari mahasiswa masuk pending_review, bukan completed", async () => {
    const result = await milestone.updateMilestoneProgress("m-progress", "stu1", 100);
    expect(result.statusUpdated).toBe("pending_review");
    expect(milestoneRow("m-progress").status).toBe("pending_review");
    expect(milestoneRow("m-progress").validatedBy).toBeNull();
  });

  it("mahasiswa tidak bisa mengubah status milestone menjadi completed", async () => {
    await expect(
      milestone.updateMilestoneStatus("m-progress", "stu1", "completed"),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(milestoneRow("m-progress").status).toBe("in_progress");
  });

  it("mahasiswa tidak bisa memvalidasi milestone sendiri", async () => {
    await expect(milestone.validateMilestone("m-review", "stu1")).rejects.toMatchObject({ statusCode: 403 });
    expect(milestoneRow("m-review").status).toBe("pending_review");
  });
});

describe("3. Validasi milestone dan relasi pembimbing aktif", () => {
  it("Pembimbing 1 aktif dapat memvalidasi", async () => {
    await milestone.validateMilestone("m-review", "p1", "OK");
    expect(milestoneRow("m-review").status).toBe("completed");
  });

  it.each([
    ["Pembimbing 2 aktif", "p2"],
    ["mantan P1 released", "rel"],
    ["mantan P1 terminated", "term"],
    ["dosen tidak terkait", "other"],
  ])("%s ditolak (403)", async (_label, userId) => {
    await expect(milestone.validateMilestone("m-review", userId)).rejects.toMatchObject({ statusCode: 403 });
    expect(milestoneRow("m-review").status).toBe("pending_review");
  });

  it("mantan pembimbing tetap bisa membaca milestone (akses histori), tanpa kewenangan aksi", async () => {
    const result = await milestone.getMilestones("t1", "rel");
    expect(result).toBeTruthy();
    await expect(milestone.requestRevision("m-review", "rel", "revisi")).rejects.toMatchObject({ statusCode: 403 });
  });

  it.each([
    ["released", "rel", "g-pend-rel"],
    ["terminated", "term", "g-pend-term"],
  ])("pembimbing %s tidak bisa menyetujui ringkasan sesi miliknya", async (_label, userId, guidanceId) => {
    await expect(lecturer.approveSessionSummaryService(userId, guidanceId)).rejects.toMatchObject({ statusCode: 403 });
    expect(guidanceRow(guidanceId).status).toBe("summary_pending");
  });

  it("dosen tidak terkait tidak menemukan sesi milik dosen lain (404)", async () => {
    await expect(lecturer.approveSessionSummaryService("other", "g-pend-p1")).rejects.toMatchObject({ statusCode: 404 });
    expect(guidanceRow("g-pend-p1").status).toBe("summary_pending");
  });

  it("pembimbing released tidak bisa membatalkan sesi yang masih tercatat atas namanya", async () => {
    await expect(
      lecturer.cancelGuidanceByLecturerService("rel", "g-acc-rel", { reason: "x" }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(guidanceRow("g-acc-rel").status).toBe("accepted");
  });

  it("pembimbing released tidak bisa mengirim peringatan dari halaman dosen", async () => {
    await expect(lecturer.sendWarningNotificationService("rel", "t1", "slow")).rejects.toMatchObject({
      statusCode: 403,
    });
    await expect(lecturer.sendWarningNotificationService("p1", "t1", "slow")).resolves.toBeTruthy();
  });
});

describe("4. Peringatan monitoring: GKM saja tidak berwenang", () => {
  it.each([
    ["GKM saja", "gkm"],
    ["Sekdep saja", "sekdep"],
    ["pembimbing released", "rel"],
    ["pembimbing terminated", "term"],
  ])("%s ditolak (403)", async (_label, userId) => {
    await expect(monitoring.sendWarningNotificationService(userId, "t1", "slow")).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it.each([
    ["Ketua Departemen", "kadep"],
    ["Pembimbing 1 aktif", "p1"],
  ])("%s diizinkan", async (_label, userId) => {
    await expect(monitoring.sendWarningNotificationService(userId, "t1", "slow")).resolves.toMatchObject({
      success: true,
    });
  });

  it("peringatan massal: duplikat ID tidak meloloskan / menggagalkan pembimbing aktif; GKM ditolak", async () => {
    await expect(
      monitoring.sendBatchWarningNotificationService("p1", ["t1", "t1"], "slow"),
    ).resolves.toBeTruthy();
    await expect(
      monitoring.sendBatchWarningNotificationService("gkm", ["t1"], "slow"),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      monitoring.sendBatchWarningNotificationService("rel", ["t1"], "slow"),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("5. Kompatibilitas status sesi lama", () => {
  it("summary_rejected: mahasiswa dapat merevisi dan mengirim ulang, lalu menunggu dosen", async () => {
    await student.submitSessionSummaryService("stu1", "g-rej", { sessionSummary: "Ringkasan revisi" });
    expect(guidanceRow("g-rej").status).toBe("summary_pending");
    expect(guidanceRow("g-rej").sessionSummary).toBe("Ringkasan revisi");
  });

  it("summary_rejected muncul di daftar perlu ringkasan dan tidak dihitung selesai", async () => {
    const result = await student.getGuidancesNeedingSummaryService("stu1");
    const ids = JSON.stringify(result);
    expect(ids).toContain("g-rej");
    expect(guidanceRow("g-rej").status).not.toBe("completed");
  });

  // Paket B (K19): legacy "rescheduled" is treated exactly like "accepted".
  it("rescheduled: diperlakukan seperti accepted, jadi bisa diisi ringkasan", async () => {
    await student.submitSessionSummaryService("stu1", "g-resch", { sessionSummary: "x" });
    expect(guidanceRow("g-resch").status).toBe("summary_pending");
  });

  it("rescheduled: mahasiswa dapat membatalkan dengan alasan; record disimpan sebagai cancelled", async () => {
    await expect(student.cancelGuidanceService("stu1", "g-resch", "")).rejects.toMatchObject({ statusCode: 400 });
    await student.cancelGuidanceService("stu1", "g-resch", "Jadwal baru tidak cocok");
    expect(guidanceRow("g-resch").status).toBe("cancelled");
  });

  it("rescheduled: pembimbing aktif terkait dapat membatalkan", async () => {
    await lecturer.cancelGuidanceByLecturerService("p1", "g-resch", { reason: "Berhalangan" });
    expect(guidanceRow("g-resch").status).toBe("cancelled");
  });

  it("status lama tidak bisa disetujui ringkasannya tanpa melewati summary_pending", async () => {
    // Paket B (K19): the status guard answers 400 with labels instead of a 404 lookup miss.
    await expect(lecturer.approveSessionSummaryService("p1", "g-rej")).rejects.toMatchObject({ statusCode: 400 });
    await expect(lecturer.approveSessionSummaryService("p1", "g-resch")).rejects.toMatchObject({ statusCode: 400 });
    expect(guidanceRow("g-rej").status).toBe("summary_rejected");
    expect(guidanceRow("g-resch").status).toBe("rescheduled");
  });
});

describe("6. Jumlah sesi selesai dan kesiapan seminar", () => {
  beforeEach(() => {
    store.state.thesisMilestone.forEach((m) => {
      m.status = "completed";
      m.progressPercentage = 100;
    });
  });

  it("7 sesi completed (status lain tidak dihitung) → persetujuan seminar ditolak", async () => {
    await expect(milestone.approveSeminarReadiness("t1", "p1")).rejects.toMatchObject({ statusCode: 400 });
    expect(store.state.thesisSupervisors.find((s) => s.id === "ts-p1").seminarReady).toBe(false);
  });

  it("8 sesi completed → P1 aktif dapat menyetujui; released/terminated tidak", async () => {
    await lecturer.approveSessionSummaryService("p1", "g-pend-p1"); // completed #8
    await expect(milestone.approveSeminarReadiness("t1", "rel")).rejects.toMatchObject({ statusCode: 403 });
    await expect(milestone.approveSeminarReadiness("t1", "term")).rejects.toMatchObject({ statusCode: 403 });
    await milestone.approveSeminarReadiness("t1", "p1");
    expect(store.state.thesisSupervisors.find((s) => s.id === "ts-p1").seminarReady).toBe(true);
    expect(store.state.thesisSupervisors.find((s) => s.id === "ts-rel").seminarReady).toBe(false);
  });
});
