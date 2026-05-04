import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const cplData = [
  {
    code: 'CPL-01',
    minimalScore: 55,
    isActive: true,
    description: 'Kemampuan untuk mengidentifikasi, memformulasikan dan memecahkan permasalahan kebutuhan informasi dari suatu organisasi;',
  },
  {
    code: 'CPL-02',
    minimalScore: 55,
    isActive: true,
    description: 'Kemampuan untuk mengintegrasikan solusi berbasis teknologi informasi secara efektif pada suatu organisasi;',
  },
  {
    code: 'CPL-03',
    minimalScore: 55,
    isActive: true,
    description: 'Kemampuan untuk menerapkan konsep-konsep dasar dalam merencanakan Sistem Informasi, merancang Sistem Informasi, membangun Sistem Informasi, mengoperasikan Sistem Informasi, dan mengevaluasi Sistem Informasi;',
  },
  {
    code: 'CPL-04',
    minimalScore: 55,
    isActive: true,
    description: 'Kemampuan untuk berkarya dengan perilaku etika sesuai bidang keprofesian teknologi informasi;',
  },
  {
    code: 'CPL-05',
    minimalScore: 55,
    isActive: true,
    description: 'Kemampuan untuk berkomunikasi secara efektif pada berbagai kalangan;',
  },
  {
    code: 'CPL-06',
    minimalScore: 55,
    isActive: true,
    description: 'Kemampuan untuk melibatkan diri dalam proses belajar terus-menerus sepanjang hidup;',
  },
  {
    code: 'CPL-07',
    minimalScore: 55,
    isActive: true,
    description: 'Kemampuan untuk bekerja-sama secara efektif baik sebagai anggota maupun pimpinan tim kerja;',
  },
  {
    code: 'CPL-08',
    minimalScore: 55,
    isActive: true,
    description: 'Kemampuan untuk mengidentifikasi kebutuhan untuk menjadi seorang wirausaha di bidang teknologi informasi.',
  },
];

async function main() {
  console.log('🌱 Starting CPL seeding...');

  for (const data of cplData) {
    const existing = await prisma.cpl.findFirst({
      where: { code: data.code }
    });

    if (existing) {
      await prisma.cpl.update({
        where: { id: existing.id },
        data,
      });
      console.log(`✅ Updated: ${data.code}`);
    } else {
      await prisma.cpl.create({
        data,
      });
      console.log(`✨ Created: ${data.code}`);
    }
  }

  console.log('🏁 CPL seeding finished.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
