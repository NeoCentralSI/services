/**
 * Paket B: guidance session lifecycle (K19) and milestone lifecycle (K20).
 *
 * Real services + repositories over the in-memory Prisma stand-in (helpers/fakePrisma.js),
 * so each transition is checked against stored rows: allowed source status, the actor,
 * the active supervisor relation, and thesis status `research`. Error messages must not
 * leak raw enum values.
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
const calendar = vi.hoisted(() => ({
  createGuidanceCalendarEvent: vi.fn().mockResolvedValue({ supervisorEventId: null, studentEventId: null }),
  deleteCalendarEvent: vi.fn().mockResolvedValue(undefined),
  updateCalendarEvent: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../../services/outlook-calendar.service.js", () => calendar);

const student = await import("../../../services/thesisGuidance/student.guidance.service.js");
const lecturer = await import("../../../services/thesisGuidance/lecturer.guidance.service.js");
const milestone = await import("../../../services/thesisGuidance/milestone.service.js");
const { createNotificationsForUsers } = await import("../../../services/notification.service.js");

const RAW_GUIDANCE = /\b(requested|accepted|rescheduled|summary_pending|summary_rejected|completed|cancelled|rejected)\b/;
const RAW_MILESTONE = /\b(not_started|in_progress|pending_review|revision_needed|completed)\b/;
const g = (id) => store.state.thesisGuidance.find((x) => x.id === id);
const m = (id) => store.state.thesisMilestone.find((x) => x.id === id);
const future = (days = 3, hour = 10) => {
  const d = new Date(Date.now() + days * 24 * 3600 * 1000);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};

/** Expect a 400 whose message uses labels, not raw enum values. */
async function rejects400(promise, raw = RAW_GUIDANCE) {
  const err = await promise.then(
    () => null,
    (e) => e,
  );
  expect(err, "expected the call to be rejected").not.toBeNull();
  expect(err.statusCode).toBe(400);
  expect(err.message).not.toMatch(raw);
  return err;
}

