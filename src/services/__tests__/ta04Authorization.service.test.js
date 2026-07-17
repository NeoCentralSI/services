import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../repositories/ta04Authorization.repository.js", () => ({
  findTa04GuidanceAuthorization: vi.fn(),
}));

const repo = await import("../../repositories/ta04Authorization.repository.js");
const {
  TA04_GUIDANCE_GATE_MESSAGE,
  assertTa04GuidanceAuthorized,
  getTa04GuidanceAuthorization,
} = await import("../ta04Authorization.service.js");

function authorizationRow({ activeP1 = true, bookingApproved = true, issued = false } = {}) {
  return {
    id: "thesis-1",
    isProposal: true,
    ta04AssignmentIssuedAt: issued ? new Date("2026-07-10T08:00:00.000Z") : null,
    thesisSupervisors: activeP1 ? [{ id: "p1-1" }] : [],
    advisorRequests: bookingApproved ? [{ id: "request-1" }] : [],
  };
}

describe("ta04Authorization.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps booking separate from official guidance authorization", async () => {
    repo.findTa04GuidanceAuthorization.mockResolvedValue(authorizationRow());

    await expect(getTa04GuidanceAuthorization("thesis-1")).resolves.toMatchObject({
      hasBookedSupervisor: true,
      hasOfficialSupervisor: false,
      guidanceGateOpen: false,
      guidanceGateReason: TA04_GUIDANCE_GATE_MESSAGE,
    });
    await expect(assertTa04GuidanceAuthorized("thesis-1")).rejects.toThrow(
      TA04_GUIDANCE_GATE_MESSAGE,
    );
  });

  it("opens recorded proposal guidance only after TA-04 is issued", async () => {
    repo.findTa04GuidanceAuthorization.mockResolvedValue(authorizationRow({ issued: true }));

    await expect(getTa04GuidanceAuthorization("thesis-1")).resolves.toMatchObject({
      hasBookedSupervisor: true,
      hasOfficialSupervisor: true,
      guidanceGateOpen: true,
      guidanceGateReason: null,
    });
    await expect(assertTa04GuidanceAuthorized("thesis-1")).resolves.toMatchObject({
      guidanceGateOpen: true,
    });
  });

  it("distinguishes a missing booking from a booking waiting for KaDep", async () => {
    repo.findTa04GuidanceAuthorization.mockResolvedValue(
      authorizationRow({ activeP1: false, bookingApproved: false }),
    );

    await expect(getTa04GuidanceAuthorization("thesis-1")).resolves.toMatchObject({
      hasBookedSupervisor: false,
      hasOfficialSupervisor: false,
      guidanceGateOpen: false,
      guidanceGateReason: "Bimbingan proposal belum dapat dimulai karena booking pembimbing belum disetujui.",
    });
  });
});
