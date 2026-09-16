import path from "path";
import { createHash } from "crypto";
import { mkdir, writeFile, unlink } from "fs/promises";
import * as docRepo from "../../repositories/thesis-seminar/doc.repository.js";
import * as coreRepo from "../../repositories/thesis-seminar/thesis-seminar.repository.js";
import prisma from "../../config/prisma.js";
import { ENV } from "../../config/env.js";
import { getActiveAcademicYear, formatAcademicYearLabel } from "../../helpers/academicYear.helper.js";

const MIN_BIMBINGAN = ENV.SEMINAR_MIN_BIMBINGAN;
const MIN_KEHADIRAN = ENV.SEMINAR_MIN_KEHADIRAN;
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
    thesisSeminarId: document.thesisSeminarId,
    requirementId: document.thesisSeminarRequirementId,
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
      console.warn("Gagal menghapus file dokumen seminar lama:", error.message);
    }
  }
}

async function validateRegistrationChecklist(thesis) {
  const [student, completedGuidances, seminarAttendance, supervisors] = await Promise.all([
    prisma.student.findUnique({ where: { id: thesis.studentId } }),
    prisma.thesisGuidance.count({ where: { thesisId: thesis.id, status: "completed" } }),
    coreRepo.countSeminarAttendance(thesis.studentId),
    prisma.thesisSupervisors.findMany({ where: { thesisId: thesis.id } }),
  ]);
  const allSupervisorsReady = supervisors.length > 0 && supervisors.every((item) => item.seminarReady);

  if (
    completedGuidances < MIN_BIMBINGAN ||
    seminarAttendance < MIN_KEHADIRAN ||
    !student?.researchMethodCompleted ||
    !allSupervisorsReady
  ) {
    throwError("Lengkapi seluruh checklist persyaratan sebelum mengunggah dokumen seminar.", 403);
  }
}

async function getOrCreateSeminar(thesis) {
  const existing = thesis.thesisSeminars?.[0];
  if (existing && !["failed", "cancelled"].includes(existing.status)) return existing;

  await validateRegistrationChecklist(thesis);
  const created = await coreRepo.createThesisSeminar(thesis.id);
  return { id: created.id, status: created.status };
}

