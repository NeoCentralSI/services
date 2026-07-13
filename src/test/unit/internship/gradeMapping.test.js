/**
 * Unit Tests — mapScoreToGrade()
 * 
 * Strategi Pemilihan Test Case (Sommerville, 2015):
 * 1. Equivalence Partitioning (EP-GM-01 s/d EP-GM-09)
 * 2. Guideline-Based Testing (Boundary Values) (GB-GM-01 s/d GB-GM-05)
 * 3. Path Testing (Covered by Equivalence Partitioning - 9 paths for 9 grades)
 */
import { describe, it, expect } from "vitest";
import { mapScoreToGrade } from "../../../services/insternship/penilaian.service.js";

// ============================================================
// GRADE MAPPING — EQUIVALENCE PARTITIONING & PATH TESTING
// ============================================================
describe("mapScoreToGrade — Equivalence Partitioning & Path Testing", () => {

    it("EP-GM-01: score >= 80 → A", () => {
        expect(mapScoreToGrade(85)).toBe("A");
    });

    it("EP-GM-02: 75 <= score < 80 → A-", () => {
        expect(mapScoreToGrade(77)).toBe("A-");
    });

    it("EP-GM-03: 70 <= score < 75 → B+", () => {
        expect(mapScoreToGrade(72)).toBe("B+");
    });

    it("EP-GM-04: 65 <= score < 70 → B", () => {
        expect(mapScoreToGrade(67)).toBe("B");
    });

    it("EP-GM-05: 60 <= score < 65 → B-", () => {
        expect(mapScoreToGrade(62)).toBe("B-");
    });

    it("EP-GM-06: 55 <= score < 60 → C+", () => {
        expect(mapScoreToGrade(57)).toBe("C+");
    });

    it("EP-GM-07: 50 <= score < 55 → C", () => {
        expect(mapScoreToGrade(52)).toBe("C");
    });

    it("EP-GM-08: 45 <= score < 50 → D", () => {
        expect(mapScoreToGrade(47)).toBe("D");
    });

    it("EP-GM-09: score < 45 → E", () => {
        expect(mapScoreToGrade(30)).toBe("E");
    });
});

// ============================================================
// GRADE MAPPING — GUIDELINE-BASED TESTING (Boundary Values)
// ============================================================
describe("mapScoreToGrade — Guideline-Based Testing (Boundary Values)", () => {

    it("GB-GM-01: Tepat pada boundary 80 (Batas A)", () => {
        expect(mapScoreToGrade(80)).toBe("A");
    });

    it("GB-GM-02: Tepat di bawah boundary 80 (Batas Atas A-)", () => {
        expect(mapScoreToGrade(79.99)).toBe("A-");
    });

    it("GB-GM-03: Tepat pada boundary 45 (Batas D)", () => {
        expect(mapScoreToGrade(45)).toBe("D");
    });

    it("GB-GM-04: Tepat di bawah boundary 45 (Batas Atas E)", () => {
        expect(mapScoreToGrade(44.99)).toBe("E");
    });

    it("GB-GM-05: Score = 0 (Minimum absolute)", () => {
        expect(mapScoreToGrade(0)).toBe("E");
    });
});
