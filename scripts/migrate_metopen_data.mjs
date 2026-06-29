import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

async function migrate() {
  console.log('Starting metopen assessment data migration...');

  // Step 1: Find the actual FK constraint name
  const fkRows = await prisma.$queryRawUnsafe(`
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'research_method_score_details'
      AND REFERENCED_TABLE_NAME IS NOT NULL
      AND COLUMN_NAME = 'assessment_criteria_id'
    LIMIT 1
  `);

  if (fkRows?.length > 0) {
    const fkName = fkRows[0].CONSTRAINT_NAME;
    console.log(`Found FK constraint: ${fkName}`);
    await prisma.$executeRawUnsafe(`ALTER TABLE research_method_score_details DROP FOREIGN KEY \`${fkName}\``);
    console.log('Dropped old FK constraint');
  } else {
    console.log('No FK constraint found on assessment_criteria_id');
  }

  // Step 2: Drop old index safely
  try {
    await prisma.$executeRawUnsafe(`DROP INDEX \`research_method_score_details_criteria_id_fkey\` ON \`research_method_score_details\``);
    console.log('Dropped old index');
  } catch {
    console.log('No old index to drop (or name differs)');
  }

  // Step 3: Count rows to migrate
  const cpmkCount = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as cnt FROM cpmks WHERE type = 'research_method'
  `);
  const criteriaCount = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as cnt FROM assessment_criterias WHERE applies_to IN ('proposal', 'metopen')
  `);
  const rubricCount = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as cnt FROM assessment_rubrics ar
    INNER JOIN assessment_criterias ac ON ar.assessment_criteria_id = ac.id
    WHERE ac.applies_to IN ('proposal', 'metopen')
  `);

  console.log(`CPMKs to migrate: ${cpmkCount[0]?.cnt || 0}`);
  console.log(`Criteria to migrate: ${criteriaCount[0]?.cnt || 0}`);
  console.log(`Rubrics to migrate: ${rubricCount[0]?.cnt || 0}`);

  // Step 4: Migrate Cpmk (research_method) → MetopenCpmk
  await prisma.$executeRawUnsafe(`
    INSERT IGNORE INTO metopen_cpmks (id, academic_year_id, code, description, created_at, updated_at)
    SELECT id, academic_year_id, code, description, created_at, updated_at
    FROM cpmks
    WHERE type = 'research_method'
  `);
  console.log('Migrated Cpmk → MetopenCpmk');

  // Step 5: Migrate AssessmentCriteria → MetopenAssessmentCriteria
  await prisma.$executeRawUnsafe(`
    INSERT IGNORE INTO metopen_assessment_criterias (id, metopen_cpmk_id, name, role, max_score, display_order, created_at, updated_at)
    SELECT ac.id, ac.cpmk_id, ac.name, ac.role, ac.max_score, ac.display_order, ac.created_at, ac.updated_at
    FROM assessment_criterias ac
    WHERE ac.applies_to IN ('proposal', 'metopen')
  `);
  console.log('Migrated AssessmentCriteria → MetopenAssessmentCriteria');

  // Step 6: Migrate AssessmentRubric → MetopenAssessmentRubric
  await prisma.$executeRawUnsafe(`
    INSERT IGNORE INTO metopen_assessment_rubrics (id, metopen_assessment_criteria_id, min_score, max_score, description, display_order, created_at, updated_at)
    SELECT ar.id, ar.assessment_criteria_id, ar.min_score, ar.max_score, ar.description, ar.display_order, ar.created_at, ar.updated_at
    FROM assessment_rubrics ar
    INNER JOIN assessment_criterias ac ON ar.assessment_criteria_id = ac.id
    WHERE ac.applies_to IN ('proposal', 'metopen')
  `);
  console.log('Migrated AssessmentRubric → MetopenAssessmentRubric');

  // Step 7: Verify data integrity before adding FK
  const orphanCount = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as cnt FROM research_method_score_details rmsd
    LEFT JOIN metopen_assessment_criterias mac ON rmsd.assessment_criteria_id = mac.id
    WHERE mac.id IS NULL
  `);
  const orphans = orphanCount[0]?.cnt || 0;
  if (orphans > 0) {
    console.error(`ERROR: ${orphans} research_method_score_details reference criteria NOT in metopen_assessment_criterias!`);
    console.error('These must be fixed before adding the FK constraint.');
    process.exit(1);
  }
  console.log('Data integrity verified: no orphaned references');

  // Step 8: Add new index
  await prisma.$executeRawUnsafe(`
    CREATE INDEX \`research_method_score_details_criteria_id_fkey\` 
    ON \`research_method_score_details\` (\`assessment_criteria_id\`)
  `);
  console.log('Added new index');

  // Step 9: Add new FK constraint
  await prisma.$executeRawUnsafe(`
    ALTER TABLE \`research_method_score_details\` 
    ADD CONSTRAINT \`research_method_score_details_criteria_id_fkey\` 
    FOREIGN KEY (\`assessment_criteria_id\`) 
    REFERENCES \`metopen_assessment_criterias\`(\`id\`) 
    ON DELETE RESTRICT ON UPDATE CASCADE
  `);
  console.log('Added new FK constraint to metopen_assessment_criterias');

  // Step 10: Handle assessment_rubric_id FK → metopen_assessment_rubrics
  const oldRubricFk = await prisma.$queryRawUnsafe(`
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'research_method_score_details'
      AND REFERENCED_TABLE_NAME IS NOT NULL
      AND COLUMN_NAME = 'assessment_rubric_id'
    LIMIT 1
  `);
  if (oldRubricFk?.length > 0) {
    await prisma.$executeRawUnsafe(`ALTER TABLE research_method_score_details DROP FOREIGN KEY \`${oldRubricFk[0].CONSTRAINT_NAME}\``);
    console.log('Dropped old rubric FK constraint');
  }
  try {
    await prisma.$executeRawUnsafe(`DROP INDEX \`research_method_score_details_rubric_id_fkey\` ON \`research_method_score_details\``);
  } catch {
    console.log('No old rubric index to drop (or name differs)');
  }
  const orphanedRubrics = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*) as cnt FROM research_method_score_details rmsd
    LEFT JOIN metopen_assessment_rubrics mar ON rmsd.assessment_rubric_id = mar.id
    WHERE rmsd.assessment_rubric_id IS NOT NULL AND mar.id IS NULL
  `);
  if ((orphanedRubrics[0]?.cnt || 0) > 0) {
    console.error(`ERROR: ${orphanedRubrics[0].cnt} rubric refs orphaned — cannot add FK`);
    process.exit(1);
  }
  await prisma.$executeRawUnsafe(`CREATE INDEX \`research_method_score_details_rubric_id_fkey\` ON \`research_method_score_details\` (\`assessment_rubric_id\`)`);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE \`research_method_score_details\`
    ADD CONSTRAINT \`research_method_score_details_rubric_id_fkey\`
    FOREIGN KEY (\`assessment_rubric_id\`)
    REFERENCES \`metopen_assessment_rubrics\`(\`id\`)
    ON DELETE SET NULL ON UPDATE CASCADE
  `);
  console.log('Added rubric FK constraint to metopen_assessment_rubrics');

  console.log('\nMigration completed successfully!');
}

migrate()
  .catch(e => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
