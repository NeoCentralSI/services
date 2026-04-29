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

  console.log(`🌱 Seeding Internship Guidance Lecturer Criteria for AY: ${ay.year}...`);

  const criteriaList = [
    {
      criteriaName: "Keaktifan Mahasiswa",
      weekNumber: 1,
      inputType: "EVALUATION", // Enum: EVALUATION or TEXT
      orderIndex: 1,
      academicYearId: ay.id,
      options: ["Sangat Aktif", "Cukup Aktif", "Kurang Aktif"]
    },
    {
      criteriaName: "Kesesuaian Target",
      weekNumber: 1,
      inputType: "EVALUATION",
      orderIndex: 2,
      academicYearId: ay.id,
      options: ["Sesuai", "Sebagian Sesuai", "Tidak Sesuai"]
    },
    {
      criteriaName: "Catatan Tambahan Dosen",
      weekNumber: 1,
      inputType: "TEXT",
      orderIndex: 3,
      academicYearId: ay.id,
      options: []
    }
  ];

  for (const c of criteriaList) {
    const { options, ...criteriaData } = c;

    const existing = await prisma.internshipGuidanceLecturerCriteria.findFirst({
      where: { 
        criteriaName: c.criteriaName,
        weekNumber: c.weekNumber,
        academicYearId: ay.id 
      }
    });

    if (!existing) {
      const createdCriteria = await prisma.internshipGuidanceLecturerCriteria.create({
        data: criteriaData
      });
      console.log(`  ✅ Created Criteria: ${c.criteriaName}`);

      if (options.length > 0) {
        for (let i = 0; i < options.length; i++) {
          await prisma.internshipGuidanceLecturerCriteriaOption.create({
            data: {
              criteriaId: createdCriteria.id,
              optionText: options[i],
              orderIndex: i + 1
            }
          });
        }
        console.log(`     - Added ${options.length} options`);
      }
    } else {
      console.log(`  ⏩ Skipped Criteria (exists): ${c.criteriaName}`);
    }
  }

  console.log("✅ Lecturer Guidance Criteria seeded!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
