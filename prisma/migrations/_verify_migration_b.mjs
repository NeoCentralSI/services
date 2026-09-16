import { PrismaClient } from '../../src/generated/prisma/index.js';
const prisma = new PrismaClient();

const statusBreakdown = await prisma.$queryRawUnsafe(`
  SELECT status, COUNT(*) AS cnt
  FROM thesis_advisor_request
  GROUP BY status
  ORDER BY cnt DESC
`);
console.log('Status breakdown after backfill:');
console.log(JSON.stringify(statusBreakdown, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));

const routeBreakdown = await prisma.$queryRawUnsafe(`
  SELECT route_type, request_type, COUNT(*) AS cnt
  FROM thesis_advisor_request
  GROUP BY route_type, request_type
  ORDER BY route_type, request_type
`);
console.log('\nRoute type x Request type breakdown:');
console.log(JSON.stringify(routeBreakdown, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));

const legacyResidual = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS legacy_remaining
  FROM thesis_advisor_request
  WHERE status IN ('approved', 'override_approved', 'assigned', 'rejected', 'closed', 'escalated')
`);
console.log('\nLegacy status remaining (should be 0):');
console.log(JSON.stringify(legacyResidual, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));

const ta02WithoutDept = await prisma.$queryRawUnsafe(`
  SELECT COUNT(*) AS ta02_not_dept
  FROM thesis_advisor_request
  WHERE request_type = 'ta_02' AND route_type != 'dept'
`);
console.log('\nTA-02 rows tanpa route_type=dept (should be 0):');
console.log(JSON.stringify(ta02WithoutDept, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));

const routeEnum = await prisma.$queryRawUnsafe(`
  SELECT COLUMN_TYPE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'thesis_advisor_request'
    AND COLUMN_NAME = 'route_type'
`);
console.log('\nRoute_type column definition:');
console.log(JSON.stringify(routeEnum, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));

await prisma.$disconnect();
