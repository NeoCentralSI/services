import prisma from "../../config/prisma.js";
import { formatAcademicYearLabel } from "../../helpers/academicYear.helper.js";
import { buildWorkbookBuffer, normalizeHeader, readSheetRows } from "../../helpers/spreadsheet.helper.js";
import { normalizeIdentity } from "../../repositories/research-method/attendance.repository.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";
import { AUDIT_ACTIONS, ENTITY_TYPES, logAudit } from "../auditLog.service.js";
import { ACADEMIC_FLAG_SOURCE, setStudentPeriodFlags } from "./eligibility.service.js";

/**
 * Bulk import of the semester flags "Mengambil Metode Penelitian" and "Mengambil
 * Tugas Akhir" by the Admin (Data Master → Mahasiswa → Impor Keikutsertaan). Same result as the
 * one-by-one edit: source `admin`, kept by the SIA sync. A preview stores nothing; applying writes
 * only the rows that change, so importing the same file twice changes nothing the second time.
 * Problem rows (unknown NIM, invalid values, a name that does not match the NIM) are reported and
 * do not stop the rest.
 */

export const PERIOD_FLAGS_HEADERS = Object.freeze(["NIM", "Nama", "Mengambil Metode Penelitian", "Mengambil Tugas Akhir"]);

/** A name compared without case and extra spaces. */
export function normalizeName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}
const isNameHeader = (label) => label === "nama" || label.startsWith("nama ");

const FIELDS = Object.freeze([
  { key: "eligibleResearchMethod", source: "eligibilitySource", label: "Mengambil Metode Penelitian", match: (h) => h.includes("metode penelitian") },
  { key: "takingThesisCourse", source: "thesisCourseSource", label: "Mengambil Tugas Akhir", match: (h) => h.includes("tugas akhir") },
]);

const YES = new Set(["ya", "yes", "true", "1"]);
const NO = new Set(["tidak", "no", "false", "0"]);

/** "Ya" / "Tidak" (and yes/no, true/false, 1/0); an empty cell means "not changed". */
export function parseFlagCell(value) {
  const text = normalizeHeader(value);
  if (!text) return { empty: true };
  if (YES.has(text)) return { value: true };
  if (NO.has(text)) return { value: false };
  return { invalid: true };
}

/** Rows of the template (or any sheet with a NIM column and at least one flag column). */
export function parsePeriodFlagsSheet(buffer) {
  const rows = readSheetRows(buffer, {
    unreadableMessage: "Berkas tidak dapat dibaca. Gunakan berkas .xlsx atau .csv dari templat Impor Keikutsertaan.",
    emptyMessage: "Berkas tidak memiliki sheet.",
  });
  const headerIndex = rows.findIndex((row) => {
    const labels = row.map(normalizeHeader);
    return labels.some((l) => l === "nim" || l.startsWith("nim ")) && labels.some((l) => FIELDS.some((f) => f.match(l)));
  });
  if (headerIndex < 0) {
    throw new BadRequestError("Header tidak ditemukan. Gunakan templat dengan kolom NIM, Mengambil Metode Penelitian, dan Mengambil Tugas Akhir.");
  }
  const header = rows[headerIndex].map(normalizeHeader);
  const nimColumn = header.findIndex((l) => l === "nim" || l.startsWith("nim "));
  // Optional: an older file without "Nama" is read without the name check.
  const nameColumn = header.findIndex(isNameHeader);
  const columns = FIELDS.map((field) => ({ ...field, index: header.findIndex((l) => field.match(l)) })).filter((c) => c.index >= 0);

  const valid = [];
  const invalid = [];
  const seen = new Map();
  rows.slice(headerIndex + 1).forEach((cells, offset) => {
    const row = headerIndex + offset + 2; // the sheet's own row number (1-based, after the header)
    const nim = normalizeIdentity(cells[nimColumn]);
    const parsed = columns.map((c) => ({ ...c, cell: parseFlagCell(cells[c.index]) }));
    if (!nim && parsed.every((p) => p.cell.empty)) return; // a blank line
    const problems = [];
    if (!nim) problems.push("NIM kosong.");
    for (const p of parsed) if (p.cell.invalid) problems.push(`${p.label}: isi Ya atau Tidak.`);
    if (problems.length === 0 && parsed.every((p) => p.cell.empty)) problems.push("Tidak ada penanda yang diisi.");
    if (nim && seen.has(nim)) problems.push(`NIM sudah ada di baris ${seen.get(nim)}.`);
    if (nim && !seen.has(nim)) seen.set(nim, row);
    if (problems.length) {
      invalid.push({ row, nim: nim || null, reason: problems.join(" ") });
      return;
    }
    const flags = {};
    for (const p of parsed) if (!p.cell.empty) flags[p.key] = p.cell.value;
    const name = nameColumn >= 0 ? String(cells[nameColumn] ?? "").trim() : "";
    valid.push({ row, nim, name: name || null, flags });
  });
  if (valid.length === 0 && invalid.length === 0) throw new BadRequestError("Tidak ada baris yang dapat dibaca dari berkas.");
  return { valid, invalid, totalRows: valid.length + invalid.length };
}

