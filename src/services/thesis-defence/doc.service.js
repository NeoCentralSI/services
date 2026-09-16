import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { mkdir, writeFile, unlink, access } from "fs/promises";
import * as docRepo from "../../repositories/thesis-defence/doc.repository.js";
import * as coreRepo from "../../repositories/thesis-defence/thesis-defence.repository.js";
import { getStudentByUserId } from "../../repositories/thesisGuidance/student.guidance.repository.js";
import prisma from "../../config/prisma.js";
import { ENV } from "../../config/env.js";
import { getActiveAcademicYear, formatAcademicYearLabel } from "../../helpers/academicYear.helper.js";

const MAX_FILE_SIZE_BYTES = ENV.REQUIREMENT_DOCUMENT_MAX_SIZE_MB * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".pdf"];

function throwError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
}

function mapDocument(document) {
  if (!document) return null;
  return {
    thesisDefenceId: document.thesisDefenceId,
    requirementId: document.thesisDefenceRequirementId,
    status: document.status,
    filePath: document.filePath,
    fileName: document.fileName,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    submittedAt: document.submittedAt,
    verifiedAt: document.verifiedAt,
    verifiedBy: document.verifier?.fullName || null,
    notes: document.notes,
  };
}

function mapRequirement(requirement, document = null) {
  return {
    id: requirement.id,
    name: requirement.name,
    description: requirement.description || null,
    displayOrder: requirement.displayOrder,
    document: mapDocument(document),
  };
}

function uploadConfig() {
  return {
    accept: ACCEPTED_EXTENSIONS,
    maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
    maxFileSizeMb: ENV.REQUIREMENT_DOCUMENT_MAX_SIZE_MB,
  };
}

function validateFile(file) {
  if (!file?.buffer) throwError("Pilih file dokumen yang akan diunggah.", 400);

  const originalName = Buffer.from(file.originalname || "", "latin1").toString("utf8");
  const extension = path.extname(originalName).toLowerCase();
  if (!ACCEPTED_EXTENSIONS.includes(extension)) {
    throwError("Format dokumen tidak didukung. Gunakan file PDF.", 400);
  }
  if (file.mimetype !== "application/pdf") {
    throwError("Isi file tidak dikenali sebagai dokumen PDF yang valid.", 400);
  }
  if (file.size > MAX_FILE_SIZE_BYTES || file.buffer.length > MAX_FILE_SIZE_BYTES) {
    throwError(`Ukuran file maksimal ${ENV.REQUIREMENT_DOCUMENT_MAX_SIZE_MB} MB.`, 400);
  }
  if (file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throwError("File yang dipilih bukan dokumen PDF yang valid.", 400);
  }

  return { ...file, originalname: originalName };
}

async function safeUnlink(relativePath) {
  if (!relativePath) return;
  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  const target = path.resolve(process.cwd(), relativePath);
  if (target !== uploadsRoot && !target.startsWith(`${uploadsRoot}${path.sep}`)) return;
  try {
    await unlink(target);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn("Gagal menghapus file dokumen sidang lama:", error.message);
    }
  }
}

async function validateRegistrationChecklist(thesis) {
  if (!thesis.studentId) throwError("Data mahasiswa tidak ditemukan pada tugas akhir ini.", 400);

  const student = await prisma.student.findUnique({
    where: { id: thesis.studentId },
    select: { sksCompleted: true },
  });

  const passedSeminar = thesis.thesisSeminars?.[0] || null;
  const seminarStatus = passedSeminar?.status ?? null;
  const seminarId = passedSeminar?.id ?? null;

  let seminarRevisionMet = false;
  if (seminarStatus === "passed") {
    seminarRevisionMet = true;
  } else if (seminarStatus === "passed_with_revision" && seminarId) {
    if (passedSeminar.revisionFinalizedAt) {
      seminarRevisionMet = true;
    } else {
      const revCounts = await coreRepo.countSeminarRevisions(seminarId);
      seminarRevisionMet = revCounts.total > 0 && revCounts.total === revCounts.finished;
    }
  }

  const supervisors = thesis.thesisSupervisors || [];
  const allSupervisorsReady = supervisors.length > 0 && supervisors.every((s) => s.defenceReady);

  if (
    !passedSeminar ||
    !seminarRevisionMet ||
    (student?.sksCompleted || 0) < 142 ||
    !allSupervisorsReady
  ) {
    throwError("Lengkapi seluruh checklist persyaratan sebelum mengunggah dokumen sidang.", 403);
  }
}

