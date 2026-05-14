/**
 * Script: Set user Ilham tanpa pembimbing untuk testing fitur "Cari Pembimbing"
 *
 * Melakukan:
 * 1. Menghapus semua ThesisSupervisors dari thesis Ilham
 * 2. Menambahkan gate milestone (isGateToAdvisorSearch) yang sudah completed
 *    agar Ilham bisa mengakses halaman pencarian pembimbing
 *
 * Jalankan dari folder services:
 *   node scripts/set-ilham-no-advisor.js
 */

import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const NIM_ILHAM = '2211522028';

async function main() {
  console.log('🔧 Mengatur user Ilham tanpa pembimbing untuk testing...\n');

  // 1. Cari user Ilham
  const user = await prisma.user.findUnique({
    where: { identityNumber: NIM_ILHAM },
    select: { id: true, fullName: true, email: true },
  });

  if (!user) {
    console.error('❌ User Ilham (NIM', NIM_ILHAM, ') tidak ditemukan. Jalankan seed terlebih dahulu.');
    process.exit(1);
  }

  console.log(`✅ User ditemukan: ${user.fullName} (${user.email})`);

  // 2. Cari thesis Ilham
  const thesis = await prisma.thesis.findFirst({
    where: { studentId: user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true },
  });

  if (!thesis) {
    console.error('❌ Thesis Ilham tidak ditemukan. Jalankan seed terlebih dahulu.');
    process.exit(1);
  }

  console.log(`✅ Thesis ditemukan: ${thesis.title}\n`);

  // 3. Hapus semua pembimbing (ThesisSupervisors)
  const deleted = await prisma.thesisSupervisors.deleteMany({
    where: { thesisId: thesis.id },
  });
  console.log(`🗑️  Dihapus ${deleted.count} pembimbing dari thesis Ilham`);

  // 4. Pastikan gate milestone ada dan completed
  const gateTemplate = await prisma.thesisMilestoneTemplate.findFirst({
    where: { isGateToAdvisorSearch: true, phase: 'metopen' },
    select: { id: true, name: true },
  });

  if (!gateTemplate) {
    console.log('⚠️  Template gate (isGateToAdvisorSearch) tidak ditemukan. Jalankan seed untuk membuat template.');
    console.log('   Fitur cari pembimbing memerlukan milestone gate yang completed.');
    process.exit(1);
  }

  const existingGate = await prisma.thesisMilestone.findFirst({
    where: {
      thesisId: thesis.id,
      milestoneTemplateId: gateTemplate.id,
    },
    select: { id: true, status: true },
  });

  const now = new Date();
  if (existingGate) {
    if (existingGate.status !== 'completed') {
      await prisma.thesisMilestone.update({
        where: { id: existingGate.id },
        data: {
          status: 'completed',
          progressPercentage: 100,
          completedAt: now,
          validatedAt: now,
        },
      });
      console.log(`✅ Gate milestone "${gateTemplate.name}" diupdate → completed`);
    } else {
      console.log(`✅ Gate milestone "${gateTemplate.name}" sudah completed`);
    }
  } else {
    await prisma.thesisMilestone.create({
      data: {
        thesisId: thesis.id,
        milestoneTemplateId: gateTemplate.id,
        title: gateTemplate.name,
        orderIndex: 2,
        status: 'completed',
        progressPercentage: 100,
        completedAt: now,
        validatedAt: now,
      },
    });
    console.log(`✅ Gate milestone "${gateTemplate.name}" dibuat (completed)`);
  }

  // 5. Hapus advisor request yang mungkin blocking (opsional - agar tidak ada pengajuan aktif)
  const withdrawn = await prisma.thesisAdvisorRequest.updateMany({
    where: {
      studentId: user.id,
      status: { in: ['pending', 'escalated'] },
    },
    data: { status: 'withdrawn' },
  });
  if (withdrawn.count > 0) {
    console.log(`📤 ${withdrawn.count} pengajuan aktif di-withdraw`);
  }

  console.log('\n✨ Selesai! User Ilham siap untuk testing fitur "Cari Pembimbing".');
  console.log('   Login: ilham_2211522028@fti.unand.ac.id');
}

main()
  .catch((e) => {
    console.error('Gagal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
