/**
 * Ensure users sesuai usersData master.
 * Password semua: Password@2025
 *
 * Jalankan: node scripts/ensure-users.js
 * (dari folder services, dengan DATABASE_URL ter-set)
 */

import { PrismaClient } from '../src/generated/prisma/index.js';
import bcrypt from 'bcrypt';
import { ROLES } from '../src/constants/roles.js';

const prisma = new PrismaClient();
const PASSWORD_PLAIN = 'Password@2025';

// Data user master - sesuaikan dengan seed-master
const usersData = [
  {
    email: 'kadep_si@fti.unand.ac.id',
    fullName: 'Ricky Akbar M.Kom',
    identityType: 'NIP',
    identityNumber: '198410062012121001',
    roles: [ROLES.KETUA_DEPARTEMEN, ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.PENGUJI],
    isLecturer: true,
  },
  {
    email: 'sekdep_si@fti.unand.ac.id',
    fullName: 'Afriyanti Dwi Kartika, M.T',
    identityType: 'NIP',
    identityNumber: '198904212019032024',
    roles: [ROLES.SEKRETARIS_DEPARTEMEN, ROLES.KOORDINATOR_YUDISIUM, ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2, ROLES.PENGUJI],
    isLecturer: true,
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
  {
    email: 'test_changetopic@fti.unand.ac.id',
    fullName: 'Test Ganti Topik',
    identityType: 'NIM',
    identityNumber: '2211522101',
    roles: [ROLES.MAHASISWA],
    isStudent: true,
    enrollmentYear: 2022,
    sksCompleted: 130,
  },
  {
    email: 'test_changesupervisor@fti.unand.ac.id',
    fullName: 'Test Ganti Dospem',
    identityType: 'NIM',
    identityNumber: '2211522102',
    roles: [ROLES.MAHASISWA],
    isStudent: true,
    enrollmentYear: 2022,
    sksCompleted: 130,
  },
  {
    email: 'test_nothesis@fti.unand.ac.id',
    fullName: 'Test Tanpa Thesis',
    identityType: 'NIM',
    identityNumber: '2211522103',
    roles: [ROLES.MAHASISWA],
    isStudent: true,
    enrollmentYear: 2022,
    sksCompleted: 130,
  },
];

async function ensureRoles() {
  const roleNames = [...new Set(usersData.flatMap((u) => u.roles))];
  for (const name of roleNames) {
    const existing = await prisma.userRole.findFirst({ where: { name } });
    if (!existing) {
      await prisma.userRole.create({ data: { id: name, name } });
      console.log(`  Role dibuat: ${name}`);
    }
  }
}

async function ensureAllowedUsers(passwordHash) {
  for (const spec of usersData) {
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

async function deleteRedundantUsers(allowedEmails, allowedIdentityNumbers) {
  const allUsers = await prisma.user.findMany({
    select: { id: true, email: true, identityNumber: true },
  });
  const toDelete = allUsers.filter(
    (u) =>
      !allowedIdentityNumbers.has(u.identityNumber) &&
      !(u.email && allowedEmails.has(u.email.toLowerCase()))
  );
  if (toDelete.length === 0) {
    console.log('  Tidak ada user redundan.');
    return;
  }

  console.log(`  Menghapus ${toDelete.length} user redundan...`);

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
        const metopenClasses = await prisma.metopenClass.findMany({ where: { lecturerId: id }, select: { id: true } });
        for (const mc of metopenClasses) {
          await prisma.metopenClassStudent.deleteMany({ where: { classId: mc.id } });
        }
        await prisma.metopenClass.deleteMany({ where: { lecturerId: id } });
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
          await prisma.thesisSupervisors.deleteMany({ where: { thesisId: t.id } });
          await prisma.thesisMilestone.deleteMany({ where: { thesisId: t.id } });
          await prisma.thesisGuidance.deleteMany({ where: { thesisId: t.id } });
          await prisma.thesisSeminar.deleteMany({ where: { thesisId: t.id } });
          await prisma.thesisDefence.deleteMany({ where: { thesisId: t.id } });
          await prisma.metopenClassStudent.deleteMany({ where: { studentId: id } });
        }
        await prisma.thesis.deleteMany({ where: { studentId: id } });
        await prisma.thesisAdvisorRequest.deleteMany({ where: { studentId: id } });
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
      console.log(`    Dihapus: ${u.email}`);
    } catch (err) {
      console.error(`    Gagal hapus ${u.email}:`, err.message);
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
  console.log('Ensure users - sesuai usersData master, password: Password@2025\n');

  const passwordHash = await bcrypt.hash(PASSWORD_PLAIN, 10);
  const allowedEmails = new Set(usersData.map((u) => u.email.toLowerCase()));
  const allowedIdentityNumbers = new Set(usersData.map((u) => u.identityNumber));

  console.log('--- Pastikan role ada ---');
  await ensureRoles();

  console.log('\n--- Hapus user redundan terlebih dahulu ---');
  await deleteRedundantUsers(allowedEmails, allowedIdentityNumbers);

  console.log('\n--- Upsert user dari usersData ---');
  await ensureAllowedUsers(passwordHash);

  console.log('\n--- Pastikan kuota bimbingan ada untuk semua pembimbing ---');
  await ensureSupervisionQuotas();

  console.log('\nSelesai.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
