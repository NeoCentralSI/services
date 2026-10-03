import { describe, expect, it } from "vitest";
import {
  createThesisSchema,
  updateThesisSchema,
} from "../../../validators/masterDataTa.validator.js";

const STUDENT_ID = "11111111-1111-4111-8111-111111111111";
const LECTURER_ID = "22222222-2222-4222-8222-222222222222";
const STATUS_ID = "33333333-3333-4333-8333-333333333333";

describe("masterDataTa validator", () => {
  it("mempertahankan thesisStatusId dan nilai isProposal false saat pembaruan", () => {
    const result = updateThesisSchema.parse({
      thesisStatusId: STATUS_ID,
      isProposal: false,
    });

    expect(result).toEqual({
      thesisStatusId: STATUS_ID,
      isProposal: false,
    });
  });

  it("tetap menerima sentinel none untuk kompatibilitas status kosong", () => {
    const result = updateThesisSchema.parse({ thesisStatusId: "none" });

    expect(result.thesisStatusId).toBe("none");
  });

  it("mempertahankan isProposal saat pembuatan data tugas akhir", () => {
    const result = createThesisSchema.parse({
      studentId: STUDENT_ID,
      pembimbing1: LECTURER_ID,
      isProposal: false,
    });

    expect(result.isProposal).toBe(false);
  });
});
