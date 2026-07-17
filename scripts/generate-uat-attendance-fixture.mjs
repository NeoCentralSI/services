/** Generate deterministic UAT attendance workbook (EC01-EC20 contract). */
import XLSX from 'xlsx';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(here, '../../e2e/fixtures/data/metopen-attendance-uat.xlsx');
const rows = [
  ['Kelas', 'EDGE-CASE/SI/Kuliah/A'],
  ['Mata Kuliah', 'Metode Penelitian'],
  ['Semester', '2025/2026 Genap'],
  ['Dosen', 'Koordinator Metopen UAT'],
  [],
  ['NIM / BP', 'Nama Mahasiswa', 'Hadir', 'Alpa', 'Sakit', 'Izin', 'Total', 'Persentase Hadir'],
];

for (let index = 1; index <= 18; index += 1) {
  const nim = `23990000${String(index).padStart(2, '0')}`;
  const ineligible = index === 16 || index === 18;
  const present = ineligible ? 11 : 14;
  rows.push([nim, `EC${String(index).padStart(2, '0')} Mahasiswa UAT`, present, 16 - present, 0, 0, 16, present / 16]);
}
// EC19 deliberately absent; EC20 deliberately unmatched.
rows.push(['9999900099', 'EC20 Tidak Terdaftar', 14, 2, 0, 0, 16, 0.875]);

const worksheet = XLSX.utils.aoa_to_sheet(rows);
worksheet['!cols'] = [{ wch: 18 }, { wch: 34 }, ...Array(6).fill({ wch: 18 })];
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Presensi UAT');
XLSX.writeFile(workbook, output);
console.log(`Generated ${output}: 19 rows (18 matched candidates, EC19 absent, EC20 unmatched)`);
