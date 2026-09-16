/**
 * Seed PREP UAT — melengkapi data untuk skenario interaktif yang tidak ter-cover
 * oleh ensure-users / seed-metopen-monitoring / seed-metopen-eligible-students.
 *
 * Idempotent: rerun aman.
 *
 * Jalankan (urutan ke-4, setelah 3 seed utama):
 *   cd services
 *   node scripts/seed-uat-prep.js
 *
 * Yang disiapkan:
 *  1) Password Password@2025 untuk akun dummy yang dipakai login UAT:
 *     - wang.liu@dummy.ac.id        (UAT-21 co-sign P2)
 *     - edge06@dummy.ac.id          (TA04-v26 booking + TA-04 awal)
 *     - edge15@dummy.ac.id          (UAT-16 arsip pasca TA-04)
 *     - edge02@dummy.ac.id          (UAT-10 tarik pengajuan >72 jam)
 *     - garcia.hernandez@dummy.ac.id(UAT-19 dosen kuota penuh → forward overquota)
 *  2) UAT-10: backdate pengajuan pending edge02 menjadi >72 jam supaya bisa ditarik.
 *  3) UAT-17/18: 2 pengajuan TA-01 NORMAL pending masuk inbox pembimbing_si
 *     (terima + tolak) dari mahasiswa requester khusus UAT.
 *  4) UAT-19: garcia.hernandez dibuat kuota PENUH (quotaMax=1) + 1 pengajuan
 *     escalated pending dengan justifikasi mahasiswa → dosen accept → forward KaDep.
 *  5) TA-04 v2.6: finalisasi Formulir TA-04 awal untuk booking, lalu edge15
 *     dipromosikan otomatis dan edge16 dilepas karena auto-zero.
 */

import { PrismaClient } from '../src/generated/prisma/index.js';
import servicePrisma from '../src/config/prisma.js';
import bcrypt from 'bcrypt';
import { finalizeBatchTA04 } from '../src/services/advisorRequest.service.js';
import {
  ensureOperationalAcademicYearWindow,
  resolveOperationalAcademicYear,
} from '../src/helpers/academicYear.helper.js';
import { syncBookingActivationForStudent } from '../src/services/metopen.service.js';
import { ROLES } from '../src/constants/roles.js';
import { THESIS_STATUS } from '../src/constants/thesisStatus.js';

const prisma = new PrismaClient();
const PASSWORD_PLAIN = 'Password@2025';
const WITHDRAW_LOCK_HOURS = 72;

// Mahasiswa requester khusus prep — email @dummy.ac.id (di-preserve ensure-users),
// NIM 2388xxxxxx (TIDAK 2399 → aman dari cleanup seed-metopen-monitoring).
const REQUESTERS = [
  { nim: '2388000001', name: 'UATREQ01 Inbox Terima', email: 'uatreq01@dummy.ac.id' },
  { nim: '2388000002', name: 'UATREQ02 Inbox Tolak', email: 'uatreq02@dummy.ac.id' },
  { nim: '2388000003', name: 'UATREQ03 Overquota Forward', email: 'uatreq03@dummy.ac.id' },
];

const TA03A_QUEUE_STUDENTS = [
  { nim: '2388000004', name: 'UATTA03A P1 Pending', email: 'uatta03a-p1@dummy.ac.id' },
  { nim: '2388000005', name: 'UATTA03A P2 Cosign', email: 'uatta03a-p2@dummy.ac.id' },
];

const INDEPENDENT_FIXTURES = [
  { nim: '2388000011', name: 'UATSTU01 TA01 Fresh', email: 'uatstu01-ta01@dummy.ac.id' },
  { nim: '2388000012', name: 'UATSTU02 TA02 Approve', email: 'uatstu02-ta02-approve@dummy.ac.id' },
  { nim: '2388000013', name: 'UATSTU03 TA02 Reject', email: 'uatstu03-ta02-reject@dummy.ac.id' },
  { nim: '2388000014', name: 'UATSTU04 Path C Fresh', email: 'uatstu04-pathc@dummy.ac.id' },
  { nim: '2388000017', name: 'UATTA04 Batch Ready', email: 'uatta04-batch-ready@dummy.ac.id' },
  { nim: '2388000018', name: 'UATIMM01 Final Score', email: 'uatimm01-final-score@dummy.ac.id' },
  { nim: '2388000019', name: 'UATWDR01 Under Review', email: 'uatwdr01-under-review@dummy.ac.id' },
];

