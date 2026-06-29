import { PrismaClient } from '../src/generated/prisma/index.js';
import { writeFileSync, mkdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

const BACKUP_DIR = join(__dirname, 'backups');
mkdirSync(BACKUP_DIR, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = join(BACKUP_DIR, `metopen_backup_${timestamp}.json`);

try {
  const tables = [
    'metopenCpmk',
    'metopenAssessmentCriteria',
    'metopenAssessmentRubric',
    'researchMethodScore',
    'researchMethodScoreDetail',
    'cpmk',
    'assessmentCriteria',
    'assessmentRubric',
  ];

  const backup = { timestamp: new Date().toISOString(), tables: {} };

  for (const table of tables) {
    if (typeof prisma[table]?.findMany === 'function') {
      const rows = await prisma[table].findMany();
      backup.tables[table] = { count: rows.length, rows };
      console.log(`${table}: ${rows.length} rows`);
    } else {
      console.log(`${table}: model not found, skipping`);
      backup.tables[table] = { count: 0, error: 'model not found' };
    }
  }

  writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  const sizeKb = Math.round(statSync(backupFile).size / 1024);
  console.log(`\nBackup saved: ${backupFile} (${sizeKb} KB)`);
} catch (e) {
  console.error('Backup FAILED:', e.message);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
