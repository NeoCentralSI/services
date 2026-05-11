import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";

export function getProposalVersions(thesisId) {
  return prisma.thesisProposalVersion.findMany({
    where: { thesisId },
    orderBy: { version: "desc" },
    select: {
      id: true,
      documentId: true,
      version: true,
      isLatest: true,
      description: true,
      submittedAsFinalAt: true,
      createdAt: true,
      document: {
        select: {
          filePath: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
        },
      },
    },
  });
}

export function findLatestProposalVersion(thesisId) {
  return prisma.thesisProposalVersion.findFirst({
    where: {
      thesisId,
      isLatest: true,
    },
    orderBy: { version: "desc" },
    select: {
      id: true,
      thesisId: true,
      documentId: true,
      version: true,
      isLatest: true,
      description: true,
      submittedAsFinalAt: true,
      createdAt: true,
      document: {
        select: {
          id: true,
          filePath: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
        },
      },
    },
  });
}

export function createProposalVersion(data) {
  return prisma.thesisProposalVersion.create({ data });
}

export function markPreviousNotLatest(thesisId) {
  return prisma.thesisProposalVersion.updateMany({
    where: { thesisId },
    data: { isLatest: false },
  });
}

export function countVersions(thesisId) {
  return prisma.thesisProposalVersion.count({ where: { thesisId } });
}

export function createDocument({ userId, filePath, fileName, fileSize, mimeType }) {
  return prisma.document.create({
    data: { userId, filePath, fileName, fileSize, mimeType },
  });
}

export async function createProposalVersionWithDocument({
  thesisId,
  userId,
  filePath,
  fileName,
  fileSize,
  mimeType,
  description,
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id
      FROM thesis
      WHERE id = ${thesisId}
      FOR UPDATE
    `;

    const document = await tx.document.create({
      data: { userId, filePath, fileName, fileSize, mimeType },
      select: {
        id: true,
        fileName: true,
        filePath: true,
        fileSize: true,
        mimeType: true,
      },
    });

    await tx.thesisProposalVersion.updateMany({
      where: { thesisId, isLatest: true },
      data: { isLatest: false },
    });

    const latestVersion = await tx.thesisProposalVersion.findFirst({
      where: { thesisId },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const versionDoc = await tx.thesisProposalVersion.create({
      data: {
        thesisId,
        documentId: document.id,
        description: description || null,
        version: (latestVersion?.version ?? 0) + 1,
        isLatest: true,
      },
      select: {
        id: true,
        documentId: true,
        version: true,
        isLatest: true,
        description: true,
        submittedAsFinalAt: true,
        createdAt: true,
      },
    });

    return { ...versionDoc, document };
  }, { isolationLevel: "Serializable" });
}

/**
 * @deprecated Legacy direct setter pada `Thesis.proposalDocumentId`.
 *
 * Active SIMPTA flow memakai `thesis_proposal_versions` + `Thesis.finalProposalVersionId`
 * (Canon §5.6). Field `proposalDocumentId` masih ada di schema sebagai
 * legacy column dan akan di-drop pada migration berikutnya setelah audit
 * memastikan tidak ada read sisa. Jangan dipakai untuk write baru.
 */
export function updateThesisProposalDocumentId(thesisId, proposalDocumentId) {
  return prisma.thesis.update({
    where: { id: thesisId },
    data: { proposalDocumentId },
  });
}

export function findThesisSupervisor(thesisId, userId) {
  return prisma.thesisParticipant.findFirst({
    where: { thesisId, lecturer: { userId } },
  });
}

export function findMetopenLecturerRole(lecturerUserId) {
  return prisma.userHasRole.findFirst({
    where: {
      userId: lecturerUserId,
      status: "active",
      role: { name: ROLES.KOORDINATOR_METOPEN },
    },
  });
}

export function findThesisById(thesisId) {
  return prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      studentId: true,
      title: true,
      proposalStatus: true,
      finalProposalVersionId: true,
    },
  });
}

export function countActiveSupervisors(thesisId) {
  return prisma.thesisParticipant.count({
    where: {
      thesisId,
      status: "active",
      role: {
        name: {
          in: [ROLES.PEMBIMBING_1, ROLES.PEMBIMBING_2],
        },
      },
    },
  });
}

export function getProposalSubmissionStatus(thesisId) {
  return prisma.thesis.findUnique({
    where: { id: thesisId },
    select: {
      id: true,
      proposalStatus: true,
      finalProposalVersionId: true,
      proposalReviewNotes: true,
      finalProposalVersion: {
        select: {
          id: true,
          version: true,
          submittedAsFinalAt: true,
          document: {
            select: {
              id: true,
              fileName: true,
              filePath: true,
              fileSize: true,
              mimeType: true,
            },
          },
        },
      },
    },
  });
}

export async function submitFinalProposalVersion(thesisId, versionId, userId, submittedAt = new Date()) {
  return prisma.$transaction(async (tx) => {
    const version = await tx.thesisProposalVersion.update({
      where: { id: versionId },
      data: {
        submittedAsFinalAt: submittedAt,
        submittedAsFinalByUserId: userId,
      },
      select: {
        id: true,
        thesisId: true,
        documentId: true,
        version: true,
        submittedAsFinalAt: true,
        document: {
          select: {
            id: true,
            fileName: true,
            filePath: true,
            fileSize: true,
            mimeType: true,
          },
        },
      },
    });

    await tx.thesis.update({
      where: { id: thesisId },
      data: {
        proposalDocumentId: null,
        finalProposalVersionId: version.id,
        isProposal: true,
        proposalStatus: null,
        proposalReviewNotes: null,
        proposalReviewedAt: null,
        proposalReviewedByUserId: null,
        titleApprovalDocumentId: null,
      },
    });

    return version;
  });
}