const ok = (s) => console.log('  [OK]  ' + s);
const warn = (s) => console.log('  [!!]  ' + s);

async function setPassword(email, hash) {
  const u = await prisma.user.findFirst({ where: { email } });
  if (!u) { warn(`set password: ${email} tidak ada (skip)`); return; }
  await prisma.user.update({ where: { id: u.id }, data: { password: hash, isVerified: true } });
  ok(`password di-set: ${email}`);
}

async function ensureRequester(spec) {
  const role = await prisma.userRole.findFirst({ where: { name: 'Mahasiswa' } });
  const user = await prisma.user.upsert({
    where: { identityNumber: spec.nim },
    update: { fullName: spec.name, email: spec.email, isVerified: true },
    create: { fullName: spec.name, email: spec.email, identityNumber: spec.nim, identityType: 'NIM', isVerified: true },
  });
  if (role) {
    await prisma.userHasRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: { status: 'active' },
      create: { userId: user.id, roleId: role.id, status: 'active' },
    });
  }
  await prisma.student.upsert({
    where: { id: user.id },
    update: { eligibleMetopen: true, metopenEligibilitySource: 'sia', status: 'active', sksCompleted: 120, mandatoryCoursesCompleted: true, mkwuCompleted: true },
    create: { id: user.id, eligibleMetopen: true, metopenEligibilitySource: 'sia', status: 'active', enrollmentYear: 2023, sksCompleted: 120, mandatoryCoursesCompleted: true, mkwuCompleted: true },
  });
  return user;
}

async function cleanupPrevRequests(requesterIds) {
  // Hapus request prep lama (by requester) supaya idempotent.
  await prisma.thesisAdvisorRequest.deleteMany({ where: { studentId: { in: requesterIds } } });
}

async function ensureRole(name) {
  return prisma.userRole.upsert({
    where: { name },
    update: {},
    create: { name },
  });
}

async function ensureThesisStatus(name) {
  const existing = await prisma.thesisStatus.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.thesisStatus.create({ data: { name } });
}

async function ensureDocumentType(name) {
  const existing = await prisma.documentType.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.documentType.create({ data: { name } });
}

async function cleanupTa03AFixtures(studentIds) {
  const theses = await prisma.thesis.findMany({
    where: { studentId: { in: studentIds } },
    select: { id: true },
  });
  const thesisIds = theses.map((t) => t.id);
  if (thesisIds.length === 0) return;

  await prisma.researchMethodScoreDetail.deleteMany({
    where: { researchMethodScore: { thesisId: { in: thesisIds } } },
  });
  await prisma.researchMethodScore.deleteMany({ where: { thesisId: { in: thesisIds } } });
  await prisma.ta04BatchMember.deleteMany({ where: { thesisId: { in: thesisIds } } });
  await prisma.thesisSupervisors.deleteMany({ where: { thesisId: { in: thesisIds } } });
  await prisma.thesisProposalVersion.deleteMany({ where: { thesisId: { in: thesisIds } } });
  await prisma.thesisAdvisorRequest.deleteMany({ where: { thesisId: { in: thesisIds } } });
  await prisma.thesis.deleteMany({ where: { id: { in: thesisIds } } });
}

async function attachFinalProposal(thesisId, studentUserId, fileName) {
  const docType = await ensureDocumentType('Proposal Tugas Akhir');
  const doc = await prisma.document.create({
    data: {
      userId: studentUserId,
      documentTypeId: docType.id,
      fileName,
      filePath: `uploads/dummy/${fileName}`,
      fileSize: 2048,
      mimeType: 'application/pdf',
    },
  });
  const version = await prisma.thesisProposalVersion.create({
    data: {
      thesisId,
      documentId: doc.id,
      version: 1,
      isLatest: true,
      submittedAsFinalAt: new Date(),
      submittedAsFinalByUserId: studentUserId,
    },
  });
  await prisma.thesis.update({
    where: { id: thesisId },
    data: { finalProposalVersionId: version.id },
  });
}

