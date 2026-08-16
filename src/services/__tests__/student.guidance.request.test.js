import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoMock = vi.hoisted(() => ({
  getStudentByUserId: vi.fn(),
  getActiveThesisForStudent: vi.fn(),
  getSupervisorsForThesis: vi.fn(),
  listGuidancesForThesis: vi.fn(),
  getGuidanceByIdForStudent: vi.fn(),
  createGuidance: vi.fn(),
  updateGuidanceById: vi.fn(),
  listGuidanceHistoryByStudent: vi.fn(),
  listMilestones: vi.fn(),
  listMilestoneTemplates: vi.fn(),
  createMilestonesDirectly: vi.fn(),
  submitSessionSummary: vi.fn(),
  getGuidanceForExport: vi.fn(),
  getGuidancesNeedingSummary: vi.fn(),
  getThesisHistory: vi.fn(),
}));

const prismaMock = {
  user: { findUnique: vi.fn() },
  thesisGuidance: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  thesisMilestone: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  thesis: { update: vi.fn(), findUnique: vi.fn() },
  academicYear: { findFirst: vi.fn() },
  documentType: { findFirst: vi.fn(), create: vi.fn() },
  document: { create: vi.fn() },
};

const assertTa04GuidanceAuthorized = vi.hoisted(() => vi.fn());
const createNotificationsForUsers = vi.hoisted(() => vi.fn());
const sendFcmToUsers = vi.hoisted(() => vi.fn());
const logAudit = vi.hoisted(() => vi.fn());

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../repositories/thesisGuidance/student.guidance.repository.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, ...repoMock };
});
vi.mock("../ta04Authorization.service.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    assertTa04GuidanceAuthorized,
  };
});
vi.mock("../notification.service.js", () => ({
  createNotificationsForUsers,
}));
vi.mock("../push.service.js", () => ({
  sendFcmToUsers,
  sendPushNotification: vi.fn(),
}));
vi.mock("../auditLog.service.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, logAudit };
});
vi.mock("../outlook-calendar.service.js", () => ({
  createGuidanceCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
}));

const { requestGuidanceService } = await import("../thesisGuidance/student.guidance.service.js");
const { buildGuidanceListWhere } = await import(
  "../../repositories/thesisGuidance/student.guidance.repository.js"
);

const GUIDANCE_DATE = new Date("2026-08-20T03:00:00.000Z");

function proposalThesis() {
  return {
    id: "thesis-1",
    isProposal: true,
    proposalStatus: "submitted",
    academicYearId: "ay-1",
    thesisStatus: { name: "Metopel" },
  };
}

function thesisAfterPromotion() {
  return {
    id: "thesis-1",
    isProposal: false,
    proposalStatus: "accepted",
    academicYearId: "ay-1",
    thesisStatus: { name: "Bimbingan" },
  };
}

function stubHappyPath(thesis) {
  repoMock.getStudentByUserId.mockResolvedValue({ id: "student-1" });
  repoMock.getActiveThesisForStudent.mockResolvedValue(thesis);
  prismaMock.user.findUnique.mockResolvedValue({
    fullName: "Mahasiswa Uji",
    identityNumber: "2211522028",
  });
  prismaMock.thesisGuidance.findFirst.mockResolvedValue(null);
  prismaMock.thesisGuidance.findMany.mockResolvedValue([]);
  prismaMock.thesisMilestone.findMany.mockResolvedValue([]);
  repoMock.getSupervisorsForThesis.mockResolvedValue([
    {
      lecturerId: "lect-1",
      role: { name: "Pembimbing 1" },
      lecturer: { user: { id: "lect-user-1", fullName: "Dosen Pembimbing" } },
    },
  ]);
  repoMock.createGuidance.mockImplementation(async (data) => ({
    id: "guidance-1",
    ...data,
    requestedDate: GUIDANCE_DATE,
    status: "requested",
  }));
  createNotificationsForUsers.mockResolvedValue(undefined);
  sendFcmToUsers.mockResolvedValue(true);
  logAudit.mockResolvedValue(undefined);
  assertTa04GuidanceAuthorized.mockResolvedValue({ guidanceGateOpen: true });
}

describe("requestGuidanceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asserts TA-04 for Metopel theses and stores derived proposal phase", async () => {
    stubHappyPath(proposalThesis());

    const result = await requestGuidanceService(
      "student-1",
      GUIDANCE_DATE,
      "Catatan",
      null,
      "lect-1",
    );

    expect(assertTa04GuidanceAuthorized).toHaveBeenCalledWith("thesis-1");
    expect(repoMock.createGuidance).toHaveBeenCalledWith(
      expect.objectContaining({
        thesisId: "thesis-1",
        supervisorId: "lect-1",
        phase: "proposal",
        status: "requested",
      }),
    );
    expect(createNotificationsForUsers).toHaveBeenCalled();
    expect(result.guidance.phase).toBe("proposal");
  });

  it("skips the TA-04 proposal gate after the thesis leaves Metopel", async () => {
    stubHappyPath(thesisAfterPromotion());

    await requestGuidanceService("student-1", GUIDANCE_DATE, "Catatan", null, "lect-1");

    expect(assertTa04GuidanceAuthorized).not.toHaveBeenCalled();
    expect(repoMock.createGuidance).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "thesis" }),
    );
  });

  it("rejects a second pending request before creating another row", async () => {
    stubHappyPath(proposalThesis());
    prismaMock.thesisGuidance.findFirst.mockResolvedValue({
      id: "existing",
      requestedDate: GUIDANCE_DATE,
      status: "requested",
    });

    await expect(
      requestGuidanceService("student-1", GUIDANCE_DATE, "Catatan", null, "lect-1"),
    ).rejects.toThrow(/masih memiliki pengajuan bimbingan/);
    expect(repoMock.createGuidance).not.toHaveBeenCalled();
  });
});

describe("buildGuidanceListWhere", () => {
  it("filters by proposal|thesis phase and ignores other values", () => {
    expect(buildGuidanceListWhere("t1", null, "proposal")).toEqual({
      thesisId: "t1",
      status: { not: "deleted" },
      phase: "proposal",
    });
    expect(buildGuidanceListWhere("t1", "completed", "thesis").phase).toBe("thesis");
    expect(buildGuidanceListWhere("t1", null, "all").phase).toBeUndefined();
  });
});

describe("HTTP POST /student/guidance/request", () => {
  it("delegates create to requestGuidanceService instead of inline prisma writes", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const routeSrc = readFileSync(join(here, "../../routes/thesisGuidance.route.js"), "utf8");
    expect(routeSrc).toContain("requestGuidanceService");
    expect(routeSrc).not.toMatch(/tx\.thesisGuidance\.create/);
    expect(routeSrc).not.toMatch(/req\.body\.phase/);
  });
});
