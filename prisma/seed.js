/**
 * Prisma Seed — NeoCentral / SIMPTA
 *
 * Menginisialisasi data master dan data testing awal.
 * Jalankan dengan: npx prisma db seed
 *
 * Prinsip:
 * - Gunakan upsert agar seed bisa dijalankan berulang tanpa duplikat
 * - Data master (roles, thesis statuses, dll) selalu di-seed
 * - Data testing hanya di-upsert, tidak menimpa data yang sudah ada
 */

import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

// ────────────────────────────────────────────────────────────
// MASTER DATA
// ────────────────────────────────────────────────────────────

async function seedRoles() {
  const roles = [
    'Admin',
    'Ketua Departemen',
    'Sekretaris Departemen',
    'Pembimbing 1',
    'Pembimbing 2',
    'Penguji',
    'Mahasiswa',
    'GKM',
    'Koordinator Matkul Metopen',
    'Koordinator Yudisium',
    'Tim Pengelola CPL',
  ];

  for (const name of roles) {
    const existingByName = await prisma.userRole.findFirst({ where: { name } });
    if (existingByName) {
      await prisma.userRole.update({
        where: { id: existingByName.id },
        data: { name },
      });
    } else {
      await prisma.userRole.create({ data: { id: name, name } });
    }
  }

  // Cleanup legacy Metopen role ids if present and already migrated.
  for (const legacyRoleId of ['Dosen Metodologi Penelitian', 'Dosen Pengampu Metopel']) {
    const legacy = await prisma.userRole.findUnique({ where: { id: legacyRoleId } });
    if (legacy) {
      const hasLinks = await prisma.userHasRole.count({ where: { roleId: legacy.id } });
      if (hasLinks === 0) {
        await prisma.userRole.delete({ where: { id: legacy.id } }).catch(() => {});
      }
    }
  }

  console.log(`  Roles: ${roles.length} seeded`);
}

async function seedThesisStatuses() {
  const statuses = [
    'Pengajuan Judul',
    'Metopel',
    'Bimbingan',
    'Seminar Proposal',
    'Acc Seminar',
    'Revisi Seminar',
    'Sidang',
    'Revisi Sidang',
    'Selesai',
    'Gagal',
  ];

  for (const name of statuses) {
    await prisma.thesisStatus.upsert({
      where: { id: name },
      update: { name },
      create: { id: name, name },
    });
  }

  console.log(`  ThesisStatus: ${statuses.length} seeded`);
}

async function seedAcademicYear() {
  const year = await prisma.academicYear.upsert({
    where: { id: 'tahun-2025-genap' },
    update: { isActive: true },
    create: {
      id: 'tahun-2025-genap',
      semester: 'genap',
      year: 2025,
      startDate: new Date('2026-01-13'),
      endDate: new Date('2026-06-30'),
      isActive: true,
    },
  });

  await prisma.supervisionQuotaDefault.upsert({
    where: { academicYearId: year.id },
    update: {},
    create: {
      academicYearId: year.id,
      quotaMax: 10,
      quotaSoftLimit: 8,
    },
  });

  console.log(`  AcademicYear: ${year.year} ${year.semester} (aktif)`);
  return year;
}

async function seedDocumentTypes() {
  const types = [
    { id: 'dt-proposal-ta', name: 'Proposal Tugas Akhir' },
    { id: 'dt-lembar-konsultasi', name: 'Lembar Konsultasi' },
    { id: 'dt-berita-acara-seminar', name: 'Berita Acara Seminar' },
    { id: 'dt-berita-acara-sidang', name: 'Berita Acara Sidang' },
    { id: 'dt-surat-persetujuan-judul', name: 'Surat Persetujuan Judul TA' },
    { id: 'dt-surat-penugasan', name: 'Surat Penugasan Pembimbing (TA-04)' },
    { id: 'dt-naskah-ta', name: 'Naskah Tugas Akhir Final' },
  ];

  for (const dt of types) {
    await prisma.documentType.upsert({
      where: { id: dt.id },
      update: { name: dt.name },
      create: dt,
    });
  }

  console.log(`  DocumentType: ${types.length} seeded`);
}

