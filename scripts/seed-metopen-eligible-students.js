/**
 * Seed mahasiswa eligible Metopen & TA dengan data mock SIA.
 *
 * Logika:
 *  - isProposal = true  → Thesis masih fase proposal / Metopen
 *  - isProposal = false → Thesis sudah menjadi TA
 *  - Eligible TA otomatis eligible Metopen (superset)
 *  - Eligible Metopen belum tentu eligible TA
 *
 * Grup 1 (Metopen-only): status Metopel, isProposal true, tanpa title/topic/supervisor
 * Grup 2 (Sudah TA):     status Bimbingan, isProposal false, proposalStatus accepted
 * Grup 3 (Tidak eligible): dimas & john — tidak disentuh
 *
 * Script ini juga membuat MetopenClass dan enroll mahasiswa Metopen-eligible
 * agar data langsung muncul di roster admin dan halaman Koordinator Metopen.
 *
 * Jalankan: node scripts/seed-metopen-eligible-students.js
 * (dari folder services, dengan DATABASE_URL ter-set)
 */

import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();

const METOPEN_ONLY_STUDENTS = [
  { nim: '2211523034', skipThesis: false }, // fariz
  { nim: '2211522018', skipThesis: false }, // nabil
  { nim: '2211523030', skipThesis: false }, // khalied
  { nim: '2211522036', skipThesis: false }, // mustafa
  { nim: '2211521020', skipThesis: false }, // muhammad
  { nim: '2211523012', skipThesis: false }, // syauqi
  { nim: '2211522103', skipThesis: true },  // test_nothesis — eligible tapi tanpa Thesis
];

const TA_STUDENTS = [
  { nim: '2211523022', title: 'Implementasi Sistem Informasi Akademik Berbasis Web' },         // daffa
  { nim: '2211522028', title: 'Pengembangan Platform Manajemen Tugas Akhir' },                 // ilham
  { nim: '2211522101', title: '[TEST] Analisis Sentimen Media Sosial dengan NLP' },            // test_changetopic
  { nim: '2211522102', title: '[TEST] Sistem Rekomendasi Dosen Pembimbing Otomatis' },         // test_changesupervisor
];

const ALL_ENROLLABLE_NIMS = [
  ...METOPEN_ONLY_STUDENTS.filter((s) => !s.skipThesis).map((s) => s.nim),
  ...TA_STUDENTS.map((s) => s.nim),
];

const MIN_SKS_ELIGIBLE = 110;
const KOORDINATOR_METOPEN_ROLE = 'Koordinator Matkul Metopen';

async function ensureStudentEligible(user) {
  if (!user.student) {
    await prisma.student.create({
      data: {
        id: user.id,
        sksCompleted: MIN_SKS_ELIGIBLE,
        status: 'active',
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: 8,
      },
    });
    return 'created';
  }

  const s = user.student;
  const needUpdate =
    s.sksCompleted < MIN_SKS_ELIGIBLE ||
    !s.mandatoryCoursesCompleted ||
    !s.mkwuCompleted ||
    !s.internshipCompleted ||
    !s.kknCompleted;

  if (needUpdate) {
    await prisma.student.update({
      where: { id: user.id },
      data: {
        sksCompleted: Math.max(s.sksCompleted ?? 0, MIN_SKS_ELIGIBLE),
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
      },
    });
    return 'updated';
  }

  return 'ok';
}

async function upsertThesis(userId, data) {
  const existing = await prisma.thesis.findFirst({ where: { studentId: userId } });

  if (!existing) {
    await prisma.thesis.create({ data: { studentId: userId, ...data } });
    return 'created';
  }

  await prisma.thesis.update({ where: { id: existing.id }, data });
  return 'updated';
}

async function findOrCreateDosenMetopen() {
  const roleAssignment = await prisma.userHasRole.findFirst({
    where: { role: { name: KOORDINATOR_METOPEN_ROLE }, status: 'active' },
    include: { user: { select: { id: true, fullName: true } } },
  });

  if (roleAssignment) {
    const lecturer = await prisma.lecturer.findUnique({ where: { id: roleAssignment.userId } });
    if (lecturer) {
      return { id: lecturer.id, name: roleAssignment.user.fullName };
    }
  }

  // Fallback: assign Koordinator Matkul Metopen role to the first available lecturer
  const lecturer = await prisma.lecturer.findFirst({
    include: { user: { select: { id: true, fullName: true } } },
  });
  if (!lecturer) return null;

  const role = await prisma.userRole.findFirst({ where: { name: KOORDINATOR_METOPEN_ROLE } });
  if (role) {
    await prisma.userHasRole.upsert({
      where: { userId_roleId: { userId: lecturer.id, roleId: role.id } },
      update: { status: 'active' },
      create: { userId: lecturer.id, roleId: role.id, status: 'active' },
    });
    console.log(`  Role "${KOORDINATOR_METOPEN_ROLE}" diberikan ke ${lecturer.user.fullName}`);
  }

  return { id: lecturer.id, name: lecturer.user.fullName };
}

