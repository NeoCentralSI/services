import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

// Tabel yang akan di-DROP oleh prisma db push (DB punya tapi schema tidak punya).
const DROP_CANDIDATES = [
  "internship_application_letters",
  "internship_assessments",
  "internship_assignment_letters",
  "internship_company_responses",
  "internship_cpmk_scores",
  "internship_final_score_summary",
  "internship_proposal_members",
];

// Kolom yang akan di-DROP dari tabel yang akan tetap exist.
const DROP_COLUMNS = [
  { table: "lecturer_availabilities", col: "is_active" },
  { table: "internships", col: "assignment_letter_id" },
  { table: "internships", col: "report_file_id" },
  { table: "internships", col: "supervisor_letter_id" },
  { table: "thesis_seminars", col: "grade" },
  { table: "thesis_defences", col: "grade" },
  { table: "internship_proposals", col: "sekdep_notes" },
  { table: "thesis_participants", col: "active_lecturer_key" },
  { table: "thesis_participants", col: "active_role_key" },
];

async function checkColumnDrop(table, col) {
  const exists = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    col,
  );
  if (Number(exists[0]?.c ?? 0) === 0) {
    return { exists: false, nonNull: 0 };
  }
  const safeCol = col.replace(/`/g, "");
  const safeTable = table.replace(/`/g, "");
  try {
    const r = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) AS c FROM \`${safeTable}\` WHERE \`${safeCol}\` IS NOT NULL`,
    );
    return { exists: true, nonNull: Number(r[0]?.c ?? 0) };
  } catch (e) {
    return { exists: true, nonNull: -1, err: e.message.split("\n")[0] };
  }
}

async function main() {
  console.log("=================================================");
  console.log("  PRE-FLIGHT: tabel/kolom yang akan di-DROP");
  console.log("=================================================");

  console.log("\n[1] Tabel yang akan di-DROP (DB punya, schema TIDAK):");
  for (const t of DROP_CANDIDATES) {
    try {
      const r = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM \`${t}\``);
      const count = Number(r[0]?.c ?? 0);
      const label = count === 0 ? "✓ EMPTY (safe to drop)" : `⚠ HAS ${count} ROWS (DATA LOSS!)`;
      console.log(`    ${t.padEnd(40)} ${label}`);
    } catch (e) {
      console.log(`    ${t.padEnd(40)} (already dropped or n/a)`);
    }
  }

  console.log("\n[2] Kolom yang akan di-DROP (DB punya, schema TIDAK):");
  for (const { table, col } of DROP_COLUMNS) {
    const { exists, nonNull, err } = await checkColumnDrop(table, col);
    if (!exists) {
      console.log(`    ${(table + "." + col).padEnd(60)} (already dropped)`);
    } else if (nonNull < 0) {
      console.log(`    ${(table + "." + col).padEnd(60)} ERROR: ${err}`);
    } else if (nonNull === 0) {
      console.log(`    ${(table + "." + col).padEnd(60)} ✓ all NULL (safe)`);
    } else {
      console.log(`    ${(table + "." + col).padEnd(60)} ⚠ ${nonNull} non-null rows (DATA LOSS!)`);
    }
  }
}

main()
  .catch((e) => {
    console.error("FATAL:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