async function createTa03AThesis({
  student,
  academicYearId,
  topicId,
  thesisStatusId,
  p1Id,
  p2Id = null,
  title,
}) {
  const thesis = await prisma.thesis.create({
    data: {
      studentId: student.id,
      academicYearId,
      thesisTopicId: topicId,
      thesisStatusId,
      title,
      isProposal: true,
      proposalStatus: null,
      ta04AssignmentIssuedAt: new Date(),
      ta04AssignmentIssuedByUserId: p1Id,
      ta04AssignmentTitle: title,
      ta04AssignmentSupervisorNames: p2Id ? 'Pembimbing 1; Pembimbing 2' : 'Pembimbing 1',
      ta04AssignmentAcademicYearId: academicYearId,
    },
  });

  const roleP1 = await ensureRole(ROLES.PEMBIMBING_1);
  await prisma.thesisSupervisors.create({
    data: {
      thesisId: thesis.id,
      lecturerId: p1Id,
      roleId: roleP1.id,
      status: 'active',
    },
  });

  if (p2Id) {
    const roleP2 = await ensureRole(ROLES.PEMBIMBING_2);
    await prisma.thesisSupervisors.create({
      data: {
        thesisId: thesis.id,
        lecturerId: p2Id,
        roleId: roleP2.id,
        status: 'active',
      },
    });
  }

  await attachFinalProposal(thesis.id, student.id, `${student.identityNumber}-proposal-final-ta03a.pdf`);
  await prisma.thesisAdvisorRequest.create({
    data: {
      studentId: student.id,
      lecturerId: p1Id,
      academicYearId,
      topicId,
      thesisId: thesis.id,
      proposedTitle: title,
      status: 'booking_approved',
      routeType: 'normal',
      requestType: 'ta_01',
    },
  });
  return thesis;
}

async function ensureLatestAttendanceCoversTa03(students) {
  const attendanceImport = await prisma.metopenAttendanceImport.findFirst({ orderBy: { uploadedAt: 'desc' } });
  if (!attendanceImport) { warn('Import presensi belum ada — jalankan seed-metopen-monitoring dulu'); return; }
  for (const student of students) {
    await prisma.metopenAttendanceRecord.upsert({
      where: { importId_identityNumber: { importId: attendanceImport.id, identityNumber: student.identityNumber } },
      update: { studentId: student.id, studentName: student.fullName, presentCount: 14, absentCount: 2, totalMeetings: 16, attendancePercentage: 0.875, isEligible: true },
      create: {
        importId: attendanceImport.id,
        studentId: student.id,
        identityNumber: student.identityNumber,
        studentName: student.fullName,
        presentCount: 14,
        absentCount: 2,
        sickCount: 0,
        permitCount: 0,
        totalMeetings: 16,
        attendancePercentage: 0.875,
        isEligible: true,
        rawRow: { fixture: 'UAT-20/21', deterministic: true },
      },
    });
  }
  const [totalRows, matchedRows, eligibleRows] = await Promise.all([
    prisma.metopenAttendanceRecord.count({ where: { importId: attendanceImport.id } }),
    prisma.metopenAttendanceRecord.count({ where: { importId: attendanceImport.id, studentId: { not: null } } }),
    prisma.metopenAttendanceRecord.count({ where: { importId: attendanceImport.id, isEligible: true } }),
  ]);
  await prisma.metopenAttendanceImport.update({
    where: { id: attendanceImport.id },
    data: { totalRows, matchedRows, eligibleRows, ineligibleRows: totalRows - eligibleRows },
  });
  ok('Presensi eligible UAT-20/21 tersedia pada import terbaru');
}

