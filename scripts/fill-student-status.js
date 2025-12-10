import 'dotenv/config';
import prisma from "../src/config/prisma.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { name: 'Aktif', id: undefined };
  for (const a of args) {
    const [k, v] = a.replace(/^--/, "").split("=");
    if (k === 'name' && v) out.name = v;
    if (k === 'id' && v) out.id = v;
  }
  return out;
}

function canonicalizeStatusName(input) {
  if (!input) return 'Aktif';
  const v = String(input).trim().toLowerCase().replace(/\s+/g, ' ');
  if (v === 'aktif' || v === 'active') return 'Aktif';
  if (v === 'non aktif' || v === 'nonaktif' || v === 'inactive') return 'Non Aktif';
  if (v === 'drop out' || v === 'dropout' || v === 'drop-out') return 'Drop Out';
  // fallback to capitalized original
  return input;
}

async function ensureStatus(name) {
  const existing = await prisma.studentStatus.findFirst({ where: { name } });
  if (existing) return existing;
  const created = await prisma.studentStatus.create({ data: { name } });
  console.log(`Created StudentStatus: ${name}`);
  return created;
}

async function ensureDefaultStatuses() {
  // Seed a minimal set of statuses if they don't exist
  const needed = ['Aktif', 'Non Aktif', 'Drop Out'];
  for (const n of needed) {
    // eslint-disable-next-line no-await-in-loop
    await ensureStatus(n);
  }
}

async function getTargetStatus({ id, name }) {
  if (id) {
    const status = await prisma.studentStatus.findFirst({ where: { id } });
    if (!status) throw new Error(`StudentStatus with id '${id}' not found`);
    return status;
  }
  const status = await prisma.studentStatus.findFirst({ where: { name } });
  if (!status) throw new Error(`StudentStatus with name '${name}' not found`);
  return status;
}

async function main() {
  const args = parseArgs();
  const targetName = args.id ? undefined : canonicalizeStatusName(args.name);
  console.log(`Setting studentStatusId=null -> '${args.id ? args.id : targetName}'...`);

  // Ensure baseline statuses exist
  await ensureDefaultStatuses();

  const target = await getTargetStatus({ id: args.id, name: targetName });

  // Find students with null status
  const students = await prisma.student.findMany({
    where: { studentStatusId: null },
    select: { id: true },
  });

  if (!students.length) {
    console.log("No students with null status found. Nothing to update.");
    return;
  }

  console.log(`Found ${students.length} student(s) to update.`);

  const updates = students.map((s) =>
    prisma.student.update({ where: { id: s.id }, data: { studentStatusId: target.id } })
  );

  const result = await prisma.$transaction(updates, { timeout: 60000 }).catch(async (err) => {
    console.error("Transaction failed, falling back to sequential updates:", err.message);
    let count = 0;
    for (const s of students) {
      try {
        await prisma.student.update({ where: { id: s.id }, data: { studentStatusId: target.id } });
        count++;
      } catch (e) {
        console.error(`Failed updating student ${s.id}:`, e.message);
      }
    }
    return { fallbackUpdated: count };
  });

  if (Array.isArray(result)) {
    console.log(`Updated ${result.length} student(s) successfully.`);
  } else if (result && typeof result.fallbackUpdated === 'number') {
    console.log(`Updated ${result.fallbackUpdated} student(s) (sequential fallback).`);
  } else {
    console.log("Update completed.");
  }
}

main()
  .catch((err) => {
    console.error("Error:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
