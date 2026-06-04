import { PrismaClient } from '../../src/generated/prisma/index.js';
const prisma = new PrismaClient();

const requestSummary = await prisma.$queryRawUnsafe(`
  SELECT
    COUNT(*) AS total_rows,
    SUM(CASE WHEN justification_text IS NOT NULL THEN 1 ELSE 0 END) AS rows_with_legacy,
    SUM(CASE WHEN student_justification IS NOT NULL THEN 1 ELSE 0 END) AS rows_with_canonical,
    SUM(CASE WHEN justification_text IS NOT NULL AND student_justification IS NULL THEN 1 ELSE 0 END) AS unbackfilled
  FROM thesis_advisor_request
`);
console.log('thesis_advisor_request justification fields:');
console.log(JSON.stringify(requestSummary, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));

const draftSummary = await prisma.$queryRawUnsafe(`
  SELECT
    COUNT(*) AS total_rows,
    SUM(CASE WHEN justification_text IS NOT NULL THEN 1 ELSE 0 END) AS rows_with_legacy,
    SUM(CASE WHEN student_justification IS NOT NULL THEN 1 ELSE 0 END) AS rows_with_canonical,
    SUM(CASE WHEN justification_text IS NOT NULL AND student_justification IS NULL THEN 1 ELSE 0 END) AS unbackfilled
  FROM thesis_advisor_request_draft
`);
console.log('\nthesis_advisor_request_draft justification fields:');
console.log(JSON.stringify(draftSummary, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));

await prisma.$disconnect();
