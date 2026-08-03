/**
 * Ensure users sesuai usersData master + akun dummy peran tunggal untuk UAT.
 * Password semua akun yang di-manage di sini: Password@2025
 *
 * Kebijakan (2026-07-13):
 * - Akun REAL (@fti.unand.ac.id) tidak dipecah / tidak dilucuti role-nya.
 *   Kalau Sekdep kebetulan juga Koordinator di data real, biarkan.
 * - Isolasi peran untuk uji UAT memakai akun DUMMY @dummy.ac.id (satu peran jelas).
 * - Hapus hanya user residual yang eksplisit tidak terpakai (bukan dosen/mahasiswa real).
 *
 * Jalankan: node scripts/ensure-users.js
 * Opsional: node scripts/ensure-users.js --skip-dummy
 *   → tidak membuat/menghidupkan akun @dummy.ac.id (uji berbasis akun real saja)
 * (dari folder services, dengan DATABASE_URL ter-set)
 */

import { PrismaClient } from '../src/generated/prisma/index.js';
import bcrypt from 'bcrypt';
import { ROLES } from '../src/constants/roles.js';

const prisma = new PrismaClient();
const PASSWORD_PLAIN = 'Password@2025';
const SKIP_DUMMY = process.argv.includes('--skip-dummy');

/** User residual yang boleh dihapus — jangan masukkan akun real / fixture EDGE / fixture UAT. */
const UNUSED_USERS = [
  { email: 'mahasiswa@email.com', identityNumber: '209102201' },
  { email: 'test_changetopic@fti.unand.ac.id', identityNumber: '2211522101' },
  { email: 'test_changesupervisor@fti.unand.ac.id', identityNumber: '2211522102' },
  { email: 'test_nothesis@fti.unand.ac.id', identityNumber: '2211522103' },
];

