/**
 * Cleanup akun & data UAT/dummy setelah UAT selesai.
 *
 * Target HAPUS (aman):
 *  - Semua user email *@dummy.ac.id
 *  - Mahasiswa EDGE NIM 2399xxxxxx
 *  - Fixture UAT NIM 2388xxxxxx
 *  - Import presensi classCode EDGE-CASE/*
 *  - Batch TA-04 yang kosong setelah member dummy dihapus
 *
 * TIDAK disentuh:
 *  - Akun real *@fti.unand.ac.id
 *  - Master data (role, tahun ajaran, KBK, rubrik, dll.)
 *
 * Penggunaan (dari folder services/):
 *   node scripts/cleanup-uat-dummy.js            # dry-run (default)
 *   node scripts/cleanup-uat-dummy.js --execute  # hapus sungguhan
 */

import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--execute');

function isDummyIdentity(identityNumber) {
  if (!identityNumber) return false;
  return identityNumber.startsWith('2399') || identityNumber.startsWith('2388');
}

function isDummyEmail(email) {
  if (!email) return false;
  return email.toLowerCase().endsWith('@dummy.ac.id');
}

async function findTargetUsers() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      identityNumber: true,
      fullName: true,
      lecturer: { select: { id: true } },
      student: { select: { id: true } },
    },
    orderBy: [{ email: 'asc' }, { identityNumber: 'asc' }],
  });

  return users.filter((u) => {
    if (u.email && u.email.toLowerCase().endsWith('@fti.unand.ac.id')) return false;
    return isDummyEmail(u.email) || isDummyIdentity(u.identityNumber);
  });
}

async function deleteThesisCascade(thesisId) {
  await prisma.researchMethodScoreDetail.deleteMany({
    where: { researchMethodScore: { thesisId } },
  });
  await prisma.researchMethodScore.deleteMany({ where: { thesisId } });
  await prisma.thesisSupervisors.deleteMany({ where: { thesisId } });
  await prisma.thesisGuidanceEvaluation.deleteMany({ where: { thesisId } }).catch(() => null);
  await prisma.thesisGuidanceMilestone.deleteMany({
    where: { guidance: { thesisId } },
  }).catch(() => null);
  await prisma.thesisGuidance.deleteMany({ where: { thesisId } });
  await prisma.thesisMilestoneDocument.deleteMany({
    where: { milestone: { thesisId } },
  }).catch(() => null);
  await prisma.thesisMilestoneAssessmentDetail.deleteMany({
    where: { milestone: { thesisId } },
  }).catch(() => null);
  await prisma.thesisMilestone.deleteMany({ where: { thesisId } });
  await prisma.thesisSeminar.deleteMany({ where: { thesisId } });
  await prisma.thesisDefence.deleteMany({ where: { thesisId } });
  await prisma.ta04BatchMember.deleteMany({ where: { thesisId } });
  await prisma.thesisStudentInformalLog.deleteMany({ where: { thesisId } });
  await prisma.thesisChangeRequest.deleteMany({ where: { thesisId } });
  await prisma.yudisiumParticipant.deleteMany({ where: { thesisId } }).catch(() => null);
  await prisma.thesisAdvisorRequest.deleteMany({ where: { thesisId } });
  await prisma.thesis.update({
    where: { id: thesisId },
    data: {
      finalProposalVersionId: null,
      proposalReviewedByUserId: null,
      ta04AssignmentIssuedByUserId: null,
    },
  }).catch(() => null);
  await prisma.thesisProposalVersion.deleteMany({ where: { thesisId } });
  await prisma.thesis.delete({ where: { id: thesisId } });
}

