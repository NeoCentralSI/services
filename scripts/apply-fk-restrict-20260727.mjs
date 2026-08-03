import prisma from "../src/config/prisma.js";

async function main() {
  const rows = await prisma.$queryRaw`
    SELECT TABLE_NAME, CONSTRAINT_NAME, DELETE_RULE, REFERENCED_TABLE_NAME
    FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND (
        (TABLE_NAME = 'metopen_attendance_imports' AND REFERENCED_TABLE_NAME = 'users')
        OR (TABLE_NAME = 'research_method_scores' AND REFERENCED_TABLE_NAME IN ('thesis', 'theses'))
      )
  `;
  console.log("before", rows);

  for (const row of rows) {
    if (row.DELETE_RULE === "RESTRICT" || row.DELETE_RULE === "NO ACTION") {
      console.log(`skip ${row.CONSTRAINT_NAME}: already ${row.DELETE_RULE}`);
      continue;
    }

    const table = row.TABLE_NAME;
    const name = row.CONSTRAINT_NAME;

    // Discover column mapping
    const cols = await prisma.$queryRaw`
      SELECT COLUMN_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND CONSTRAINT_NAME = ${name}
        AND TABLE_NAME = ${table}
      ORDER BY ORDINAL_POSITION
    `;

    if (!cols.length) {
      console.warn(`no columns for ${name}`);
      continue;
    }

    const localCols = cols.map((c) => `\`${c.COLUMN_NAME}\``).join(", ");
    const refCols = cols.map((c) => `\`${c.REFERENCED_COLUMN_NAME}\``).join(", ");
    const refTable = row.REFERENCED_TABLE_NAME;

    await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${name}\``);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\` FOREIGN KEY (${localCols}) REFERENCES \`${refTable}\` (${refCols}) ON DELETE RESTRICT ON UPDATE CASCADE`,
    );
    console.log(`updated ${name} -> RESTRICT`);
  }

  const after = await prisma.$queryRaw`
    SELECT TABLE_NAME, CONSTRAINT_NAME, DELETE_RULE, REFERENCED_TABLE_NAME
    FROM information_schema.REFERENTIAL_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND (
        (TABLE_NAME = 'metopen_attendance_imports' AND REFERENCED_TABLE_NAME = 'users')
        OR (TABLE_NAME = 'research_method_scores' AND REFERENCED_TABLE_NAME IN ('thesis', 'theses'))
      )
  `;
  console.log("after", after);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