// Data user master - sesuaikan dengan seed-master
const usersData = [
  {
    email: 'kadep_si@fti.unand.ac.id',
    fullName: 'Ricky Akbar M.Kom',
    identityType: 'NIP',
    identityNumber: '198410062012121001',
    roles: [ROLES.KETUA_DEPARTEMEN, ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.PENGUJI],
    isLecturer: true,
    preserveExtraRoles: true,
  },
  {
    email: 'sekdep_si@fti.unand.ac.id',
    fullName: 'Afriyanti Dwi Kartika, M.T',
    identityType: 'NIP',
    identityNumber: '198904212019032024',
    // Role di bawah = baseline. Role tambahan yang sudah ada di DB (mis. Koordinator Metopen) TIDAK dihapus.
    roles: [ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KOORDINATOR_YUDISIUM, ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.PENGUJI],
    isLecturer: true,
    preserveExtraRoles: true,
  },
  {
    email: 'pembimbing_si@fti.unand.ac.id',
    fullName: 'Husnil Kamil, MT',
    identityType: 'NIP',
    identityNumber: '198201182008121002',
    roles: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.PENGUJI],
    isLecturer: true,
  },
  {
    email: 'penguji_si@fti.unand.ac.id',
    fullName: 'Aina Hubby Aziira, M.Eng',
    identityType: 'NIP',
    identityNumber: '199504302022032013',
    roles: [ROLES.PENGUJI, ROLES.TIM_PENGELOLA_CPL, ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2],
    isLecturer: true,
  },
  {
    email: 'gkm_si@fti.unand.ac.id',
    fullName: 'Ullya Mega Wahyuni, M.Kom',
    identityType: 'NIP',
    identityNumber: '199011032019032008',
    roles: [ROLES.GKM, ROLES.TIM_PENGELOLA_CPL, ROLES.PENGUJI, ROLES.PEMBIMBING_2],
    isLecturer: true,
  },
  {
    email: 'admin_si@fti.unand.ac.id',
    fullName: 'Nindy Malisha, SE',
    identityType: 'OTHER',
    identityNumber: '220199206201501201',
    roles: [ROLES.ADMIN],
    isLecturer: false,
  },
  {
    email: 'yudisium_si@fti.unand.ac.id',
    fullName: 'Koordinator Yudisium',
    identityType: 'NIP',
    identityNumber: '199203152020121003',
    roles: [ROLES.KOORDINATOR_YUDISIUM, ROLES.PEMBIMBING_2, ROLES.PENGUJI],
    isLecturer: true,
  },
  {
    email: 'cpl_si@fti.unand.ac.id',
    fullName: 'Tim Pengelola CPL',
    identityType: 'NIP',
    identityNumber: '199107282019031005',
    roles: [ROLES.TIM_PENGELOLA_CPL, ROLES.PEMBIMBING_2, ROLES.PENGUJI],
    isLecturer: true,
  },
  {
    email: 'fariz_2211523034@fti.unand.ac.id',
    fullName: 'Muhammad Fariz',
    identityType: 'NIM',
    identityNumber: '2211523034',
    roles: [ROLES.MAHASISWA],
    isStudent: true,
    enrollmentYear: 2022,
    sksCompleted: 122,
  },
  {
    email: 'nabil_2211522018@fti.unand.ac.id',
    fullName: 'Nabil Rizki Navisa',
    identityType: 'NIM',
    identityNumber: '2211522018',
    roles: [ROLES.MAHASISWA],
    isStudent: true,
    enrollmentYear: 2022,
    sksCompleted: 137,
  },
  {
    email: 'khalied_2211523030@fti.unand.ac.id',
    fullName: 'Khalied Nauly Maturino',
    identityType: 'NIM',
    identityNumber: '2211523030',
    roles: [ROLES.MAHASISWA],
    isStudent: true,
    enrollmentYear: 2022,
    sksCompleted: 141,
  },
  {
    email: 'mustafa_2211522036@fti.unand.ac.id',
    fullName: 'Mustafa Fathur Rahman',
    identityType: 'NIM',
    identityNumber: '2211522036',
    roles: [ROLES.MAHASISWA],
    isStudent: true,
    enrollmentYear: 2022,
    sksCompleted: 137,
  },
  {
    email: 'muhammad_2211521020@fti.unand.ac.id',
    fullName: 'Muhammad Nouval Habibie',
    identityType: 'NIM',
    identityNumber: '2211521020',
    roles: [ROLES.MAHASISWA],
    isStudent: true,
    enrollmentYear: 2022,
    sksCompleted: 137,
  },
  {
    email: 'daffa_2211523022@fti.unand.ac.id',
    fullName: 'Daffa Agustian Saadi',
    identityType: 'NIM',
    identityNumber: '2211523022',
    roles: [ROLES.MAHASISWA],
    isStudent: true,
    enrollmentYear: 2022,
    sksCompleted: 137,
  },
  {
    email: 'ilham_2211522028@fti.unand.ac.id',
    fullName: 'Ilham',
    identityType: 'NIM',
    identityNumber: '2211522028',
    roles: [ROLES.MAHASISWA],
    isStudent: true,
    enrollmentYear: 2022,
    sksCompleted: 137,
  },
  {
    email: 'syauqi_2211523012@fti.unand.ac.id',
    fullName: 'Syauqi',
    identityType: 'NIM',
    identityNumber: '2211523012',
    roles: [ROLES.MAHASISWA],
    isStudent: true,
    enrollmentYear: 2022,
    sksCompleted: 125,
  },
  {
    email: 'dimas_2311523026@fti.unand.ac.id',
    fullName: 'Dimas',
    identityType: 'NIM',
    identityNumber: '2311523026',
    roles: [ROLES.MAHASISWA],
    isStudent: true,
    enrollmentYear: 2023,
    sksCompleted: 99,
  },
  {
    email: 'john_2411522001@fti.unand.ac.id',
    fullName: 'John',
    identityType: 'NIM',
    identityNumber: '2411522001',
    roles: [ROLES.MAHASISWA],
    isStudent: true,
    enrollmentYear: 2024,
    sksCompleted: 60,
  },

  // ── Akun DUMMY peran tunggal untuk UAT (bukan orang real) ──────────────
  // Dipakai saat perlu membuktikan "role A boleh / role B tidak boleh"
  // tanpa mengubah akun real yang punya banyak jabatan.
  {
    email: 'uat.admin@dummy.ac.id',
    fullName: 'UAT Admin',
    identityType: 'OTHER',
    identityNumber: '297000000001',
    roles: [ROLES.ADMIN],
    isLecturer: false,
  },
  {
    email: 'uat.kadep@dummy.ac.id',
    fullName: 'UAT Ketua Departemen',
    identityType: 'NIP',
    identityNumber: '297001012020121001',
    roles: [ROLES.KETUA_DEPARTEMEN, ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2],
    isLecturer: true,
  },
  {
    email: 'uat.sekdep@dummy.ac.id',
    fullName: 'UAT Sekretaris Departemen',
    identityType: 'NIP',
    identityNumber: '297001012020121002',
    roles: [ROLES.SEKRETARIS_DEPARTEMEN, ROLES.PEMBIMBING_2],
    isLecturer: true,
  },
  {
    email: 'uat.koordinator@dummy.ac.id',
    fullName: 'UAT Koordinator Metopen',
    identityType: 'NIP',
    identityNumber: '297001012020121003',
    roles: [ROLES.KOORDINATOR_METOPEN, ROLES.PEMBIMBING_2],
    isLecturer: true,
  },
  {
    email: 'uat.pembimbing@dummy.ac.id',
    fullName: 'UAT Dosen Pembimbing',
    identityType: 'NIP',
    identityNumber: '297001012020121004',
    roles: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.PENGUJI],
    isLecturer: true,
  },
  {
    email: 'uat.mhs.eligible@dummy.ac.id',
    fullName: 'UAT Mahasiswa Eligible',
    identityType: 'NIM',
    identityNumber: '2377000001',
    roles: [ROLES.MAHASISWA],
    isStudent: true,
    enrollmentYear: 2023,
    sksCompleted: 120,
    eligibleMetopen: true,
  },
  {
    email: 'uat.mhs.blocked@dummy.ac.id',
    fullName: 'UAT Mahasiswa Tidak Eligible',
    identityType: 'NIM',
    identityNumber: '2377000002',
    roles: [ROLES.MAHASISWA],
    isStudent: true,
    enrollmentYear: 2024,
    sksCompleted: 60,
    eligibleMetopen: false,
  },
];

