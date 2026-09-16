/**
 * Tutup celah kalender tahun ajaran operasional (UAT-03 / UAT-31).
 * Usage: node scripts/ensure-operational-academic-year.mjs
 */
import {
  ensureOperationalAcademicYearWindow,
  resolveOperationalAcademicYear,
} from "../src/helpers/academicYear.helper.js";
import prisma from "../src/config/prisma.js";

const ensured = await ensureOperationalAcademicYearWindow();
const operational = ensured || (await resolveOperationalAcademicYear());

if (!operational) {
  console.error("FAIL: tidak ada academic year di database");
  process.exitCode = 1;
} else {
  console.log(
    JSON.stringify(
      {
        ok: true,
        id: operational.id,
        year: operational.year,
        semester: operational.semester,
        isActive: operational.isActive,
        startDate: operational.startDate,
        endDate: operational.endDate,
      },
      null,
      2,
    ),
  );
}

await prisma.$disconnect();
