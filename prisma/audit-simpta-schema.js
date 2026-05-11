import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import generated from "../src/generated/prisma/index.js";
import {
  REQUIRED_SIMPTA_COLUMNS,
  REQUIRED_SIMPTA_ENUM_VALUES,
  REQUIRED_SIMPTA_TABLES,
} from "./simpta-schema-contract.js";

const { PrismaClient } = generated;
const prisma = new PrismaClient();
const strict = process.argv.includes("--strict");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, "migrations");

function quoteSqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function listLocalMigrationNames() {
  try {
    return fs
      .readdirSync(migrationsDir, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          fs.existsSync(path.join(migrationsDir, entry.name, "migration.sql")),
      )
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

async function queryRows(query) {
  const rows = await prisma.$queryRawUnsafe(query);
  return Array.isArray(rows) ? rows : [];
}

async function getTableNames(tableNames) {
  if (tableNames.length === 0) {
    return new Set();
  }

  const rows = await queryRows(
    `SELECT table_name AS tableName
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name IN (${tableNames.map(quoteSqlLiteral).join(", ")})`,
  );

  return new Set(rows.map((row) => row.tableName));
}

async function getColumnNames(tableName, columnNames) {
  if (columnNames.length === 0) {
    return new Set();
  }

  const rows = await queryRows(
    `SELECT column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ${quoteSqlLiteral(tableName)}
       AND column_name IN (${columnNames.map(quoteSqlLiteral).join(", ")})`,
  );

  return new Set(rows.map((row) => row.columnName));
}

async function getColumnType(tableName, columnName) {
  const rows = await queryRows(
    `SELECT column_type AS columnType
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ${quoteSqlLiteral(tableName)}
       AND column_name = ${quoteSqlLiteral(columnName)}
     LIMIT 1`,
  );

  return rows[0]?.columnType ?? null;
}

function enumColumnHasValue(columnType, value) {
  return String(columnType).includes(`'${String(value).replace(/'/g, "''")}'`);
}

async function getMigrationSummary() {
  try {
    const rows = await queryRows(
      `SELECT migration_name AS migrationName,
              finished_at AS finishedAt,
              rolled_back_at AS rolledBackAt
       FROM _prisma_migrations
       ORDER BY started_at`,
    );
    const applied = new Set(
      rows
        .filter((row) => row.finishedAt && !row.rolledBackAt)
        .map((row) => row.migrationName),
    );
    const local = listLocalMigrationNames();

    return {
      appliedCount: applied.size,
      latestApplied: rows.slice(-10).map((row) => row.migrationName),
      pendingLocal: local.filter((name) => !applied.has(name)),
      rolledBack: rows
        .filter((row) => row.rolledBackAt)
        .map((row) => row.migrationName),
    };
  } catch (error) {
    return {
      appliedCount: 0,
      latestApplied: [],
      pendingLocal: [],
      rolledBack: [],
      error: error.message,
    };
  }
}

async function main() {
  const databaseRows = await queryRows("SELECT DATABASE() AS dbName, VERSION() AS version");
  const database = databaseRows[0] ?? {};
  const tableNamesToCheck = [
    ...new Set([
      ...REQUIRED_SIMPTA_TABLES,
      ...Object.keys(REQUIRED_SIMPTA_COLUMNS),
      "thesis_supervisors",
      "_prisma_migrations",
    ]),
  ];
  const existingTables = await getTableNames(tableNamesToCheck);
  const missing = [];
  const missingSet = new Set();
  const columnReport = {};
  const enumReport = {};

  function addMissing(part) {
    if (missingSet.has(part)) {
      return;
    }
    missingSet.add(part);
    missing.push(part);
  }

  for (const tableName of REQUIRED_SIMPTA_TABLES) {
    if (!existingTables.has(tableName)) {
      addMissing(`table ${tableName}`);
    }
  }

  for (const [tableName, columnNames] of Object.entries(REQUIRED_SIMPTA_COLUMNS)) {
    const existingColumns = await getColumnNames(tableName, columnNames);
    const missingColumns = columnNames.filter((columnName) => !existingColumns.has(columnName));
    columnReport[tableName] = {
      present: columnNames.filter((columnName) => existingColumns.has(columnName)),
      missing: missingColumns,
    };
    for (const columnName of missingColumns) {
      addMissing(`column ${tableName}.${columnName}`);
    }
  }

  for (const [tableName, columns] of Object.entries(REQUIRED_SIMPTA_ENUM_VALUES)) {
    enumReport[tableName] = {};
    for (const [columnName, requiredValues] of Object.entries(columns)) {
      const columnType = await getColumnType(tableName, columnName);
      const missingValues = columnType
        ? requiredValues.filter((value) => !enumColumnHasValue(columnType, value))
        : requiredValues;
      enumReport[tableName][columnName] = {
        columnType,
        present: requiredValues.filter((value) => columnType && enumColumnHasValue(columnType, value)),
        missing: missingValues,
      };
      if (!columnType) {
        addMissing(`column ${tableName}.${columnName}`);
      } else if (missingValues.length > 0) {
        addMissing(`enum ${tableName}.${columnName} missing values ${missingValues.join(", ")}`);
      }
    }
  }

  const report = {
    database,
    tables: {
      present: tableNamesToCheck.filter((tableName) => existingTables.has(tableName)),
      missing: tableNamesToCheck.filter((tableName) => !existingTables.has(tableName)),
    },
    columns: columnReport,
    enums: enumReport,
    migrations: await getMigrationSummary(),
    missing,
  };

  console.log(JSON.stringify(report, null, 2));

  if (strict && missing.length > 0) {
    console.error(`SIMPTA schema audit failed: ${missing.join(", ")}`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("SIMPTA schema audit could not run:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
