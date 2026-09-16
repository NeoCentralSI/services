import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

const curriculumData = {
    name: "Kurikulum OBE",
    startYear: 2021,
    endYear: 2026,
};

const cplData = [
    {
        code: "CPL-01",
        minimalScore: 55,
        isActive: true,
        description:
            "Kemampuan untuk mengidentifikasi, memformulasikan dan memecahkan permasalahan kebutuhan informasi dari suatu organisasi",
    },
    {
        code: "CPL-02",
        minimalScore: 55,
        isActive: true,
        description:
            "Kemampuan untuk mengintegrasikan solusi berbasis teknologi informasi secara efektif pada suatu organisasi",
    },
    {
        code: "CPL-03",
        minimalScore: 55,
        isActive: true,
        description:
            "Kemampuan untuk menerapkan konsep-konsep dasar dalam merencanakan Sistem Informasi, merancang Sistem Informasi, membangun Sistem Informasi, mengoperasikan Sistem Informasi, dan mengevaluasi Sistem Informasi",
    },
    {
        code: "CPL-04",
        minimalScore: 55,
        isActive: true,
        description:
            "Kemampuan untuk berkarya dengan perilaku etika sesuai bidang keprofesian teknologi informasi",
    },
    {
        code: "CPL-05",
        minimalScore: 55,
        isActive: true,
        description:
            "Kemampuan untuk berkomunikasi secara efektif pada berbagai kalangan",
    },
    {
        code: "CPL-06",
        minimalScore: 55,
        isActive: true,
        description:
            "Kemampuan untuk melibatkan diri dalam proses belajar terus-menerus sepanjang hidup",
    },
    {
        code: "CPL-07",
        minimalScore: 55,
        isActive: true,
        description:
            "Kemampuan untuk bekerja-sama secara efektif baik sebagai anggota maupun pimpinan tim kerja",
    },
    {
        code: "CPL-08",
        minimalScore: 55,
        isActive: true,
        description:
            "Kemampuan untuk mengidentifikasi kebutuhan untuk menjadi seorang wirausaha di bidang teknologi informasi",
    },
];

async function main() {
    console.log("🌱 Starting CPL & Curriculum seeding...");

    // Upsert curriculum
    let curriculum = await prisma.curriculum.findFirst({
        where: { name: curriculumData.name },
    });

    if (curriculum) {
        curriculum = await prisma.curriculum.update({
            where: { id: curriculum.id },
            data: curriculumData,
        });
        console.log(`✅ Updated Curriculum: ${curriculum.name}`);
    } else {
        curriculum = await prisma.curriculum.create({
            data: curriculumData,
        });
        console.log(`✨ Created Curriculum: ${curriculum.name}`);
    }

    for (const data of cplData) {
        const existing = await prisma.cpl.findFirst({
            where: {
                code: data.code,
                curriculumId: curriculum.id,
            },
        });

        const payload = {
            ...data,
            curriculumId: curriculum.id,
        };

        if (existing) {
            await prisma.cpl.update({
                where: { id: existing.id },
                data: payload,
            });
            console.log(`✅ Updated CPL: ${data.code}`);
        } else {
            await prisma.cpl.create({
                data: payload,
            });
            console.log(`✨ Created CPL: ${data.code}`);
        }
    }

    console.log("🏁 CPL seeding finished.");
}

main()
    .catch((e) => {
        console.error("❌ Seeding failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
