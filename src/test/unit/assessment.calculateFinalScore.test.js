// Test untuk BR-10 (KONTEKS_KANONIS_SIMPTA.md §5.7).
// Formula 75:25 — `finalScore = supervisorScore + lecturerScore` (additive,
// max 100). Nilai akhir baru lengkap setelah TA-03A dan TA-03B sama-sama
// tersedia.

import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/prisma.js", () => ({
  default: {},
}));
vi.mock("../../repositories/metopen.repository.js", () => ({}));
vi.mock("../../helpers/academicYear.helper.js", () => ({}));
vi.mock("../../services/metopen.service.js", () => ({
  syncKadepProposalQueueByThesisId: vi.fn(),
}));

const { calculateFinalScore } = await import(
  "../../services/assessment.service.js"
);

describe("BR-10 calculateFinalScore — formula 75:25", () => {
  it("returns null when both scores missing", () => {
    expect(calculateFinalScore({})).toBeNull();
    expect(calculateFinalScore(null)).toBeNull();
    expect(calculateFinalScore(undefined)).toBeNull();
  });

  it("returns null when supervisorScore is missing (TA-03A belum ada)", () => {
    expect(calculateFinalScore({ supervisorScore: null, lecturerScore: 20 })).toBeNull();
    expect(calculateFinalScore({ lecturerScore: 20 })).toBeNull();
  });

  it("returns null when lecturerScore is missing (TA-03B belum ada)", () => {
    expect(calculateFinalScore({ supervisorScore: 70, lecturerScore: null })).toBeNull();
    expect(calculateFinalScore({ supervisorScore: 70 })).toBeNull();
  });

  it("returns 0 only when both scores are exactly 0", () => {
    expect(calculateFinalScore({ supervisorScore: 0, lecturerScore: 0 })).toBe(0);
  });

  it("computes 75 + 25 = 100 (maximum case)", () => {
    expect(calculateFinalScore({ supervisorScore: 75, lecturerScore: 25 })).toBe(100);
  });

  it("computes a representative passing score", () => {
    expect(calculateFinalScore({ supervisorScore: 60, lecturerScore: 18 })).toBe(78);
  });

  it("computes a low score that may fail Metopel passing threshold", () => {
    expect(calculateFinalScore({ supervisorScore: 30, lecturerScore: 10 })).toBe(40);
  });

  it("does not apply weighting beyond simple addition", () => {
    // Sanity: 70 + 20 must equal 90, not 70*0.75 + 20*0.25 = 52.5+5 = 57.5
    expect(calculateFinalScore({ supervisorScore: 70, lecturerScore: 20 })).toBe(90);
  });
});
