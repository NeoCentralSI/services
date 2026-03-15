import prisma from "../../config/prisma.js";

const PROPOSAL_MILESTONE_TITLE = "Dokumen Proposal";

export function findProposalMilestone(thesisId) {
  return prisma.thesisMilestone.findFirst({
    where: {
      thesisId,
      title: PROPOSAL_MILESTONE_TITLE,
      milestoneTemplateId: null,
    },
  });
}

export function createProposalMilestone(thesisId) {
  return prisma.thesisMilestone.create({
    data: {
      thesisId,
      title: PROPOSAL_MILESTONE_TITLE,
      description: "Riwayat versi dokumen proposal tugas akhir",
      status: "in_progress",
      orderIndex: 0,
    },
  });
}

export function getProposalVersions(milestoneId) {
  return prisma.thesisMilestoneDocument.findMany({
    where: { milestoneId },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      isLatest: true,
      filePath: true,
      fileName: true,
      fileSize: true,
      mimeType: true,
      description: true,
      createdAt: true,
    },
  });
}

export function createProposalVersion(data) {
  return prisma.thesisMilestoneDocument.create({ data });
}

export function markPreviousNotLatest(milestoneId) {
  return prisma.thesisMilestoneDocument.updateMany({
    where: { milestoneId },
    data: { isLatest: false },
  });
}

export function countVersions(milestoneId) {
  return prisma.thesisMilestoneDocument.count({ where: { milestoneId } });
}

export function createDocument({ userId, filePath, fileName, fileSize, mimeType }) {
  return prisma.document.create({
    data: { userId, filePath, fileName, fileSize, mimeType },
  });
}

export function updateThesisProposalDocumentId(thesisId, proposalDocumentId) {
  return prisma.thesis.update({
    where: { id: thesisId },
    data: { proposalDocumentId },
  });
}

export function findThesisSupervisor(thesisId, userId) {
  return prisma.thesisSupervisors.findFirst({
    where: { thesisId, lecturer: { userId } },
  });
}

export function findMetopenClassForStudent(studentId, lecturerUserId) {
  return prisma.metopenClassStudent.findFirst({
    where: {
      student: { id: studentId },
      metopenClass: { lecturer: { userId: lecturerUserId } },
    },
  });
}

export function findThesisById(thesisId) {
  return prisma.thesis.findUnique({
    where: { id: thesisId },
    select: { id: true, studentId: true, title: true },
  });
}
