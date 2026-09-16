/**
 * Unit Tests — terbilang(), formatLongIndonesianDate(), getIndonesianDayName(), getIndonesianMonthName()
 * 
 * Strategi Pemilihan Test Case (Sommerville, 2015):
 * 1. Equivalence Partitioning (EP-TB-01 s/d EP-TB-09, EP-DF-01 s/d EP-DF-07)
 * 2. Guideline-Based Testing  (GB-TB-01 s/d GB-TB-06, GB-DF-01 s/d GB-DF-02)
 * 3. Path Testing              (PT-TB-01 s/d PT-TB-07)
 */
import { describe, it, expect } from "vitest";
import {
    terbilang,
    formatLongIndonesianDate,
    getIndonesianDayName,
    getIndonesianMonthName
} from "../../../utils/internship-document.util.js";

// ============================================================
// TERBILANG — EQUIVALENCE PARTITIONING
// ============================================================
describe("terbilang — Equivalence Partitioning", () => {

    it("EP-TB-01: n = 0 → string kosong", () => {
        expect(terbilang(0)).toBe("");
    });

    it("EP-TB-02: 1 ≤ n ≤ 11 (satuan) → kata tunggal", () => {
        expect(terbilang(7)).toBe("tujuh");
    });

    it("EP-TB-03: n = 11 (sebelas khusus) → 'sebelas'", () => {
        expect(terbilang(11)).toBe("sebelas");
    });

    it("EP-TB-04: 12 ≤ n ≤ 19 (belasan) → '... belas'", () => {
        expect(terbilang(15)).toBe("lima belas");
    });

    it("EP-TB-05: 20 ≤ n ≤ 99 (puluhan) → '... puluh ...'", () => {
        expect(terbilang(42)).toBe("empat puluh dua");
    });

    it("EP-TB-06: 100 ≤ n ≤ 199 (seratus khusus) → 'seratus ...'", () => {
        expect(terbilang(150)).toBe("seratus lima puluh");
    });

    it("EP-TB-07: 200 ≤ n ≤ 999 (ratusan umum) → '... ratus ...'", () => {
        expect(terbilang(365)).toBe("tiga ratus enam puluh lima");
    });

    it("EP-TB-08: 1000 ≤ n ≤ 1999 (seribu khusus) → 'seribu ...'", () => {
        expect(terbilang(1500)).toBe("seribu lima ratus");
    });

    it("EP-TB-09: n ≥ 2000 (ribuan umum) → '... ribu ...'", () => {
        expect(terbilang(5000)).toBe("lima ribu");
    });
});

// ============================================================
// TERBILANG — GUIDELINE-BASED TESTING (Boundary Values)
// ============================================================
describe("terbilang — Guideline-Based Testing", () => {

    it("GB-TB-01: Boundary batas atas words[] — n = 11", () => {
        expect(terbilang(11)).toBe("sebelas");
    });

    it("GB-TB-02: Boundary awal belasan — n = 12", () => {
        expect(terbilang(12)).toBe("dua belas");
    });

    it("GB-TB-03: Boundary awal puluhan — n = 20", () => {
        expect(terbilang(20)).toBe("dua puluh");
    });

    it("GB-TB-04: Boundary awal seratus khusus — n = 100", () => {
        expect(terbilang(100)).toBe("seratus");
    });

    it("GB-TB-05: Boundary awal ratusan umum — n = 200", () => {
        expect(terbilang(200)).toBe("dua ratus");
    });

    it("GB-TB-06: Angka bulat puluhan — n = 30", () => {
        expect(terbilang(30)).toBe("tiga puluh");
    });
});

// ============================================================
// TERBILANG — PATH TESTING
// ============================================================
describe("terbilang — Path Testing", () => {

    it("PT-TB-01: Path n < 12 → return words[n]", () => {
        expect(terbilang(5)).toBe("lima");
    });

    it("PT-TB-02: Path 12 ≤ n < 20 → rekursi + ' belas'", () => {
        expect(terbilang(13)).toBe("tiga belas");
    });

    it("PT-TB-03: Path 20 ≤ n < 100 → '... puluh ...'", () => {
        expect(terbilang(25)).toBe("dua puluh lima");
    });

    it("PT-TB-04: Path 100 ≤ n < 200 → 'seratus ...'", () => {
        expect(terbilang(100)).toBe("seratus");
    });

    it("PT-TB-05: Path 200 ≤ n < 1000 → '... ratus ...'", () => {
        expect(terbilang(456)).toBe("empat ratus lima puluh enam");
    });

    it("PT-TB-06: Path 1000 ≤ n < 2000 → 'seribu ...'", () => {
        expect(terbilang(1000)).toBe("seribu");
    });

    it("PT-TB-07: Path n ≥ 2000 → '... ribu ...'", () => {
        expect(terbilang(2500)).toBe("dua ribu lima ratus");
    });
});

// ============================================================
// DATE FORMATTERS — EQUIVALENCE PARTITIONING
// ============================================================
describe("formatLongIndonesianDate — Equivalence Partitioning", () => {

    it("EP-DF-01: Date object valid → mengandung bulan & tahun Indonesia", () => {
        const result = formatLongIndonesianDate(new Date("2026-04-24"));
        expect(result).toContain("April");
        expect(result).toContain("2026");
    });

    it("EP-DF-02: Input null → return '-'", () => {
        expect(formatLongIndonesianDate(null)).toBe("-");
    });

    it("EP-DF-03: Input string ISO → mengandung bulan & tahun Indonesia", () => {
        const result = formatLongIndonesianDate("2026-01-01");
        expect(result).toContain("2026");
    });
});

describe("getIndonesianDayName — Equivalence Partitioning", () => {

    it("EP-DF-04: Tanggal valid (Senin) → mengandung nama hari", () => {
        // 2026-07-06 = Senin
        const result = getIndonesianDayName("2026-07-06");
        expect(result).toContain("Senin");
    });

    it("EP-DF-05: Input null → return '-'", () => {
        expect(getIndonesianDayName(null)).toBe("-");
    });
});

describe("getIndonesianMonthName — Equivalence Partitioning", () => {

    it("EP-DF-06: Tanggal valid → mengandung nama bulan Indonesia", () => {
        const result = getIndonesianMonthName("2026-08-15");
        expect(result).toContain("Agustus");
    });

    it("EP-DF-07: Input null → return '-'", () => {
        expect(getIndonesianMonthName(null)).toBe("-");
    });
});

// ============================================================
// DATE FORMATTERS — GUIDELINE-BASED TESTING
// ============================================================
describe("Date Formatters — Guideline-Based Testing", () => {

    it("GB-DF-01: Input string ISO vs Date object → hasil konsisten", () => {
        const fromString = formatLongIndonesianDate("2026-07-06");
        const fromDate = formatLongIndonesianDate(new Date("2026-07-06"));
        expect(fromString).toBe(fromDate);
    });

    it("GB-DF-02: Tanggal akhir bulan → bulan tetap benar", () => {
        const result = getIndonesianMonthName("2026-01-31");
        expect(result).toContain("Januari");
    });
});
