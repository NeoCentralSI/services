/**
 * Guidance revival — correction round regression tests (route level).
 *
 * Mounts the real /thesisGuidance and /milestones routers with the real role guards
 * (requireAnyRole, requireRole, loadUserRoles/requireRoles) and real controllers,
 * services and repositories. Only `authGuard` is replaced (reads the user id from an
 * `x-test-user` header instead of verifying a JWT) and Prisma is the in-memory store.
 */
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildState } from "./helpers/guidanceFixtures.js";
import { store, resetDb } from "./helpers/fakePrisma.js";

// The student action shield (TA course of the semester, leave) reads tables this test does not fake.
vi.mock("../../../services/thesisLifecycle.service.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getStudentThesisActionBlock: vi.fn(async () => ({ blocked: false, code: null, reason: null, takingThesisCourse: true })),
  assertStudentThesisActionAllowed: vi.fn(async () => ({ blocked: false, code: null, reason: null, takingThesisCourse: true })),
}));
vi.mock("../../../config/prisma.js", async () => ({
  default: (await import("./helpers/fakePrisma.js")).prismaFake,
}));
vi.mock("../../../middlewares/auth.middleware.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    authGuard: (req, res, next) => {
      const sub = req.headers["x-test-user"];
      if (!sub) return res.status(401).json({ message: "Unauthorized" });
      req.user = { sub };
      return next();
    },
  };
});
vi.mock("../../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }),
}));
vi.mock("../../../repositories/notification.repository.js", async (importOriginal) => ({
  ...(await importOriginal()),
  createNotification: vi.fn().mockResolvedValue({}),
}));
// Read path stub: the in-memory store does not model the monitoring detail query.
// Only getThesisDetail is replaced; the warning services stay real.
vi.mock("../../../services/thesisGuidance/monitoring.service.js", async (importOriginal) => ({
  ...(await importOriginal()),
  getThesisDetail: vi.fn().mockResolvedValue({ id: "t1", title: "TA Uji" }),
}));
vi.mock("../../../services/outlook-calendar.service.js", () => ({
  createGuidanceCalendarEvent: vi.fn().mockResolvedValue({ supervisorEventId: null, studentEventId: null }),
  deleteCalendarEvent: vi.fn().mockResolvedValue(undefined),
}));

const { default: thesisGuidanceRouter } = await import("../../../routes/thesisGuidance.route.js");
const { default: milestonesRouter } = await import("../../../routes/milestones.route.js");
const { default: errorHandler } = await import("../../../middlewares/error.middleware.js");

const app = express();
app.use(express.json());
app.use("/thesisGuidance", thesisGuidanceRouter);
app.use("/milestones", milestonesRouter);
app.use(errorHandler);

const as = (userId) => ({ "x-test-user": userId });
const guidanceRow = (id) => store.state.thesisGuidance.find((g) => g.id === id);
const milestoneRow = (id) => store.state.thesisMilestone.find((m) => m.id === id);

