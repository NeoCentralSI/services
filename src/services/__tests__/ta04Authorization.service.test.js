import { describe, expect, it } from "vitest";
import { deriveGuidancePhaseFromThesis } from "../ta04Authorization.service.js";

describe("deriveGuidancePhaseFromThesis", () => {
  it("keeps Metopel theses on proposal even if a client would send thesis", () => {
    expect(
      deriveGuidancePhaseFromThesis({
        isProposal: true,
        proposalStatus: "submitted",
      }),
    ).toBe("proposal");
  });

  it("uses thesis phase after proposal is accepted", () => {
    expect(
      deriveGuidancePhaseFromThesis({
        isProposal: true,
        proposalStatus: "accepted",
      }),
    ).toBe("thesis");
  });

  it("uses thesis phase when the thesis has left Metopel", () => {
    expect(
      deriveGuidancePhaseFromThesis({
        isProposal: false,
        proposalStatus: "submitted",
      }),
    ).toBe("thesis");
  });
});
