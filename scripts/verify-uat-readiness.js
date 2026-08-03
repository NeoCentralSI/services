/**
 * Pemeriksa read-only kesiapan data UAT SIMPTA.
 * Usage: node scripts/verify-uat-readiness.js [--json]
 */
import { PrismaClient } from '../src/generated/prisma/index.js';
import bcrypt from 'bcrypt';
import {
  getActiveAcademicYear,
  isWithinDateRange,
  resolveOperationalAcademicYear,
} from '../src/helpers/academicYear.helper.js';

const prisma = new PrismaClient();
const jsonMode = process.argv.includes('--json');
const results = [];
const add = (id, pass, detail) => results.push({ id, pass: Boolean(pass), detail });

const CORE_ACCOUNTS = [
  ['admin_si@fti.unand.ac.id', 'Admin'],
  ['kadep_si@fti.unand.ac.id', 'Ketua Departemen'],
  ['sekdep_si@fti.unand.ac.id', 'Sekretaris Departemen'],
  ['pembimbing_si@fti.unand.ac.id', 'Pembimbing 1'],
  ['dimas_2311523026@fti.unand.ac.id', 'Mahasiswa'],
  ['john_2411522001@fti.unand.ac.id', 'Mahasiswa'],
];

/** Akun dummy peran tunggal — dipakai uji isolasi tanpa mengubah akun real multi-jabatan. */
const DUMMY_ROLE_ACCOUNTS = [
  ['uat.admin@dummy.ac.id', 'Admin'],
  ['uat.kadep@dummy.ac.id', 'Ketua Departemen'],
  ['uat.sekdep@dummy.ac.id', 'Sekretaris Departemen'],
  ['uat.koordinator@dummy.ac.id', 'Koordinator Matkul Metopen'],
  ['uat.pembimbing@dummy.ac.id', 'Pembimbing 1'],
  ['uat.mhs.eligible@dummy.ac.id', 'Mahasiswa'],
  ['uat.mhs.blocked@dummy.ac.id', 'Mahasiswa'],
];

const MUTATION_ACCOUNTS = [
  'uatstu01-ta01@dummy.ac.id',
  'uatstu02-ta02-approve@dummy.ac.id',
  'uatstu03-ta02-reject@dummy.ac.id',
  'uatstu04-pathc@dummy.ac.id',
  'uatta04-batch-ready@dummy.ac.id',
  'uatimm01-final-score@dummy.ac.id',
  'uatwdr01-under-review@dummy.ac.id',
  'uatta03a-p1@dummy.ac.id',
  'uatta03a-p2@dummy.ac.id',
];

async function verifyAccounts() {
  for (const [email, role] of CORE_ACCOUNTS) {
    const user = await prisma.user.findFirst({
      where: { email },
      include: { userHasRoles: { where: { status: 'active' }, include: { role: true } } },
    });
    const roles = user?.userHasRoles.map((item) => item.role.name) ?? [];
    const passwordOk = user?.password ? await bcrypt.compare('Password@2025', user.password) : false;
    add(`account:${email}`, user && user.isVerified && roles.includes(role) && passwordOk,
      user ? `verified=${user.isVerified}; role=${roles.join(',')}; password=${passwordOk ? 'valid' : 'invalid'}` : 'missing');
  }

  for (const [email, role] of DUMMY_ROLE_ACCOUNTS) {
    const user = await prisma.user.findFirst({
      where: { email },
      include: { userHasRoles: { where: { status: 'active' }, include: { role: true } } },
    });
    const roles = user?.userHasRoles.map((item) => item.role.name) ?? [];
    const passwordOk = user?.password ? await bcrypt.compare('Password@2025', user.password) : false;
    add(`dummy-role:${email}`, user && user.isVerified && roles.includes(role) && passwordOk,
      user ? `verified=${user.isVerified}; role=${roles.join(',')}; password=${passwordOk ? 'valid' : 'invalid'}` : 'missing');
  }

  const sekdepDummy = await prisma.user.findFirst({
    where: { email: 'uat.sekdep@dummy.ac.id' },
    include: { userHasRoles: { where: { status: 'active' }, include: { role: true } } },
  });
  const koordinatorDummy = await prisma.user.findFirst({
    where: { email: 'uat.koordinator@dummy.ac.id' },
    include: { userHasRoles: { where: { status: 'active' }, include: { role: true } } },
  });
  const sekdepRoles = sekdepDummy?.userHasRoles.map((item) => item.role.name) ?? [];
  const koordRoles = koordinatorDummy?.userHasRoles.map((item) => item.role.name) ?? [];
  add(
    'dummy-role:isolation-sekdep-vs-koordinator',
    sekdepRoles.includes('Sekretaris Departemen')
      && !sekdepRoles.includes('Koordinator Matkul Metopen')
      && koordRoles.includes('Koordinator Matkul Metopen')
      && !koordRoles.includes('Sekretaris Departemen'),
    `sekdep=[${sekdepRoles.join(',')}]; koordinator=[${koordRoles.join(',')}]`,
  );

  const fixtures = await prisma.user.findMany({ where: { email: { in: MUTATION_ACCOUNTS } } });
  const validPasswords = await Promise.all(fixtures.map((user) => user.password && bcrypt.compare('Password@2025', user.password)));
  add('accounts:independent-fixtures', fixtures.length === MUTATION_ACCOUNTS.length && validPasswords.every(Boolean),
    `${fixtures.length}/${MUTATION_ACCOUNTS.length} akun tersedia dengan password UAT`);
}

