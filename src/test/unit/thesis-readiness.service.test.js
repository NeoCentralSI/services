/**
 * E2 — seminar and defence readiness without a document upload: system requirements,
 * supervisor approval, and the student's "Minta Persetujuan" request.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { repo, prismaMock, push, notif, audit } = vi.hoisted(() => ({
  repo: {
    getThesisProgress: vi.fn(),
    getThesisSeminarReadiness: vi.fn(),
    getThesisDefenceReadiness: vi.fn(),
    findLatestGuidanceAttachment: vi.fn(),
    approveSeminarReadiness: vi.fn(),
    revokeSeminarReadiness: vi.fn(),
    approveDefenceReadiness: vi.fn(),
    revokeDefenceReadiness: vi.fn(),
    findStudentsReadyForDefence: vi.fn(),
  },
  prismaMock: {
    thesis: { findUnique: vi.fn() },
    thesisGuidance: { count: vi.fn() },
    thesisSupervisors: { findFirst: vi.fn() },
  },
  push: { sendFcmToUsers: vi.fn() },
  notif: { createNotification: vi.fn() },
  audit: { logAudit: vi.fn() },
}));

vi.mock("../../repositories/thesisGuidance/milestone.repository.js", () => repo);
vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../services/push.service.js", () => push);
vi.mock("../../repositories/notification.repository.js", () => notif);
vi.mock("../../services/auditLog.service.js", async (importOriginal) => ({
  ...(await importOriginal()),
  logAudit: audit.logAudit,
}));

const service = await import("../../services/thesisGuidance/milestone.service.js");

const STUDENT = "user-student";
const P1 = "user-p1";
const P2 = "user-p2";

const supervisor = (userId, role, flags = {}) => ({
  lecturerId: userId,
  seminarReady: false,
  defenceReady: false,
  ...flags,
  lecturer: { id: userId, user: { id: userId, fullName: `Dosen ${role}`, email: `${userId}@x.test` } },
  role: { name: role },
});

function thesis({ status = "research", supervisors = [supervisor(P1, "Pembimbing 1"), supervisor(P2, "Pembimbing 2")], seminars = [] } = {}) {
  return {
    id: "t1",
    title: "Judul TA",
    status,
    studentId: STUDENT,
    student: { id: STUDENT, user: { id: STUDENT, fullName: "Mahasiswa Uji", identityNumber: "2211", email: "m@x.test" } },
    thesisSupervisors: supervisors,
    thesisSeminars: seminars,
  };
}

/** One thesis object serves the access lookup and both readiness selects. */
function useThesis(value) {
  prismaMock.thesis.findUnique.mockResolvedValue(value);
  repo.getThesisSeminarReadiness.mockResolvedValue(value);
  repo.getThesisDefenceReadiness.mockResolvedValue(value);
}

