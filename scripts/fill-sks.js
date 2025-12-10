import 'dotenv/config';
import prisma from "../src/config/prisma.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { min: 90, max: 100 };
  for (const a of args) {
    const [k, v] = a.replace(/^--/, "").split("=");
    if (k === "min" && v) out.min = Number(v);
    if (k === "max" && v) out.max = Number(v);
  }
  if (!Number.isFinite(out.min) || !Number.isFinite(out.max) || out.min > out.max) {
    throw new Error(`Invalid range: min=${out.min} max=${out.max}`);
  }
  return out;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  const { min, max } = parseArgs();
  console.log(`Filling SKS for students with empty values using random range ${min}-${max}...`);

  // Fetch potentially empty SKS rows; primarily 0 (default from previous imports)
  let candidates = await prisma.student.findMany({
    where: { skscompleted: 0 },
    select: { id: true },
  });

  if (!candidates.length) {
    console.log("No students found with empty SKS. Nothing to update.");
    return;
  }

  console.log(`Found ${candidates.length} student(s) to update.`);

  // Update each with a random value in a single transaction for consistency
  const updates = candidates.map((s) =>
    prisma.student.update({
      where: { id: s.id },
      data: { skscompleted: randomInt(min, max) },
    })
  );

  const result = await prisma.$transaction(updates, { timeout: 60000 }).catch(async (err) => {
    console.error("Transaction failed, falling back to sequential updates:", err.message);
    let count = 0;
    for (const s of candidates) {
      try {
        await prisma.student.update({
          where: { id: s.id },
          data: { skscompleted: randomInt(min, max) },
        });
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
