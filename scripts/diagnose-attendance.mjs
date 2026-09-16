import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

async function probeColumns(table, columns) {
  console.log(`\n[probe] table=${table}`);
  for (const col of columns) {
    const r = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      table,
      col,
    );
    const exists = Number(r[0]?.c ?? 0) > 0;
    console.log(`    ${exists ? "✓" : "✗"} ${col}`);
  }
}

async function probeTable(name) {
  const r = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name,
  );
  const exists = Number(r[0]?.c ?? 0) > 0;
  console.log(`Table ${name}: ${exists ? "EXISTS" : "MISSING"}`);
  return exists;
}

async function main() {
  console.log("=================================================");
  console.log("  DIAGNOSE: Metopen Attendance feature dependencies");
  console.log("=================================================");

  const importsExists = await probeTable("metopen_attendance_imports");
  const recordsExists = await probeTable("metopen_attendance_records");
  await probeTable("research_method_scores");
  await probeTable("research_method_score_details");
  await probeTable("documents");
  await probeTable("document_types");

  if (importsExists) {
    await probeColumns("metopen_attendance_imports", [
      "id",
      "academic_year_id",
      "document_id",
      "uploaded_by_user_id",
      "class_code",
      "course_name",
      "semester_label",
      "filter_label",
      "lecturer_names",
      "threshold_percent",
      "total_rows",
      "matched_rows",
      "eligible_rows",
      "ineligible_rows",
      "auto_zeroed_count",
      "skipped_finalized_count",
      "uploaded_at",
      "created_at",
      "updated_at",
    ]);
  }

  if (recordsExists) {
    await probeColumns("metopen_attendance_records", [
      "id",
      "import_id",
      "student_id",
      "identity_number",
      "student_name",
      "present_count",
      "absent_count",
      "sick_count",
      "permit_count",
      "total_meetings",
      "attendance_percentage",
      "is_eligible",
      "raw_row",
      "created_at",
      "updated_at",
    ]);
  }

  await probeColumns("research_method_scores", [
    "id",
    "thesis_id",
    "supervisor_id",
    "supervisor_score",
    "lecturer_id",
    "lecturer_score",
    "final_score",
    "is_finalized",
    "finalized_by",
    "finalized_at",
    "calculated_at",
    "co_signed_by_lecturer_id",
    "co_signed_at",
    "co_sign_note",
    "attendance_record_id",
    "attendance_auto_zeroed_at",
    "attendance_auto_zero_reason",
  ]);

  await probeColumns("documents", ["id", "file_hash", "user_id", "document_type_id"]);

  // Try insert dummy via transaction (rollback)
  console.log("\n[smoke] Try insert minimal MetopenAttendanceImport...");
  try {
    await prisma.$transaction(async (tx) => {
      const docType = await tx.documentType.findFirst({
        where: { name: "Presensi Metode Penelitian" },
      });
      const docTypeId = docType?.id ?? "DUMMY-DOCTYPE";
      console.log(`    document_type_id resolved=${docTypeId}, found=${Boolean(docType)}`);

      const userExists = await tx.user.findFirst({ select: { id: true } });
      console.log(`    sample user id=${userExists?.id ?? "(none)"}`);

      throw new Error("ROLLBACK_INTENDED");
    });
  } catch (err) {
    if (err.message !== "ROLLBACK_INTENDED") {
      console.log(`    ✗ ${err.message}`);
    } else {
      console.log("    ✓ Read OK (rolled back)");
    }
  }
}

main()
  .catch((e) => {
    console.error("FATAL:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