function useSeminarNumbers({ completedGuidances = 8, total = 5, completed = 5 } = {}) {
  prismaMock.thesisGuidance.count.mockResolvedValue(completedGuidances);
  repo.getThesisProgress.mockResolvedValue({
    total,
    completed,
    percentComplete: total ? Math.round((completed / total) * 100) : 0,
    isComplete: total > 0 && completed === total,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  push.sendFcmToUsers.mockResolvedValue(undefined);
  notif.createNotification.mockResolvedValue({ id: "n1" });
  prismaMock.thesisSupervisors.findFirst.mockResolvedValue(null);
  repo.findLatestGuidanceAttachment.mockResolvedValue(null);
});

describe("seminar readiness", () => {
  it("lists both system requirements with their state and blocks the request while unmet", async () => {
    useThesis(thesis());
    useSeminarNumbers({ completedGuidances: 5, total: 4, completed: 4 });

    const result = await service.getThesisSeminarReadiness("t1", STUDENT);

    expect(result.requirements).toEqual([
      { key: "guidance", label: "Minimal 8 sesi bimbingan fase penelitian berstatus Selesai", met: false, detail: "5 dari 8 sesi" },
      { key: "milestone", label: "Seluruh milestone selesai (100%)", met: true, detail: "4 dari 4 milestone selesai" },
    ]);
    expect(result.requirementsMet).toBe(false);
    expect(result.requestBlockedReason).toBe("Syarat sistem belum terpenuhi.");
    expect(result.approveBlockedReason).toBe("Syarat sistem belum terpenuhi.");
    expect(result.canRegisterSeminar).toBe(false);
  });

  it("opens the request when requirements are met, and exposes the latest guidance attachment", async () => {
    useThesis(thesis({ supervisors: [supervisor(P1, "Pembimbing 1", { seminarReady: true }), supervisor(P2, "Pembimbing 2")] }));
    useSeminarNumbers();
    const attachment = { guidanceId: "g9", fileName: "draf.pdf", filePath: "uploads/thesis/t1/guidance/g9/draf.pdf", uploadedAt: new Date("2026-10-01T00:00:00Z") };
    repo.findLatestGuidanceAttachment.mockResolvedValue(attachment);

    const result = await service.getThesisSeminarReadiness("t1", P2);

    expect(result.requirementsMet).toBe(true);
    expect(result.requestBlockedReason).toBeNull();
    expect(result.approveBlockedReason).toBeNull();
    expect(result.seminarReadiness).toEqual({ approvedBySupervisor1: true, approvedBySupervisor2: false, isFullyApproved: false });
    expect(result.currentUserRole).toBe("Pembimbing 2");
    expect(result.currentUserHasApproved).toBe(false);
    expect(result.latestGuidanceAttachment).toEqual(attachment);
    expect(result.canRegisterSeminar).toBe(false);
    expect(result).not.toHaveProperty("finalDocument");
  });

  it("is never fully approved without an active supervisor", async () => {
    useThesis(thesis({ supervisors: [] }));
    useSeminarNumbers();

    const result = await service.getThesisSeminarReadiness("t1", STUDENT);

    expect(result.seminarReadiness.isFullyApproved).toBe(false);
    expect(result.requestBlockedReason).toBe("Tugas akhir belum memiliki pembimbing aktif.");
    expect(result.canRegisterSeminar).toBe(false);
  });

  it("request: notifies only the supervisors who have not approved", async () => {
    useThesis(thesis({ supervisors: [supervisor(P1, "Pembimbing 1", { seminarReady: true }), supervisor(P2, "Pembimbing 2")] }));
    useSeminarNumbers();

    const result = await service.requestSeminarApproval("t1", STUDENT);

    expect(result).toMatchObject({ success: true, data: { notifiedSupervisors: 1 } });
    expect(notif.createNotification).toHaveBeenCalledTimes(1);
    expect(notif.createNotification.mock.calls[0][0]).toMatchObject({ userId: P2 });
    expect(audit.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "SEMINAR_READINESS_REQUESTED", entityId: "t1" }));
  });

  it("request: rejected with the unmet requirement when the system requirements are not met", async () => {
    useThesis(thesis());
    useSeminarNumbers({ completedGuidances: 7 });

    await expect(service.requestSeminarApproval("t1", STUDENT)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("7 dari 8 sesi"),
    });
    expect(notif.createNotification).not.toHaveBeenCalled();
  });

  it("request: rejected when every supervisor already approved, for a non-owner, and for a thesis on leave", async () => {
    useSeminarNumbers();
    useThesis(thesis({ supervisors: [supervisor(P1, "Pembimbing 1", { seminarReady: true })] }));
    await expect(service.requestSeminarApproval("t1", STUDENT)).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.requestSeminarApproval("t1", P1)).rejects.toMatchObject({ statusCode: 403 });

    useThesis(thesis({ status: "on_leave" }));
    await expect(service.requestSeminarApproval("t1", STUDENT)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("Berhenti Studi Sementara (BSS)"),
    });
    expect(notif.createNotification).not.toHaveBeenCalled();
  });

  it("approve: rejected for a thesis that is not in research", async () => {
    useThesis(thesis({ status: "on_leave" }));
    useSeminarNumbers();

    await expect(service.approveSeminarReadiness("t1", P1)).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.approveSeminarReadiness).not.toHaveBeenCalled();
  });

  it("revoke: clears the supervisor's flag and tells the student the reason", async () => {
    const value = thesis({ supervisors: [supervisor(P1, "Pembimbing 1", { seminarReady: true })] });
    useThesis(value);
    repo.revokeSeminarReadiness.mockResolvedValue({ id: "t1", title: "Judul TA", thesisSupervisors: [supervisor(P1, "Pembimbing 1")] });

    const result = await service.revokeSeminarReadiness("t1", P1, "Bab 4 belum lengkap");

    expect(repo.revokeSeminarReadiness).toHaveBeenCalledWith("t1", P1);
    expect(result.data).toMatchObject({ approvedBySupervisor1: false, isFullyApproved: false });
    expect(notif.createNotification.mock.calls[0][0]).toMatchObject({
      userId: STUDENT,
      message: expect.stringContaining("Alasan: Bab 4 belum lengkap"),
    });
  });
});