async function deleteUserDeep(user) {
  const id = user.id;

  // Lepas referensi opsional dari entitas lain sebelum hapus user/lecturer.
  await prisma.thesis.updateMany({
    where: { proposalReviewedByUserId: id },
    data: { proposalReviewedByUserId: null },
  });
  await prisma.thesis.updateMany({
    where: { ta04AssignmentIssuedByUserId: id },
    data: { ta04AssignmentIssuedByUserId: null },
  });
  await prisma.ta04Batch.updateMany({
    where: { generatedByUserId: id },
    data: { generatedByUserId: null },
  });
  await prisma.researchMethodScore.updateMany({
    where: { finalizedBy: id },
    data: { finalizedBy: null },
  });
  await prisma.thesisProposalVersion.updateMany({
    where: { submittedAsFinalByUserId: id },
    data: { submittedAsFinalByUserId: null },
  });
  await prisma.thesisAdvisorRequest.updateMany({
    where: { reviewedBy: id },
    data: { reviewedBy: null },
  });
  await prisma.thesisGuidanceEvaluation.updateMany({
    where: { kadepApprovedBy: id },
    data: { kadepApprovedBy: null },
  }).catch(() => null);

  if (user.lecturer) {
    await prisma.thesisSupervisors.deleteMany({ where: { lecturerId: id } });
    await prisma.thesisSeminarExaminer.deleteMany({ where: { lecturerId: id } }).catch(() => null);
    await prisma.thesisDefenceExaminer.deleteMany({ where: { lecturerId: id } }).catch(() => null);
    await prisma.thesisAdvisorRequest.deleteMany({ where: { lecturerId: id } });
    await prisma.thesisAdvisorRequestDraft.updateMany({
      where: { lecturerId: id },
      data: { lecturerId: null },
    });
    await prisma.thesisAdvisorRequest.updateMany({
      where: { redirectedTo: id },
      data: { redirectedTo: null },
    });
    await prisma.thesisAdvisorRequest.updateMany({
      where: { forwardedByLecturerId: id },
      data: { forwardedByLecturerId: null },
    });
    await prisma.thesisTopic.updateMany({
      where: { lecturerId: id },
      data: { lecturerId: null },
    });
    await prisma.thesisGuidance.updateMany({
      where: { supervisorId: id },
      data: { supervisorId: null },
    });
    await prisma.researchMethodScore.updateMany({
      where: { supervisorId: id },
      data: { supervisorId: null },
    });
    await prisma.researchMethodScore.updateMany({
      where: { lecturerId: id },
      data: { lecturerId: null },
    });
    await prisma.researchMethodScore.updateMany({
      where: { coSignedByLecturerId: id },
      data: { coSignedByLecturerId: null },
    });
    await prisma.lecturerSupervisionQuota.deleteMany({ where: { lecturerId: id } });
    await prisma.lecturerAvailability.deleteMany({ where: { lecturerId: id } });
    await prisma.thesisChangeRequestApproval.deleteMany({ where: { lecturerId: id } }).catch(() => null);
    await prisma.thesisChangeRequest.updateMany({
      where: { reviewedBy: id },
      data: { reviewedBy: null },
    }).catch(() => null);
    await prisma.thesisChangeRequest.updateMany({
      where: { newSupervisorId: id },
      data: { newSupervisorId: null },
    }).catch(() => null);
    await prisma.thesisChangeRequest.updateMany({
      where: { replacedSupervisorLecturerId: id },
      data: { replacedSupervisorLecturerId: null },
    }).catch(() => null);
    await prisma.thesisMilestoneAssessmentDetail.deleteMany({ where: { lecturerId: id } }).catch(() => null);
    await prisma.lecturer.delete({ where: { id } });
  }

  if (user.student) {
    const theses = await prisma.thesis.findMany({
      where: { studentId: id },
      select: { id: true },
    });
    for (const t of theses) {
      await deleteThesisCascade(t.id);
    }
    await prisma.metopenAttendanceRecord.updateMany({
      where: { studentId: id },
      data: { studentId: null },
    });
    await prisma.thesisAdvisorRequestDraft.deleteMany({ where: { studentId: id } });
    await prisma.thesisAdvisorRequest.deleteMany({ where: { studentId: id } });
    await prisma.studentCplScore.deleteMany({ where: { studentId: id } }).catch(() => null);
    await prisma.student.delete({ where: { id } });
  }

  // Hapus import presensi yang di-upload oleh user dummy (cascade records).
  const imports = await prisma.metopenAttendanceImport.findMany({
    where: { uploadedByUserId: id },
    select: { id: true },
  });
  if (imports.length > 0) {
    const importIds = imports.map((row) => row.id);
    await prisma.researchMethodScore.updateMany({
      where: { attendanceRecord: { importId: { in: importIds } } },
      data: { attendanceRecordId: null },
    });
    await prisma.metopenAttendanceRecord.deleteMany({ where: { importId: { in: importIds } } });
    await prisma.metopenAttendanceImport.deleteMany({ where: { id: { in: importIds } } });
  }

  await prisma.userHasRole.deleteMany({ where: { userId: id } });
  await prisma.notification.deleteMany({ where: { userId: id } });
  await prisma.document.updateMany({ where: { userId: id }, data: { userId: null } });
  await prisma.studentCplScore.updateMany({ where: { inputBy: id }, data: { inputBy: null } }).catch(() => null);
  await prisma.studentCplScore.updateMany({ where: { verifiedBy: id }, data: { verifiedBy: null } }).catch(() => null);
  await prisma.thesisSeminarDocument.updateMany({ where: { verifiedBy: id }, data: { verifiedBy: null } }).catch(() => null);
  await prisma.thesisDefenceDocument.updateMany({ where: { verifiedBy: id }, data: { verifiedBy: null } }).catch(() => null);
  await prisma.thesisSeminarExaminer.deleteMany({ where: { assignedBy: id } }).catch(() => null);
  await prisma.thesisDefenceExaminer.deleteMany({ where: { assignedBy: id } }).catch(() => null);
  await prisma.yudisiumParticipantRequirement.updateMany({ where: { verifiedBy: id }, data: { verifiedBy: null } }).catch(() => null);
  await prisma.yudisiumCplRecommendation.updateMany({ where: { createdBy: id }, data: { createdBy: null } }).catch(() => null);
  await prisma.yudisiumCplRecommendation.updateMany({ where: { resolvedBy: id }, data: { resolvedBy: null } }).catch(() => null);

  await prisma.user.delete({ where: { id } });
}

