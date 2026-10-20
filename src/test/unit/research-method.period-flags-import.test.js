import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Impor Keikutsertaan. The preview stores nothing; applying writes the changed rows
 * with source admin and audits the counts; the same file again changes nothing.
 */
const { audit } = vi.hoisted(() => ({ audit: { logAudit: vi.fn(async () => null) } }));
vi.mock("../../config/prisma.js", () => ({ default: {} }));
vi.mock("../../services/auditLog.service.js", async (importOriginal) => ({ ...(await importOriginal()), logAudit: audit.logAudit }));

const { parseFlagCell, parsePeriodFlagsSheet, previewPeriodFlagsImport, applyPeriodFlagsImport, buildPeriodFlagsTemplate, PERIOD_FLAGS_HEADERS } =
  await import("../../services/research-method/period-flags-import.service.js");

const HEADERS = ["NIM", "Mengambil Metode Penelitian", "Mengambil Tugas Akhir"];
const xlsx = (rows) => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Keikutsertaan");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
};
const csv = (text) => Buffer.from(text, "utf8");

/** An in-memory database of users and snapshots, enough for the plan and the writes. */
function fakeDb({ users = [], snapshots = [] } = {}) {
  const rows = snapshots.map((s) => ({ ...s }));
  const db = {
    academicYear: { findUnique: vi.fn(async ({ where }) => (where.id === "ay-1" ? { id: "ay-1", year: "2026/2027", semester: "ganjil" } : null)) },
    user: { findMany: vi.fn(async ({ where }) => users.filter((u) => where.identityNumber.in.includes(u.identityNumber))) },
    studentAcademicYearSnapshot: {
      findMany: vi.fn(async ({ where }) => rows.filter((r) => r.academicYearId === where.academicYearId && where.studentId.in.includes(r.studentId))),
      upsert: vi.fn(async ({ where, create, update }) => {
        const key = where.studentId_academicYearId;
        const found = rows.find((r) => r.studentId === key.studentId && r.academicYearId === key.academicYearId);
        if (found) Object.assign(found, update);
        else rows.push({ ...create });
        return found ?? create;
      }),
    },
    $transaction: vi.fn(async (fn) => fn(db)),
    rows,
  };
  return db;
}

const USERS = [
  { id: "s1", fullName: "Uji Proposal Tidak Layak", identityNumber: "2211528002" },
  { id: "s2", fullName: "Uji Proposal Layak", identityNumber: "2211528001" },
];
const SNAPSHOTS = [
  { studentId: "s1", academicYearId: "ay-1", eligibleResearchMethod: false, eligibilitySource: "sia", takingThesisCourse: false, thesisCourseSource: "sia" },
  { studentId: "s2", academicYearId: "ay-1", eligibleResearchMethod: true, eligibilitySource: "admin", takingThesisCourse: false, thesisCourseSource: "sia" },
];

beforeEach(() => vi.clearAllMocks());

describe("parser", () => {
  it("Ya/Tidak (and yes/no, true/false, 1/0); empty = not changed; anything else is invalid", () => {
    expect(parseFlagCell("Ya")).toEqual({ value: true });
    expect(parseFlagCell(" tidak ")).toEqual({ value: false });
    expect(parseFlagCell(1)).toEqual({ value: true });
    expect(parseFlagCell("")).toEqual({ empty: true });
    expect(parseFlagCell("Mungkin")).toEqual({ invalid: true });
  });

  it("reads the template columns from .xlsx and .csv; reports bad rows without stopping", () => {
    const rows = [HEADERS, ["2211528002", "Ya", ""], ["", "Ya", "Tidak"], ["2211528001", "Mungkin", "Ya"], ["2211528005", "", ""], ["2211528002", "Tidak", ""], ["", "", ""]];
    const parsed = parsePeriodFlagsSheet(xlsx(rows));
    expect(parsed.valid).toEqual([{ row: 2, nim: "2211528002", name: null, flags: { eligibleResearchMethod: true } }]);
    expect(parsed.invalid.map((i) => [i.row, i.reason])).toEqual([
      [3, "NIM kosong."],
      [4, "Mengambil Metode Penelitian: isi Ya atau Tidak."],
      [5, "Tidak ada penanda yang diisi."],
      [6, "NIM sudah ada di baris 2."],
    ]);
    expect(parsed.totalRows).toBe(5);
    const fromCsv = parsePeriodFlagsSheet(csv("NIM,Mengambil Metode Penelitian,Mengambil Tugas Akhir\n2211528002,Ya,Tidak\n"));
    expect(fromCsv.valid).toEqual([{ row: 2, nim: "2211528002", name: null, flags: { eligibleResearchMethod: true, takingThesisCourse: false } }]);
  });

  it("a sheet without the NIM and flag headers is refused", () => {
    expect(() => parsePeriodFlagsSheet(xlsx([["Nama", "Kelas"], ["Budi", "A"]]))).toThrow(/Header tidak ditemukan/);
  });

  it("the template has NIM, Nama and the two flags", () => {
    const book = XLSX.read(buildPeriodFlagsTemplate(), { type: "buffer" });
    expect(XLSX.utils.sheet_to_json(book.Sheets.Keikutsertaan, { header: 1 })[0]).toEqual([...PERIOD_FLAGS_HEADERS]);
  });
});

