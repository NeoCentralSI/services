import { PrismaClient } from '../../src/generated/prisma/index.js';
const prisma = new PrismaClient();

const statusEnum = await prisma.$queryRawUnsafe(`
  SELECT COLUMN_TYPE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'thesis_guidances'
    AND COLUMN_NAME = 'status'
`);
console.log('GuidanceStatus enum after Migration F:');
console.log(JSON.stringify(statusEnum, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));

const guidanceCount = await prisma.$queryRawUnsafe(`
  SELECT status, COUNT(*) AS cnt
  FROM thesis_guidances
  GROUP BY status
`);
console.log('\nGuidance status breakdown:');
console.log(JSON.stringify(guidanceCount, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2));

await prisma.$disconnect();