async function getOrCreateDefence(thesis) {
  const existing = thesis.thesisDefences?.[0];
  if (existing && !["failed", "cancelled"].includes(existing.status)) return existing;

  await validateRegistrationChecklist(thesis);
  const created = await coreRepo.createThesisDefence(thesis.id);
  return { id: created.id, status: created.status };
}

export async function getRequirementsForOverview(_thesis, currentDefence) {
  const documents = currentDefence?.requirementDocuments || [];
  const documentMap = new Map(documents.map((item) => [item.thesisDefenceRequirementId, item]));

  // Locked attempts retain the documents/requirements that were actually submitted for that attempt.
  if (currentDefence && currentDefence.status !== "registered") {
    const historicalRequirements = documents
      .map((document) => document.requirement)
      .filter(Boolean);
    return {
      requirements: historicalRequirements.map((requirement) =>
        mapRequirement(requirement, documentMap.get(requirement.id))
      ),
      requirementConfiguration: { isConfigured: true, message: null },
      uploadConfig: uploadConfig(),
    };
  }

  const academicYear = await getActiveAcademicYear();
  if (!academicYear) {
    return {
      requirements: [],
      requirementConfiguration: {
        isConfigured: false,
        message: "Tahun akademik yang sedang berjalan belum tersedia. Hubungi Admin.",
      },
      uploadConfig: uploadConfig(),
    };
  }

  const requirements = await docRepo.findRequirementsByAcademicYear(academicYear.id);
  if (requirements.length === 0) {
    return {
      requirements: [],
      requirementConfiguration: {
        isConfigured: false,
        message: `Syarat dokumen sidang untuk ${formatAcademicYearLabel(academicYear)} belum dikonfigurasi.`,
      },
      uploadConfig: uploadConfig(),
    };
  }

  return {
    requirements: requirements.map((requirement) =>
      mapRequirement(requirement, documentMap.get(requirement.id))
    ),
    requirementConfiguration: { isConfigured: true, message: null },
    uploadConfig: uploadConfig(),
  };
}

export async function getDocumentTypes(userId) {
  const student = await getStudentByUserId(userId);
  if (!student) throwError("Data mahasiswa tidak ditemukan.", 404);
  const thesis = await coreRepo.getStudentThesisWithDefenceInfo(student.id);
  if (!thesis) throwError("Anda belum memiliki tugas akhir yang terdaftar.", 404);
  const academicYear = await getActiveAcademicYear();
  if (!academicYear) throwError("Tahun akademik yang sedang berjalan belum tersedia. Hubungi Admin.", 400);
  const requirements = await docRepo.findRequirementsByAcademicYear(academicYear.id);
  return requirements.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    displayOrder: item.displayOrder,
    label: item.name,
    accept: ACCEPTED_EXTENSIONS,
    maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
  }));
}

export async function getDocuments(defenceId) {
  const defence = await coreRepo.findDefenceBasicById(defenceId);
  if (!defence) throwError("Sidang tidak ditemukan.", 404);

  const documents = await docRepo.findDefenceDocuments(defenceId);
  const academicYear = defence.status === "registered" ? await getActiveAcademicYear() : null;
  if (defence.status === "registered" && !academicYear) {
    throwError("Tahun akademik yang sedang berjalan belum tersedia. Hubungi Admin.", 400);
  }
  const requirements = defence.status === "registered"
    ? await docRepo.findRequirementsByAcademicYear(academicYear.id)
    : documents.map((item) => item.requirement);
  const documentMap = new Map(documents.map((item) => [item.thesisDefenceRequirementId, item]));

  return {
    defenceId,
    requirements: requirements.map((requirement) =>
      mapRequirement(requirement, documentMap.get(requirement.id))
    ),
    uploadConfig: uploadConfig(),
  };
}