async function requireYear(academicYearId, client) {
  const year = await client.academicYear.findUnique({ where: { id: academicYearId } });
  if (!year) throw new NotFoundError("Tahun ajaran tidak ditemukan.");
  return year;
}

/** What applying would do: rows that change, rows already the same, unknown NIMs, invalid rows. */
async function buildPlan(academicYearId, buffer, client) {
  const year = await requireYear(academicYearId, client);
  const parsed = parsePeriodFlagsSheet(buffer);
  const nims = parsed.valid.map((r) => r.nim);
  const users = nims.length
    ? await client.user.findMany({ where: { identityNumber: { in: nims }, student: { isNot: null } }, select: { id: true, fullName: true, identityNumber: true } })
    : [];
  const userOf = new Map(users.map((u) => [normalizeIdentity(u.identityNumber), u]));
  const snapshots = users.length
    ? await client.studentAcademicYearSnapshot.findMany({ where: { academicYearId, studentId: { in: users.map((u) => u.id) } } })
    : [];
  const snapshotOf = new Map(snapshots.map((s) => [s.studentId, s]));

  const changes = [];
  const unknown = [];
  const nameMismatch = [];
  let unchanged = 0;
  for (const entry of parsed.valid) {
    const user = userOf.get(entry.nim);
    if (!user) {
      unknown.push({ row: entry.row, nim: entry.nim });
      continue;
    }
    // A name that does not match the NIM: the row is skipped, never written.
    if (entry.name && normalizeName(entry.name) !== normalizeName(user.fullName)) {
      nameMismatch.push({ row: entry.row, nim: entry.nim, name: entry.name, expected: user.fullName });
      continue;
    }
    const snapshot = snapshotOf.get(user.id);
    const before = Object.fromEntries(FIELDS.map((f) => [f.key, snapshot?.[f.key] ?? null]));
    // Same value and already the Admin's: nothing to write (the second import of a file).
    const changed = FIELDS.filter((f) => entry.flags[f.key] !== undefined
      && (snapshot?.[f.key] !== entry.flags[f.key] || snapshot?.[f.source] !== ACADEMIC_FLAG_SOURCE.ADMIN));
    if (changed.length === 0) {
      unchanged += 1;
      continue;
    }
    changes.push({
      row: entry.row,
      nim: entry.nim,
      studentId: user.id,
      fullName: user.fullName,
      before,
      after: { ...before, ...entry.flags },
      flags: entry.flags,
    });
  }
  return {
    academicYear: { id: year.id, label: formatAcademicYearLabel(year) },
    totals: {
      rows: parsed.totalRows,
      changed: changes.length,
      unchanged,
      unknownNim: unknown.length,
      invalid: parsed.invalid.length,
      nameMismatch: nameMismatch.length,
    },
    changes: changes.map(({ flags, ...rest }) => rest),
    unknown,
    invalid: parsed.invalid,
    nameMismatch,
    _writes: changes,
  };
}

const publicPlan = ({ _writes, ...plan }) => plan;

export async function previewPeriodFlagsImport(academicYearId, buffer, { client = prisma } = {}) {
  return publicPlan(await buildPlan(academicYearId, buffer, client));
}

/** Writes the changed rows with source `admin` and records the counts in the audit log. */
export async function applyPeriodFlagsImport(academicYearId, buffer, { actorUserId = null, fileName = null, client = prisma, now = new Date() } = {}) {
  const plan = await buildPlan(academicYearId, buffer, client);
  if (plan._writes.length > 0) {
    await client.$transaction(async (tx) => {
      for (const write of plan._writes) {
        await setStudentPeriodFlags(write.studentId, academicYearId, write.flags, { source: ACADEMIC_FLAG_SOURCE.ADMIN, client: tx, now });
      }
    }, { timeout: 60_000 });
  }
  await logAudit({
    actorUserId,
    action: AUDIT_ACTIONS.STUDENT_PERIOD_FLAGS_IMPORTED,
    entityType: ENTITY_TYPES.ACADEMIC_YEAR,
    entityId: academicYearId,
    newValues: { academicYearId, fileName, ...plan.totals },
  });
  return { ...publicPlan(plan), applied: plan._writes.length };
}

/** The template: the three columns, and a sheet that says how to fill them. */
export function buildPeriodFlagsTemplate() {
  return buildWorkbookBuffer([
    ["Keikutsertaan", [[...PERIOD_FLAGS_HEADERS]]],
    ["Petunjuk", [
      ["Isi satu baris per mahasiswa untuk semester yang dipilih di dialog Impor Keikutsertaan."],
      ["NIM: wajib, sama dengan NIM di Data Master."],
      ["Nama: nama mahasiswa pemilik NIM itu (huruf besar-kecil dan spasi berlebih diabaikan). Baris yang namanya tidak cocok dilewati dan dilaporkan."],
      ["Mengambil Metode Penelitian dan Mengambil Tugas Akhir: Ya atau Tidak; sel kosong berarti tidak diubah."],
      ["Hasil impor bersumber Admin dan tidak ditimpa sinkronisasi SIA; Ikuti Data SIA di detail mahasiswa mengembalikannya."],
    ]],
  ]);
}