async function verifyEdgeCases() {
  const users = await prisma.user.findMany({ where: { identityNumber: { startsWith: '23990000' } } });
  add('edge:accounts', users.length === 19, `${users.length}/19 akun EC01-EC19`);
  const attendanceImport = await prisma.metopenAttendanceImport.findFirst({
    where: { classCode: 'EDGE-CASE/SI/Kuliah/A' },
    orderBy: { uploadedAt: 'desc' },
    include: { records: true },
  });
  const records = attendanceImport?.records ?? [];
  const ecRecords = records.filter((row) => /^23990000(0[1-9]|1[0-8])$/.test(row.identityNumber));
  const unmatched = records.find((row) => row.identityNumber === '9999900099');
  const missingEc19 = !records.some((row) => row.identityNumber === '2399000019');
  const required = ['2399000016', '2399000018'].every((nim) => records.some((row) => row.identityNumber === nim));
  add('edge:attendance-contract', ecRecords.length === 18 && Boolean(unmatched) && unmatched.studentId == null && missingEc19 && required,
    `EC matched=${ecRecords.length}; EC20 unmatched=${Boolean(unmatched && !unmatched.studentId)}; EC19 absent=${missingEc19}`);
  add('edge:auto-zero', attendanceImport?.autoZeroedCount === 2,
    `autoZeroedCount=${attendanceImport?.autoZeroedCount ?? 'missing'}`);
}

async function verifyTa03() {
  const latestImport = await prisma.metopenAttendanceImport.findFirst({ orderBy: { uploadedAt: 'desc' } });
  for (const [nim, expected] of [['2388000004', 'p1_pending'], ['2388000005', 'p2_pending_cosign']]) {
    const user = await prisma.user.findUnique({ where: { identityNumber: nim } });
    const thesis = user ? await prisma.thesis.findFirst({
      where: { studentId: user.id },
      include: {
        thesisSupervisors: { where: { status: 'active' }, include: { role: true } },
        researchMethodScores: true,
      },
    }) : null;
    const score = thesis?.researchMethodScores[0];
    const stateOk = expected === 'p1_pending'
      ? !score
      : score?.supervisorScore === 65 && !score?.coSignedAt && !score?.isFinalized;
    const attendance = user && latestImport ? await prisma.metopenAttendanceRecord.findFirst({
      where: { studentId: user.id, importId: latestImport.id },
    }) : null;
    add(`ta03:${expected}`, thesis?.ta04AssignmentIssuedAt && thesis.finalProposalVersionId
      && thesis.thesisSupervisors.length >= 1 && attendance?.isEligible && stateOk,
    `TA04=${Boolean(thesis?.ta04AssignmentIssuedAt)}; proposal=${Boolean(thesis?.finalProposalVersionId)}; attendance=${attendance?.isEligible ?? false}; state=${stateOk}`);
  }
}

