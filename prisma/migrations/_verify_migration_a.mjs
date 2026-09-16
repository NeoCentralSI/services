import { PrismaClient } from '../../src/generated/prisma/index.js';
const prisma = new PrismaClient();

const result = await prisma.$queryRawUnsafe(`
  SELECT 
    COUNT(*) AS total_rows,
    SUM(CASE WHEN forwarded_to_kadep_at IS NOT NULL THEN 1 ELSE 0 END) AS rows_with_forwarded_at,
    SUM(CASE WHEN forwarded_by_lecturer_id IS NOT NULL THEN 1 ELSE 0 END) AS rows_with_forwarded_by,
    SUM(CASE WHEN accepted_over_normal = TRUE THEN 1 ELSE 0 END) AS rows_overquota_sah,
    SUM(CASE WHEN lecturer_overquota_reason IS NOT NULL AND forwarded_to_kadep_at IS NULL THEN 1 ELSE 0 END) AS unbackfilled_path_c
  FROM thesis_advisor_request
`);
console.log('Migration A verification:');
console.log(JSON.stringify(result, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));

const columns = await prisma.$queryRawUnsafe(`
  SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'thesis_advisor_request'
    AND COLUMN_NAME IN ('forwarded_to_kadep_at', 'forwarded_by_lecturer_id', 'accepted_over_normal')
  ORDER BY COLUMN_NAME
`);
console.log('\nNew columns schema:');
console.log(JSON.stringify(columns, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));

await prisma.$disconnect();