function activeUsersData() {
  if (!SKIP_DUMMY) return usersData;
  return usersData.filter((u) => !String(u.email || '').toLowerCase().endsWith('@dummy.ac.id'));
}

async function ensureRoles() {
  const roleNames = [...new Set(activeUsersData().flatMap((u) => u.roles))];
  for (const name of roleNames) {
    const existing = await prisma.userRole.findFirst({ where: { name } });
    if (!existing) {
      await prisma.userRole.create({ data: { id: name, name } });
      console.log(`  Role dibuat: ${name}`);
    }
  }
}

async function ensureAllowedUsers(passwordHash) {
  for (const spec of activeUsersData()) {
    let user = await prisma.user.findFirst({
      where: {
        OR: [{ email: spec.email }, { identityNumber: spec.identityNumber }],
      },
    });
    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          fullName: spec.fullName,
          email: spec.email,
          identityNumber: spec.identityNumber,
          identityType: spec.identityType,
          password: passwordHash,
          isVerified: true,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: spec.email,
          fullName: spec.fullName,
          identityNumber: spec.identityNumber,
          identityType: spec.identityType,
          password: passwordHash,
          isVerified: true,
        },
      });
    }

    if (spec.isLecturer) {
      const sg = await prisma.scienceGroup.findFirst();
      await prisma.lecturer.upsert({
        where: { id: user.id },
        update: { scienceGroupId: sg?.id ?? null, acceptingRequests: true },
        create: { id: user.id, scienceGroupId: sg?.id ?? null, acceptingRequests: true },
      });
    }

    if (spec.isStudent) {
      const enrollmentYear = spec.enrollmentYear ?? 2022;
      const sksCompleted = spec.sksCompleted ?? 130;
      const eligibilityPatch =
        typeof spec.eligibleMetopen === 'boolean'
          ? {
              eligibleMetopen: spec.eligibleMetopen,
              metopenEligibilitySource: 'devtools',
              metopenEligibilityUpdatedAt: new Date(),
            }
          : {};
      await prisma.student.upsert({
        where: { id: user.id },
        update: {
          sksCompleted,
          status: 'active',
          mandatoryCoursesCompleted: true,
          mkwuCompleted: true,
          internshipCompleted: true,
          kknCompleted: true,
          currentSemester: 8,
          enrollmentYear,
          ...eligibilityPatch,
        },
        create: {
          id: user.id,
          sksCompleted,
          status: 'active',
          mandatoryCoursesCompleted: true,
          mkwuCompleted: true,
          internshipCompleted: true,
          kknCompleted: true,
          currentSemester: 8,
          enrollmentYear,
          ...eligibilityPatch,
        },
      });
    }

    for (const roleName of spec.roles) {
      const role = await prisma.userRole.findFirst({ where: { name: roleName } });
      if (role) {
        await prisma.userHasRole.upsert({
          where: { userId_roleId: { userId: user.id, roleId: role.id } },
          update: { status: 'active' },
          create: { userId: user.id, roleId: role.id, status: 'active' },
        });
      }
    }
    console.log(`  OK: ${spec.email} (${spec.fullName})`);
  }
}