async function verifyIndependentStates() {
  const expectedRequests = [
    ['2388000011', 'pending', 'ta_01'],
    ['2388000012', 'pending_kadep', 'ta_02'],
    ['2388000013', 'pending_kadep', 'ta_02'],
    ['2388000014', 'pending', 'ta_01'],
  ];
  for (const [nim, status, type] of expectedRequests) {
    const request = await prisma.thesisAdvisorRequest.findFirst({ where: { student: { user: { identityNumber: nim } } } });
    add(`request:${nim}`, request?.status === status && request?.requestType === type,
      `status=${request?.status ?? 'missing'}; type=${request?.requestType ?? 'missing'}`);
  }
  const batchReady = await prisma.thesis.findFirst({ where: { student: { user: { identityNumber: '2388000017' } } } });
  add('ta04:fresh-booking', batchReady && !batchReady.ta04AssignmentIssuedAt,
    `booking thesis=${Boolean(batchReady)}; TA04 issued=${Boolean(batchReady?.ta04AssignmentIssuedAt)}`);
  const immutable = await prisma.researchMethodScore.findFirst({ where: { thesis: { student: { user: { identityNumber: '2388000018' } } } } });
  add('score:immutable', immutable?.isFinalized && immutable?.finalScore === 95,
    `finalized=${immutable?.isFinalized ?? false}; finalScore=${immutable?.finalScore ?? 'missing'}`);
  const withdraw = await prisma.thesisAdvisorRequest.findFirst({ where: { student: { user: { identityNumber: '2388000019' } } } });
  const ageHours = withdraw ? (Date.now() - withdraw.createdAt.getTime()) / 3_600_000 : 0;
  add('withdraw:under-review-72h', withdraw?.status === 'under_review' && ageHours > 72,
    `status=${withdraw?.status ?? 'missing'}; ageHours=${ageHours.toFixed(1)}`);
  const batch = await prisma.ta04Batch.findFirst({ where: { status: 'current' }, orderBy: { generatedAt: 'desc' } });
  add('ta04:batch', Boolean(batch?.generatedAt), `current=${Boolean(batch?.generatedAt)}; version=${batch?.version ?? 'missing'}`);
}

async function verifyAcademicYearOperational() {
  const byDate = await getActiveAcademicYear();
  const operational = await resolveOperationalAcademicYear();
  const afriyanti = await prisma.user.findFirst({
    where: { email: 'sekdep_si@fti.unand.ac.id' },
    include: { lecturer: true },
  });
  let bookingCount = null;
  if (operational && afriyanti?.lecturer?.id) {
    const { getLecturerQuotaSnapshot } = await import('../src/services/advisorQuota.service.js');
    const snap = await getLecturerQuotaSnapshot(afriyanti.lecturer.id, operational.id);
    bookingCount = snap?.bookingCount ?? 0;
  }
  add(
    'academic-year:date-window',
    Boolean(byDate && isWithinDateRange(byDate)),
    byDate
      ? `${byDate.year} ${byDate.semester} covers today (${byDate.startDate?.toISOString?.()} → ${byDate.endDate?.toISOString?.()})`
      : 'no academic year covers today — jalankan node scripts/seed-uat-prep.js',
  );
  add(
    'academic-year:operational',
    Boolean(operational?.id),
    operational ? `${operational.year} ${operational.semester} (${operational.id})` : 'missing',
  );
  add(
    'quota:afriyanti-booking-aligned',
    bookingCount === null || bookingCount >= 1,
    bookingCount === null
      ? 'Afriyanti lecturer/snapshot tidak tersedia'
      : `Afriyanti bookingCount=${bookingCount} on operational year (admin Kuota Bimbingan harus sama)`,
  );
}

async function main() {
  await verifyAcademicYearOperational();
  await verifyAccounts();
  await verifyEdgeCases();
  await verifyTa03();
  await verifyIndependentStates();
  const failed = results.filter((result) => !result.pass);
  const payload = { ready: failed.length === 0, checkedAt: new Date().toISOString(), passed: results.length - failed.length, failed: failed.length, checks: results };
  if (jsonMode) console.log(JSON.stringify(payload, null, 2));
  else {
    for (const result of results) console.log(`${result.pass ? '[PASS]' : '[FAIL]'} ${result.id}: ${result.detail}`);
    console.log(`\n${payload.ready ? 'READY' : 'NOT READY'}: ${payload.passed}/${results.length} checks passed`);
  }
  if (!payload.ready) process.exitCode = 1;
}

main().catch((error) => {
  console.error(jsonMode ? JSON.stringify({ ready: false, fatal: error.message }) : error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