async function seedScienceGroups() {
  const groups = [
    { id: 'kbk-si', name: 'Sistem Informasi' },
    { id: 'kbk-rpl', name: 'Rekayasa Perangkat Lunak' },
    { id: 'kbk-bd', name: 'Big Data & Analitika' },
    { id: 'kbk-iot', name: 'Internet of Things' },
    { id: 'kbk-ai', name: 'Kecerdasan Buatan' },
  ];

  for (const g of groups) {
    await prisma.scienceGroup.upsert({
      where: { id: g.id },
      update: { name: g.name },
      create: g,
    });
  }

  console.log(`  ScienceGroup: ${groups.length} seeded`);
}

// ────────────────────────────────────────────────────────────
// THESIS TOPICS
// ────────────────────────────────────────────────────────────

async function seedTopics() {
  const topics = [
    { id: 'topic-erp', name: 'Enterprise Resource Planning', scienceGroupId: 'kbk-si', isPublished: true },
    { id: 'topic-ecommerce', name: 'E-Commerce & Digital Business', scienceGroupId: 'kbk-si', isPublished: true },
    { id: 'topic-webdev', name: 'Pengembangan Aplikasi Web', scienceGroupId: 'kbk-rpl', isPublished: true },
    { id: 'topic-mobile', name: 'Mobile Application Development', scienceGroupId: 'kbk-rpl', isPublished: true },
    { id: 'topic-datawarehouse', name: 'Data Warehouse & Business Intelligence', scienceGroupId: 'kbk-bd', isPublished: true },
    { id: 'topic-datamining', name: 'Data Mining & Knowledge Discovery', scienceGroupId: 'kbk-bd', isPublished: true },
    { id: 'topic-smartcity', name: 'Smart City & Smart Environment', scienceGroupId: 'kbk-iot', isPublished: true },
    { id: 'topic-embedded', name: 'Embedded System & Sensor Networks', scienceGroupId: 'kbk-iot', isPublished: true },
    { id: 'topic-nlp', name: 'Natural Language Processing', scienceGroupId: 'kbk-ai', isPublished: true },
    { id: 'topic-ml', name: 'Machine Learning & Deep Learning', scienceGroupId: 'kbk-ai', isPublished: true },
  ];

  for (const t of topics) {
    await prisma.thesisTopic.upsert({
      where: { id: t.id },
      update: { name: t.name, isPublished: t.isPublished },
      create: { ...t, description: `Topik penelitian bidang ${t.name}` },
    });
  }

  console.log(`  ThesisTopics: ${topics.length} seeded`);
}

// ────────────────────────────────────────────────────────────
// MILESTONE TEMPLATES (METOPEN)
// ────────────────────────────────────────────────────────────