async function cleanupEdgeAttendanceImports() {
  const imports = await prisma.metopenAttendanceImport.findMany({
    where: { classCode: { startsWith: 'EDGE-CASE/' } },
    select: { id: true, classCode: true },
  });
  if (imports.length === 0) return { count: 0, imports: [] };

  if (EXECUTE) {
    const importIds = imports.map((row) => row.id);
    await prisma.researchMethodScore.updateMany({
      where: { attendanceRecord: { importId: { in: importIds } } },
      data: { attendanceRecordId: null },
    });
    await prisma.metopenAttendanceRecord.deleteMany({ where: { importId: { in: importIds } } });
    await prisma.metopenAttendanceImport.deleteMany({ where: { id: { in: importIds } } });
  }
  return { count: imports.length, imports };
}

async function cleanupEmptyTa04Batches() {
  const emptyBatches = await prisma.ta04Batch.findMany({
    where: { members: { none: {} } },
    select: { id: true, academicYearId: true, version: true, status: true },
  });
  if (EXECUTE && emptyBatches.length > 0) {
    await prisma.ta04Batch.deleteMany({
      where: { id: { in: emptyBatches.map((b) => b.id) } },
    });
  }
  return emptyBatches;
}

async function main() {
  console.log(EXECUTE
    ? '\n=== CLEANUP UAT/DUMMY — MODE EXECUTE ===\n'
    : '\n=== CLEANUP UAT/DUMMY — DRY-RUN (tidak menghapus) ===\n');
  console.log('Scope: @dummy.ac.id + NIM 2399*/2388* + import EDGE-CASE/*');
  console.log('Aman: akun @fti.unand.ac.id TIDAK dihapus.\n');

  const targets = await findTargetUsers();
  const students = targets.filter((u) => u.student);
  const lecturers = targets.filter((u) => u.lecturer);
  const thesisCount = await prisma.thesis.count({
    where: { studentId: { in: students.map((u) => u.id) } },
  });
  const requestCount = await prisma.thesisAdvisorRequest.count({
    where: {
      OR: [
        { studentId: { in: students.map((u) => u.id) } },
        { lecturerId: { in: lecturers.map((u) => u.id) } },
      ],
    },
  });

  console.log(`Target user      : ${targets.length}`);
  console.log(`  - mahasiswa    : ${students.length}`);
  console.log(`  - dosen        : ${lecturers.length}`);
  console.log(`Thesis terkait   : ${thesisCount}`);
  console.log(`Pengajuan terkait: ${requestCount}`);
  console.log('\nDaftar akun:');
  for (const u of targets) {
    const kind = [
      u.student ? 'MHS' : null,
      u.lecturer ? 'DSN' : null,
    ].filter(Boolean).join('+') || 'USER';
    console.log(`  [${kind}] ${u.identityNumber} | ${u.email ?? '-'} | ${u.fullName}`);
  }

  const edgeImports = await cleanupEdgeAttendanceImports();
  console.log(`\nImport EDGE-CASE : ${edgeImports.count}`);

  if (!EXECUTE) {
    console.log('\nDry-run selesai. Untuk menghapus sungguhan jalankan:');
    console.log('  node scripts/cleanup-uat-dummy.js --execute\n');
    return;
  }

  console.log('\nMenghapus user dummy/UAT...');
  let ok = 0;
  let fail = 0;
  for (const user of targets) {
    try {
      await deleteUserDeep(user);
      ok += 1;
      console.log(`  [OK] ${user.email ?? user.identityNumber}`);
    } catch (err) {
      fail += 1;
      console.error(`  [FAIL] ${user.email ?? user.identityNumber}: ${err.message}`);
    }
  }

  // Pastikan import EDGE-CASE hilang meski di-upload oleh akun real.
  await cleanupEdgeAttendanceImports();
  const emptyBatches = await cleanupEmptyTa04Batches();

  const remaining = await findTargetUsers();
  const remainingEdge = await prisma.metopenAttendanceImport.count({
    where: { classCode: { startsWith: 'EDGE-CASE/' } },
  });

  console.log('\n=== RINGKASAN ===');
  console.log(`Dihapus ok     : ${ok}`);
  console.log(`Gagal          : ${fail}`);
  console.log(`Batch TA-04 kosong dihapus: ${emptyBatches.length}`);
  console.log(`Sisa target    : ${remaining.length}`);
  console.log(`Sisa EDGE-CASE : ${remainingEdge}`);
  if (remaining.length === 0 && remainingEdge === 0) {
    console.log('\n✅ Database bersih dari akun/data UAT & dummy.\n');
  } else {
    console.log('\n⚠ Masih ada sisa — cek error di atas.\n');
    for (const u of remaining) {
      console.log(`  sisa: ${u.identityNumber} | ${u.email}`);
    }
  }
}

main()
  .catch((err) => {
    console.error('❌ Cleanup gagal:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
