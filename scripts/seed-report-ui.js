import { PrismaClient } from '../src/generated/prisma/index.js';

const prisma = new PrismaClient();
const REPORT_FILE_PREFIX = 'REPORT-UI-';

async function createDocument(userId, fileName, mimeType = 'application/pdf') {
  return prisma.document.create({
    data: {
      userId,
      fileName,
      filePath: `uploads/dummy/${fileName}`,
      fileSize: 2048,
      mimeType,
    },
  });
}

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: 'edge06@dummy.ac.id' },
    select: { id: true },
  });
  if (!user) throw new Error('Fixture edge06 belum tersedia. Jalankan seed UAT terlebih dahulu.');

  const thesis = await prisma.thesis.findFirst({
    where: { studentId: user.id },
    select: { id: true, ta04AssignmentIssuedAt: true },
  });
  if (!thesis?.ta04AssignmentIssuedAt) {
    throw new Error('Fixture edge06 belum memiliki penugasan TA-04 resmi.');
  }

  const existingDocs = await prisma.document.findMany({
    where: { userId: user.id, fileName: { startsWith: REPORT_FILE_PREFIX } },
    select: { id: true },
  });
  const existingDocIds = existingDocs.map((doc) => doc.id);

  await prisma.thesis.update({
    where: { id: thesis.id },
    data: { finalProposalVersionId: null },
  });
  await prisma.thesisProposalVersion.deleteMany({
    where: {
      thesisId: thesis.id,
      documentId: { in: existingDocIds },
    },
  });
  await prisma.thesisStudentInformalLog.deleteMany({
    where: {
      thesisId: thesis.id,
      OR: [
        { documentId: { in: existingDocIds } },
        { content: { startsWith: '[REPORT-UI]' } },
      ],
    },
  });
  await prisma.document.deleteMany({ where: { id: { in: existingDocIds } } });

  const proposalV1 = await createDocument(user.id, `${REPORT_FILE_PREFIX}proposal-v1.pdf`);
  const proposalV2 = await createDocument(user.id, `${REPORT_FILE_PREFIX}proposal-v2.pdf`);
  const informalAttachment = await createDocument(
    user.id,
    `${REPORT_FILE_PREFIX}catatan-instrumen.pdf`,
  );

  await prisma.thesisProposalVersion.createMany({
    data: [
      {
        thesisId: thesis.id,
        documentId: proposalV1.id,
        version: 1,
        description: 'Rancangan awal proposal dan batasan masalah.',
        isLatest: false,
        createdAt: new Date('2026-06-20T03:00:00.000Z'),
      },
      {
        thesisId: thesis.id,
        documentId: proposalV2.id,
        version: 2,
        description: 'Perbaikan metodologi dan instrumen penelitian.',
        isLatest: true,
        createdAt: new Date('2026-06-27T03:00:00.000Z'),
      },
    ],
  });

  await prisma.thesisStudentInformalLog.createMany({
    data: [
      {
        thesisId: thesis.id,
        studentId: user.id,
        content: '[REPORT-UI] Menyempurnakan ruang lingkup dan batasan masalah sesuai diskusi awal.',
        createdAt: new Date('2026-06-22T03:00:00.000Z'),
      },
      {
        thesisId: thesis.id,
        studentId: user.id,
        content: '[REPORT-UI] Menyusun instrumen pengumpulan data dan memperbarui rancangan metodologi.',
        documentId: informalAttachment.id,
        createdAt: new Date('2026-06-29T03:00:00.000Z'),
      },
    ],
  });

  const ta03User = await prisma.user.findFirst({
    where: { email: 'uatta03a-p2@dummy.ac.id' },
    include: { student: true },
  });
  const kadep = await prisma.user.findFirst({
    where: { email: 'kadep_si@fti.unand.ac.id' },
    select: { id: true },
  });
  if (!ta03User?.student || !kadep) {
    throw new Error('Fixture TA-03A atau akun KaDep belum tersedia.');
  }

  const ta03Thesis = await prisma.thesis.findFirst({
    where: { studentId: ta03User.student.id },
    include: { thesisSupervisors: true },
  });
  const p1 = ta03Thesis?.thesisSupervisors[0];
  if (!ta03Thesis || !p1) throw new Error('Fixture TA-03A belum memiliki tesis dan Pembimbing 1.');

  const advisorRequestData = {
    lecturerId: p1.lecturerId,
    academicYearId: ta03Thesis.academicYearId,
    topicId: ta03Thesis.thesisTopicId,
    thesisId: ta03Thesis.id,
    proposedTitle: ta03Thesis.title,
    backgroundSummary: 'Fixture laporan untuk riwayat penilaian TA-03A.',
    problemStatement: 'Validasi tampilan proposal dan catatan informal pembimbing.',
    proposedSolution: 'Menampilkan state TA-04 resmi dan penilaian read-only.',
    researchObject: 'Implementasi SIMPTA',
    researchPermitStatus: 'approved',
    requestType: 'ta_01',
    status: 'booking_approved',
    routeType: 'normal',
    lecturerRespondedAt: new Date('2026-06-10T03:00:00.000Z'),
  };
  const existingRequest = await prisma.thesisAdvisorRequest.findFirst({
    where: { studentId: ta03User.student.id, thesisId: ta03Thesis.id },
    select: { id: true },
  });
  if (existingRequest) {
    await prisma.thesisAdvisorRequest.update({
      where: { id: existingRequest.id },
      data: advisorRequestData,
    });
  } else {
    await prisma.thesisAdvisorRequest.create({
      data: { studentId: ta03User.student.id, ...advisorRequestData },
    });
  }

  await prisma.thesis.update({
    where: { id: ta03Thesis.id },
    data: {
      ta04AssignmentIssuedAt: new Date('2026-06-12T03:00:00.000Z'),
      ta04AssignmentIssuedByUserId: kadep.id,
      ta04AssignmentTitle: ta03Thesis.title,
      ta04AssignmentSupervisorNames: 'Husnil Kamil, MT; Dr. Wang Liu, M.Sc.',
      ta04AssignmentAcademicYearId: ta03Thesis.academicYearId,
    },
  });

  const ta03Docs = await prisma.document.findMany({
    where: { userId: ta03User.id, fileName: `${REPORT_FILE_PREFIX}ta03a-catatan.pdf` },
    select: { id: true },
  });
  const ta03DocIds = ta03Docs.map((doc) => doc.id);
  await prisma.thesisStudentInformalLog.deleteMany({
    where: {
      thesisId: ta03Thesis.id,
      OR: [
        { documentId: { in: ta03DocIds } },
        { content: { startsWith: '[REPORT-UI]' } },
      ],
    },
  });
  await prisma.document.deleteMany({ where: { id: { in: ta03DocIds } } });
  const ta03Attachment = await createDocument(
    ta03User.id,
    `${REPORT_FILE_PREFIX}ta03a-catatan.pdf`,
  );
  await prisma.thesisStudentInformalLog.create({
    data: {
      thesisId: ta03Thesis.id,
      studentId: ta03User.student.id,
      content: '[REPORT-UI] Perbaikan proposal telah dikirim sebelum co-sign Pembimbing 2.',
      documentId: ta03Attachment.id,
      createdAt: new Date('2026-06-24T03:00:00.000Z'),
    },
  });

  console.log('Seed laporan UI siap: mahasiswa Metopel + riwayat TA-03A pembimbing.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