async function seedMilestoneTemplates() {
  const templates = [
    { id: 'tpl-bab1', name: 'BAB 1 - Pendahuluan', description: 'Latar belakang masalah, rumusan masalah, tujuan, dan manfaat penelitian', orderIndex: 1, defaultDueDays: 14, weightPercentage: 15, isGateToAdvisorSearch: false },
    { id: 'tpl-literatur', name: 'Kajian Literatur & Gap Penelitian', description: 'Studi literatur terkait, identifikasi research gap, dan kerangka pemikiran', orderIndex: 2, defaultDueDays: 14, weightPercentage: 20, isGateToAdvisorSearch: false },
    { id: 'tpl-metodologi', name: 'Metodologi Penelitian', description: 'Desain penelitian, metode pengumpulan data, teknik analisis', orderIndex: 3, defaultDueDays: 14, weightPercentage: 20, isGateToAdvisorSearch: false, requiresAdvisor: true },
    { id: 'tpl-draft-proposal', name: 'Draft Proposal Lengkap', description: 'Dokumen proposal BAB 1-3 lengkap untuk direview pembimbing dan Koordinator Metopen', orderIndex: 4, defaultDueDays: 21, weightPercentage: 25, isGateToAdvisorSearch: false, requiresAdvisor: true },
    { id: 'tpl-revisi-final', name: 'Revisi & Proposal Final', description: 'Revisi berdasarkan feedback dan penyerahan proposal final', orderIndex: 5, defaultDueDays: 14, weightPercentage: 20, isGateToAdvisorSearch: false, requiresAdvisor: true },
  ];

  for (const t of templates) {
    await prisma.thesisMilestoneTemplate.upsert({
      where: { id: t.id },
      update: { name: t.name, description: t.description, orderIndex: t.orderIndex, isActive: true },
      create: {
        id: t.id,
        name: t.name,
        description: t.description,
        phase: 'metopen',
        orderIndex: t.orderIndex,
        defaultDueDays: t.defaultDueDays,
        weightPercentage: t.weightPercentage,
        isGateToAdvisorSearch: t.isGateToAdvisorSearch || false,
        requiresAdvisor: t.requiresAdvisor || false,
        isActive: true,
      },
    });
  }

  console.log(`  MilestoneTemplates: ${templates.length} seeded`);
}

// ────────────────────────────────────────────────────────────
// TEST LECTURERS (with quota and KBK)
// ────────────────────────────────────────────────────────────

async function seedTestLecturers(activeYear) {
  const lecturers = [
    { nip: '198501012010011001', name: 'Dr. Husnil Kamil, M.T.',          kbk: 'kbk-si',  topics: ['topic-erp', 'topic-ecommerce'],  quotaMax: 10, quotaSoft: 8,  current: 3  },
    { nip: '199003052015042001', name: 'Afriyanti Dwi Kartika, M.T.',    kbk: 'kbk-rpl', topics: ['topic-webdev', 'topic-mobile'],   quotaMax: 8,  quotaSoft: 6,  current: 5  },
    { nip: '198712152012011002', name: 'Dr. Ricky Akbar, M.Kom.',        kbk: 'kbk-bd',  topics: ['topic-datawarehouse', 'topic-datamining'], quotaMax: 10, quotaSoft: 8, current: 7 },
    { nip: '199205102018031001', name: 'Meza Silvana, M.T.',             kbk: 'kbk-iot', topics: ['topic-smartcity', 'topic-embedded'], quotaMax: 8,  quotaSoft: 6, current: 2 },
    { nip: '199108222017041001', name: 'Dr. Fajril Akbar, M.Sc.',       kbk: 'kbk-ai',  topics: ['topic-nlp', 'topic-ml'],           quotaMax: 10, quotaSoft: 8, current: 8 },
    { nip: '198809142014041001', name: 'Haris Suryamen, M.Sc.',         kbk: 'kbk-si',  topics: ['topic-erp'],                       quotaMax: 8,  quotaSoft: 6, current: 6 },
  ];

  const pembimbing1Role = await prisma.userRole.findFirst({ where: { name: 'Pembimbing 1' } });
  if (!pembimbing1Role) throw new Error('Role "Pembimbing 1" not found — run seedRoles first');

  for (const l of lecturers) {
    const user = await prisma.user.upsert({
      where: { identityNumber: l.nip },
      update: { fullName: l.name },
      create: {
        identityNumber: l.nip,
        identityType: 'NIP',
        fullName: l.name,
        email: `${l.nip}@fti.unand.ac.id`,
        isVerified: true,
      },
    });

    await prisma.lecturer.upsert({
      where: { id: user.id },
      update: { scienceGroupId: l.kbk, acceptingRequests: true },
      create: { id: user.id, scienceGroupId: l.kbk, acceptingRequests: true },
    });

    // Assign Pembimbing 1 role
    await prisma.userHasRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: pembimbing1Role.id } },
      update: { status: 'active' },
      create: { userId: user.id, roleId: pembimbing1Role.id, status: 'active' },
    });

    // Set supervision quota
    const existingQuota = await prisma.lecturerSupervisionQuota.findFirst({
      where: { lecturerId: user.id, academicYearId: activeYear.id },
    });
    if (!existingQuota) {
      await prisma.lecturerSupervisionQuota.create({
        data: {
          lecturerId: user.id,
          academicYearId: activeYear.id,
          quotaMax: l.quotaMax,
          quotaSoftLimit: l.quotaSoft,
          currentCount: l.current,
        },
      });
    }

    // Link offered topics
    for (const topicId of l.topics) {
      const topic = await prisma.thesisTopic.findUnique({ where: { id: topicId } });
      if (topic && !topic.lecturerId) {
        await prisma.thesisTopic.update({
          where: { id: topicId },
          data: { lecturerId: user.id },
        });
      }
    }
  }

  console.log(`  Lecturers: ${lecturers.length} seeded with quota & KBK`);
}

