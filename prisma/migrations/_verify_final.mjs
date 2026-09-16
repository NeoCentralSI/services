import { PrismaClient } from '../../src/generated/prisma/index.js';
const prisma = new PrismaClient();

console.log('========================================');
console.log('  FINAL VERIFICATION — Migration A-G');
console.log('========================================\n');

// === Migration A verification ===
const migA = await prisma.$queryRawUnsafe(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN accepted_over_normal IS NULL THEN 1 ELSE 0 END) AS null_flags,
    SUM(CASE WHEN lecturer_overquota_reason IS NOT NULL AND forwarded_to_kadep_at IS NULL THEN 1 ELSE 0 END) AS unbackfilled_path_c
  FROM thesis_advisor_request
`);
console.log('Migration A — Path C audit + Overquota Sah:');
console.log(`  Total rows: ${migA[0].total}, Null flags (should=0): ${migA[0].null_flags}, Unbackfilled (should=0): ${migA[0].unbackfilled_path_c}`);

// === Migration B verification ===
const migB1 = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS legacy_remaining
  FROM thesis_advisor_request
  WHERE status IN ('approved', 'override_approved', 'assigned', 'rejected', 'closed', 'escalated')
`);
const migB2 = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS ta02_not_dept
  FROM thesis_advisor_request
  WHERE request_type = 'ta_02' AND route_type != 'dept'
`);
const migB3 = await prisma.$queryRawUnsafe(`
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'thesis_advisor_request' AND COLUMN_NAME = 'route_type'
`);
console.log('\nMigration B — Status consolidation + dept route:');
console.log(`  Legacy status remaining (should=0): ${migB1[0].legacy_remaining}`);
console.log(`  TA-02 rows tanpa route=dept (should=0): ${migB2[0].ta02_not_dept}`);
console.log(`  route_type enum: ${migB3[0].COLUMN_TYPE}`);

// === Migration C verification ===
const migC1 = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS unbackfilled
  FROM thesis_advisor_request
  WHERE student_justification IS NULL AND justification_text IS NOT NULL
`);
const migC2 = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS unbackfilled
  FROM thesis_advisor_request_draft
  WHERE student_justification IS NULL AND justification_text IS NOT NULL
`);
console.log('\nMigration C — Justification field cleanup:');
console.log(`  Request unbackfilled (should=0): ${migC1[0].unbackfilled}`);
console.log(`  Draft unbackfilled (should=0): ${migC2[0].unbackfilled}`);

// === Migration F verification ===
const migF = await prisma.$queryRawUnsafe(`
  SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'thesis_guidances' AND COLUMN_NAME = 'status'
`);
console.log('\nMigration F — GuidanceStatus extension:');
console.log(`  status enum: ${migF[0].COLUMN_TYPE}`);
const hasRescheduled = migF[0].COLUMN_TYPE.includes('rescheduled');
const hasSummaryRejected = migF[0].COLUMN_TYPE.includes('summary_rejected');
console.log(`  Has 'rescheduled': ${hasRescheduled}, Has 'summary_rejected': ${hasSummaryRejected}`);

// === Migration history ===
const migrationsApplied = await prisma.$queryRawUnsafe(`
  SELECT migration_name, finished_at
  FROM _prisma_migrations
  WHERE migration_name LIKE '20260515%'
  ORDER BY migration_name
`);
console.log('\n========================================');
console.log('  Migration A-G Applied to DB:');
console.log('========================================');
migrationsApplied.forEach(m => console.log(`  ✓ ${m.migration_name} (${m.finished_at?.toISOString?.() || m.finished_at})`));

await prisma.$disconnect();
