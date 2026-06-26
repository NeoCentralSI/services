/**
 * Unit Tests — Co-advisor assignment (FR-CHG-02)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockHasPembimbing2, mockCreateThesisSupervisors, mockMarkProcessed, mockPrisma, mockSyncQuotaCount } = vi.hoisted(() => ({
  mockHasPembimbing2: vi.fn(),
  mockCreateThesisSupervisors: vi.fn(),
  mockMarkProcessed: vi.fn().mockResolvedValue({ count: 0 }),
  mockPrisma: {
    thesis: { findUnique: vi.fn(), update: vi.fn() },
    lecturer: { findUnique: vi.fn() },
    thesisParticipant: { findFirst: vi.fn() },
    notification: { updateMany: vi.fn() },
    researchMethodScore: { findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (fn) => fn(mockPrisma)),
  },
  mockSyncQuotaCount: vi.fn(),
}));

vi.mock("../../repositories/thesisGuidance/supervisor2.repository.js", () => ({
  hasPembimbing2: (...args) => mockHasPembimbing2(...args),
  createThesisSupervisors: (...args) => mockCreateThesisSupervisors(...args),
  markSupervisor2RequestsProcessedForThesis: (...args) => mockMarkProcessed(...args),
}));
vi.mock("../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../utils/quotaSync.js", () => ({ syncQuotaCount: (...args) => mockSyncQuotaCount(...args) }));
vi.mock("../../services/metopen.service.js", () => ({
  syncKadepProposalQueueByThesisId: vi.fn().mockResolvedValue({ synced: false }),
}));
vi.mock("../../services/notification.service.js", () => ({
  createNotificationsForUsers: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../services/push.service.js", () => ({
  sendFcmToUsers: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../services/auditLog.service.js", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
  AUDIT_ACTIONS: { REQUEST_ADVISOR_KADEP_APPROVED: "REQUEST_ADVISOR_KADEP_APPROVED" },
  ENTITY_TYPES: { SUPERVISOR2_REQUEST: "SUPERVISOR2_REQUEST" },
}));
vi.mock("../../utils/global.util.js", () => ({
  toTitleCaseName: (name) => name || "Dosen",
}));

import { assignCoAdvisor } from "../../services/thesisSupervisors.service.js";

describe("ThesisSupervisors: assignCoAdvisor (FR-CHG-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.researchMethodScore.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (fn) => fn(mockPrisma));
  });

  const baseThesis = {
    id: "thesis-1",
    student: { user: { id: "student-1", fullName: "Mahasiswa Test" } },
    thesisSupervisors: [{ lecturerId: "lec-1", role: { name: "Pembimbing 1" } }],
  };

  it("assigns Pembimbing 2 when thesis exists and has no P2", async () => {
    mockPrisma.thesis.findUnique.mockResolvedValue(baseThesis);
    mockHasPembimbing2.mockResolvedValue(false);
    mockPrisma.lecturer.findUnique.mockResolvedValue({
      id: "lec-2",
      user: { fullName: "Dr. Budi" },
    });
    mockCreateThesisSupervisors.mockResolvedValue({ id: "ts-1" });

    const result = await assignCoAdvisor("thesis-1", "lec-2", "kadep-1");

    expect(result.message).toBe("Pembimbing 2 berhasil ditetapkan");
    expect(result.thesisId).toBe("thesis-1");
    expect(result.lecturerId).toBe("lec-2");
    expect(mockCreateThesisSupervisors).toHaveBeenCalledWith("thesis-1", "lec-2", mockPrisma);
  });

  it("resets isFinalized when score was finalized without P2 co-sign", async () => {
    mockPrisma.thesis.findUnique.mockResolvedValue(baseThesis);
    mockHasPembimbing2.mockResolvedValue(false);
    mockPrisma.lecturer.findUnique.mockResolvedValue({
      id: "lec-2",
      user: { fullName: "Dr. Budi" },
    });
    mockCreateThesisSupervisors.mockResolvedValue({ id: "ts-1" });
    mockPrisma.researchMethodScore.findFirst.mockResolvedValue({
      id: "score-1",
      isFinalized: true,
      coSignedAt: null,
      supervisorScore: 60,
    });
    mockPrisma.researchMethodScore.update.mockResolvedValue({});

    await assignCoAdvisor("thesis-1", "lec-2", "kadep-1");

    expect(mockPrisma.researchMethodScore.update).toHaveBeenCalledWith({
      where: { id: "score-1" },
      data: { isFinalized: false, finalizedBy: null, finalizedAt: null },
    });
  });

  it("does NOT reset isFinalized when score already has co-sign", async () => {
    mockPrisma.thesis.findUnique.mockResolvedValue(baseThesis);
    mockHasPembimbing2.mockResolvedValue(false);
    mockPrisma.lecturer.findUnique.mockResolvedValue({
      id: "lec-2",
      user: { fullName: "Dr. Budi" },
    });
    mockCreateThesisSupervisors.mockResolvedValue({ id: "ts-1" });
    mockPrisma.researchMethodScore.findFirst.mockResolvedValue({
      id: "score-1",
      isFinalized: true,
      coSignedAt: new Date(),
      supervisorScore: 60,
    });

    await assignCoAdvisor("thesis-1", "lec-2", "kadep-1");

    expect(mockPrisma.researchMethodScore.update).not.toHaveBeenCalled();
  });

  it("rejects (400) when thesis already has Pembimbing 2", async () => {
    mockPrisma.thesis.findUnique.mockResolvedValue({ ...baseThesis, thesisSupervisors: [] });
    mockHasPembimbing2.mockResolvedValue(true);

    await expect(assignCoAdvisor("thesis-1", "lec-2", "kadep-1")).rejects.toMatchObject({
      message: expect.stringContaining("sudah memiliki Pembimbing 2"),
      statusCode: 400,
    });
    expect(mockCreateThesisSupervisors).not.toHaveBeenCalled();
  });

  it("rejects (404) when thesis not found", async () => {
    mockPrisma.thesis.findUnique.mockResolvedValue(null);

    await expect(assignCoAdvisor("nonexistent", "lec-2", "kadep-1")).rejects.toMatchObject({
      message: expect.stringContaining("tidak ditemukan"),
      statusCode: 404,
    });
  });

  it("rejects (400) when lecturer already a supervisor", async () => {
    mockPrisma.thesis.findUnique.mockResolvedValue({
      ...baseThesis,
      thesisSupervisors: [{ lecturerId: "lec-2", role: { name: "Pembimbing 1" } }],
    });
    mockHasPembimbing2.mockResolvedValue(false);
    mockPrisma.lecturer.findUnique.mockResolvedValue({ id: "lec-2", user: {} });

    await expect(assignCoAdvisor("thesis-1", "lec-2", "kadep-1")).rejects.toMatchObject({
      message: expect.stringContaining("sudah terdaftar"),
      statusCode: 400,
    });
  });
});
