import { PrismaClient } from "../../src/generated/prisma/index.js";
const prisma = new PrismaClient();

async function main() {
  const ay = await prisma.academicYear.findFirst({ 
    where: { isActive: true },
    orderBy: { createdAt: 'desc' }
  });
  
  if (!ay) {
    console.error("❌ No active academic year found.");
    process.exit(1);
  }

  console.log(`🌱 Seeding Internship Guidance Questions for AY: ${ay.year}...`);

  const questions = [
    // Week 1-4 examples
    { weekNumber: 1, orderIndex: 1, questionText: "Rencana kegiatan apa yang akan dilakukan minggu ini?", academicYearId: ay.id },
    { weekNumber: 1, orderIndex: 2, questionText: "Kendala apa yang dihadapi pada awal mulai KP?", academicYearId: ay.id },
    { weekNumber: 2, orderIndex: 1, questionText: "Progress pekerjaan dari rencana minggu sebelumnya?", academicYearId: ay.id },
    { weekNumber: 3, orderIndex: 1, questionText: "Bagaimana adaptasi dengan lingkungan kerja di perusahaan?", academicYearId: ay.id },
  ];

  for (const q of questions) {
    const existing = await prisma.internshipGuidanceQuestion.findFirst({
      where: { 
        weekNumber: q.weekNumber, 
        questionText: q.questionText,
        academicYearId: q.academicYearId 
      }
    });

    if (!existing) {
      await prisma.internshipGuidanceQuestion.create({ data: q });
      console.log(`  ✅ Created Week ${q.weekNumber}: ${q.questionText.substring(0, 30)}...`);
    }
  }

  console.log("✅ Guidance Questions seeded!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
