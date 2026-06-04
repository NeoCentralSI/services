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
// RESEARCH METHOD ASSESSMENT (TA-03A + TA-03B)
//
// Sumber rubrik resmi:
//   guide/TA-03 A_PENILAIAN PROPOSAL TUGAS AKHIR OLEH PEMBIMBING_FIX.pdf
//   guide/TA-03 B_PENILAIAN PROPOSAL TUGAS AKHIR OLEH PENGAMPU MATA KULIAH METODE PENELITIAN_FIX.pdf
//
// Catatan kontrak:
// - 4 AssessmentCriteria (Presentasi 20, Konten 40, Struktur 25, Respon 15)
// - 3 kriteria scalar (Presentasi, Struktur, Respon) memiliki 5 rubric level deskriptif
// - Konten 40 (CPMK-02 supervisor) SENGAJA tanpa rubric DB karena UI Pembimbing
//   memakai sub-breakdown 4 × 10 (Pendahuluan, Kajian, Metodologi, Kelayakan).
//   Submit ke backend tetap 1 score scalar 0-40 dengan rubricId=null (kompatibel
//   dengan validasi `validateResearchMethodScores` saat `assessmentRubrics.length === 0`).
// ────────────────────────────────────────────────────────────

const RM_CPMKS = [
  { code: 'CPMK-01', description: 'Presentasi proposal' },
  { code: 'CPMK-02', description: 'Penulisan sistematis proposal' },
  { code: 'CPMK-03', description: 'Kemampuan merespon masukan/kritikan' },
];

const RM_CRITERIA = [
  {
    name: 'Presentasi',
    cpmkCode: 'CPMK-01',
    role: 'supervisor',
    appliesTo: 'proposal',
    maxScore: 20,
    displayOrder: 1,
  },
  {
    name: 'Proposal (konten)',
    cpmkCode: 'CPMK-02',
    role: 'supervisor',
    appliesTo: 'proposal',
    maxScore: 40,
    displayOrder: 2,
  },
  {
    name: 'Proposal (struktur)',
    cpmkCode: 'CPMK-02',
    role: 'default',
    appliesTo: 'metopen',
    maxScore: 25,
    displayOrder: 1,
  },
  {
    name: 'Kemampuan merespon',
    cpmkCode: 'CPMK-03',
    role: 'supervisor',
    appliesTo: 'proposal',
    maxScore: 15,
    displayOrder: 3,
  },
];

const RM_RUBRIC_LEVELS = {
  // TA-03A · CPMK-01 Presentasi (0-20)
  'Presentasi': [
    {
      minScore: 0,
      maxScore: 4,
      description:
        'Sangat kurang — Menyampaikan secara tidak lengkap, alur tidak jelas, tidak menggunakan bahasa akademik, dan tidak memahami isi proposal.',
    },
    {
      minScore: 5,
      maxScore: 8,
      description:
        'Kurang — Menyampaikan dengan banyak kekurangan, alur tidak runtut, bahasa kurang akademik, dan pemahaman rendah.',
    },
    {
      minScore: 9,
      maxScore: 12,
      description:
        'Cukup — Menyampaikan komponen utama secara cukup jelas, struktur cukup logis, penggunaan istilah umum, pemahaman cukup.',
    },
    {
      minScore: 13,
      maxScore: 16,
      description:
        'Baik — Menyampaikan semua isi dengan baik, struktur presentasi logis, bahasa formal, dan menunjukkan penguasaan.',
    },
    {
      minScore: 17,
      maxScore: 20,
      description:
        'Sangat baik — Menyampaikan seluruh isi proposal secara lengkap, runtut, akademik, menggunakan istilah teknis yang tepat, dan menunjukkan pemahaman mendalam.',
    },
  ],
  // TA-03B · CPMK-02 Penulisan sistematis (0-25)
  'Proposal (struktur)': [
    {
      minScore: 0,
      maxScore: 5,
      description:
        'Sangat kurang — Proposal tidak mengandung sebagian besar aspek penting. Abstrak dan referensi tidak sistematis. Pendahuluan tidak memuat latar belakang. Tinjauan pustaka tidak relevan. Metode tidak mendukung tujuan. Referensi tidak kredibel. Bahasa tidak sesuai SPOK.',
    },
    {
      minScore: 6,
      maxScore: 10,
      description:
        'Kurang — Penulisan kurang sistematis. Latar belakang kurang jelas. Tinjauan pustaka dan metode tidak relevan. Referensi sebagian besar tidak kredibel. Bahasa kurang konsisten dan tidak tepat.',
    },
    {
      minScore: 11,
      maxScore: 15,
      description:
        'Cukup — Penulisan cukup sistematis. Latar belakang dan kajian pustaka cukup sesuai. Metode cukup mendukung tujuan. Referensi cukup kredibel. Bahasa cukup formal dan dapat dipahami.',
    },
    {
      minScore: 16,
      maxScore: 20,
      description:
        'Baik — Penulisan sesuai pedoman. Isi lengkap dan saling terkait. Metode mendukung tujuan. Referensi kredibel. Bahasa sesuai SPOK dan konsisten.',
    },
    {
      minScore: 21,
      maxScore: 25,
      description:
        'Sangat baik — Penulisan sangat sistematis dan konsisten. Semua aspek lengkap, logis, dan mendalam. Referensi sangat relevan dan kredibel. Bahasa akademik sangat baik dan konsisten.',
    },
  ],
  // TA-03A · CPMK-03 Kemampuan merespon (0-15)
  'Kemampuan merespon': [
    {
      minScore: 0,
      maxScore: 3,
      description:
        'Sangat kurang — Tidak menindaklanjuti saran, tidak aktif berkomunikasi, dan tidak melakukan revisi.',
    },
    {
      minScore: 4,
      maxScore: 6,
      description:
        'Kurang — Menindaklanjuti sebagian saran, komunikasi pasif, revisi kurang tepat.',
    },
    {
      minScore: 7,
      maxScore: 9,
      description:
        'Cukup — Menindaklanjuti sebagian besar saran, komunikasi cukup terbuka, revisi cukup sesuai.',
    },
    {
      minScore: 10,
      maxScore: 12,
      description:
        'Baik — Menindaklanjuti hampir seluruh saran, komunikasi baik, revisi sesuai dan lengkap.',
    },
    {
      minScore: 13,
      maxScore: 15,
      description:
        'Sangat baik — Menindaklanjuti semua saran secara tepat, komunikasi aktif dan reflektif, serta revisi sangat komprehensif.',
    },
  ],
};