async function ensureTa03AQueues(academicYearId, topicId) {
  const p1 = await prisma.user.findFirst({ where: { email: 'pembimbing_si@fti.unand.ac.id' } });
  const p2 = await prisma.user.findFirst({ where: { email: 'wang.liu@dummy.ac.id' } });
  if (!p1) { warn('pembimbing_si tidak ada — UAT-20 tidak bisa disiapkan'); return; }
  if (!p2) { warn('wang.liu tidak ada — UAT-21 tidak bisa disiapkan'); return; }

  const students = [];
  for (const spec of TA03A_QUEUE_STUDENTS) students.push(await ensureRequester(spec));
  await cleanupTa03AFixtures(students.map((u) => u.id));
  await ensureLatestAttendanceCoversTa03(students);

  const statusBimbingan = await ensureThesisStatus(THESIS_STATUS.BIMBINGAN);
  const p1Pending = await createTa03AThesis({
    student: students[0],
    academicYearId,
    topicId,
    thesisStatusId: statusBimbingan.id,
    p1Id: p1.id,
    title: '[UAT-PREP] TA-03A P1 pending input rubrik',
  });
  ok(`UAT-20: antrean TA-03A P1 siap (${p1Pending.title})`);

  const p2Pending = await createTa03AThesis({
    student: students[1],
    academicYearId,
    topicId,
    thesisStatusId: statusBimbingan.id,
    p1Id: p1.id,
    p2Id: p2.id,
    title: '[UAT-PREP] TA-03A P2 pending co-sign',
  });
  await prisma.researchMethodScore.create({
    data: {
      thesisId: p2Pending.id,
      supervisorId: p1.id,
      supervisorScore: 65,
      lecturerScore: null,
      finalScore: null,
      isFinalized: false,
    },
  });
  ok(`UAT-21: antrean TA-03A P2 co-sign siap (${p2Pending.title})`);
}

async function createAdvisorRequest({ studentId, lecturerId, academicYearId, topicId, status, routeType, requestType = 'ta_01', studentJustification = null }) {
  return prisma.thesisAdvisorRequest.create({
    data: {
      studentId,
      lecturerId,
      academicYearId,
      topicId,
      proposedTitle: '[UAT-PREP] Pengajuan Pembimbing',
      backgroundSummary: 'Latar belakang yang cukup panjang untuk pengujian SIMPTA UAT.',
      problemStatement: 'Permasalahan utama penelitian yang akan dibahas pada UAT.',
      proposedSolution: 'Rencana solusi yang akan ditawarkan dalam penelitian UAT.',
      researchObject: 'Objek penelitian konkret untuk UAT',
      researchPermitStatus: 'approved',
      requestType,
      status,
      routeType,
      studentJustification,
      justificationText: studentJustification,
    },
  });
}

async function ensureLegacyProposalFinalForEc14() {
  const ec14 = await prisma.user.findFirst({
    where: { identityNumber: '2399000014', identityType: 'NIM' },
    include: { student: true },
  });
  if (!ec14?.student) { warn('EC14 (2399000014) tidak ada — jalankan seed-metopen-monitoring dulu'); return; }
  const thesis = await prisma.thesis.findFirst({ where: { studentId: ec14.student.id } });
  if (!thesis) { warn('EC14 thesis tidak ada'); return; }

  if (thesis.finalProposalVersionId) {
    ok('EC14 sudah punya proposal final untuk coverage legacy non-happy-path');
    return;
  }

  let dt = await prisma.documentType.findFirst({ where: { name: 'Proposal Tugas Akhir' } });
  if (!dt) dt = await prisma.documentType.create({ data: { name: 'Proposal Tugas Akhir' } });
  const doc = await prisma.document.create({
    data: {
      userId: ec14.id,
      documentTypeId: dt.id,
      fileName: 'proposal-final-ec14.pdf',
      filePath: 'uploads/dummy/proposal-final-ec14.pdf',
      fileSize: 2048,
      mimeType: 'application/pdf',
    },
  });
  const version = await prisma.thesisProposalVersion.create({
    data: {
      thesisId: thesis.id,
      documentId: doc.id,
      version: 1,
      isLatest: true,
      submittedAsFinalAt: new Date(),
      submittedAsFinalByUserId: ec14.id,
    },
  });
  await prisma.thesis.update({ where: { id: thesis.id }, data: { finalProposalVersionId: version.id } });
  ok('EC14 → proposal final di-set untuk coverage legacy non-happy-path');
}

async function cleanupExistingTa03AQueues() {
  const students = [];
  for (const spec of TA03A_QUEUE_STUDENTS) students.push(await ensureRequester(spec));
  await cleanupTa03AFixtures(students.map((user) => user.id));
}

async function ensureLifecycleAcademicYear(currentAcademicYear) {
  const nextYear = currentAcademicYear?.year === '2025/2026' ? '2026/2027' : '2026/2027';
  const existing = await prisma.academicYear.findFirst({
    where: { year: nextYear, semester: 'ganjil' },
  });
  if (existing) return existing;
  return prisma.academicYear.create({
    data: {
      year: nextYear,
      semester: 'ganjil',
      isActive: false,
      startDate: new Date('2026-08-01T00:00:00.000Z'),
      endDate: new Date('2027-01-31T00:00:00.000Z'),
    },
  });
}