// ────────────────────────────────────────────────────────────
// KOORDINATOR METOPEN
// ────────────────────────────────────────────────────────────

async function seedDosenPengampu(activeYear) {
  const nip = '198501012010011001'; // Dr. Husnil Kamil
  const user = await prisma.user.findUnique({ where: { identityNumber: nip } });
  if (!user) { console.log('  ! Koordinator Metopen not found, skipping'); return; }

  const metopelRole = await prisma.userRole.findFirst({ where: { name: 'Koordinator Matkul Metopen' } });
  if (!metopelRole) return;

  await prisma.userHasRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: metopelRole.id } },
    update: { status: 'active' },
    create: { userId: user.id, roleId: metopelRole.id, status: 'active' },
  });

  console.log(`  Koordinator Matkul Metopen: ${user.fullName}`);
}

// ────────────────────────────────────────────────────────────
// TEST STUDENT — ILHAM
// ────────────────────────────────────────────────────────────

async function seedTestStudentIlham(activeYear) {
  const NIM = '2211522028';

  const user = await prisma.user.upsert({
    where: { identityNumber: NIM },
    update: { fullName: 'Ilham Nugraha' },
    create: {
      identityNumber: NIM,
      identityType: 'NIM',
      fullName: 'Ilham Nugraha',
      email: 'ilham_2211522028@fti.unand.ac.id',
      isVerified: true,
    },
  });

  await prisma.student.upsert({
    where: { id: user.id },
    update: {
      sksCompleted: 130,
      status: 'active',
      mandatoryCoursesCompleted: true,
      mkwuCompleted: true,
      internshipCompleted: true,
      kknCompleted: true,
      currentSemester: 8,
      enrollmentYear: 2022,
    },
    create: {
      id: user.id,
      sksCompleted: 130,
      status: 'active',
      mandatoryCoursesCompleted: true,
      mkwuCompleted: true,
      internshipCompleted: true,
      kknCompleted: true,
      currentSemester: 8,
      enrollmentYear: 2022,
    },
  });

  // Assign Mahasiswa role
  const mahasiswaRole = await prisma.userRole.findFirst({ where: { name: 'Mahasiswa' } });
  if (mahasiswaRole) {
    await prisma.userHasRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: mahasiswaRole.id } },
      update: { status: 'active' },
      create: { userId: user.id, roleId: mahasiswaRole.id, status: 'active' },
    });
  }

  // Thesis with status "Metopel" (eligible for metopen features)
  const metopelStatus = await prisma.thesisStatus.findFirst({ where: { name: 'Metopel' } });

  const existingThesis = await prisma.thesis.findFirst({ where: { studentId: user.id } });
  let thesis;

  if (!existingThesis) {
    thesis = await prisma.thesis.create({
      data: {
        studentId: user.id,
        thesisStatusId: metopelStatus?.id,
        academicYearId: activeYear.id,
        title: 'Pengembangan Sistem Informasi Monitoring Tugas Akhir Berbasis Web',
        thesisTopicId: 'topic-webdev',
        rating: 'ONGOING',
      },
    });
    console.log('    Thesis baru dibuat untuk Ilham');
  } else {
    thesis = await prisma.thesis.update({
      where: { id: existingThesis.id },
      data: {
        thesisStatusId: metopelStatus?.id,
        academicYearId: activeYear.id,
      },
    });
    console.log('    Thesis Ilham diupdate → Metopel');
  }

  // Pastikan Ilham TIDAK punya pembimbing (untuk testing fitur cari pembimbing)
  await prisma.thesisParticipant.deleteMany({ where: { thesisId: thesis.id } });
  console.log(`  Test Student Ilham (${NIM}) — tanpa pembimbing, siap test fitur cari pembimbing`);
  return user;
}

