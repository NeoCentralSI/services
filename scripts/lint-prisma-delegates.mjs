/**
 * lint-prisma-delegates.mjs
 *
 * Fail CI/local if code calls Prisma delegates that do not exist in schema.prisma.
 * Scope: SIMPTA-relevant paths under services/src, services/scripts, services/prisma.
 *
 * Excludes:
 * - node_modules / generated
 * - internship / KP paths (out of SIMPTA module ownership)
 * - obsolete seed-metopen-dummy.js (intentionally deprecated)
 *
 * Usage (from services/):
 *   node scripts/lint-prisma-delegates.mjs
 *   pnpm run lint:prisma-delegates
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const servicesRoot = path.resolve(__dirname, "..");
const schemaPath = path.join(servicesRoot, "prisma", "schema.prisma");

const SCAN_ROOTS = [
  path.join(servicesRoot, "src"),
  path.join(servicesRoot, "scripts"),
  path.join(servicesRoot, "prisma"),
];

const EXCLUDE_DIR_NAMES = new Set([
  "node_modules",
  "generated",
  "__pycache__",
  ".git",
]);

/** Path fragments to skip (KP / internship + obsolete seed). */
const EXCLUDE_PATH_FRAGMENTS = [
  `${path.sep}insternship${path.sep}`,
  `${path.sep}internship${path.sep}`,
  `${path.sep}seed-metopen-dummy.js`,
];

const DELEGATE_CALL_RE =
  /\b(?:prisma|tx|db|client)\.([a-zA-Z][a-zA-Z0-9_]*)\./g;

function toDelegate(modelName) {
  return modelName[0].toLowerCase() + modelName.slice(1);
}

function loadValidDelegates() {
  const schema = fs.readFileSync(schemaPath, "utf8");
  const models = [...schema.matchAll(/^model\s+(\w+)/gm)].map((m) => m[1]);
  return new Set(models.map(toDelegate));
}

function shouldSkipFile(filePath) {
  const normalized = filePath.split(path.sep).join(path.sep);
  for (const frag of EXCLUDE_PATH_FRAGMENTS) {
    if (normalized.includes(frag)) return true;
  }
  return false;
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
      continue;
    }
    if (!/\.(js|mjs|cjs|ts)$/.test(entry.name)) continue;
    if (shouldSkipFile(full)) continue;
    out.push(full);
  }
  return out;
}

function main() {
  const valid = loadValidDelegates();
  const findings = [];

  for (const root of SCAN_ROOTS) {
    for (const file of walkFiles(root)) {
      const text = fs.readFileSync(file, "utf8");
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip pure comments
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

        DELEGATE_CALL_RE.lastIndex = 0;
        let match;
        while ((match = DELEGATE_CALL_RE.exec(line)) !== null) {
          const delegate = match[1];
          if (!valid.has(delegate)) {
            findings.push({
              file: path.relative(servicesRoot, file),
              line: i + 1,
              delegate,
              snippet: trimmed.slice(0, 140),
            });
          }
        }
      }
    }
  }

  if (findings.length === 0) {
    console.log(
      `OK: ${valid.size} schema models; no invalid Prisma delegates in SIMPTA scan paths.`,
    );
    process.exit(0);
  }

  console.error(`FAIL: ${findings.length} invalid Prisma delegate call(s):\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  ${f.delegate}`);
    console.error(`    ${f.snippet}`);
  }
  console.error(
    "\nFix: rename to a valid schema delegate, or exclude the path if out of SIMPTA scope.",
  );
  process.exit(1);
}

main();