export async function getRequirementsForOverview(_thesis, currentSeminar) {
  const documents = currentSeminar?.requirementDocuments || [];
  const documentMap = new Map(documents.map((item) => [item.thesisSeminarRequirementId, item]));

  // Locked attempts retain the documents/requirements that were actually submitted for that attempt.
  if (currentSeminar && currentSeminar.status !== "registered") {
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
        message: `Syarat dokumen seminar untuk ${formatAcademicYearLabel(academicYear)} belum dikonfigurasi.`,
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


export async function getDocumentTypes(studentId) {
  const thesis = await coreRepo.getThesisWithSeminar(studentId);
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

export async function getDocuments(seminarId) {
  const seminar = await coreRepo.findSeminarBasicById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);

  const documents = await docRepo.findSeminarDocuments(seminarId);
  const academicYear = seminar.status === "registered" ? await getActiveAcademicYear() : null;
  if (seminar.status === "registered" && !academicYear) {
    throwError("Tahun akademik yang sedang berjalan belum tersedia. Hubungi Admin.", 400);
  }
  const requirements = seminar.status === "registered"
    ? await docRepo.findRequirementsByAcademicYear(academicYear.id)
    : documents.map((item) => item.requirement);
  const documentMap = new Map(documents.map((item) => [item.thesisSeminarRequirementId, item]));

  return {
    seminarId,
    requirements: requirements.map((requirement) =>
      mapRequirement(requirement, documentMap.get(requirement.id))
    ),
    uploadConfig: uploadConfig(),
  };
}

export async function uploadDocument(seminarId, studentId, file, requirementId) {
  const normalizedFile = validateFile(file);
  if (!requirementId) throwError("Pilih jenis syarat dokumen yang akan diunggah.", 400);

  const thesis = await coreRepo.getThesisWithSeminar(studentId);
  if (!thesis) throwError("Anda belum memiliki tugas akhir yang terdaftar.", 404);
  const academicYear = await getActiveAcademicYear();
  if (!academicYear) throwError("Tahun akademik yang sedang berjalan belum tersedia. Hubungi Admin.", 400);

  const requirement = await docRepo.findRequirementForAcademicYear(requirementId, academicYear.id);
  if (!requirement) {
    throwError("Syarat dokumen tidak ditemukan pada tahun akademik yang sedang berjalan.", 400);
  }

  const configuredRequirements = await docRepo.findRequirementsByAcademicYear(academicYear.id);
  if (configuredRequirements.length === 0) {
    throwError(`Syarat dokumen seminar untuk ${formatAcademicYearLabel(academicYear)} belum dikonfigurasi.`, 400);
  }

  let seminar;
  if (!seminarId || seminarId === "active") {
    seminar = await getOrCreateSeminar(thesis);
  } else {
    seminar = await coreRepo.findSeminarBasicById(seminarId);
    if (!seminar) throwError("Seminar tidak ditemukan.", 404);
    if (seminar.thesis.studentId !== studentId) {
      throwError("Anda tidak memiliki akses untuk mengubah dokumen seminar ini.", 403);
    }
  }
  if (seminar.status !== "registered") {
    throwError("Dokumen seminar sudah dikunci dan tidak dapat diubah.", 403);
  }

  const existing = await docRepo.findSeminarDocument(seminar.id, requirementId);
  if (existing?.status === "approved") {
    throwError("Dokumen ini sudah disetujui dan tidak dapat diunggah ulang.", 403);
  }

  const uploadsRoot = path.join(process.cwd(), "uploads", "thesis", thesis.id, "seminar", seminar.id);
  await mkdir(uploadsRoot, { recursive: true });
  const storedName = `requirement-${requirementId}-${Date.now()}.pdf`;
  const absolutePath = path.join(uploadsRoot, storedName);
  const relativePath = path.relative(process.cwd(), absolutePath).replace(/\\/g, "/");
  await writeFile(absolutePath, normalizedFile.buffer);

  const now = new Date();
  let saved;
  try {
    saved = await docRepo.upsertSeminarDocument(seminar.id, requirementId, {
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
  if (existing?.filePath && existing.filePath !== relativePath) await safeUnlink(existing.filePath);

  try {
    const adminIds = await coreRepo.findUserIdsByRole("Admin");
    if (adminIds.length > 0) {
      const studentName = thesis.student?.user?.fullName || "Mahasiswa";
      const title = "Dokumen Seminar Hasil Baru";
      const message = `${studentName} telah mengunggah dokumen \"${requirement.name}\".`;
      await Promise.all([
        import("../notification.service.js").then((module) =>
          module.createNotificationsForUsers(adminIds, { title, message })
        ),
        import("../push.service.js").then((module) =>
          module.sendFcmToUsers(adminIds, {
            title,
            body: message,
            data: { seminarId: seminar.id, type: "seminar_doc_upload" },
          })
        ),
      ]);
    }
  } catch (error) {
    console.error("[Notification Error] Gagal mengirim notifikasi upload dokumen seminar:", error.message);
  }

  return mapDocument(saved);
}

export async function viewDocument(seminarId, requirementId) {
  const document = await docRepo.findSeminarDocument(seminarId, requirementId);
  if (!document) throwError("Dokumen belum diunggah.", 404);
  return mapDocument(document);
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

export async function verifyDocument(seminarId, requirementId, { action, notes, userId }) {
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
    thesisSeminarId: seminarId,
    requirementId,
    status: action === "approve" ? "approved" : "declined",
    notes: String(notes || "").trim() || null,
    verifiedBy: userId,
  });
  if (result.kind === "seminar_not_found") throwError("Seminar tidak ditemukan.", 404);
  if (result.kind === "seminar_locked") {
    throwError("Verifikasi dokumen hanya dapat dilakukan saat pendaftaran masih berlangsung.", 400);
  }
  if (result.kind === "requirement_not_found") {
    throwError("Syarat dokumen tidak ditemukan pada tahun akademik yang sedang berjalan.", 400);
  }
  if (result.kind === "document_not_found") throwError("Dokumen belum diunggah.", 404);

  try {
    const title = action === "approve" ? "Dokumen Disetujui" : "Dokumen Ditolak";
    const statusText = action === "approve" ? "disetujui" : "ditolak";
    const message = `Dokumen \"${result.requirement.name}\" untuk seminar hasil Anda telah ${statusText} oleh Admin.${notes ? ` Catatan: ${String(notes).trim()}` : ""}`;
    const notificationJobs = [
      import("../notification.service.js").then((module) =>
        module.createNotificationsForUsers([result.studentUserId], { title, message })
      ),
      import("../push.service.js").then((module) =>
        module.sendFcmToUsers([result.studentUserId], {
          title,
          body: message,
          data: { seminarId, type: "seminar_doc_verified" },
        })
      ),
    ];

    if (result.seminarTransitioned) {
      const kadepIds = await coreRepo.findUserIdsByRole("Ketua Departemen");
      if (kadepIds.length > 0) {
        const kadepTitle = "Penetapan Penguji Seminar Hasil";
        const kadepMessage = "Pendaftaran seminar hasil telah terverifikasi dan siap untuk penetapan dosen penguji.";
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
    seminarTransitioned: result.seminarTransitioned,
    newSeminarStatus: result.newSeminarStatus,
  };
}
