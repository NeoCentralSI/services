/**
 * Unit Tests — Co-advisor assignment (FR-CHG-02)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockHasPembimbing2, mockCreateThesisSupervisors, mockPrisma } = vi.hoisted(() => ({
  mockHasPembimbing2: vi.fn(),
  mockCreateThesisSupervisors: vi.fn(),
  mockPrisma: {
    thesis: { findUnique: vi.fn() },
    lecturer: { findUnique: vi.fn() },
  },
}));

vi.mock("../../repositories/thesisGuidance/supervisor2.repository.js", () => ({
  hasPembimbing2: (...args) => mockHasPembimbing2(...args),
  createThesisSupervisors: (...args) => mockCreateThesisSupervisors(...args),
}));
vi.mock("../../config/prisma.js", () => ({ default: mockPrisma }));

import { assignCoAdvisor } from "../../services/thesisSupervisors.service.js";

describe("ThesisSupervisors: assignCoAdvisor (FR-CHG-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assigns Pembimbing 2 when thesis exists and has no P2", async () => {
    mockPrisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      thesisSupervisors: [{ lecturerId: "lec-1", role: { name: "Pembimbing 1" } }],
    });
    mockHasPembimbing2.mockResolvedValue(false);
    mockPrisma.lecturer.findUnique.mockResolvedValue({
      id: "lec-2",
      user: { fullName: "Dr. Budi" },
    });
    mockCreateThesisSupervisors.mockResolvedValue({ id: "ts-1" });

    const result = await assignCoAdvisor("thesis-1", "lec-2");

    expect(result.message).toBe("Pembimbing 2 berhasil ditetapkan");
    expect(result.thesisId).toBe("thesis-1");
    expect(result.lecturerId).toBe("lec-2");
    expect(mockCreateThesisSupervisors).toHaveBeenCalledWith("thesis-1", "lec-2");
  });

  it("rejects (400) when thesis already has Pembimbing 2", async () => {
    mockPrisma.thesis.findUnique.mockResolvedValue({ id: "thesis-1", thesisSupervisors: [] });
    mockHasPembimbing2.mockResolvedValue(true);

    await expect(assignCoAdvisor("thesis-1", "lec-2")).rejects.toMatchObject({
      message: expect.stringContaining("sudah memiliki Pembimbing 2"),
      statusCode: 400,
    });
    expect(mockCreateThesisSupervisors).not.toHaveBeenCalled();
  });

  it("rejects (404) when thesis not found", async () => {
    mockPrisma.thesis.findUnique.mockResolvedValue(null);

    await expect(assignCoAdvisor("nonexistent", "lec-2")).rejects.toMatchObject({
      message: expect.stringContaining("tidak ditemukan"),
      statusCode: 404,
    });
  });

  it("rejects (400) when lecturer already a supervisor", async () => {
    mockPrisma.thesis.findUnique.mockResolvedValue({
      id: "thesis-1",
      thesisSupervisors: [{ lecturerId: "lec-2", role: { name: "Pembimbing 1" } }],
    });
    mockHasPembimbing2.mockResolvedValue(false);
    mockPrisma.lecturer.findUnique.mockResolvedValue({ id: "lec-2", user: {} });

    await expect(assignCoAdvisor("thesis-1", "lec-2")).rejects.toMatchObject({
      message: expect.stringContaining("sudah terdaftar"),
      statusCode: 400,
    });
  });
});
