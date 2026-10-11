import { describe, expect, it } from "vitest";
import { deriveGuidancePhaseFromThesis } from "../ta04Authorization.service.js";

describe("deriveGuidancePhaseFromThesis", () => {
  it("keeps Metopel theses on proposal even if a client would send research", () => {
    expect(
      deriveGuidancePhaseFromThesis({
        status: "proposal",
        proposalStatus: "submitted",
      }),
    ).toBe("proposal");
  });

  it("uses research phase after proposal is accepted", () => {
    expect(
      deriveGuidancePhaseFromThesis({
        status: "proposal",
        proposalStatus: "accepted",
      }),
    ).toBe("research");
  });

  it("uses research phase when the thesis has left Metopel", () => {
    expect(
      deriveGuidancePhaseFromThesis({
        status: "research",
        proposalStatus: "submitted",
      }),
    ).toBe("research");
  });
});
