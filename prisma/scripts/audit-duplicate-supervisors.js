/**
 * Audit Duplicate Supervisors Script
 *
 * Finds ThesisSupervisors records where the same (thesisId, roleId) combination
 * exists more than once with status = "active" — which should never happen.
 *
 * Usage:
 *   node prisma/scripts/audit-duplicate-supervisors.js
 *   node prisma/scripts/audit-duplicate-supervisors.js --fix
 *
 * Options:
 *   --fix   Keep the NEWEST record per (thesisId, roleId) and set others to "terminated".
 *
 * Output:
 *   Reports each duplicate group to stdout.
 *   With --fix: terminates the older duplicates and reports what was changed.
 */

import { PrismaClient } from "../../src/generated/prisma/index.js";

const prisma = new PrismaClient();
const shouldFix = process.argv.includes("--fix");

async function main() {
  console.log("=== Audit: Duplicate Active ThesisSupervisors ===\n");

  // Fetch all active supervisors with role and thesis info
  const allActive = await prisma.thesisSupervisors.findMany({
    where: { status: "active" },
    select: {
      id: true,
      thesisId: true,
      lecturerId: true,
      roleId: true,
      createdAt: true,
      role: { select: { name: true } },
      lecturer: { select: { user: { select: { fullName: true, identityNumber: true } } } },
      thesis: {
        select: {
          title: true,
          student: { select: { user: { select: { fullName: true, identityNumber: true } } } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // Group by (thesisId, roleId)
  const groups = {};
  for (const record of allActive) {
    const key = `${record.thesisId}__${record.roleId}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(record);
  }

  const duplicateGroups = Object.entries(groups).filter(([, records]) => records.length > 1);

  if (duplicateGroups.length === 0) {
    console.log("No duplicate active supervisors found. Database is clean.");
    return;
  }

  console.log(`Found ${duplicateGroups.length} duplicate group(s):\n`);

  let totalFixed = 0;

  for (const [key, records] of duplicateGroups) {
    const newest = records[records.length - 1];
    const older = records.slice(0, -1);

    const studentName = records[0].thesis?.student?.user?.fullName ?? "Unknown";
    const studentNim = records[0].thesis?.student?.user?.identityNumber ?? "-";
    const roleName = records[0].role?.name ?? records[0].roleId;
    const thesisTitle = (records[0].thesis?.title ?? "Judul belum ditentukan").substring(0, 60);

    console.log(`  Mahasiswa : ${studentName} (NIM: ${studentNim})`);
    console.log(`  Thesis    : ${thesisTitle}`);
    console.log(`  Role      : ${roleName}`);
    console.log(`  Duplicates (${records.length} active records):`);

    for (const r of records) {
      const lecturerName = r.lecturer?.user?.fullName ?? r.lecturerId;
      const flag = r.id === newest.id ? "[KEEP - newest]" : "[DUPLICATE]";
      console.log(`    ${flag} id=${r.id} | lecturer=${lecturerName} | created=${r.createdAt.toISOString()}`);
    }

    if (shouldFix) {
      const idsToTerminate = older.map((r) => r.id);
      await prisma.thesisSupervisors.updateMany({
        where: { id: { in: idsToTerminate } },
        data: { status: "terminated" },
      });
      totalFixed += idsToTerminate.length;
      console.log(`  --> Fixed: ${idsToTerminate.length} record(s) set to "terminated"\n`);
    } else {
      console.log(`  --> Run with --fix to terminate older duplicates\n`);
    }
  }

  if (shouldFix) {
    console.log(`\nFix complete. Total records terminated: ${totalFixed}`);
    console.log('Retained the newest record per (thesisId, roleId) as the active supervisor.');
  } else {
    console.log(`\nAudit complete. Total duplicate groups: ${duplicateGroups.length}`);
    console.log('Run with --fix to automatically resolve duplicates (keeps newest, terminates older).');
  }
}

main()
  .catch((err) => {
    console.error("Script failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
