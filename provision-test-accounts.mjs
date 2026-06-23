/**
 * provision-test-accounts.mjs
 *
 * Bootstrap script that creates test accounts for E2E testing.
 * Run from services/ directory: node ../e2e/provision-test-accounts.mjs
 *
 * This script:
 * 1. Creates Admin user (if not exists) and sets password
 * 2. Creates Mahasiswa user and sets eligibility
 * 3. Sets password for seed Pembimbing 1 (Dr. Husnil Kamil)
 * 4. Creates KaDep user
 * 5. Creates Sekdep user
 * 6. Sets mahasiswa eligibility + thesis course enrollment
 */

import { PrismaClient } from './src/generated/prisma/index.js'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

const SALT_ROUNDS = 10
const DEFAULT_PASSWORD = 'Test1234!'

async function hashPassword(pw) {
  return bcrypt.hash(pw, SALT_ROUNDS)
}

async function ensureUser({
  identityNumber,
  identityType,
  fullName,
  email,
  password,
  roles,
}) {
  const hashedPw = await hashPassword(password)

  const user = await prisma.user.upsert({
    where: { identityNumber },
    update: {
      fullName,
      email,
      password: hashedPw,
      isVerified: true,
    },
    create: {
      identityNumber,
      identityType,
      fullName,
      email,
      password: hashedPw,
      isVerified: true,
    },
  })

  // Create Student or Lecturer record
  if (identityType === 'NIM') {
    await prisma.student.upsert({
      where: { id: user.id },
      update: {},
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
    })
  } else {
    await prisma.lecturer.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        scienceGroupId: 'kbk-si',
        acceptingRequests: true,
      },
    })
  }

  // Assign roles
  for (const roleName of roles) {
    const role = await prisma.userRole.findFirst({ where: { name: roleName } })
    if (!role) {
      console.warn(`  ⚠ Role "${roleName}" not found, skipping`)
      continue
    }
    await prisma.userHasRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: { status: 'active' },
      create: { userId: user.id, roleId: role.id, status: 'active' },
    })
  }

  console.log(`  ✓ ${fullName} (${identityNumber}) — roles: ${roles.join(', ')}`)
  return user
}

async function main() {
  console.log('🔧 Provisioning E2E test accounts...\n')

  // 1. Admin
  await ensureUser({
    identityNumber: '198001012010011099',
    identityType: 'NIP',
    fullName: 'E2E Admin Test',
    email: 'e2e.admin@test.dev',
    password: DEFAULT_PASSWORD,
    roles: ['Admin'],
  })

  // 2. Mahasiswa
  const mhs = await ensureUser({
    identityNumber: '2211529999',
    identityType: 'NIM',
    fullName: 'E2E Mahasiswa Test',
    email: 'e2e.mahasiswa@test.dev',
    password: DEFAULT_PASSWORD,
    roles: ['Mahasiswa'],
  })

  // 3. Pembimbing 1 (seed user — set password only)
  const pembimbingPw = await hashPassword(DEFAULT_PASSWORD)
  await prisma.user.update({
    where: { identityNumber: '198501012010011001' },
    data: { password: pembimbingPw, isVerified: true },
  })
  console.log(`  ✓ Dr. Husnil Kamil (198501012010011001) — password set`)

  // 4. KaDep
  await ensureUser({
    identityNumber: '198501012010011002',
    identityType: 'NIP',
    fullName: 'E2E KaDep Test',
    email: 'e2e.kadep@test.dev',
    password: DEFAULT_PASSWORD,
    roles: ['Ketua Departemen'],
  })

  // 5. Sekretaris Departemen
  await ensureUser({
    identityNumber: '198501012010011003',
    identityType: 'NIP',
    fullName: 'E2E Sekretaris Departemen Test',
    email: 'e2e.sekdep@test.dev',
    password: DEFAULT_PASSWORD,
    roles: ['Sekretaris Departemen'],
  })

  // 6. Set Mahasiswa eligibility
  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } })
  if (activeYear) {
    await prisma.student.update({
      where: { id: mhs.id },
      data: {
        eligibleMetopen: true,
        metopenEligibilitySource: 'devtools',
        metopenEligibilityUpdatedAt: new Date(),
        takingThesisCourse: true,
        thesisCourseEnrollmentSource: 'devtools',
        thesisCourseEnrollmentUpdatedAt: new Date(),
      },
    })
    console.log(`  ✓ Mahasiswa eligibility set (eligibleMetopen=true, takingThesisCourse=true)`)
  } else {
    console.warn(`  ⚠ No active academic year found — eligibility not set`)
  }

  console.log('\n✅ All E2E test accounts provisioned.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
