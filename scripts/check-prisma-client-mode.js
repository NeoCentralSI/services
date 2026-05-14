import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedClientPath = path.join(
  rootDir,
  "src",
  "generated",
  "prisma",
  "index.js"
);
const envPath = path.join(rootDir, ".env");

dotenv.config({ path: envPath });

const databaseUrl = process.env.DATABASE_URL || "";
const directDatabaseProtocols = [
  "mysql://",
  "mysqls://",
  "postgresql://",
  "postgres://",
  "sqlserver://",
];

const usesDirectDatabaseUrl = directDatabaseProtocols.some((protocol) =>
  databaseUrl.startsWith(protocol)
);

if (!fs.existsSync(generatedClientPath)) {
  console.error(
    "Prisma Client belum tergenerate di services/src/generated/prisma. Jalankan `pnpm --dir services prisma:generate` sebelum start/dev."
  );
  process.exit(1);
}

const generatedClientSource = fs.readFileSync(generatedClientPath, "utf8");
const isGeneratedWithoutEngine = generatedClientSource.includes('"copyEngine": false');

if (usesDirectDatabaseUrl && isGeneratedWithoutEngine) {
  console.error(
    [
      "Prisma Client lokal terdeteksi dibuat dengan --no-engine, tetapi DATABASE_URL memakai koneksi database langsung.",
      "Ini membuat backend gagal boot dan login ikut gagal karena service auth tidak pernah hidup.",
      "Hentikan proses node yang sedang berjalan, lalu jalankan `pnpm --dir services prisma:generate`.",
    ].join(" ")
  );
  process.exit(1);
}

console.log("Prisma client mode check passed");