// ────────────────────────────────────────────────────────────
// TEST STUDENT — FARIZ (preserved from original seed)
// ────────────────────────────────────────────────────────────

async function seedTestStudentFariz(activeYear) {
  const NIM = '2211523034';

  const user = await prisma.user.upsert({
    where: { identityNumber: NIM },
    update: {},
    create: {
      identityNumber: NIM,
      identityType: 'NIM',
      fullName: 'Fariz (Test Account)',
      email: 'fariz.test@simpta.dev',
      isVerified: true,
    },
  });

  await prisma.student.upsert({
    where: { id: user.id },
    update: {
      sksCompleted: 130,
      status: 'active',
      mandatoryCoursesCompleted: true,
      mkwuCompleted: true,
      internshipCompleted: true,
      kknCompleted: true,
      currentSemester: 8,
      enrollmentYear: 2022,
    },
    create: {
      id: user.id,
      sksCompleted: 130,
      status: 'active',
      mandatoryCoursesCompleted: true,
      mkwuCompleted: true,
      internshipCompleted: true,
      kknCompleted: true,
      currentSemester: 8,
      enrollmentYear: 2022,
    },
  });

  const mahasiswaRole = await prisma.userRole.findFirst({ where: { name: 'Mahasiswa' } });
  if (mahasiswaRole) {
    await prisma.userHasRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: mahasiswaRole.id } },
      update: { status: 'active' },
      create: { userId: user.id, roleId: mahasiswaRole.id, status: 'active' },
    });
  }

  const thesisStatus = await prisma.thesisStatus.findFirst({ where: { name: 'Pengajuan Judul' } });
  const existingThesis = await prisma.thesis.findFirst({ where: { studentId: user.id } });

  if (!existingThesis) {
    await prisma.thesis.create({
      data: {
        studentId: user.id,
        thesisStatusId: thesisStatus?.id,
        academicYearId: activeYear.id,
        title: '[TEST] Implementasi Sistem Rekomendasi berbasis Machine Learning untuk DSS Akademik',
        proposalStatus: 'accepted',
        rating: 'ONGOING',
      },
    });
  }

  console.log(`  Test Student Fariz (${NIM})`);
  return user;
}

// ────────────────────────────────────────────────────────────
// MAIN
// ────────────────────────────────────────────────────────────

async function main() {
  console.log('Memulai seed database NeoCentral...\n');

  console.log('--- Master Data ---');
  await seedRoles();
  await seedThesisStatuses();
  const activeYear = await seedAcademicYear();
  await seedDocumentTypes();
  await seedScienceGroups();
  await seedTopics();
  await seedMilestoneTemplates();

  console.log('\n--- Test Lecturers ---');
  await seedTestLecturers(activeYear);
  await seedDosenPengampu(activeYear);

  console.log('\n--- Test Students ---');
  await seedTestStudentIlham(activeYear);
  await seedTestStudentFariz(activeYear);

  console.log('\nSeed selesai. Database siap digunakan.');
}

main()
  .catch((e) => {
    console.error('Seed gagal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