async function resetBookingForLifecycleFixture(nim, academicYearId, { takingThesisCourse }) {
  const user = await prisma.user.findFirst({
    where: { identityNumber: nim, identityType: 'NIM' },
    include: { student: true },
  });
  if (!user?.student) {
    warn(`${nim} tidak ada — jalankan seed-metopen-monitoring dulu`);
    return null;
  }
  const thesis = await prisma.thesis.findFirst({ where: { studentId: user.student.id } });
  if (!thesis) {
    warn(`${nim} thesis tidak ada — jalankan seed-metopen-monitoring dulu`);
    return null;
  }

  await prisma.student.update({
    where: { id: user.student.id },
    data: {
      takingThesisCourse,
      thesisCourseEnrollmentSource: 'sia',
      thesisCourseEnrollmentUpdatedAt: new Date(),
    },
  });
  await prisma.thesisAdvisorRequest.updateMany({
    where: { studentId: user.student.id },
    data: {
      status: 'booking_approved',
      academicYearId,
      thesisId: thesis.id,
      releasedAt: null,
      releaseReason: null,
      releasedAcademicYearId: null,
    },
  });
  await prisma.thesisSupervisors.updateMany({
    where: { thesisId: thesis.id },
    data: { status: 'active' },
  });
  const normalizedTitle = thesis.title?.replace(/(?: \(judul berjalan setelah batch\))+$/u, '') ?? thesis.title;
  await prisma.thesis.update({
    where: { id: thesis.id },
    data: {
      academicYearId,
      title: normalizedTitle,
      isProposal: true,
      proposalStatus: null,
      activeAcademicYearId: null,
      activePromotedAt: null,
      ta04AssignmentIssuedAt: null,
      ta04AssignmentIssuedByUserId: null,
      ta04AssignmentTitle: null,
      ta04AssignmentSupervisorNames: null,
      ta04AssignmentAcademicYearId: null,
    },
  });

  return { user, thesis };
}

async function ensureEarlyTa04BookingCandidate(academicYearId) {
  const fixture = await resetBookingForLifecycleFixture('2399000006', academicYearId, {
    takingThesisCourse: null,
  });
  if (fixture) ok('EC06 siap sebagai fixture TA-04 awal: booking_approved + tetap fase Metopel');
}

async function ensureCurrentTitleDiffersFromFrozen(nim) {
  const user = await prisma.user.findFirst({
    where: { identityNumber: nim, identityType: 'NIM' },
    include: { student: true },
  });
  if (!user?.student) return;
  const thesis = await prisma.thesis.findFirst({ where: { studentId: user.student.id } });
  if (!thesis?.ta04AssignmentTitle) return;
  const changedTitle = `${thesis.ta04AssignmentTitle.replace(/(?: \(judul berjalan setelah batch\))+$/u, '')} (judul berjalan setelah batch)`;
  await prisma.thesis.update({
    where: { id: thesis.id },
    data: { title: changedTitle },
  });
  ok(`${nim}: current title diubah setelah batch; TA-04 tetap memakai snapshot "${thesis.ta04AssignmentTitle}"`);
}

async function ensureOfficialTa04Batch(academicYear) {
  const academicYearId = academicYear.id;
  const nextAcademicYear = await ensureLifecycleAcademicYear(academicYear);

  await ensureEarlyTa04BookingCandidate(academicYearId);
  const ec15Fixture = await resetBookingForLifecycleFixture('2399000015', academicYearId, {
    takingThesisCourse: true,
  });
  const ec16Fixture = await resetBookingForLifecycleFixture('2399000016', academicYearId, {
    takingThesisCourse: false,
  });

  const result = await finalizeBatchTA04(academicYearId);
  ok(
    `Formulir TA-04 awal siap: ${result.storedFileName ?? result.fileName} (${result.thesisCount} mahasiswa${result.alreadyFinalized ? ', sudah sinkron' : ''})`,
  );

  await ensureCurrentTitleDiffersFromFrozen('2399000006');

  if (ec15Fixture) {
    const syncResult = await syncBookingActivationForStudent(ec15Fixture.user.id, nextAcademicYear.id);
    ok(`EC15 promoted fixture → ${JSON.stringify(syncResult)}`);
  }
  if (ec16Fixture) {
    const syncResult = await syncBookingActivationForStudent(ec16Fixture.user.id, nextAcademicYear.id);
    ok(`EC16 released fixture → ${JSON.stringify(syncResult)}`);
  }
}

