/**
 * Builds the sample attendance files for the Research Method attendance import.
 * Same layout as the class report exported by the attendance application: metadata lines
 * (Matakuliah, Kelas, Semester, Dosen), then a header row with "NIM / BP", "Hadir" and
 * "Persentase Hadir". Rows match the accounts of scripts/seed-thesis-proposal-flow.js.
 *
 *   node scripts/fixtures/build-attendance-fixtures.mjs
 *
 * - research-method-attendance-seed.xlsx: the class as seeded (source file of the seeded import).
 * - research-method-attendance-kelas-a.xlsx / -kelas-b.xlsx: two classes for the upload test.
 *   Kelas A lowers "Uji Proposal Final Terkirim" to 11/16 (68,8%), so uploading it gives that
 *   attempt a score of 0. Kelas B carries one NIM that is not in the system.
 */
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const HERE = path.dirname(fileURLToPath(import.meta.url));

function workbook(classCode, rows) {
  const aoa = [
    ["REPORT PESERTA KELAS"],
    ["Matakuliah", ":", "Metodologi Penelitian"],
    ["Kelas", ":", classCode],
    ["Semester", ":", "Ganjil 2026/2027"],
    ["Filter Jenis", ":", "Semua"],
    ["Dosen", ":", "Husnil Kamil, M.T"],
    [],
    ["No", "NIM / BP", "Nama Mahasiswa", "Hadir", "Alpa", "Sakit", "Izin", "Total", "Persentase Hadir"],
    ...rows.map((row, index) => {
      const absent = row.total - row.present - (row.sick ?? 0) - (row.permit ?? 0);
      return [index + 1, row.nim, row.name, row.present, absent, row.sick ?? 0, row.permit ?? 0, row.total, `${((row.present / row.total) * 100).toFixed(2)}%`];
    }),
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(aoa), "Report");
  return book;
}

const SEED_ROWS = [
  { nim: "2211528001", name: "Uji Proposal Layak", present: 15, total: 16 },
  { nim: "2211528010", name: "Uji Proposal Ditetapkan", present: 12, total: 16 },
  { nim: "2211528011", name: "Uji Proposal Final Terkirim", present: 14, total: 16 },
  { nim: "2211528012", name: "Uji Proposal Presensi Kurang", present: 10, total: 16, sick: 2 },
  { nim: "2211528013", name: "Uji Proposal Siap Dinilai", present: 15, total: 16 },
  { nim: "2211528014", name: "Uji Proposal Dinilai Pembimbing", present: 16, total: 16 },
  { nim: "2211528015", name: "Uji Proposal Lulus Tunggu KRS", present: 13, total: 16, permit: 1 },
  { nim: "2211528017", name: "Uji Proposal Tidak Lulus", present: 14, total: 16 },
  { nim: "2211599999", name: "Mahasiswa Luar Daftar", present: 16, total: 16 },
];

const KELAS_A = [
  { nim: "2211528001", name: "Uji Proposal Layak", present: 15, total: 16 },
  { nim: "2211528010", name: "Uji Proposal Ditetapkan", present: 12, total: 16 },
  { nim: "2211528011", name: "Uji Proposal Final Terkirim", present: 11, total: 16, sick: 1 },
  { nim: "2211528012", name: "Uji Proposal Presensi Kurang", present: 10, total: 16, sick: 2 },
];
const KELAS_B = [
  { nim: "2211528013", name: "Uji Proposal Siap Dinilai", present: 15, total: 16 },
  { nim: "2211528014", name: "Uji Proposal Dinilai Pembimbing", present: 16, total: 16 },
  { nim: "2211528015", name: "Uji Proposal Lulus Tunggu KRS", present: 13, total: 16, permit: 1 },
  { nim: "2211528017", name: "Uji Proposal Tidak Lulus", present: 14, total: 16 },
  { nim: "2211599999", name: "Mahasiswa Luar Daftar", present: 16, total: 16 },
];

for (const [file, classCode, rows] of [
  ["research-method-attendance-seed.xlsx", "A", SEED_ROWS],
  ["research-method-attendance-kelas-a.xlsx", "A", KELAS_A],
  ["research-method-attendance-kelas-b.xlsx", "B", KELAS_B],
]) {
  XLSX.writeFile(workbook(classCode, rows), path.join(HERE, file));
  console.log(`${file}: ${rows.length} baris`);
}
