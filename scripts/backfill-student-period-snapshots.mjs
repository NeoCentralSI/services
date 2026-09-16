/**
 * Backfill `student_academic_year_snapshots` untuk satu periode akademik dari
 * observasi akademik terakhir yang tersimpan di tabel `students`.
 *
 * Dry-run secara default; tanpa `--apply` tidak ada baris yang ditulis.
 * Idempoten: baris yang sudah ada tidak digandakan dan nilai non-NULL tidak
 * pernah ditimpa. Tabel `students` tidak disentuh dan tidak ada operasi delete.
 *
 * `--include-thesis-course` ikut membawa status KRS Tugas Akhir periode lama.
 * Tanpa flag itu kolom tersebut dibiarkan NULL supaya lifecycle promosi/
 * pelepasan booking tetap fail-closed sampai ada sinkronisasi SIA yang baru.
 *
 * Usage (dari services/):
 *   node scripts/backfill-student-period-snapshots.mjs
 *   node scripts/backfill-student-period-snapshots.mjs --academic-year-id=<id>
 *   node scripts/backfill-student-period-snapshots.mjs --apply
 *   node scripts/backfill-student-period-snapshots.mjs --apply --include-thesis-course
 *   pnpm run snapshots:audit    /    pnpm run snapshots:backfill
 */
import prisma from "../src/config/prisma.js";
import {
  backfillPeriodSnapshots,
  getPeriodSnapshotCoverage,
} from "../src/services/studentPeriodSnapshot.service.js";

const APPLY = process.argv.includes("--apply");
const INCLUDE_THESIS_COURSE = process.argv.includes("--include-thesis-course");
const idFlag = process.argv.find((arg) => arg.startsWith("--academic-year-id="));
const academicYearId = idFlag ? idFlag.split("=").slice(1).join("=") : null;

try {
  const coverageBefore = await getPeriodSnapshotCoverage(academicYearId);
  const result = await backfillPeriodSnapshots(academicYearId, {
    apply: APPLY,
    includeThesisCourse: INCLUDE_THESIS_COURSE,
  });
  const coverageAfter = APPLY
    ? await getPeriodSnapshotCoverage(academicYearId)
    : coverageBefore;

  console.log(
    JSON.stringify(
      {
        mode: APPLY ? "apply" : "dry-run",
        includeThesisCourse: INCLUDE_THESIS_COURSE,
        academicYear: result.academicYear,
        before: {
          studentsWithSnapshot: coverageBefore.studentsWithSnapshot,
          totalStudents: coverageBefore.totalStudents,
          observableStudents: coverageBefore.observableStudents,
          pendingCreate: coverageBefore.pendingCreate,
          pendingFill: coverageBefore.pendingFill,
        },
        planned: {
          create: result.plannedCreate,
          fill: result.plannedFill,
        },
        written: { created: result.created, filled: result.filled },
        after: {
          studentsWithSnapshot: coverageAfter.studentsWithSnapshot,
          eligibleMetopenSnapshots: coverageAfter.eligibleMetopenSnapshots,
          pendingCreate: coverageAfter.pendingCreate,
          pendingFill: coverageAfter.pendingFill,
          complete: coverageAfter.complete,
        },
      },
      null,
      2,
    ),
  );

  if (!APPLY && (result.plannedCreate > 0 || result.plannedFill > 0)) {
    console.log(
      "\nDry-run. Jalankan ulang dengan --apply untuk menulis baris di atas.",
    );
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