async function ensureIndependentMutationFixtures(academicYear, topic) {
  const users = [];
  for (const spec of INDEPENDENT_FIXTURES) users.push(await ensureRequester(spec));
  const userByNim = new Map(users.map((user) => [user.identityNumber, user]));
  await cleanupTa03AFixtures(users.map((user) => user.id));
  await cleanupPrevRequests(users.map((user) => user.id));

  const pembimbing = await prisma.user.findFirst({ where: { email: 'pembimbing_si@fti.unand.ac.id' } });
  if (!pembimbing) { warn('pembimbing_si tidak ada — fixture mutasi independen tidak lengkap'); return; }

  await createAdvisorRequest({
    studentId: userByNim.get('2388000011').id,
    lecturerId: pembimbing.id,
    academicYearId: academicYear.id,
    topicId: topic.id,
    status: 'pending',
    routeType: 'normal',
  });
  for (const nim of ['2388000012', '2388000013']) {
    await createAdvisorRequest({
      studentId: userByNim.get(nim).id,
      lecturerId: null,
      academicYearId: academicYear.id,
      topicId: topic.id,
      status: 'pending_kadep',
      routeType: 'dept',
      requestType: 'ta_02',
    });
  }
  await createAdvisorRequest({
    studentId: userByNim.get('2388000014').id,
    lecturerId: pembimbing.id,
    academicYearId: academicYear.id,
    topicId: topic.id,
    status: 'pending',
    routeType: 'escalated',
    studentJustification: 'Topik penelitian sangat spesifik dan selaras dengan rekam keahlian dosen tujuan.',
  });

  const underReview = await createAdvisorRequest({
    studentId: userByNim.get('2388000019').id,
    lecturerId: pembimbing.id,
    academicYearId: academicYear.id,
    topicId: topic.id,
    status: 'under_review',
    routeType: 'normal',
  });
  await prisma.thesisAdvisorRequest.update({
    where: { id: underReview.id },
    data: { createdAt: new Date(Date.now() - (WITHDRAW_LOCK_HOURS + 8) * 60 * 60 * 1000) },
  });

  const statusBimbingan = await ensureThesisStatus(THESIS_STATUS.BIMBINGAN);
  const roleP1 = await ensureRole(ROLES.PEMBIMBING_1);
  const batchStudent = userByNim.get('2388000017');
  const batchThesis = await prisma.thesis.create({
    data: {
      studentId: batchStudent.id,
      academicYearId: academicYear.id,
      thesisTopicId: topic.id,
      thesisStatusId: statusBimbingan.id,
      title: '[UAT-PREP] Booking baru belum masuk batch TA-04',
      isProposal: true,
    },
  });
  await prisma.thesisSupervisors.create({
    data: { thesisId: batchThesis.id, lecturerId: pembimbing.id, roleId: roleP1.id, status: 'active' },
  });
  await prisma.thesisAdvisorRequest.create({
    data: {
      studentId: batchStudent.id,
      lecturerId: pembimbing.id,
      academicYearId: academicYear.id,
      topicId: topic.id,
      thesisId: batchThesis.id,
      proposedTitle: batchThesis.title,
      status: 'booking_approved',
      routeType: 'normal',
      requestType: 'ta_01',
    },
  });

  const immutableThesis = await createTa03AThesis({
    student: userByNim.get('2388000018'),
    academicYearId: academicYear.id,
    topicId: topic.id,
    thesisStatusId: statusBimbingan.id,
    p1Id: pembimbing.id,
    title: '[UAT-PREP] Nilai final immutable',
  });
  await prisma.researchMethodScore.create({
    data: {
      thesisId: immutableThesis.id,
      supervisorId: pembimbing.id,
      supervisorScore: 70,
      lecturerId: pembimbing.id,
      lecturerScore: 25,
      finalScore: 95,
      isFinalized: true,
      finalizedBy: pembimbing.id,
      finalizedAt: new Date(),
      calculatedAt: new Date(),
    },
  });

  ok('Fixture mutasi independen siap: TA-01, TA-02 approve/reject, Path C, batch baru, immutable, withdraw >72 jam');
}