export async function uploadDocument(defenceId, userId, file, requirementId) {
  const normalizedFile = validateFile(file);
  if (!requirementId) throwError("Pilih jenis syarat dokumen yang akan diunggah.", 400);

  const student = await getStudentByUserId(userId);
  if (!student) throwError("Data mahasiswa tidak ditemukan.", 404);

  const thesis = await coreRepo.getStudentThesisWithDefenceInfo(student.id);
  if (!thesis) throwError("Anda belum memiliki tugas akhir yang terdaftar.", 404);

  const academicYear = await getActiveAcademicYear();
  if (!academicYear) throwError("Tahun akademik yang sedang berjalan belum tersedia. Hubungi Admin.", 400);

  const requirement = await docRepo.findRequirementForAcademicYear(requirementId, academicYear.id);
  if (!requirement) {
    throwError("Syarat dokumen tidak ditemukan pada tahun akademik yang sedang berjalan.", 400);
  }

  const configuredRequirements = await docRepo.findRequirementsByAcademicYear(academicYear.id);
  if (configuredRequirements.length === 0) {
    throwError(`Syarat dokumen sidang untuk ${formatAcademicYearLabel(academicYear)} belum dikonfigurasi.`, 400);
  }

  let defence;
  if (!defenceId || defenceId === "active") {
    defence = await getOrCreateDefence(thesis);
  } else {
    defence = await coreRepo.findDefenceBasicById(defenceId);
    if (!defence) throwError("Sidang tidak ditemukan.", 404);
    if (defence.thesis.studentId !== student.id) {
      throwError("Anda tidak memiliki akses untuk mengubah dokumen sidang ini.", 403);
    }
  }
  if (defence.status !== "registered") {
    throwError("Dokumen sidang sudah dikunci dan tidak dapat diubah.", 403);
  }

  const existing = await docRepo.findDefenceDocument(defence.id, requirementId);
  if (existing?.status === "approved") {
    throwError("Dokumen ini sudah disetujui dan tidak dapat diunggah ulang.", 403);
  }

  // Storage hierarchy: isolated by studentId and defenceId attempt
  const uploadsRoot = path.join(process.cwd(), "uploads", "thesis-defence", student.id, defence.id);
  await mkdir(uploadsRoot, { recursive: true });
  const storedName = `requirement-${requirementId}-${Date.now()}.pdf`;
  const absolutePath = path.join(uploadsRoot, storedName);
  const relativePath = path.relative(process.cwd(), absolutePath).replace(/\\/g, "/");
  await writeFile(absolutePath, normalizedFile.buffer);

  const now = new Date();
  let saved;
  try {
    saved = await docRepo.upsertDefenceDocument(defence.id, requirementId, {
      filePath: relativePath,
      fileName: normalizedFile.originalname,
      mimeType: normalizedFile.mimetype,
      fileSize: normalizedFile.buffer.length,
      fileHash: createHash("sha256").update(normalizedFile.buffer).digest("hex"),
      submittedAt: now,
      status: "submitted",
      notes: null,
      verifiedBy: null,
      verifiedAt: null,
    });
  } catch (error) {
    await safeUnlink(relativePath);
    throw error;
  }

  if (existing?.filePath && existing.filePath !== relativePath) {
    await safeUnlink(existing.filePath);
  }

  try {
    const adminIds = await coreRepo.findUserIdsByRole("Admin");
    if (adminIds.length > 0) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
      const studentName = user?.fullName || "Mahasiswa";
      const title = "Dokumen Sidang TA Baru";
      const message = `${studentName} telah mengunggah dokumen "${requirement.name}".`;

      await Promise.all([
        import("../notification.service.js").then((module) =>
          module.createNotificationsForUsers(adminIds, { title, message })
        ),
        import("../push.service.js").then((module) =>
          module.sendFcmToUsers(adminIds, {
            title,
            body: message,
            data: { defenceId: defence.id, type: "defence_doc_upload" },
          })
        ),
      ]);
    }
  } catch (error) {
    console.error("[Notification Error] Gagal mengirim notifikasi upload dokumen sidang:", error.message);
  }

  return mapDocument(saved);
}

export async function viewDocument(defenceId, requirementId) {
  const document = await docRepo.findDefenceDocument(defenceId, requirementId);
  if (!document) throwError("Dokumen belum diunggah.", 404);
  return mapDocument(document);
}