describe("defence readiness", () => {
  const passed = [{ id: "s1", status: "passed", revisionFinalizedAt: null }];

  it.each([
    ["no seminar", [], false, [{ key: "seminar", met: false, detail: "Belum ada seminar hasil" }]],
    ["a failed seminar", [{ status: "failed" }], false, [{ key: "seminar", met: false, detail: "Belum dinyatakan lulus" }]],
    ["a passed seminar", passed, true, [{ key: "seminar", met: true, detail: "Lulus" }]],
    [
      "passed with revision, not finalised",
      [{ status: "passed_with_revision", revisionFinalizedAt: null }],
      false,
      [{ key: "seminar", met: true, detail: "Lulus dengan revisi" }, { key: "seminar_revision", met: false, detail: "Belum difinalkan" }],
    ],
    [
      "passed with revision, finalised",
      [{ status: "passed_with_revision", revisionFinalizedAt: new Date() }],
      true,
      [{ key: "seminar", met: true }, { key: "seminar_revision", met: true, detail: "Sudah difinalkan" }],
    ],
  ])("requirements for %s", async (_label, seminars, met, expected) => {
    useThesis(thesis({ seminars }));

    const result = await service.getThesisDefenceReadiness("t1", STUDENT);

    expect(result.requirementsMet).toBe(met);
    expect(result.requirements).toHaveLength(expected.length);
    expected.forEach((item, index) => expect(result.requirements[index]).toMatchObject(item));
  });

  it("can register once the seminar is passed and every supervisor approved — no document, no request timestamp", async () => {
    useThesis(thesis({
      seminars: passed,
      supervisors: [supervisor(P1, "Pembimbing 1", { defenceReady: true }), supervisor(P2, "Pembimbing 2", { defenceReady: true })],
    }));

    const result = await service.getThesisDefenceReadiness("t1", STUDENT);

    expect(result.canRegisterDefence).toBe(true);
    expect(result.defenceReadiness).toEqual({ approvedBySupervisor1: true, approvedBySupervisor2: true, isFullyApproved: true });
    expect(result.requestBlockedReason).toBe("Semua pembimbing sudah menyetujui.");
    expect(result).not.toHaveProperty("finalDocument");
    expect(result.defenceReadiness).not.toHaveProperty("hasRequestedDefence");
  });

  it("approve: needs only the passed seminar", async () => {
    useThesis(thesis({ seminars: passed }));
    repo.approveDefenceReadiness.mockResolvedValue({
      id: "t1",
      title: "Judul TA",
      thesisSupervisors: [supervisor(P1, "Pembimbing 1", { defenceReady: true }), supervisor(P2, "Pembimbing 2")],
    });

    const result = await service.approveDefenceReadiness("t1", P1);

    expect(repo.approveDefenceReadiness).toHaveBeenCalledWith("t1", P1);
    expect(result.data).toEqual({
      thesisId: "t1",
      thesisTitle: "Judul TA",
      approvedBySupervisor1: true,
      approvedBySupervisor2: false,
      isFullyApproved: false,
    });
  });

  it("approve: rejected while the seminar revision is not finalised", async () => {
    useThesis(thesis({ seminars: [{ status: "passed_with_revision", revisionFinalizedAt: null }] }));

    await expect(service.approveDefenceReadiness("t1", P1)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("Revisi seminar hasil sudah difinalkan"),
    });
    expect(repo.approveDefenceReadiness).not.toHaveBeenCalled();
  });

  it("request: notifies the pending supervisors and is rejected before the seminar is passed", async () => {
    useThesis(thesis({ seminars: passed }));
    const result = await service.requestDefenceApproval("t1", STUDENT);
    expect(result.data.notifiedSupervisors).toBe(2);
    expect(notif.createNotification.mock.calls.map(([arg]) => arg.userId).sort()).toEqual([P1, P2]);
    expect(audit.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "DEFENCE_READINESS_REQUESTED" }));

    vi.clearAllMocks();
    notif.createNotification.mockResolvedValue({ id: "n1" });
    useThesis(thesis({ seminars: [] }));
    await expect(service.requestDefenceApproval("t1", STUDENT)).rejects.toMatchObject({ statusCode: 400 });
    expect(notif.createNotification).not.toHaveBeenCalled();
  });

  it("ready-for-defence list no longer carries a final document", async () => {
    repo.findStudentsReadyForDefence.mockResolvedValue([{
      id: "t1",
      title: "Judul TA",
      student: { user: { fullName: "Mahasiswa Uji", identityNumber: "2211", email: "m@x.test" } },
      thesisSupervisors: [{ defenceReady: true, role: { name: "Pembimbing 1" }, lecturer: { user: { fullName: "Dosen" } } }],
    }]);

    expect(await service.getStudentsReadyForDefence()).toEqual([{
      thesisId: "t1",
      thesisTitle: "Judul TA",
      student: { name: "Mahasiswa Uji", nim: "2211", email: "m@x.test" },
      supervisors: [{ name: "Dosen", role: "Pembimbing 1", defenceReady: true }],
    }]);
  });
});
