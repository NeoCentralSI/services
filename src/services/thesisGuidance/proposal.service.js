import fs from "fs";
import path from "path";
import { BadRequestError, NotFoundError, ForbiddenError } from "../../utils/errors.js";
import { getStudentByUserId, getActiveThesisForStudent } from "../../repositories/thesisGuidance/student.guidance.repository.js";
import * as proposalRepo from "../../repositories/thesisGuidance/proposal.repository.js";

async function findOrCreateProposalMilestone(thesisId) {
  let milestone = await proposalRepo.findProposalMilestone(thesisId);
  if (!milestone) {
    milestone = await proposalRepo.createProposalMilestone(thesisId);
  }
  return milestone;
}

export async function uploadProposalVersion(userId, file, description) {
  if (!file) throw new BadRequestError("File proposal (PDF) wajib diunggah");

  const student = await getStudentByUserId(userId);
  if (!student) throw new NotFoundError("Data mahasiswa tidak ditemukan");

  const thesis = await getActiveThesisForStudent(student.id);
  if (!thesis) throw new NotFoundError("Tidak ada tugas akhir aktif");

  const milestone = await findOrCreateProposalMilestone(thesis.id);

  const uploadsDir = path.join(process.cwd(), "uploads", "thesis", thesis.id, "proposal");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const uniqueId = Date.now().toString(36);
  const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
  const diskName = `${uniqueId}-${safeOriginal}`;
  const relativeFilePath = `uploads/thesis/${thesis.id}/proposal/${diskName}`;
  const absolutePath = path.join(uploadsDir, diskName);

  fs.writeFileSync(absolutePath, file.buffer);

  await proposalRepo.markPreviousNotLatest(milestone.id);

  const nextVersion = (await proposalRepo.countVersions(milestone.id)) + 1;

  const versionDoc = await proposalRepo.createProposalVersion({
    milestoneId: milestone.id,
    fileName: file.originalname,
    filePath: relativeFilePath,
    fileSize: file.size,
    mimeType: file.mimetype,
    description: description || null,
    version: nextVersion,
    isLatest: true,
  });

  const doc = await proposalRepo.createDocument({
    userId,
    filePath: relativeFilePath,
    fileName: file.originalname,
    fileSize: file.size,
    mimeType: file.mimetype,
  });

  await proposalRepo.updateThesisProposalDocumentId(thesis.id, doc.id);

  return {
    id: versionDoc.id,
    version: versionDoc.version,
    fileName: versionDoc.fileName,
    fileSize: versionDoc.fileSize,
    description: versionDoc.description,
    createdAt: versionDoc.createdAt,
    url: `/${relativeFilePath}`,
  };
}

export async function getProposalVersions(userId) {
  const student = await getStudentByUserId(userId);
  if (!student) throw new NotFoundError("Data mahasiswa tidak ditemukan");

  const thesis = await getActiveThesisForStudent(student.id);
  if (!thesis) return { thesisId: null, versions: [] };

  const milestone = await proposalRepo.findProposalMilestone(thesis.id);
  if (!milestone) return { thesisId: thesis.id, versions: [] };

  const versions = await proposalRepo.getProposalVersions(milestone.id);

  return {
    thesisId: thesis.id,
    versions: versions.map((v) => ({
      id: v.id,
      version: v.version,
      isLatest: v.isLatest,
      fileName: v.fileName,
      fileSize: v.fileSize,
      description: v.description,
      createdAt: v.createdAt,
      url: v.filePath ? `/${v.filePath}` : null,
    })),
  };
}

export async function getProposalVersionsForLecturer(lecturerUserId, thesisId) {
  const thesis = await proposalRepo.findThesisById(thesisId);
  if (!thesis) throw new NotFoundError("Tugas akhir tidak ditemukan");

  const isSupervisor = await proposalRepo.findThesisSupervisor(thesisId, lecturerUserId);
  const isMetopenLecturer = await proposalRepo.findMetopenClassForStudent(thesis.studentId, lecturerUserId);

  if (!isSupervisor && !isMetopenLecturer) {
    throw new ForbiddenError("Anda tidak memiliki akses untuk melihat proposal mahasiswa ini");
  }

  const milestone = await proposalRepo.findProposalMilestone(thesisId);
  if (!milestone) return { thesisId, versions: [] };

  const versions = await proposalRepo.getProposalVersions(milestone.id);

  return {
    thesisId,
    versions: versions.map((v) => ({
      id: v.id,
      version: v.version,
      isLatest: v.isLatest,
      fileName: v.fileName,
      fileSize: v.fileSize,
      description: v.description,
      createdAt: v.createdAt,
      url: v.filePath ? `/${v.filePath}` : null,
    })),
  };
}