export async function streamDocumentFile(defenceId, requirementId, user, res) {
  const document = await docRepo.findDefenceDocument(defenceId, requirementId);
  if (!document || document.thesisDefenceId !== defenceId) {
    throwError("Dokumen belum diunggah.", 404);
  }

  const defence = document.defence;
  const thesisStudentId = defence?.thesis?.studentId || defence?.thesis?.student?.id;

  const userRoles = Array.isArray(user?.roles) ? user.roles : [];
  const isAdminOrLeadership = userRoles.some((r) =>
    ["Admin", "Ketua Departemen", "Sekretaris Departemen"].includes(r)
  );

  const isOwningStudent = Boolean(
    (user?.studentId && user.studentId === thesisStudentId) ||
    (user?.id && user.id === thesisStudentId)
  );

  const userLecturerId = user?.lecturerId || user?.id;
  const isAssignedSupervisor = Boolean(
    userLecturerId &&
    (defence?.thesis?.thesisSupervisors || []).some((s) => s.lecturerId === userLecturerId)
  );

  const isAssignedExaminer = Boolean(
    userLecturerId &&
    (defence?.examiners || []).some(
      (e) => e.lecturerId === userLecturerId && ["available", "pending"].includes(e.availabilityStatus || "available")
    )
  );

  if (!isAdminOrLeadership && !isOwningStudent && !isAssignedSupervisor && !isAssignedExaminer) {
    throwError("Anda tidak memiliki akses untuk mengunduh atau melihat dokumen ini.", 403);
  }

  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  const absolutePath = path.resolve(process.cwd(), document.filePath);

  if (absolutePath !== uploadsRoot && !absolutePath.startsWith(`${uploadsRoot}${path.sep}`)) {
    throwError("Akses dokumen ditolak.", 403);
  }

  try {
    await access(absolutePath);
  } catch (err) {
    throwError("File fisik dokumen tidak ditemukan di server.", 404);
  }

  const safeFileName = (document.fileName || "document.pdf").replace(/["\r\n]/g, "_");
  res.setHeader("Content-Type", document.mimeType || "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${safeFileName}"`);
  if (document.fileSize) {
    res.setHeader("Content-Length", document.fileSize);
  }

  const stream = fs.createReadStream(absolutePath);
  stream.on("error", (error) => {
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Gagal membaca file dokumen." });
    }
  });
  stream.pipe(res);
}

async function verifyWithRetry(payload) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await docRepo.verifyRequirementDocumentAtomic(payload);
    } catch (error) {
      const retryable = error?.code === "P2034" || /deadlock|serialization/i.test(error?.message || "");
      if (!retryable || attempt === maxAttempts) throw error;
    }
  }
}

export async function verifyDocument(defenceId, requirementId, { action, notes, userId }) {
  if (!["approve", "decline"].includes(action)) {
    throwError('Aksi verifikasi harus "approve" atau "decline".', 400);
  }
  if (action === "decline" && !String(notes || "").trim()) {
    throwError("Catatan wajib diisi saat dokumen ditolak.", 400);
  }

  const academicYear = await getActiveAcademicYear();
  if (!academicYear) throwError("Tahun akademik yang sedang berjalan belum tersedia. Hubungi Admin.", 400);

  const result = await verifyWithRetry({
    academicYearId: academicYear.id,
    thesisDefenceId: defenceId,
    requirementId,
    status: action === "approve" ? "approved" : "declined",
    notes: String(notes || "").trim() || null,
    verifiedBy: userId,
  });

  if (result.kind === "defence_not_found") throwError("Sidang tidak ditemukan.", 404);
  if (result.kind === "defence_locked") {
    throwError("Verifikasi dokumen hanya dapat dilakukan saat pendaftaran masih berlangsung.", 400);
  }
  if (result.kind === "requirement_not_found") {
    throwError("Syarat dokumen tidak ditemukan pada tahun akademik yang sedang berjalan.", 400);
  }
  if (result.kind === "document_not_found") throwError("Dokumen belum diunggah.", 404);

  try {
    const title = action === "approve" ? "Dokumen Disetujui" : "Dokumen Ditolak";
    const statusText = action === "approve" ? "disetujui" : "ditolak";
    const message = `Dokumen "${result.requirement.name}" untuk sidang TA Anda telah ${statusText} oleh Admin.${notes ? ` Catatan: ${String(notes).trim()}` : ""}`;

    const notificationJobs = [
      import("../notification.service.js").then((module) =>
        module.createNotificationsForUsers([result.studentUserId], { title, message })
      ),
      import("../push.service.js").then((module) =>
        module.sendFcmToUsers([result.studentUserId], {
          title,
          body: message,
          data: { defenceId, type: "defence_doc_verified" },
        })
      ),
    ];

    if (result.defenceTransitioned) {
      const kadepIds = await coreRepo.findUserIdsByRole("Ketua Departemen");
      if (kadepIds.length > 0) {
        const kadepTitle = "Penetapan Penguji Sidang TA";
        const kadepMessage = "Pendaftaran sidang TA telah terverifikasi dan siap untuk penetapan dosen penguji.";
        notificationJobs.push(
          import("../notification.service.js").then((module) =>
            module.createNotificationsForUsers(kadepIds, { title: kadepTitle, message: kadepMessage })
          )
        );
      }
    }
    await Promise.all(notificationJobs);
  } catch (error) {
    console.error("[Notification Error] Gagal mengirim notifikasi verifikasi dokumen:", error.message);
  }

  return {
    requirementId,
    status: result.document.status,
    defenceTransitioned: result.defenceTransitioned,
    newDefenceStatus: result.newDefenceStatus,
  };
}