beforeEach(() => {
  resetDb(buildState());
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("Endpoint penyelesaian langsung ditutup", () => {
  it("POST /student/guidance/:id/complete → 410, sesi tetap accepted", async () => {
    const res = await request(app)
      .post("/thesisGuidance/student/guidance/g-acc/complete")
      .set(as("stu1"))
      .send({ sessionSummary: "Saya anggap selesai" });
    expect(res.status).toBe(410);
    expect(guidanceRow("g-acc").status).toBe("accepted");
  });

  it("PATCH /student/progress/complete → 410, milestone tidak berubah", async () => {
    const res = await request(app)
      .patch("/thesisGuidance/student/progress/complete")
      .set(as("stu1"))
      .send({ componentIds: ["m-progress"] });
    expect(res.status).toBe(410);
    expect(milestoneRow("m-progress").status).toBe("in_progress");
  });

  it("PATCH /lecturer/progress/:studentId/approve → 410 bahkan untuk Pembimbing 1 aktif", async () => {
    const res = await request(app)
      .patch("/thesisGuidance/lecturer/progress/stu1/approve")
      .set(as("p1"))
      .send({ componentIds: ["tpl-1"] });
    expect(res.status).toBe(410);
  });

  it("PATCH /milestones/:id/status completed → ditolak (validator untuk mahasiswa, guard untuk dosen)", async () => {
    const asStudent = await request(app)
      .patch("/milestones/m-progress/status")
      .set(as("stu1"))
      .send({ status: "completed" });
    expect(asStudent.status).toBe(400);
    const asLecturer = await request(app)
      .patch("/milestones/m-progress/status")
      .set(as("p1"))
      .send({ status: "completed" });
    expect(asLecturer.status).toBe(403);
    expect(milestoneRow("m-progress").status).toBe("in_progress");
  });
});

describe("Alur resmi lewat route", () => {
  it("ringkasan → persetujuan Pembimbing 1 → completed; summary_rejected dapat dikirim ulang", async () => {
    const submit = await request(app)
      .post("/thesisGuidance/student/guidance/g-acc/submit-summary")
      .set(as("stu1"))
      .send({ sessionSummary: "Bahas bab 2" });
    expect(submit.status).toBe(200);
    expect(guidanceRow("g-acc").status).toBe("summary_pending");

    const approve = await request(app)
      .put("/thesisGuidance/lecturer/guidance/g-acc/approve-summary")
      .set(as("p1"));
    expect(approve.status).toBe(200);
    expect(guidanceRow("g-acc").status).toBe("completed");

    const resubmit = await request(app)
      .post("/thesisGuidance/student/guidance/g-rej/submit-summary")
      .set(as("stu1"))
      .send({ sessionSummary: "Revisi" });
    expect(resubmit.status).toBe(200);
    expect(guidanceRow("g-rej").status).toBe("summary_pending");
  });

  it("progres 100% → pending_review; validasi: mahasiswa 403 (guard), Pembimbing 2 403 (service), Pembimbing 1 200", async () => {
    const progress = await request(app)
      .patch("/milestones/m-progress/progress")
      .set(as("stu1"))
      .send({ progressPercentage: 100 });
    expect(progress.status).toBe(200);
    expect(milestoneRow("m-progress").status).toBe("pending_review");

    expect((await request(app).post("/milestones/m-progress/validate").set(as("stu1")).send({})).status).toBe(403);
    expect((await request(app).post("/milestones/m-progress/validate").set(as("p2")).send({})).status).toBe(403);
    expect((await request(app).post("/milestones/m-progress/validate").set(as("rel")).send({})).status).toBe(403);
    expect(milestoneRow("m-progress").status).toBe("pending_review");

    const ok = await request(app).post("/milestones/m-progress/validate").set(as("p1")).send({});
    expect(ok.status).toBe(200);
    expect(milestoneRow("m-progress").status).toBe("completed");
  });
});

describe("Otorisasi pembimbing dan GKM lewat route", () => {
  it("pembimbing released memegang role Pembimbing 1 global tetapi ditolak menyetujui ringkasan (403)", async () => {
    const res = await request(app)
      .put("/thesisGuidance/lecturer/guidance/g-pend-rel/approve-summary")
      .set(as("rel"));
    expect(res.status).toBe(403);
    expect(guidanceRow("g-pend-rel").status).toBe("summary_pending");
  });

  it("GKM saja tidak bisa masuk router dosen", async () => {
    const res = await request(app).get("/thesisGuidance/lecturer/requests").set(as("gkm"));
    expect(res.status).toBe(403);
  });

  it("peringatan monitoring: mahasiswa 403 (guard); KaDep, Sekdep, dan GKM 200", async () => {
    // 90 days without activity: Lambat, so a warning may be sent.
    store.state.thesis[0].startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const path = "/thesisGuidance/monitoring/theses/t1/send-warning";
    expect((await request(app).post(path).set(as("stu1")).send({ warningType: "slow" })).status).toBe(403);
    expect((await request(app).post(path).set(as("gkm")).send({ warningType: "slow" })).status).toBe(200);
    expect((await request(app).post(path).set(as("sekdep")).send({ warningType: "slow" })).status).toBe(200);
    expect((await request(app).post(path).set(as("kadep")).send({ warningType: "slow" })).status).toBe(200);
    // An unrelated lecturer without a department role is still refused (router guard).
    expect((await request(app).post(path).set(as("other")).send({ warningType: "slow" })).status).toBe(403);
  });

  it("peringatan: tingkat dihitung server, `warningType` dari klien diabaikan; TA Lancar ditolak 400", async () => {
    store.state.thesis[0].startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const single = await request(app)
      .post("/thesisGuidance/monitoring/theses/t1/send-warning")
      .set(as("kadep"))
      .send({ warningType: "at_risk" });
    expect(single.status).toBe(200);
    expect(single.body.warningType).toBe("slow");

    const fromLecturerPage = await request(app)
      .post("/thesisGuidance/lecturer/my-students/t1/send-warning")
      .set(as("p1"))
      .send({ warningType: "at_risk" });
    expect(fromLecturerPage.status).toBe(200);
    expect(fromLecturerPage.body.warningType).toBe("slow");

    const batch = await request(app)
      .post("/thesisGuidance/monitoring/batch-warning")
      .set(as("kadep"))
      .send({ thesisIds: ["t1"], warningType: "at_risk" });
    expect(batch.status).toBe(200);
    expect(batch.body.sent).toEqual([{ thesisId: "t1", studentName: "Mahasiswa Uji", warningType: "slow" }]);

    // The same thesis with activity today is Lancar: nothing is sent.
    store.state.thesis[0].startDate = new Date();
    const active = await request(app)
      .post("/thesisGuidance/monitoring/theses/t1/send-warning")
      .set(as("kadep"))
      .send({ warningType: "at_risk" });
    expect(active.status).toBe(400);
    const activeBatch = await request(app)
      .post("/thesisGuidance/monitoring/batch-warning")
      .set(as("kadep"))
      .send({ thesisIds: ["t1"], warningType: "at_risk" });
    expect(activeBatch.status).toBe(200);
    expect(activeBatch.body).toMatchObject({ sentCount: 0, notSent: [{ thesisId: "t1", reason: "active" }] });
  });

  it("GKM tetap dapat membaca dashboard monitoring (akses baca dipertahankan)", async () => {
    const res = await request(app).get("/thesisGuidance/monitoring/theses/t1").set(as("gkm"));
    expect(res.status).toBe(200);
  });
});
