/**
 * Script untuk menambahkan status "Acc Seminar" ke thesis_status
 * 
 * Usage: node scripts/add-acc-seminar-status.js
 */

import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

async function main() {
  console.log("🔄 Checking for 'Acc Seminar' status...");

  const existing = await prisma.thesisStatus.findFirst({
    where: { name: "Acc Seminar" },
  });

  if (existing) {
    console.log("✅ Status 'Acc Seminar' already exists with ID:", existing.id);
  } else {
    const created = await prisma.thesisStatus.create({
      data: { name: "Acc Seminar" },
    });
    console.log("✅ Created status 'Acc Seminar' with ID:", created.id);
  }

  // Show all thesis statuses
  const allStatuses = await prisma.thesisStatus.findMany({
    orderBy: { name: "asc" },
  });
  console.log("\n📋 All Thesis Statuses:");
  allStatuses.forEach((s, i) => {
    console.log(`   ${i + 1}. ${s.name} (${s.id})`);
  });
}

main()
  .catch((e) => {
    console.error("❌ Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
