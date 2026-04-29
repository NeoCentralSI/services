import { PrismaClient } from "../../src/generated/prisma/index.js";
const prisma = new PrismaClient();

async function main() {
  const ay = await prisma.academicYear.findFirst({ 
    where: { isActive: true },
    orderBy: { createdAt: 'desc' }
  });
  
  if (!ay) {
    console.error("❌ No active academic year found. Please seed AcademicYear first!");
    process.exit(1);
  }

  console.log(`🌱 Seeding Internship CPMK & Rubrics for AY: ${ay.year} ${ay.semester}...`);

  const cpmks = [
    {
      code: "CPMK-1",
      name: "Kemampuan Pelaksanaan Pekerjaan (Kedisiplinan, Kerjasama, dsb)",
      weight: 50,
      assessorType: "FIELD",
      academicYearId: ay.id,
      rubrics: [
        { levelName: "Sangat Baik", minScore: 81, maxScore: 100, description: "Sangat disiplin, inisiatif tinggi, dan kerjasama tim luar biasa." },
        { levelName: "Baik", minScore: 61, maxScore: 80, description: "Disiplin, bekerja sesuai arahan, dan dapat bekerjasama." },
        { levelName: "Cukup", minScore: 41, maxScore: 60, description: "Kurang disiplin namun masih menyelesaikan tugas dasar." },
      ]
    },
    {
      code: "CPMK-2",
      name: "Kualitas Laporan Akhir Internship",
      weight: 50,
      assessorType: "LECTURER",
      academicYearId: ay.id,
      rubrics: [
        { levelName: "Sangat Baik", minScore: 81, maxScore: 100, description: "Laporan sangat lengkap, analisis mendalam, dan format sempurna." },
        { levelName: "Baik", minScore: 61, maxScore: 80, description: "Laporan lengkap dan analisis cukup baik." },
        { levelName: "Cukup", minScore: 41, maxScore: 60, description: "Laporan kurang lengkap atau analisis dangkal." },
      ]
    }
  ];

  for (const c of cpmks) {
    const { rubrics, ...cpmkData } = c;
    
    // Check if CPMK already exists for this AY
    let cpmk = await prisma.internshipCpmk.findFirst({
      where: { code: c.code, academicYearId: ay.id }
    });

    if (!cpmk) {
      cpmk = await prisma.internshipCpmk.create({
        data: cpmkData
      });
      console.log(`  ✅ Created CPMK: ${c.code}`);
      
      // Create rubrics for the new CPMK
      for (const r of rubrics) {
        const { description, ...rubricData } = r; // Remove description after mapping
        await prisma.internshipAssessmentRubric.create({
          data: {
            ...rubricData,
            cpmkId: cpmk.id,
            rubricLevelDescription: description // Mapping to correct field name in schema
          }
        });
      }
      console.log(`     - Created ${rubrics.length} rubrics for ${c.code}`);
    } else {
      console.log(`  ⏩ Skipped CPMK (exists): ${c.code}`);
    }
  }
  
  console.log("✅ Internship CPMK & Rubrics seeded!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
