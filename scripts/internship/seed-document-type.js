import { PrismaClient } from "../../src/generated/prisma/index.js";
const prisma = new PrismaClient();

const documentTypes = [
  { name: "Proposal Internship" },
  { name: "Laporan Internship" },
  { name: "Absensi Internship" },
  { name: "Sertifikat Selesai KP" },
  { name: "Nilai Pembimbing Lapangan" }
];

async function main() {
  console.log("🌱 Seeding Document Types...");
  for (const type of documentTypes) {
    // Check if exists by name first to avoid duplicates
    const existing = await prisma.documentType.findFirst({
      where: { name: type.name }
    });

    if (!existing) {
      await prisma.documentType.create({
        data: type,
      });
      console.log(`  ✅ Created: ${type.name}`);
    } else {
      console.log(`  ⏩ Skipped (exists): ${type.name}`);
    }
  }
  console.log("✅ Document Types seeded!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
