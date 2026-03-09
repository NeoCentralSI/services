// Use the generated Prisma client from custom output path configured in prisma/schema.prisma
// generator client { output = "../src/generated/prisma" }
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ENV } from "./env.js";
import generated from "../generated/prisma/index.js";

const { PrismaClient } = generated;

const GENERATED_CLIENT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../generated/prisma/index.js"
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

const prisma = new PrismaClient();

export async function checkDatabaseConnection() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("✅ Database connected successfully");
  } catch (err) {
    console.error("❌ Database connection failed:", err.message);
    throw err;
  }
}

export default prisma;
