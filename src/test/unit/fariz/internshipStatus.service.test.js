/**
 * Unit Tests — isFailingFinalGrade() & hasCompletionRequirements()
 * 
 * Strategi Pemilihan Test Case (Sommerville, 2015):
 * 1. Equivalence Partitioning (EP-FG-01 s/d EP-FG-07, EP-HC-01 s/d EP-HC-04)
 * 2. Guideline-Based Testing  (GB-FG-01 s/d GB-FG-03)
 * 3. Path Testing              (PT-HC-01 s/d PT-HC-07)
 */
import { describe, it, expect } from "vitest";
import {
    isFailingFinalGrade,
    hasCompletionRequirements
} from "../../../services/insternship/internshipStatus.service.js";

// ============================================================
// Helper: Membuat objek internship dengan semua syarat terpenuhi
// ============================================================
function makeCompleteInternship(overrides = {}) {
    return {
        lecturerAssessmentStatus: "COMPLETED",
        fieldAssessmentStatus: "COMPLETED",
        seminars: [{ id: "sem-1", status: "COMPLETED" }],
        logbookDocumentStatus: "APPROVED",
        companyReceiptStatus: "APPROVED",
        reportStatus: "APPROVED",
        ...overrides
    };
}

// ============================================================
// isFailingFinalGrade — EQUIVALENCE PARTITIONING
// ============================================================
describe("isFailingFinalGrade — Equivalence Partitioning", () => {

    it("EP-FG-01: Grade lulus (A) → false", () => {
        expect(isFailingFinalGrade("A")).toBe(false);
    });

    it("EP-FG-02: Grade lulus (B+) → false", () => {
        expect(isFailingFinalGrade("B+")).toBe(false);
    });

    it("EP-FG-03: Grade lulus batas (C) → false", () => {
        expect(isFailingFinalGrade("C")).toBe(false);
    });

    it("EP-FG-04: Grade gagal (D) → true", () => {
        expect(isFailingFinalGrade("D")).toBe(true);
    });

    it("EP-FG-05: Grade gagal (E) → true", () => {
        expect(isFailingFinalGrade("E")).toBe(true);
    });

    it("EP-FG-06: Grade null → false", () => {
        expect(isFailingFinalGrade(null)).toBe(false);
    });

    it("EP-FG-07: Grade empty string → false", () => {
        expect(isFailingFinalGrade("")).toBe(false);
    });
});

// ============================================================
// isFailingFinalGrade — GUIDELINE-BASED TESTING
// ============================================================
describe("isFailingFinalGrade — Guideline-Based Testing", () => {

    it("GB-FG-01: Case-insensitive — 'd' (lowercase) → true", () => {
        expect(isFailingFinalGrade("d")).toBe(true);
    });

    it("GB-FG-02: Dengan spasi leading/trailing — ' E ' → true", () => {
        expect(isFailingFinalGrade(" E ")).toBe(true);
    });

    it("GB-FG-03: Grade tidak standar (F) → false (bukan anggota Set)", () => {
        expect(isFailingFinalGrade("F")).toBe(false);
    });
});

// ============================================================
// hasCompletionRequirements — EQUIVALENCE PARTITIONING
// ============================================================
describe("hasCompletionRequirements — Equivalence Partitioning", () => {

    it("EP-HC-01: Semua 6 syarat terpenuhi → true", () => {
        const internship = makeCompleteInternship();
        expect(hasCompletionRequirements(internship)).toBe(true);
    });

    it("EP-HC-02: Lecturer assessment belum selesai → false", () => {
        const internship = makeCompleteInternship({
            lecturerAssessmentStatus: "ONGOING"
        });
        expect(hasCompletionRequirements(internship)).toBe(false);
    });

    it("EP-HC-03: Field assessment belum selesai → false", () => {
        const internship = makeCompleteInternship({
            fieldAssessmentStatus: "PENDING"
        });
        expect(hasCompletionRequirements(internship)).toBe(false);
    });

    it("EP-HC-04: Belum ada seminar yang selesai → false", () => {
        const internship = makeCompleteInternship({
            seminars: []
        });
        expect(hasCompletionRequirements(internship)).toBe(false);
    });
});

// ============================================================
// hasCompletionRequirements — PATH TESTING
// Setiap path menguji satu kondisi yang gagal secara independen
// ============================================================
describe("hasCompletionRequirements — Path Testing", () => {

    it("PT-HC-01: lecturerAssessmentStatus !== COMPLETED → false", () => {
        const internship = makeCompleteInternship({
            lecturerAssessmentStatus: "PENDING"
        });
        expect(hasCompletionRequirements(internship)).toBe(false);
    });

    it("PT-HC-02: fieldAssessmentStatus !== COMPLETED → false", () => {
        const internship = makeCompleteInternship({
            fieldAssessmentStatus: "ONGOING"
        });
        expect(hasCompletionRequirements(internship)).toBe(false);
    });

    it("PT-HC-03: seminars.length === 0 → false", () => {
        const internship = makeCompleteInternship({
            seminars: []
        });
        expect(hasCompletionRequirements(internship)).toBe(false);
    });

    it("PT-HC-04: logbookDocumentStatus !== APPROVED → false", () => {
        const internship = makeCompleteInternship({
            logbookDocumentStatus: "PENDING"
        });
        expect(hasCompletionRequirements(internship)).toBe(false);
    });

    it("PT-HC-05: companyReceiptStatus !== APPROVED → false", () => {
        const internship = makeCompleteInternship({
            companyReceiptStatus: "PENDING"
        });
        expect(hasCompletionRequirements(internship)).toBe(false);
    });

    it("PT-HC-06: reportStatus !== APPROVED → false", () => {
        const internship = makeCompleteInternship({
            reportStatus: "PENDING"
        });
        expect(hasCompletionRequirements(internship)).toBe(false);
    });

    it("PT-HC-07: Semua kondisi terpenuhi → true", () => {
        const internship = makeCompleteInternship();
        expect(hasCompletionRequirements(internship)).toBe(true);
    });
});
