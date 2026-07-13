/**
 * Unit Tests — getWorkingDays()
 * 
 * Strategi Pemilihan Test Case (Sommerville, 2015):
 * 1. Equivalence Partitioning (EP-WD-01 s/d EP-WD-07)
 * 2. Guideline-Based Testing  (GB-WD-01 s/d GB-WD-04)
 * 3. Path Testing              (PT-WD-01 s/d PT-WD-04)
 */
import { describe, it, expect } from "vitest";
import { getWorkingDays } from "../../../utils/internship-date.util.js";

// ============================================================
// 1. EQUIVALENCE PARTITIONING
// ============================================================
describe("getWorkingDays — Equivalence Partitioning", () => {

    it("EP-WD-01: Range normal (weekday saja, Sen-Jum) → 5 hari kerja", () => {
        // 2026-07-06 = Senin, 2026-07-10 = Jumat
        const result = getWorkingDays("2026-07-06", "2026-07-10", []);
        expect(result).toHaveLength(5);
    });

    it("EP-WD-02: Range melintasi weekend (Sen-Min) → tetap 5 hari kerja", () => {
        // 2026-07-06 = Senin, 2026-07-12 = Minggu
        const result = getWorkingDays("2026-07-06", "2026-07-12", []);
        expect(result).toHaveLength(5);
    });

    it("EP-WD-03: Range dengan hari libur → hari libur dikurangi", () => {
        // 2026-07-06 = Sen, 2026-07-10 = Jum, 2026-07-08 = Rabu (libur)
        const result = getWorkingDays("2026-07-06", "2026-07-10", ["2026-07-08"]);
        expect(result).toHaveLength(4);
    });

    it("EP-WD-04: Range dimulai dari weekend → weekend dilewati", () => {
        // 2026-07-11 = Sabtu, 2026-07-17 = Jumat
        const result = getWorkingDays("2026-07-11", "2026-07-17", []);
        expect(result).toHaveLength(5);
    });

    it("EP-WD-05: Tanggal sama (weekday) → 1 hari kerja", () => {
        // 2026-07-06 = Senin
        const result = getWorkingDays("2026-07-06", "2026-07-06", []);
        expect(result).toHaveLength(1);
    });

    it("EP-WD-06: Tanggal sama (weekend) → 0 hari kerja", () => {
        // 2026-07-11 = Sabtu
        const result = getWorkingDays("2026-07-11", "2026-07-11", []);
        expect(result).toHaveLength(0);
    });

    it("EP-WD-07: Range terbalik (start > end) → 0 hari kerja", () => {
        const result = getWorkingDays("2026-07-10", "2026-07-06", []);
        expect(result).toHaveLength(0);
    });
});

// ============================================================
// 2. GUIDELINE-BASED TESTING
// ============================================================
describe("getWorkingDays — Guideline-Based Testing", () => {

    it("GB-WD-01: Holiday jatuh di weekend → tidak berpengaruh pada hasil", () => {
        // 2026-07-06 = Sen, 2026-07-10 = Jum
        // Holiday di 2026-07-11 = Sabtu (bukan weekday, jadi tidak berpengaruh)
        const withHolidayOnWeekend = getWorkingDays("2026-07-06", "2026-07-12", ["2026-07-11"]);
        const withoutHoliday = getWorkingDays("2026-07-06", "2026-07-12", []);
        expect(withHolidayOnWeekend).toHaveLength(withoutHoliday.length);
    });

    it("GB-WD-02: Semua weekday di range adalah holiday → 0 hari kerja", () => {
        // 2026-07-06 (Sen) s/d 2026-07-10 (Jum) → semua 5 hari sebagai holiday
        const allHolidays = [
            "2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10"
        ];
        const result = getWorkingDays("2026-07-06", "2026-07-10", allHolidays);
        expect(result).toHaveLength(0);
    });

    it("GB-WD-03: Holidays sebagai Date object → hasil sama dengan string", () => {
        const resultString = getWorkingDays("2026-07-06", "2026-07-10", ["2026-07-08"]);
        const resultDate = getWorkingDays("2026-07-06", "2026-07-10", [new Date("2026-07-08")]);
        expect(resultString).toHaveLength(resultDate.length);
    });

    it("GB-WD-04: Range panjang (~6 minggu) → menghasilkan ~30 hari kerja", () => {
        // 6 minggu = 42 hari kalender = 30 hari kerja (6 × 5)
        // 2026-07-06 (Sen) s/d 2026-08-14 (Jum) = 6 minggu tepat
        const result = getWorkingDays("2026-07-06", "2026-08-14", []);
        expect(result).toHaveLength(30);
    });
});

// ============================================================
// 3. PATH TESTING
// ============================================================
describe("getWorkingDays — Path Testing", () => {

    it("PT-WD-01: Path 1 — Loop tidak dieksekusi (start > end)", () => {
        const result = getWorkingDays("2026-07-10", "2026-07-06", []);
        expect(result).toEqual([]);
    });

    it("PT-WD-02: Path 2 — Loop jalan, semua hari weekend", () => {
        // Sabtu + Minggu saja
        const result = getWorkingDays("2026-07-11", "2026-07-12", []);
        expect(result).toEqual([]);
    });

    it("PT-WD-03: Path 3 — Loop jalan, weekday, bukan holiday → days.push()", () => {
        // Senin saja, tanpa holiday
        const result = getWorkingDays("2026-07-06", "2026-07-06", []);
        expect(result).toHaveLength(1);
        expect(result[0]).toBeInstanceOf(Date);
    });

    it("PT-WD-04: Path 4 — Loop jalan, weekday, adalah holiday → skip push", () => {
        // Senin saja, TAPI dia holiday
        const result = getWorkingDays("2026-07-06", "2026-07-06", ["2026-07-06"]);
        expect(result).toHaveLength(0);
    });
});