async function ensureCpmkResearchMethod(code, description) {
  const existing = await prisma.cpmk.findFirst({
    where: { code, type: 'research_method' },
  });
  if (existing) {
    if (existing.description !== description) {
      return prisma.cpmk.update({
        where: { id: existing.id },
        data: { description },
      });
    }
    return existing;
  }
  return prisma.cpmk.create({
    data: { code, description, type: 'research_method' },
  });
}

async function ensureAssessmentCriterion({
  name,
  cpmkId,
  role,
  appliesTo,
  maxScore,
  displayOrder,
}) {
  const existing = await prisma.assessmentCriteria.findFirst({
    where: { name, cpmkId, role, appliesTo },
  });
  if (existing) {
    return prisma.assessmentCriteria.update({
      where: { id: existing.id },
      data: {
        maxScore,
        displayOrder,
        isActive: true,
        isDeleted: false,
      },
    });
  }
  return prisma.assessmentCriteria.create({
    data: {
      name,
      cpmkId,
      role,
      appliesTo,
      maxScore,
      displayOrder,
      isActive: true,
      isDeleted: false,
    },
  });
}

async function ensureRubricLevels(criteriaId, levels) {
  for (const [idx, level] of levels.entries()) {
    // Identitas semantik rubric: (criteriaId, minScore, maxScore).
    const existing = await prisma.assessmentRubric.findFirst({
      where: {
        assessmentCriteriaId: criteriaId,
        minScore: level.minScore,
        maxScore: level.maxScore,
      },
    });
    if (existing) {
      await prisma.assessmentRubric.update({
        where: { id: existing.id },
        data: {
          description: level.description,
          displayOrder: idx,
          isDeleted: false,
        },
      });
    } else {
      await prisma.assessmentRubric.create({
        data: {
          assessmentCriteriaId: criteriaId,
          minScore: level.minScore,
          maxScore: level.maxScore,
          description: level.description,
          displayOrder: idx,
          isDeleted: false,
        },
      });
    }
  }
}

async function seedResearchMethodAssessment() {
  // 1. CPMK research_method
  const cpmkByCode = {};
  for (const c of RM_CPMKS) {
    const cpmk = await ensureCpmkResearchMethod(c.code, c.description);
    cpmkByCode[c.code] = cpmk;
  }

  // 2. AssessmentCriteria (4 bucket SIA)
  const criteriaByName = {};
  for (const c of RM_CRITERIA) {
    const cpmk = cpmkByCode[c.cpmkCode];
    if (!cpmk) {
      console.warn(`  ! CPMK ${c.cpmkCode} tidak ditemukan, skip kriteria ${c.name}`);
      continue;
    }
    const criterion = await ensureAssessmentCriterion({
      name: c.name,
      cpmkId: cpmk.id,
      role: c.role,
      appliesTo: c.appliesTo,
      maxScore: c.maxScore,
      displayOrder: c.displayOrder,
    });
    criteriaByName[c.name] = criterion;
  }

  // 3. AssessmentRubric levels — 3 kriteria scalar saja.
  let rubricCount = 0;
  for (const [name, levels] of Object.entries(RM_RUBRIC_LEVELS)) {
    const criterion = criteriaByName[name];
    if (!criterion) {
      console.warn(`  ! Kriteria ${name} tidak ada, skip rubric levels`);
      continue;
    }
    await ensureRubricLevels(criterion.id, levels);
    rubricCount += levels.length;
  }

  console.log(
    `  ResearchMethodAssessment: ${RM_CPMKS.length} CPMK, ${RM_CRITERIA.length} kriteria, ${rubricCount} rubric levels (Konten 40 tanpa rubric — pakai sub-breakdown UI).`,
  );
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
  await seedResearchMethodAssessment();

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

