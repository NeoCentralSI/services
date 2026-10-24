import { describe, expect, it } from "vitest";
import {
  createThesisSchema,
  updateThesisSchema,
} from "../../../validators/masterDataTa.validator.js";

const STUDENT_ID = "11111111-1111-4111-8111-111111111111";
const LECTURER_ID = "22222222-2222-4222-8222-222222222222";

// The thesis status is the enum `status`; thesisStatusId/isProposal are gone.
describe("masterDataTa validator", () => {
  it("mempertahankan status enum saat pembaruan", () => {
    const result = updateThesisSchema.parse({ status: "completed" });

    expect(result).toEqual({ status: "completed" });
    // Leave follows the student status; it is not a thesis status any more.
    expect(() => updateThesisSchema.parse({ status: "on_leave" })).toThrow();
  });

  it("menolak nilai status di luar enum dan field lama tidak diteruskan", () => {
    expect(() => updateThesisSchema.parse({ status: "Bimbingan" })).toThrow();

    const result = updateThesisSchema.parse({ thesisStatusId: "none", isProposal: false });
    expect(result).not.toHaveProperty("thesisStatusId");
    expect(result).not.toHaveProperty("isProposal");
  });

  it("mempertahankan status saat pembuatan data tugas akhir", () => {
    const result = createThesisSchema.parse({
      studentId: STUDENT_ID,
      pembimbing1: LECTURER_ID,
      status: "research",
    });

    expect(result.status).toBe("research");
  });
});
