/**
 * Paket A — thesis status enum (K15), server-side phase (K6/K7/K18) and guidance
 * attachments stored on the session row (K17).
 *
 * Real services + real repositories; only Prisma is replaced by the in-memory store
 * that evaluates the actual `where`/`orderBy` arguments (see helpers/fakePrisma.js).
 * Side-effect integrations (FCM, calendar, in-app notification rows) are stubbed.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { createHash } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildState } from "./helpers/guidanceFixtures.js";
import { store, resetDb, callsTo, prismaFake } from "./helpers/fakePrisma.js";

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
const studentRepo = await import("../../../repositories/thesisGuidance/student.guidance.repository.js");
const seminarRepo = await import("../../../repositories/thesis-seminar/thesis-seminar.repository.js");
const defenceRepo = await import("../../../repositories/thesis-defence/thesis-defence.repository.js");
const { findLatestThesisReport } = await import("../../../helpers/guidanceFile.helper.js");

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const thesisRow = () => store.state.thesis.find((t) => t.id === "t1");
const fixtureGuidanceIds = () => new Set(buildState().thesisGuidance.map((g) => g.id));
const newGuidances = (known) => store.state.thesisGuidance.filter((g) => !known.has(g.id));

let tmpRoot = null;

beforeEach(() => {
  resetDb(buildState());
  // The fixture has one open "requested" session; the student may only have one at a time.
  store.state.thesisGuidance.find((g) => g.id === "g-req").status = "cancelled";
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
  tmpRoot = null;
});

function useTmpCwd() {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "paketa-"));
  vi.spyOn(process, "cwd").mockReturnValue(tmpRoot);
  return tmpRoot;
}

describe("Pengajuan bimbingan fase TA (K6, K15)", () => {
  it("TA research: sesi dibuat dengan phase research yang ditetapkan server", async () => {
    const known = fixtureGuidanceIds();

    // A client-sent phase is ignored: phase is derived from the thesis status.
    await student.requestGuidanceService("stu1", FUTURE, "Bahas bab 3", null, "p1", { phase: "proposal" });

    const created = newGuidances(known);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ status: "requested", phase: "research", thesisId: "t1" });
  });

  it("TA proposal ditolak (403) di aksi bimbingan; tidak ada sesi dibuat", async () => {
    thesisRow().status = "proposal";
    const known = fixtureGuidanceIds();

    await expect(
      student.requestGuidanceService("stu1", FUTURE, "Bahas bab 3", null, "p1"),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      student.submitSessionSummaryService("stu1", "g-acc", { sessionSummary: "Ringkasan" }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(newGuidances(known)).toHaveLength(0);
  });

  it("TA yang mengulang proposal: alasan penolakan menyebut evaluasi bimbingan (E5)", async () => {
    thesisRow().status = "proposal";
    store.state.thesisGuidanceEvaluation = [
      { id: "ev-1", thesisId: "t1", status: "approved", recommendation: "revise_proposal", thesis: { status: "proposal" } },
    ];
    const reason = expect.stringContaining("Mengulang proposal berdasarkan evaluasi bimbingan.");

    await expect(student.requestGuidanceService("stu1", FUTURE, "Bahas bab 3", null, "p1")).rejects.toMatchObject({ statusCode: 403, message: reason });
    await expect(milestone.createMilestone("t1", "stu1", { title: "Milestone baru" })).rejects.toMatchObject({ statusCode: 403, message: reason });

    // A rejected evaluation, or another recommendation, is not a repeat: the usual message stays.
    store.state.thesisGuidanceEvaluation[0].status = "rejected";
    await expect(milestone.createMilestone("t1", "stu1", { title: "Milestone baru" })).rejects.toMatchObject({
      statusCode: 403,
      message: expect.stringContaining("masih dalam fase proposal"),
    });
  });

  it("TA on_leave ditolak (403) di aksi mahasiswa, dosen, dan milestone", async () => {
    thesisRow().status = "on_leave";
    const known = fixtureGuidanceIds();

    await expect(
      student.requestGuidanceService("stu1", FUTURE, "Bahas bab 3", null, "p1"),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(lecturer.approveSessionSummaryService("p1", "g-pend-p1")).rejects.toMatchObject({ statusCode: 403 });
    await expect(milestone.updateMilestoneProgress("m-progress", "stu1", 60)).rejects.toMatchObject({ statusCode: 403 });

    expect(newGuidances(known)).toHaveLength(0);
    expect(store.state.thesisGuidance.find((g) => g.id === "g-pend-p1").status).toBe("summary_pending");
  });
});

describe("Lampiran sesi bimbingan (K17)", () => {
  it("tersimpan di kolom file sesi dan di uploads/thesis/<thesis>/guidance/<sesi>/, tanpa baris documents", async () => {
    const root = useTmpCwd();
    const buffer = Buffer.from("%PDF-1.4 laporan bab 3");
    const known = fixtureGuidanceIds();

    await student.requestGuidanceService(
      "stu1",
      FUTURE,
      "Bahas bab 3",
      { originalname: "Bab 3 Final!.pdf", mimetype: "application/pdf", size: buffer.length, buffer },
      "p1",
    );

    const [created] = newGuidances(known);
    expect(created.filePath).toMatch(
      new RegExp(`^uploads/thesis/t1/guidance/${created.id}/\\d+-Bab_3_Final\\.pdf$`),
    );
    expect(created).toMatchObject({
      fileName: "Bab 3 Final!.pdf",
      mimeType: "application/pdf",
      fileSize: buffer.length,
      fileHash: createHash("sha256").update(buffer).digest("hex"),
    });
    expect(created.fileUploadedAt).toBeInstanceOf(Date);
    expect(fs.readFileSync(path.join(root, created.filePath))).toEqual(buffer);
    expect(callsTo("document")).toHaveLength(0);
    expect(callsTo("documentType")).toHaveLength(0);
  });

  it("gagal menyimpan file → pengajuan dibatalkan (500), tidak ada sesi yang dibuat", async () => {
    const root = useTmpCwd();
    // "uploads" exists as a file, so the attachment directory cannot be created.
    fs.writeFileSync(path.join(root, "uploads"), "bukan folder");
    const buffer = Buffer.from("%PDF-1.4");
    const known = fixtureGuidanceIds();

    await expect(
      student.requestGuidanceService(
        "stu1",
        FUTURE,
        "Bahas bab 3",
        { originalname: "bab3.pdf", mimetype: "application/pdf", size: buffer.length, buffer },
        "p1",
      ),
    ).rejects.toMatchObject({ statusCode: 500 });
    expect(newGuidances(known)).toHaveLength(0);
  });

  it("laporan terbaru = lampiran sesi fase TA terbaru yang punya file", async () => {
    const at = (iso) => new Date(iso);
    store.state.thesisGuidance.push(
      { id: "f-old", thesisId: "t1", phase: "research", status: "completed", filePath: "uploads/thesis/t1/guidance/f-old/1-a.pdf", fileName: "a.pdf", fileUploadedAt: at("2026-01-01"), createdAt: at("2026-01-01") },
      { id: "f-new", thesisId: "t1", phase: "research", status: "completed", filePath: "uploads/thesis/t1/guidance/f-new/2-b.pdf", fileName: "b.pdf", fileUploadedAt: at("2026-03-01"), createdAt: at("2026-03-01") },
      { id: "f-prop", thesisId: "t1", phase: "proposal", status: "completed", filePath: "uploads/thesis/t1/guidance/f-prop/3-c.pdf", fileName: "c.pdf", fileUploadedAt: at("2026-05-01"), createdAt: at("2026-05-01") },
      { id: "f-none", thesisId: "t1", phase: "research", status: "accepted", filePath: null, fileName: null, fileUploadedAt: null, createdAt: at("2026-06-01") },
    );

    const latest = await findLatestThesisReport(prismaFake, "t1");

    expect(latest.id).toBe("f-new");
  });
});

describe("Milestone fase TA (K6, K18)", () => {
  beforeEach(() => {
    store.state.thesisMilestone = [];
    store.state.thesisMilestoneTemplate = [
      { id: "tpl-ta", name: "Bab 1", description: "Pendahuluan", phase: "research", topicId: "topic-1", orderIndex: 0, isActive: true },
      { id: "tpl-prop", name: "Proposal Bab 1", description: "Metopen", phase: "proposal", topicId: null, orderIndex: 0, isActive: true },
    ];
  });

  it("milestone dari template mendapat phase research dan rujukan template", async () => {
    await milestone.createMilestonesFromTemplates("t1", "stu1", ["tpl-ta"]);

    expect(store.state.thesisMilestone).toHaveLength(1);
    expect(store.state.thesisMilestone[0]).toMatchObject({
      thesisId: "t1",
      phase: "research",
      milestoneTemplateId: "tpl-ta",
      title: "Bab 1",
    });
  });

  it("template berbeda fase ditolak (400) dan tidak membuat milestone", async () => {
    await expect(
      milestone.createMilestonesFromTemplates("t1", "stu1", ["tpl-ta", "tpl-prop"]),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(store.state.thesisMilestone).toHaveLength(0);
  });

  it("milestone buatan mahasiswa dan pembimbing mendapat phase research dari server", async () => {
    await milestone.createMilestone("t1", "stu1", { title: "Milestone mahasiswa", phase: "proposal" });
    await milestone.createMilestoneBySupervisor("t1", "p1", { title: "Milestone pembimbing" });

    expect(store.state.thesisMilestone.map((m) => m.phase)).toEqual(["research", "research"]);
  });
});

describe("Hitungan minimal 8 bimbingan (K7)", () => {
  it("hanya sesi completed berfase thesis yang dihitung", async () => {
    // Fixture: 7 completed TA-phase sessions. Add 3 completed proposal-phase sessions.
    for (let i = 1; i <= 3; i++) {
      store.state.thesisGuidance.push({ id: `g-prop-${i}`, thesisId: "t1", phase: "proposal", status: "completed" });
    }

    const readiness = await milestone.getThesisSeminarReadiness("t1", "p1");

    expect(readiness.guidanceProgress.completed).toBe(7);
    expect(readiness.guidanceProgress.isComplete).toBe(false);
    expect(await seminarRepo.countCompletedGuidances("t1")).toBe(7);
  });
});

describe("Pencarian TA aktif seminar, sidang, dan bimbingan (K15)", () => {
  it("memilih TA yang masih berjalan, bukan TA lama yang gagal", async () => {
    const current = thesisRow();
    current.createdAt = new Date("2026-02-01");
    // Older failed thesis inserted first, so an unfiltered/unsorted findFirst would return it.
    store.state.thesis.unshift({ id: "t-old", studentId: "stu1", status: "failed", createdAt: new Date("2025-01-01") });

    expect((await seminarRepo.getStudentThesisWithSeminarInfo("stu1")).id).toBe("t1");
    expect((await defenceRepo.getStudentThesisWithDefenceInfo("stu1")).id).toBe("t1");
    expect((await studentRepo.getActiveThesisForStudent("stu1")).id).toBe("t1");
  });

  it("di antara TA yang belum berakhir, yang terbaru dipilih", async () => {
    thesisRow().createdAt = new Date("2026-02-01");
    store.state.thesis.unshift({ id: "t-prop", studentId: "stu1", status: "proposal", createdAt: new Date("2025-06-01") });

    expect((await seminarRepo.getStudentThesisWithSeminarInfo("stu1")).id).toBe("t1");
    expect((await defenceRepo.getStudentThesisWithDefenceInfo("stu1")).id).toBe("t1");
    expect((await studentRepo.getActiveThesisForStudent("stu1")).id).toBe("t1");
  });
});
