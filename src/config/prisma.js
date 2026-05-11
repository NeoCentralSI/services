// Use the generated Prisma client from custom output path configured in prisma/schema.prisma
// generator client { output = "../src/generated/prisma" }
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ENV } from "./env.js";
import generated from "../generated/prisma/index.js";
import {
  REQUIRED_SIMPTA_COLUMNS,
  REQUIRED_SIMPTA_ENUM_VALUES,
  REQUIRED_SIMPTA_TABLES,
} from "../../prisma/simpta-schema-contract.js";

const { PrismaClient, Prisma } = generated;

const GENERATED_CLIENT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../generated/prisma/index.js"
);
const PRISMA_MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../prisma/migrations"
);
const DIRECT_DATABASE_PROTOCOLS = [
  "mysql://",
  "mysqls://",
  "postgresql://",
  "postgres://",
  "sqlserver://",
];

function usesDirectDatabaseUrl(databaseUrl = "") {
  return DIRECT_DATABASE_PROTOCOLS.some((protocol) =>
    databaseUrl.startsWith(protocol)
  );
}

function isGeneratedWithoutEngine() {
  try {
    const generatedClientSource = fs.readFileSync(
      GENERATED_CLIENT_PATH,
      "utf8"
    );
    return generatedClientSource.includes('"copyEngine": false');
  } catch {
    return false;
  }
}

function assertPrismaClientMode() {
  if (!usesDirectDatabaseUrl(ENV.DATABASE_URL) || !isGeneratedWithoutEngine()) {
    return;
  }

  throw new Error(
    [
      "Prisma Client lokal terdeteksi dibuat dengan --no-engine, tetapi DATABASE_URL memakai koneksi database langsung.",
      "Local development repo ini harus memakai generated client dengan engine normal.",
      "Hentikan proses node yang sedang berjalan, lalu jalankan `pnpm --dir services prisma:generate`.",
    ].join(" ")
  );
}

assertPrismaClientMode();

const basePrisma = new PrismaClient();

function quoteSqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function listLocalPrismaMigrationNames() {
  try {
    return fs
      .readdirSync(PRISMA_MIGRATIONS_DIR, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          fs.existsSync(path.join(PRISMA_MIGRATIONS_DIR, entry.name, "migration.sql"))
      )
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

async function getPendingPrismaMigrationNames(client = basePrisma) {
  const localMigrationNames = listLocalPrismaMigrationNames();
  if (localMigrationNames.length === 0) {
    return [];
  }

  try {
    const appliedRows = await client.$queryRawUnsafe(
      "SELECT migration_name AS migrationName, finished_at AS finishedAt, rolled_back_at AS rolledBackAt FROM `_prisma_migrations`"
    );
    const appliedNames = new Set(
      (Array.isArray(appliedRows) ? appliedRows : [])
        .filter((row) => row?.finishedAt && !row?.rolledBackAt)
        .map((row) => row.migrationName)
    );

    return localMigrationNames.filter((name) => !appliedNames.has(name));
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2021" || error.code === "P2022")
    ) {
      return [];
    }

    return [];
  }
}

async function getExistingTableNames(tableNames, client = basePrisma) {
  if (!tableNames.length) {
    return new Set();
  }

  const rows = await client.$queryRawUnsafe(
    `SELECT table_name AS tableName
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name IN (${tableNames.map(quoteSqlLiteral).join(", ")})`
  );

  return new Set((Array.isArray(rows) ? rows : []).map((row) => row.tableName));
}

async function getExistingColumnNames(tableName, columnNames, client = basePrisma) {
  if (!columnNames.length) {
    return new Set();
  }

  const rows = await client.$queryRawUnsafe(
    `SELECT column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ${quoteSqlLiteral(tableName)}
       AND column_name IN (${columnNames.map(quoteSqlLiteral).join(", ")})`
  );

  return new Set((Array.isArray(rows) ? rows : []).map((row) => row.columnName));
}

async function getColumnType(tableName, columnName, client = basePrisma) {
  const rows = await client.$queryRawUnsafe(
    `SELECT column_type AS columnType
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ${quoteSqlLiteral(tableName)}
       AND column_name = ${quoteSqlLiteral(columnName)}
     LIMIT 1`
  );

  return (Array.isArray(rows) ? rows : [])[0]?.columnType ?? null;
}

function enumColumnHasValue(columnType, value) {
  return String(columnType).includes(`'${String(value).replace(/'/g, "''")}'`);
}

export async function assertSimptaSchemaCompatibility(client = basePrisma) {
  const tableNamesToCheck = [...new Set([...REQUIRED_SIMPTA_TABLES, "thesis_supervisors"])];
  const [existingTables, pendingMigrations] = await Promise.all([
    getExistingTableNames(tableNamesToCheck, client),
    getPendingPrismaMigrationNames(client),
  ]);

  const missingSchemaParts = [];
  const missingSchemaPartSet = new Set();

  function addMissingSchemaPart(part) {
    if (missingSchemaPartSet.has(part)) {
      return;
    }
    missingSchemaPartSet.add(part);
    missingSchemaParts.push(part);
  }

  REQUIRED_SIMPTA_TABLES
    .filter((tableName) => !existingTables.has(tableName))
    .forEach((tableName) => addMissingSchemaPart(`table \`${tableName}\``));

  for (const [tableName, columnNames] of Object.entries(REQUIRED_SIMPTA_COLUMNS)) {
    const existingColumns = await getExistingColumnNames(tableName, columnNames, client);
    for (const columnName of columnNames) {
      if (!existingColumns.has(columnName)) {
        addMissingSchemaPart(`kolom \`${tableName}.${columnName}\``);
      }
    }
  }

  for (const [tableName, columns] of Object.entries(REQUIRED_SIMPTA_ENUM_VALUES)) {
    for (const [columnName, requiredValues] of Object.entries(columns)) {
      const columnType = await getColumnType(tableName, columnName, client);
      if (!columnType) {
        addMissingSchemaPart(`kolom \`${tableName}.${columnName}\``);
        continue;
      }
      const missingValues = requiredValues.filter(
        (value) => !enumColumnHasValue(columnType, value)
      );
      if (missingValues.length > 0) {
        addMissingSchemaPart(
          `enum \`${tableName}.${columnName}\` belum memuat ${missingValues.join(", ")}`
        );
      }
    }
  }

  if (missingSchemaParts.length === 0) {
    return;
  }

  const legacyHint =
    existingTables.has("thesis_supervisors") && !existingTables.has("thesis_participants")
      ? " Database masih memakai tabel legacy `thesis_supervisors`."
      : "";
  const pendingHint =
    pendingMigrations.length > 0
      ? ` Pending Prisma migrations: ${pendingMigrations.join(", ")}.`
      : "";

  throw new Error(
    `Schema database SIMPTA belum sinkron dengan code aktif. Objek yang belum tersedia: ${missingSchemaParts.join(", ")}.${legacyHint}${pendingHint} Periksa \`npx prisma migrate status\` di folder services dan sinkronkan database ke baseline migration repo ini.`
  );
}

/**
 * After TA-03A/TA-03B rows change, keep KaDep queue in sync (Panduan Langkah 4–6).
 * Dynamic import avoids circular dependency with metopen.service (which imports prisma).
 */
async function afterResearchMethodScoreWrite(thesisId) {
  if (!thesisId) return;
  try {
    const { syncKadepProposalQueueByThesisId } = await import(
      "../services/metopen.service.js"
    );
    await syncKadepProposalQueueByThesisId(thesisId);
  } catch (err) {
    console.error(
      "[Prisma] syncKadepProposalQueueByThesisId failed:",
      err?.message ?? err
    );
  }
}

const prisma = basePrisma.$extends({
  query: {
    researchMethodScore: {
      async create({ args, query }) {
        const result = await query(args);
        await afterResearchMethodScoreWrite(result?.thesisId);
        return result;
      },
      async update({ args, query }) {
        const result = await query(args);
        await afterResearchMethodScoreWrite(result?.thesisId);
        return result;
      },
      async upsert({ args, query }) {
        const result = await query(args);
        await afterResearchMethodScoreWrite(result?.thesisId);
        return result;
      },
    },
  },
});

export async function checkDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    try {
      await assertSimptaSchemaCompatibility(basePrisma);
    } catch (schemaError) {
      if (process.env.SIMPTA_SCHEMA_STRICT === "true") {
        throw schemaError;
      }
      console.warn(
        "⚠️ SIMPTA schema compatibility warning:",
        schemaError.message
      );
    }
    console.log("✅ Database connected successfully");
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    throw err;
  }
}

export default prisma;