async function deleteUnusedUsers() {
  const allUsers = await prisma.user.findMany({
    select: { id: true, email: true, identityNumber: true },
  });
  const unusedEmails = new Set(UNUSED_USERS.map((u) => u.email.toLowerCase()));
  const unusedIds = new Set(UNUSED_USERS.map((u) => u.identityNumber));
  const toDelete = allUsers.filter(
    (u) =>
      (u.email && unusedEmails.has(u.email.toLowerCase())) ||
      (u.identityNumber && unusedIds.has(u.identityNumber)),
  );

  if (toDelete.length === 0) {
    console.log('  Tidak ada user residual yang perlu dihapus.');
    return;
  }

  console.log(`  Menghapus ${toDelete.length} user residual tidak terpakai...`);

  for (const u of toDelete) {
    try {
      const id = u.id;
      const hasLecturer = await prisma.lecturer.findUnique({ where: { id } });
      const hasStudent = await prisma.student.findUnique({ where: { id } });

      if (hasLecturer) {
        await prisma.thesisSupervisors.deleteMany({ where: { lecturerId: id } });
        await prisma.thesisSeminarExaminer.deleteMany({ where: { lecturerId: id } });
        await prisma.thesisDefenceExaminer.deleteMany({ where: { lecturerId: id } });
        await prisma.thesisAdvisorRequest.deleteMany({ where: { lecturerId: id } });
        await prisma.thesisAdvisorRequest.updateMany({ where: { redirectedTo: id }, data: { redirectedTo: null } });
        await prisma.thesisTopic.updateMany({ where: { lecturerId: id }, data: { lecturerId: null } });
        await prisma.thesisGuidance.updateMany({ where: { supervisorId: id }, data: { supervisorId: null } });
        await prisma.lecturerSupervisionQuota.deleteMany({ where: { lecturerId: id } });
        await prisma.lecturerAvailability.deleteMany({ where: { lecturerId: id } });
        await prisma.thesisChangeRequestApproval.deleteMany({ where: { lecturerId: id } });
        await prisma.thesisChangeRequest.updateMany({ where: { reviewedBy: id }, data: { reviewedBy: null } });
        await prisma.thesisMilestoneAssessmentDetail.deleteMany({ where: { lecturerId: id } });
        await prisma.lecturer.delete({ where: { id } });
      }
      if (hasStudent) {
        const theses = await prisma.thesis.findMany({ where: { studentId: id }, select: { id: true } });
        for (const t of theses) {
          await prisma.researchMethodScoreDetail.deleteMany({ where: { researchMethodScore: { thesisId: t.id } } });
          await prisma.researchMethodScore.deleteMany({ where: { thesisId: t.id } });
          await prisma.thesisSupervisors.deleteMany({ where: { thesisId: t.id } });
          await prisma.thesisMilestone.deleteMany({ where: { thesisId: t.id } });
          await prisma.thesisGuidance.deleteMany({ where: { thesisId: t.id } });
          await prisma.thesisSeminar.deleteMany({ where: { thesisId: t.id } });
          await prisma.thesisDefence.deleteMany({ where: { thesisId: t.id } });
          await prisma.ta04BatchMember.deleteMany({ where: { thesisId: t.id } });
          await prisma.thesisStudentInformalLog.deleteMany({ where: { thesisId: t.id } });
          await prisma.thesisChangeRequest.deleteMany({ where: { thesisId: t.id } });
          await prisma.yudisiumParticipant.deleteMany({ where: { thesisId: t.id } });
          await prisma.thesisAdvisorRequest.deleteMany({ where: { thesisId: t.id } });
          await prisma.thesis.update({
            where: { id: t.id },
            data: { finalProposalVersionId: null },
          }).catch(() => null);
          await prisma.thesisProposalVersion.deleteMany({ where: { thesisId: t.id } });
        }
        await prisma.metopenAttendanceRecord.updateMany({
          where: { studentId: id },
          data: { studentId: null },
        });
        await prisma.thesisAdvisorRequestDraft.deleteMany({ where: { studentId: id } });
        await prisma.thesisAdvisorRequest.deleteMany({ where: { studentId: id } });
        await prisma.thesis.deleteMany({ where: { studentId: id } });
        await prisma.student.delete({ where: { id } });
      }

      await prisma.userHasRole.deleteMany({ where: { userId: id } });
      await prisma.notification.deleteMany({ where: { userId: id } });
      await prisma.document.updateMany({ where: { userId: id }, data: { userId: null } });
      await prisma.studentCplScore.updateMany({ where: { inputBy: id }, data: { inputBy: null } });
      await prisma.studentCplScore.updateMany({ where: { verifiedBy: id }, data: { verifiedBy: null } });
      await prisma.thesisSeminarDocument.updateMany({ where: { verifiedBy: id }, data: { verifiedBy: null } });
      await prisma.thesisDefenceDocument.updateMany({ where: { verifiedBy: id }, data: { verifiedBy: null } });
      await prisma.thesisSeminarExaminer.deleteMany({ where: { assignedBy: id } });
      await prisma.thesisDefenceExaminer.deleteMany({ where: { assignedBy: id } });
      await prisma.yudisiumParticipantRequirement.updateMany({ where: { verifiedBy: id }, data: { verifiedBy: null } });
      await prisma.yudisiumCplRecommendation.updateMany({ where: { createdBy: id }, data: { createdBy: null } });
      await prisma.yudisiumCplRecommendation.updateMany({ where: { resolvedBy: id }, data: { resolvedBy: null } });
      await prisma.thesisAdvisorRequest.updateMany({ where: { reviewedBy: id }, data: { reviewedBy: null } });
      await prisma.user.delete({ where: { id } });
      console.log(`    Dihapus: ${u.email ?? u.identityNumber}`);
    } catch (err) {
      console.error(`    Gagal hapus ${u.email ?? u.identityNumber}:`, err.message);
    }
  }
}