async function ensureMetopenClassAndEnroll(academicYear, enrollableStudentIds) {
  const dosenMetopen = await findOrCreateDosenMetopen();
  if (!dosenMetopen) {
    console.log('  [WARN] Tidak ada dosen tersedia untuk MetopenClass, skip enrollment');
    return;
  }

  console.log(`\n── MetopenClass & Enrollment ──`);
  console.log(`  Koordinator Metopen: ${dosenMetopen.name}`);

  // Upsert class
  let cls = await prisma.metopenClass.findFirst({
    where: { lecturerId: dosenMetopen.id, academicYearId: academicYear.id },
  });

  if (!cls) {
    cls = await prisma.metopenClass.create({
      data: {
        name: `Metopen ${academicYear.year} ${academicYear.semester === 'genap' ? 'Genap' : 'Ganjil'}`,
        academicYearId: academicYear.id,
        lecturerId: dosenMetopen.id,
        description: 'Kelas Metodologi Penelitian (auto-seeded)',
        isActive: true,
      },
    });
    console.log(`  MetopenClass created: ${cls.name}`);
  } else {
    console.log(`  MetopenClass exists: ${cls.name}`);
  }

  // Enroll students
  let enrolled = 0;
  for (const studentId of enrollableStudentIds) {
    const existing = await prisma.metopenClassStudent.findUnique({
      where: { studentId_academicYearId: { studentId, academicYearId: academicYear.id } },
    });
    if (!existing) {
      await prisma.metopenClassStudent.create({
        data: { studentId, classId: cls.id, academicYearId: academicYear.id },
      });
      enrolled++;
    }
  }
  console.log(`  Enrolled: ${enrolled} baru, ${enrollableStudentIds.length - enrolled} sudah ada`);
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  Seed Mahasiswa Eligible Metopen & TA (Mock SIA)');
  console.log('='.repeat(60));

  const metopelStatus = await prisma.thesisStatus.findFirst({ where: { name: 'Metopel' } });
  const bimbinganStatus = await prisma.thesisStatus.findFirst({ where: { name: 'Bimbingan' } });
  const academicYear = await prisma.academicYear.findFirst({ where: { isActive: true } });

  if (!metopelStatus || !bimbinganStatus) {
    console.error('ThesisStatus "Metopel" atau "Bimbingan" tidak ditemukan. Jalankan prisma db seed dulu.');
    process.exit(1);
  }
  if (!academicYear) {
    console.error('Tidak ada AcademicYear aktif. Jalankan prisma db seed dulu.');
    process.exit(1);
  }

  console.log(`  Academic year : ${academicYear.year} ${academicYear.semester}`);
  console.log(`  Status Metopel: ${metopelStatus.id}`);
  console.log(`  Status Bimbingan: ${bimbinganStatus.id}\n`);

  const stats = { studentUpdated: 0, metopen: 0, ta: 0, skipped: 0 };
  const enrollableStudentIds = [];

  // ── Grup 1: Metopen-only (isProposal = true, status Metopel) ──
  console.log('── Grup 1: Eligible Metopen (proposal) ──');
  for (const entry of METOPEN_ONLY_STUDENTS) {
    const user = await prisma.user.findFirst({
      where: { identityNumber: entry.nim, identityType: 'NIM' },
      include: { student: true },
    });
    if (!user) {
      console.log(`  [SKIP] ${entry.nim} tidak ditemukan`);
      stats.skipped++;
      continue;
    }

    const studentResult = await ensureStudentEligible(user);
    if (studentResult !== 'ok') stats.studentUpdated++;

    if (entry.skipThesis) {
      const existing = await prisma.thesis.findFirst({ where: { studentId: user.id } });
      if (existing) {
        await prisma.thesisSupervisors.deleteMany({ where: { thesisId: existing.id } });
        await prisma.thesis.delete({ where: { id: existing.id } });
        console.log(`  ${user.fullName} (${entry.nim}) — Thesis dihapus (test tanpa thesis)`);
      } else {
        console.log(`  ${user.fullName} (${entry.nim}) — Student eligible, tanpa Thesis`);
      }
      continue;
    }

    const result = await upsertThesis(user.id, {
      isProposal: true,
      thesisStatusId: metopelStatus.id,
      academicYearId: academicYear.id,
      title: null,
      proposalStatus: null,
      startDate: new Date(),
      deadlineDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });
    enrollableStudentIds.push(user.id);
    stats.metopen++;
    console.log(`  ${user.fullName} (${entry.nim}) — Metopel [isProposal=true] (${result})`);
  }

  // ── Grup 2: Sudah TA (isProposal = false, status Bimbingan) ──
  console.log('\n── Grup 2: Sudah TA (bimbingan) ──');
  for (const entry of TA_STUDENTS) {
    const user = await prisma.user.findFirst({
      where: { identityNumber: entry.nim, identityType: 'NIM' },
      include: { student: true },
    });
    if (!user) {
      console.log(`  [SKIP] ${entry.nim} tidak ditemukan`);
      stats.skipped++;
      continue;
    }

    const studentResult = await ensureStudentEligible(user);
    if (studentResult !== 'ok') stats.studentUpdated++;

    const result = await upsertThesis(user.id, {
      isProposal: false,
      thesisStatusId: bimbinganStatus.id,
      academicYearId: academicYear.id,
      title: entry.title,
      proposalStatus: 'accepted',
      startDate: new Date(),
      deadlineDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    });
    enrollableStudentIds.push(user.id);
    stats.ta++;
    console.log(`  ${user.fullName} (${entry.nim}) — Bimbingan [isProposal=false] (${result})`);
  }

  // ── MetopenClass & Enrollment ──
  await ensureMetopenClassAndEnroll(academicYear, enrollableStudentIds);

  console.log('\n' + '-'.repeat(60));
  console.log('Selesai.');
  console.log(`  Students updated/created : ${stats.studentUpdated}`);
  console.log(`  Thesis Metopen (proposal): ${stats.metopen}`);
  console.log(`  Thesis TA (bimbingan)    : ${stats.ta}`);
  console.log(`  Skipped (user not found) : ${stats.skipped}`);
  console.log('\nGrup 3 (dimas, john) tidak disentuh — negative test case.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