async function cleanupExistingIndependentFixtures() {
  const users = [];
  for (const spec of INDEPENDENT_FIXTURES) users.push(await ensureRequester(spec));
  await cleanupTa03AFixtures(users.map((user) => user.id));
  await cleanupPrevRequests(users.map((user) => user.id));
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  Seed PREP UAT (skenario interaktif)');
  console.log('='.repeat(60));

  const hash = await bcrypt.hash(PASSWORD_PLAIN, 10);

  // Tutup celah kalender (mis. Juli setelah endDate Juni) agar Admin UAT-03/31
  // dan kuota dosen memakai cohort yang sama.
  console.log('\n── 0. Pastikan tahun ajaran operasional menutup tanggal hari ini ──');
  const ensured = await ensureOperationalAcademicYearWindow();
  const academicYear = ensured || (await resolveOperationalAcademicYear());
  if (!academicYear) { warn('Tidak ada AcademicYear aktif — jalankan seed utama dulu'); process.exit(1); }
  ok(`Tahun operasional: ${academicYear.year} ${academicYear.semester} (${academicYear.id}) | ${academicYear.startDate?.toISOString?.() ?? academicYear.startDate} → ${academicYear.endDate?.toISOString?.() ?? academicYear.endDate}`);

  const topic = await prisma.thesisTopic.findFirst({ where: { scienceGroupId: { not: null } } });
  if (!topic) { warn('Tidak ada topik dengan scienceGroupId — jalankan seed utama dulu'); process.exit(1); }

  // 1) Passwords
  console.log('\n── 1. Password akun dummy (login UAT) ──');
  for (const email of ['wang.liu@dummy.ac.id', 'edge06@dummy.ac.id', 'edge15@dummy.ac.id', 'edge02@dummy.ac.id', 'garcia.hernandez@dummy.ac.id']) {
    await setPassword(email, hash);
  }

  // 2) UAT-10: backdate request edge02 menjadi >72 jam
  console.log('\n── 2. UAT-10: pengajuan edge02 di-backdate >72 jam ──');
  const edge02 = await prisma.user.findFirst({ where: { email: 'edge02@dummy.ac.id' } });
  if (edge02) {
    const req = await prisma.thesisAdvisorRequest.findFirst({ where: { studentId: edge02.id, status: 'pending' } });
    if (req) {
      const aged = new Date(Date.now() - (WITHDRAW_LOCK_HOURS + 8) * 60 * 60 * 1000);
      await prisma.thesisAdvisorRequest.update({ where: { id: req.id }, data: { createdAt: aged } });
      ok(`edge02 request pending → createdAt ${aged.toISOString()} (bisa ditarik, >72 jam)`);
    } else warn('edge02 tidak punya request pending (jalankan seed-metopen-monitoring dulu)');
  }

  // 3) Requester students + inbox pembimbing_si (UAT-17/18) + garcia overquota (UAT-19)
  console.log('\n── 3. Inbox pembimbing_si (UAT-17/18) + overquota garcia (UAT-19) ──');
  const pembimbing = await prisma.user.findFirst({ where: { email: 'pembimbing_si@fti.unand.ac.id' } });
  const garcia = await prisma.user.findFirst({ where: { email: 'garcia.hernandez@dummy.ac.id' } });
  if (!pembimbing) { warn('pembimbing_si tidak ada — jalankan ensure-users'); }
  if (!garcia) { warn('garcia.hernandez tidak ada — jalankan seed-metopen-monitoring'); }

  const reqUsers = [];
  for (const spec of REQUESTERS) reqUsers.push(await ensureRequester(spec));
  await cleanupPrevRequests(reqUsers.map((u) => u.id));

  if (pembimbing) {
    await createAdvisorRequest({ studentId: reqUsers[0].id, lecturerId: pembimbing.id, academicYearId: academicYear.id, topicId: topic.id, status: 'pending', routeType: 'normal' });
    ok('UAT-17: pengajuan NORMAL pending → pembimbing_si (untuk Terima)');
    await createAdvisorRequest({ studentId: reqUsers[1].id, lecturerId: pembimbing.id, academicYearId: academicYear.id, topicId: topic.id, status: 'pending', routeType: 'normal' });
    ok('UAT-18: pengajuan NORMAL pending → pembimbing_si (untuk Tolak)');
  }

  if (garcia) {
    // Buat garcia PENUH: quotaMax = 1 dengan tepat 1 booking (EC17 dari monitoring).
    // Jangan biarkan Booking > Max tanpa Overquota Sah — membingungkan saat demo KaDep.
    await prisma.lecturerSupervisionQuota.upsert({
      where: { lecturerId_academicYearId: { lecturerId: garcia.id, academicYearId: academicYear.id } },
      update: { quotaMax: 1, quotaSoftLimit: 1, currentCount: 1 },
      create: { lecturerId: garcia.id, academicYearId: academicYear.id, quotaMax: 1, quotaSoftLimit: 1, currentCount: 1 },
    });
    ok('garcia.hernandez quotaMax=1 + 1 booking EC17 → kuota PENUH (untuk skenario overquota)');
    await createAdvisorRequest({
      studentId: reqUsers[2].id,
      lecturerId: garcia.id,
      academicYearId: academicYear.id,
      topicId: topic.id,
      status: 'pending',
      routeType: 'escalated',
      studentJustification: 'Justifikasi akademik mahasiswa untuk overquota: topik sangat selaras dengan keahlian dosen dan tidak ada dosen lain yang relevan pada KBK ini.',
    });
    ok('UAT-19: pengajuan ESCALATED pending + justifikasi → garcia.hernandez (untuk Forward overquota)');
  }

  // 4) Bersihkan antrean TA-03A sebelum batch agar fixture scoring tidak
  // ikut mengubah cohort/hash batch TA-04 pada setiap rerun.
  console.log('\n── 4. Bersihkan fixture TA-03A sebelum finalisasi batch ──');
  await cleanupExistingTa03AQueues();
  await cleanupExistingIndependentFixtures();

  // 5) Legacy EC14 tetap diberi proposal final untuk coverage historis, bukan happy path.
  console.log('\n── 5. Legacy EC14: proposal final untuk coverage non-happy-path ──');
  await ensureLegacyProposalFinalForEc14();

  // 6) TA-04 v2.6: batch awal + promoted/released fixtures.
  console.log('\n── 6. TA-04 v2.6: batch awal + promosi/release otomatis ──');
  await ensureOfficialTa04Batch(academicYear);

  // Fixture scoring dibuat setelah batch dan diberi gate TA-04 deterministik.
  console.log('\n── 7. UAT-20/21: antrean TA-03A P1 + P2 co-sign ──');
  await ensureTa03AQueues(academicYear.id, topic.id);

  // 8) Start state independen dibuat SETELAH batch awal agar UAT-30 belum ikut batch.
  console.log('\n── 8. Fixture mutasi independen UAT formal ──');
  await ensureIndependentMutationFixtures(academicYear, topic);
  for (const spec of [...REQUESTERS, ...TA03A_QUEUE_STUDENTS, ...INDEPENDENT_FIXTURES]) {
    await setPassword(spec.email, hash);
  }

  console.log('\n' + '-'.repeat(60));
  console.log('Selesai prep UAT.');
  console.log('  UAT-10 : login edge02@dummy.ac.id → Status & Riwayat → tarik pengajuan');
  console.log('  UAT-17 : login pembimbing_si → Inbox → Terima (UATREQ01)');
  console.log('  UAT-18 : login pembimbing_si → Inbox → Tolak (UATREQ02)');
  console.log('  UAT-19 : login garcia.hernandez@dummy.ac.id → Inbox → Terima di atas kuota → isi alasan → forward');
  console.log('  UAT-20 : login pembimbing_si → Penilaian TA-03A → UATTA03A P1 Pending');
  console.log('  UAT-21 : login wang.liu@dummy.ac.id (co-sign P2)');
  console.log('  UAT-45 : login edge06@dummy.ac.id → /metopel → status TA-04 tampil tanpa unduh PDF mahasiswa');
  console.log('  UAT-16 : login edge15@dummy.ac.id (promoted active + arsip status pasca promosi)');
  console.log('  UAT-30/31 : login kadep_si → pengesahan-judul → batch TA-04 awal booking TA-01/TA-02');
  console.log('  Semua password: Password@2025');
}

let exitCode = 0;
try {
  await main();
} catch (e) {
  console.error('FATAL:', e);
  exitCode = 1;
} finally {
  await Promise.allSettled([prisma.$disconnect(), servicePrisma.$disconnect()]);
}
process.exit(exitCode);