async function ensureSupervisionQuotas() {
  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (!activeYear) {
    console.log('  [SKIP] Tidak ada tahun ajaran aktif, kuota tidak dibuat');
    return;
  }

  const pembimbingRole = await prisma.userRole.findFirst({ where: { name: ROLES.PEMBIMBING_1 } });
  if (!pembimbingRole) return;

  const lecturersWithRole = await prisma.userHasRole.findMany({
    where: { roleId: pembimbingRole.id, status: 'active' },
    select: { userId: true },
  });

  const DEFAULT_QUOTA_MAX = 8;
  const DEFAULT_SOFT_LIMIT = 6;
  let created = 0;

  for (const { userId } of lecturersWithRole) {
    const lecturer = await prisma.lecturer.findUnique({ where: { id: userId } });
    if (!lecturer) continue;

    const existing = await prisma.lecturerSupervisionQuota.findUnique({
      where: { lecturerId_academicYearId: { lecturerId: userId, academicYearId: activeYear.id } },
    });

    if (!existing) {
      await prisma.lecturerSupervisionQuota.create({
        data: {
          lecturerId: userId,
          academicYearId: activeYear.id,
          quotaMax: DEFAULT_QUOTA_MAX,
          quotaSoftLimit: DEFAULT_SOFT_LIMIT,
          currentCount: 0,
        },
      });
      created++;
    }
  }

  console.log(`  Kuota: ${created} record baru untuk tahun ajaran ${activeYear.year} ${activeYear.semester}`);
}

async function main() {
  console.log('Ensure users - password: Password@2025');
  console.log(
    SKIP_DUMMY
      ? 'Mode: --skip-dummy (hanya akun real @fti.unand.ac.id)\n'
      : 'Kebijakan: akun real tidak dilucuti role; isolasi UAT via akun @dummy.ac.id\n',
  );

  const passwordHash = await bcrypt.hash(PASSWORD_PLAIN, 10);

  console.log('--- Pastikan role ada ---');
  await ensureRoles();

  console.log('\n--- Hapus user residual tidak terpakai saja ---');
  await deleteUnusedUsers();

  console.log(SKIP_DUMMY
    ? '\n--- Upsert user master (tanpa akun dummy) ---'
    : '\n--- Upsert user master + akun dummy peran tunggal ---');
  await ensureAllowedUsers(passwordHash);

  console.log('\n--- Pastikan kuota bimbingan ada untuk semua pembimbing ---');
  await ensureSupervisionQuotas();

  console.log('\nSelesai. Role ekstra pada akun real (jika ada) dibiarkan utuh.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