beforeEach(() => {
  resetDb(buildState());
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("K19 mahasiswa: ubah jadwal dan batal", () => {
  it("ubah jadwal hanya selama requested", async () => {
    const when = future();
    await student.rescheduleGuidanceService("stu1", "g-req", when, "jadwal baru");
    expect(new Date(g("g-req").requestedDate).getTime()).toBe(when.getTime());
    expect(g("g-req").status).toBe("requested");

    await rejects400(student.rescheduleGuidanceService("stu1", "g-acc", future(4), "x"));
  });

  it("batal requested: alasan wajib, baris disimpan sebagai cancelled oleh mahasiswa", async () => {
    await rejects400(student.cancelGuidanceService("stu1", "g-req", "  "));
    await student.cancelGuidanceService("stu1", "g-req", "Berhalangan");
    expect(g("g-req")).toMatchObject({ status: "cancelled", cancelReason: "Berhalangan", cancelledBy: "student" });
    expect(g("g-req").cancelledAt).toBeInstanceOf(Date);
    expect(callsTo("thesisGuidance", "delete")).toHaveLength(0);
  });

  it("batal accepted dan rescheduled lama: boleh dengan alasan", async () => {
    await student.cancelGuidanceService("stu1", "g-acc", "Sakit");
    await student.cancelGuidanceService("stu1", "g-resch", "Sakit");
    expect(g("g-acc").status).toBe("cancelled");
    expect(g("g-resch").status).toBe("cancelled");
  });

  it("batal ditolak untuk summary_pending / completed", async () => {
    await rejects400(student.cancelGuidanceService("stu1", "g-pend-p1", "x"));
    await rejects400(student.cancelGuidanceService("stu1", "g-done-1", "x"));
  });
});

describe("K19 dosen: tolak, setujui, ubah jadwal, batal", () => {
  it("tolak: alasan wajib; usulan waktu disimpan; status asal harus requested", async () => {
    await rejects400(lecturer.rejectGuidanceService("p1", "g-req", { reason: " " }));
    const suggested = future(5);
    await lecturer.rejectGuidanceService("p1", "g-req", { reason: "Bentrok rapat", suggestedDate: suggested });
    expect(g("g-req")).toMatchObject({ status: "rejected", rejectionReason: "Bentrok rapat" });
    expect(new Date(g("g-req").suggestedDate).getTime()).toBe(suggested.getTime());
    expect(createNotificationsForUsers.mock.calls.at(-1)[1].message).toMatch(/Usulan waktu lain/);
    expect(store.state.auditLog.some((a) => a.action === "GUIDANCE_REJECTED")).toBe(true);

    await rejects400(lecturer.rejectGuidanceService("p1", "g-acc", { reason: "x" }));
  });

  it("tolak: usulan waktu di masa lalu ditolak", async () => {
    await rejects400(lecturer.rejectGuidanceService("p1", "g-req", { reason: "x", suggestedDate: new Date("2020-01-01") }));
    expect(g("g-req").status).toBe("requested");
  });

  it("setujui: requested -> accepted; dari status lain 400", async () => {
    await lecturer.approveGuidanceService("p1", "g-req", {});
    expect(g("g-req").status).toBe("accepted");
    await rejects400(lecturer.approveGuidanceService("p1", "g-acc", {}));
  });

  it("ubah jadwal oleh dosen: status tetap accepted, waktu baru, alasan, audit, notifikasi, kalender", async () => {
    g("g-acc").supervisorCalendarEventId = "ev-sup";
    g("g-acc").studentCalendarEventId = "ev-stu";
    const when = future(6);
    await lecturer.rescheduleGuidanceByLecturerService("p1", "g-acc", { newDate: when, reason: "Ada sidang" });
    expect(g("g-acc")).toMatchObject({ status: "accepted", rescheduleReason: "Ada sidang" });
    expect(new Date(g("g-acc").approvedDate).getTime()).toBe(when.getTime());
    expect(g("g-acc").rescheduledAt).toBeInstanceOf(Date);
    expect(calendar.updateCalendarEvent).toHaveBeenCalledTimes(2);
    expect(store.state.auditLog.find((a) => a.action === "GUIDANCE_RESCHEDULED").changes.newValues.reason).toBe("Ada sidang");
    expect(createNotificationsForUsers.mock.calls.at(-1)[0]).toEqual(["stu1"]);
  });

  it("ubah jadwal oleh dosen: kegagalan kalender tidak menggagalkan aksi", async () => {
    g("g-acc").supervisorCalendarEventId = "ev-sup";
    calendar.updateCalendarEvent.mockRejectedValueOnce(new Error("Graph down"));
    await lecturer.rescheduleGuidanceByLecturerService("p1", "g-acc", { newDate: future(6), reason: "x" });
    expect(g("g-acc").rescheduleReason).toBe("x");
  });

  it("ubah jadwal oleh dosen: rescheduled lama dinormalisasi ke accepted", async () => {
    await lecturer.rescheduleGuidanceByLecturerService("p1", "g-resch", { newDate: future(7), reason: "Geser" });
    expect(g("g-resch").status).toBe("accepted");
  });

  it("ubah jadwal oleh dosen: alasan wajib, waktu di masa depan, tidak bentrok, hanya sesi terjadwal", async () => {
    await rejects400(lecturer.rescheduleGuidanceByLecturerService("p1", "g-acc", { newDate: future(6), reason: "" }));
    await rejects400(lecturer.rescheduleGuidanceByLecturerService("p1", "g-acc", { newDate: new Date("2020-01-01"), reason: "x" }));
    // bentrok dengan pengajuan lain dosen ini
    const slot = future(8);
    g("g-req").requestedDate = slot;
    const clash = await rejects400(lecturer.rescheduleGuidanceByLecturerService("p1", "g-acc", { newDate: slot, reason: "x" }));
    expect(clash.message).toMatch(/bentrok/i);
    await rejects400(lecturer.rescheduleGuidanceByLecturerService("p1", "g-req", { newDate: future(9), reason: "x" }));
  });

  it("hanya pembimbing aktif sesi itu; TA harus research", async () => {
    await expect(
      lecturer.rescheduleGuidanceByLecturerService("p2", "g-acc", { newDate: future(6), reason: "x" }),
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      lecturer.rescheduleGuidanceByLecturerService("rel", "g-acc-rel", { newDate: future(6), reason: "x" }),
    ).rejects.toMatchObject({ statusCode: 403 });
    store.state.thesis[0].status = "on_leave";
    await expect(
      lecturer.rescheduleGuidanceByLecturerService("p1", "g-acc", { newDate: future(6), reason: "x" }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("batal oleh dosen: hanya sesi terjadwal, alasan wajib, tercatat cancelledBy lecturer", async () => {
    await rejects400(lecturer.cancelGuidanceByLecturerService("p1", "g-acc", { reason: "" }));
    await rejects400(lecturer.cancelGuidanceByLecturerService("p1", "g-req", { reason: "x" }));
    await lecturer.cancelGuidanceByLecturerService("p1", "g-acc", { reason: "Dinas luar" });
    expect(g("g-acc")).toMatchObject({ status: "cancelled", cancelReason: "Dinas luar", cancelledBy: "lecturer" });
  });
});

describe("K19 ringkasan", () => {
  it("diisi dari accepted dan rescheduled lama; ditolak dari requested", async () => {
    await student.submitSessionSummaryService("stu1", "g-acc", { sessionSummary: "Bahas bab 2" });
    await student.submitSessionSummaryService("stu1", "g-resch", { sessionSummary: "Bahas bab 2" });
    expect(g("g-acc").status).toBe("summary_pending");
    expect(g("g-resch").status).toBe("summary_pending");
    await rejects400(student.submitSessionSummaryService("stu1", "g-req", { sessionSummary: "x" }));
  });

  it("dosen minta perbaikan: catatan wajib, summary_pending -> summary_rejected, catatan di supervisorFeedback", async () => {
    await rejects400(lecturer.rejectSessionSummaryService("p1", "g-pend-p1", { notes: "  " }));
    await lecturer.rejectSessionSummaryService("p1", "g-pend-p1", { notes: "Tambahkan daftar tindak lanjut" });
    expect(g("g-pend-p1")).toMatchObject({ status: "summary_rejected", supervisorFeedback: "Tambahkan daftar tindak lanjut" });
    expect(store.state.auditLog.some((a) => a.action === "GUIDANCE_SUMMARY_REJECTED")).toBe(true);
    await rejects400(lecturer.rejectSessionSummaryService("p1", "g-acc", { notes: "x" }));
  });

  it("perbaiki -> summary_pending lagi -> disetujui -> completed", async () => {
    await lecturer.rejectSessionSummaryService("p1", "g-pend-p1", { notes: "Perbaiki" });
    await student.submitSessionSummaryService("stu1", "g-pend-p1", { sessionSummary: "Ringkasan diperbaiki" });
    expect(g("g-pend-p1").status).toBe("summary_pending");
    await lecturer.approveSessionSummaryService("p1", "g-pend-p1");
    expect(g("g-pend-p1").status).toBe("completed");
  });

  it("setujui ringkasan hanya dari summary_pending", async () => {
    await rejects400(lecturer.approveSessionSummaryService("p1", "g-rej"));
    await rejects400(lecturer.approveSessionSummaryService("p1", "g-acc"));
  });

  it("mahasiswa tidak pernah bisa menetapkan completed", async () => {
    await expect(student.markSessionCompleteService("stu1", "g-acc", { sessionSummary: "x" })).rejects.toMatchObject({ statusCode: 410 });
    await student.submitSessionSummaryService("stu1", "g-acc", { sessionSummary: "x" });
    expect(g("g-acc").status).toBe("summary_pending");
    const studentCompletes = callsTo("thesisGuidance").filter((c) => c.args?.data?.status === "completed");
    expect(studentCompletes).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("K20 pasang template", () => {
  const tpl = (id, extra = {}) => ({ id, name: `Template ${id}`, description: "", phase: "research", topicId: "topic-1", orderIndex: 0, isActive: true, ...extra });

  beforeEach(() => {
    store.state.thesisMilestone = [];
    store.state.thesisMilestoneTemplate = [
      tpl("tpl-a"),
      tpl("tpl-general", { topicId: null, orderIndex: 1 }),
      tpl("tpl-off", { isActive: false }),
      tpl("tpl-other", { topicId: "topic-2" }),
      tpl("tpl-prop", { phase: "proposal", topicId: null }),
    ];
  });

  it("memasang template aktif dari topik TA (dan template umum fase research)", async () => {
    await milestone.createMilestonesFromTemplates("t1", "stu1", ["tpl-a", "tpl-general"], "topic-2");
    expect(store.state.thesisMilestone.map((x) => x.milestoneTemplateId).sort()).toEqual(["tpl-a", "tpl-general"]);
    // topicId dari body tidak pernah dipakai / tidak mengubah topik TA
    expect(store.state.thesis[0].thesisTopicId).toBe("topic-1");
    expect(callsTo("thesis", "update")).toHaveLength(0);
  });

  it("menolak template nonaktif, topik lain, dan fase lain", async () => {
    await rejects400(milestone.createMilestonesFromTemplates("t1", "stu1", ["tpl-off"]), RAW_MILESTONE);
    await rejects400(milestone.createMilestonesFromTemplates("t1", "stu1", ["tpl-other"]), RAW_MILESTONE);
    await rejects400(milestone.createMilestonesFromTemplates("t1", "stu1", ["tpl-prop"]), RAW_MILESTONE);
    expect(store.state.thesisMilestone).toHaveLength(0);
  });

  it("TA tanpa topik: 400 dengan penjelasan data master", async () => {
    store.state.thesis[0].thesisTopicId = null;
    const err = await rejects400(milestone.createMilestonesFromTemplates("t1", "stu1", ["tpl-a"]), RAW_MILESTONE);
    expect(err.message).toMatch(/Data Master/);
  });

  it("hanya saat milestone fase TA masih kosong", async () => {
    await milestone.createMilestonesFromTemplates("t1", "stu1", ["tpl-a"]);
    await rejects400(milestone.createMilestonesFromTemplates("t1", "stu1", ["tpl-general"]), RAW_MILESTONE);
  });
});

describe("K20 siklus status milestone", () => {
  it("mulai: not_started -> in_progress; progres 100 -> pending_review", async () => {
    store.state.thesisMilestone.push({ id: "m-new", thesisId: "t1", title: "Baru", status: "not_started", phase: "research", progressPercentage: 0, thesis: { id: "t1" } });
    await milestone.updateMilestoneStatus("m-new", "stu1", "in_progress");
    expect(m("m-new").status).toBe("in_progress");
    await milestone.updateMilestoneProgress("m-new", "stu1", 100);
    expect(m("m-new").status).toBe("pending_review");
  });

  it("mahasiswa tidak bisa menetapkan completed lewat ubah status", async () => {
    await rejects400(milestone.updateMilestoneStatus("m-progress", "stu1", "completed"), RAW_MILESTONE);
    expect(m("m-progress").status).toBe("in_progress");
  });

  it("validasi: hanya P1, hanya dari pending_review", async () => {
    await expect(milestone.validateMilestone("m-review", "p2")).rejects.toMatchObject({ statusCode: 403 });
    await rejects400(milestone.validateMilestone("m-progress", "p1"), RAW_MILESTONE);
    await milestone.validateMilestone("m-review", "p1", "Bagus");
    expect(m("m-review").status).toBe("completed");
  });

  it("revisi: catatan wajib, dari pending_review -> revision_needed; lalu progres 100 -> pending_review lagi", async () => {
    await rejects400(milestone.requestRevision("m-review", "p1", "  "), RAW_MILESTONE);
    await rejects400(milestone.requestRevision("m-progress", "p1", "x"), RAW_MILESTONE);
    await milestone.requestRevision("m-review", "p1", "Lengkapi data uji");
    expect(m("m-review")).toMatchObject({ status: "revision_needed", supervisorNotes: "Lengkapi data uji" });

    // progress is still 100 in the store (the fake has no `decrement`): updating to 100 re-submits
    m("m-review").progressPercentage = 90;
    await milestone.updateMilestoneProgress("m-review", "stu1", 95);
    expect(m("m-review").status).toBe("in_progress");
    await milestone.updateMilestoneProgress("m-review", "stu1", 100);
    expect(m("m-review").status).toBe("pending_review");
  });

  it("menurunkan progres saat pending_review menarik kembali ke in_progress", async () => {
    await milestone.updateMilestoneProgress("m-review", "stu1", 80);
    expect(m("m-review").status).toBe("in_progress");
  });

  it("P2 boleh memberi feedback (status tidak berubah); feedback kosong ditolak", async () => {
    await milestone.addSupervisorFeedback("m-progress", "p2", "Perhatikan sitasi");
    expect(m("m-progress")).toMatchObject({ status: "in_progress", feedback: "Perhatikan sitasi", feedbackBy: "p2" });
    expect(m("m-progress").feedbackAt).toBeInstanceOf(Date);
    await rejects400(milestone.addSupervisorFeedback("m-progress", "p1", " "), RAW_MILESTONE);
  });

  // Paket C (C9): decision notes and feedback never overwrite each other.
  it("C9: feedback P2 setelah persetujuan P1 tidak mengubah supervisorNotes", async () => {
    await milestone.validateMilestone("m-review", "p1", "Disetujui, lanjut bab 4");
    const result = await milestone.addSupervisorFeedback("m-review", "p2", "Rapikan daftar pustaka");
    expect(m("m-review")).toMatchObject({
      status: "completed",
      supervisorNotes: "Disetujui, lanjut bab 4",
      feedback: "Rapikan daftar pustaka",
      feedbackBy: "p2",
    });
    expect(result.feedbackByName).toBe("Dosen P2");
    // mahasiswa diberi tahu (nama dosen + isi), dan audit log dicatat
    const { createNotification } = await import("../../../repositories/notification.repository.js");
    expect(createNotification.mock.calls.at(-1)[0]).toMatchObject({ userId: "stu1", title: "Feedback Milestone" });
    expect(createNotification.mock.calls.at(-1)[0].message).toMatch(/Dosen P2.*Rapikan daftar pustaka/);
    expect(store.state.auditLog.some((a) => a.action === "MILESTONE_FEEDBACK_ADDED" && a.entityId === "m-review")).toBe(true);
  });

  it("C9: feedback baru menggantikan feedback lama; revisi tidak menghapus feedback", async () => {
    await milestone.addSupervisorFeedback("m-review", "p2", "Feedback pertama");
    await milestone.addSupervisorFeedback("m-review", "p1", "Feedback kedua");
    expect(m("m-review")).toMatchObject({ feedback: "Feedback kedua", feedbackBy: "p1" });
    await milestone.requestRevision("m-review", "p1", "Perbaiki grafik");
    expect(m("m-review")).toMatchObject({ supervisorNotes: "Perbaiki grafik", feedback: "Feedback kedua" });
  });

  it("C9: daftar milestone memuat nama pemberi feedback", async () => {
    await milestone.addSupervisorFeedback("m-progress", "p2", "Catatan");
    const { milestones } = await milestone.getMilestones("t1", "stu1");
    expect(milestones.find((x) => x.id === "m-progress")).toMatchObject({ feedback: "Catatan", feedbackByName: "Dosen P2" });
  });

  it("hapus: hanya yang belum completed", async () => {
    m("m-review").status = "completed";
    await rejects400(milestone.deleteMilestone("m-review", "stu1"), /\bcompleted\b/);
    await milestone.deleteMilestone("m-progress", "stu1");
    expect(m("m-progress")).toBeUndefined();
  });

  it("ubah urutan bekerja", async () => {
    await milestone.reorderMilestones("t1", "stu1", [
      { id: "m-progress", orderIndex: 0 },
      { id: "m-review", orderIndex: 1 },
    ]);
    expect(m("m-progress").orderIndex).toBe(0);
    expect(m("m-review").orderIndex).toBe(1);
  });

  it("pembimbing menambah milestone; TA bukan research ditolak 403", async () => {
    await milestone.createMilestoneBySupervisor("t1", "p2", { title: "Dari P2" });
    expect(store.state.thesisMilestone.some((x) => x.title === "Dari P2" && x.phase === "research")).toBe(true);
    store.state.thesis[0].status = "on_leave";
    await expect(milestone.createMilestoneBySupervisor("t1", "p1", { title: "x" })).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe("K21 daftar Mahasiswa Bimbingan dosen", () => {
  const ids = (r) => r.students.map((s) => s.thesisId);

  it("default Aktif (research + on_leave); Selesai, Gagal, Semua", async () => {
    expect(ids(await lecturer.getMyStudentsService("p1"))).toEqual(["t1"]);
    store.state.thesis[0].status = "on_leave";
    expect(ids(await lecturer.getMyStudentsService("p1"))).toEqual(["t1"]);

    store.state.thesis[0].status = "completed";
    expect(ids(await lecturer.getMyStudentsService("p1"))).toEqual([]);
    expect(ids(await lecturer.getMyStudentsService("p1", undefined, { filter: "completed" }))).toEqual(["t1"]);
    expect(ids(await lecturer.getMyStudentsService("p1", undefined, { filter: "all" }))).toEqual(["t1"]);

    // failed: supervisor relation released by the termination, still listed under "Gagal"
    store.state.thesis[0].status = "failed";
    store.state.thesisSupervisors.find((s) => s.id === "ts-p1").status = "released";
    expect(ids(await lecturer.getMyStudentsService("p1", undefined, { filter: "failed" }))).toEqual(["t1"]);
    expect(ids(await lecturer.getMyStudentsService("p1", undefined, { filter: "completed" }))).toEqual([]);
  });
});