describe("preview and apply", () => {
  const file = () => xlsx([HEADERS, ["2211528002", "Ya", ""], ["2211528001", "Ya", ""], ["2211599999", "Ya", "Ya"], ["2211528001x", "Mungkin", ""]]);

  it("preview: changed, unchanged (same value, already Admin), unknown NIM, invalid; nothing written", async () => {
    const db = fakeDb({ users: USERS, snapshots: SNAPSHOTS });
    const plan = await previewPeriodFlagsImport("ay-1", file(), { client: db });
    expect(plan.totals).toEqual({ rows: 4, changed: 1, unchanged: 1, unknownNim: 1, invalid: 1, nameMismatch: 0 });
    expect(plan.changes).toEqual([expect.objectContaining({ nim: "2211528002", before: { eligibleResearchMethod: false, takingThesisCourse: false }, after: { eligibleResearchMethod: true, takingThesisCourse: false } })]);
    expect(plan.unknown).toEqual([{ row: 4, nim: "2211599999" }]);
    expect(plan.academicYear.label).toBe("2026/2027 Ganjil");
    expect(db.studentAcademicYearSnapshot.upsert).not.toHaveBeenCalled();
    expect(audit.logAudit).not.toHaveBeenCalled();
  });

  it("apply writes source admin for the given fields only, audits the counts; the same file again changes nothing", async () => {
    const db = fakeDb({ users: USERS, snapshots: SNAPSHOTS });
    const first = await applyPeriodFlagsImport("ay-1", file(), { client: db, actorUserId: "admin-1", fileName: "keikutsertaan.xlsx" });
    expect(first.applied).toBe(1);
    const s1 = db.rows.find((r) => r.studentId === "s1");
    expect(s1).toMatchObject({ eligibleResearchMethod: true, eligibilitySource: "admin", takingThesisCourse: false, thesisCourseSource: "sia" });
    expect(audit.logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "STUDENT_PERIOD_FLAGS_IMPORTED",
      entityId: "ay-1",
      newValues: { academicYearId: "ay-1", fileName: "keikutsertaan.xlsx", rows: 4, changed: 1, unchanged: 1, unknownNim: 1, invalid: 1, nameMismatch: 0 },
    }));

    db.studentAcademicYearSnapshot.upsert.mockClear();
    const second = await applyPeriodFlagsImport("ay-1", file(), { client: db, actorUserId: "admin-1" });
    expect(second.applied).toBe(0);
    expect(second.totals).toMatchObject({ changed: 0, unchanged: 2 });
    expect(db.studentAcademicYearSnapshot.upsert).not.toHaveBeenCalled();
  });

  it("Nama: a name that does not match the NIM skips the row and is reported; case and extra spaces are ignored", async () => {
    const db = fakeDb({ users: USERS, snapshots: SNAPSHOTS });
    const result = await applyPeriodFlagsImport("ay-1", xlsx([
      ["NIM", "Nama", "Mengambil Metode Penelitian", "Mengambil Tugas Akhir"],
      ["2211528002", "  uji   PROPOSAL tidak layak ", "Ya", ""],
      ["2211528001", "Orang Lain", "", "Ya"],
    ]), { client: db, actorUserId: "admin-1" });
    expect(result.applied).toBe(1);
    expect(result.totals).toMatchObject({ rows: 2, changed: 1, nameMismatch: 1 });
    expect(result.nameMismatch).toEqual([{ row: 3, nim: "2211528001", name: "Orang Lain", expected: "Uji Proposal Layak" }]);
    expect(db.rows.find((r) => r.studentId === "s2")).toMatchObject({ takingThesisCourse: false, thesisCourseSource: "sia" });
    expect(audit.logAudit).toHaveBeenCalledWith(expect.objectContaining({ newValues: expect.objectContaining({ nameMismatch: 1 }) }));
  });

  it("a student without a snapshot gets one; an unknown semester is refused", async () => {
    const db = fakeDb({ users: USERS, snapshots: [] });
    const result = await applyPeriodFlagsImport("ay-1", xlsx([HEADERS, ["2211528001", "", "Ya"]]), { client: db });
    expect(result.applied).toBe(1);
    expect(db.rows[0]).toMatchObject({ studentId: "s2", takingThesisCourse: true, thesisCourseSource: "admin" });
    await expect(previewPeriodFlagsImport("ay-x", file(), { client: db })).rejects.toMatchObject({ statusCode: 404 });
  });
});
