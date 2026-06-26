import path from "path";
import { mkdir, writeFile, unlink } from "fs/promises";
import { getStudentByUserId } from "../../repositories/thesisGuidance/student.guidance.repository.js";
import * as docRepo from "../../repositories/thesis-seminar/doc.repository.js";
import * as coreRepo from "../../repositories/thesis-seminar/thesis-seminar.repository.js";
import prisma from "../../config/prisma.js";
import { ENV } from "../../config/env.js";

const MIN_BIMBINGAN = ENV.SEMINAR_MIN_BIMBINGAN;
const MIN_KEHADIRAN = ENV.SEMINAR_MIN_KEHADIRAN;

// ============================================================
// CONSTANTS
// ============================================================

const DOC_TYPE_CONFIG = {
  "Laporan Tugas Akhir": { accept: [".pdf"], label: "Laporan Tugas Akhir (PDF)" },
  "Slide Presentasi": { accept: [".pdf"], label: "Slide Presentasi (PDF)" },
  "Draft Jurnal TEKNOSI": { accept: [".pdf"], label: "Draft Jurnal TEKNOSI (PDF)" },
};

// ============================================================
// HELPERS
// ============================================================

function throwError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
}

function validateFileExtension(file, documentTypeName) {
  const config = DOC_TYPE_CONFIG[documentTypeName];
  if (!config) throwError(`Tipe dokumen "${documentTypeName}" tidak valid.`, 400);
  const ext = path.extname(file.originalname).toLowerCase();
  if (!config.accept.includes(ext)) {
    throwError(`File untuk ${config.label} harus berformat ${config.accept.join(" atau ").toUpperCase()}.`, 400);
  }
}

async function getOrCreateSeminar(thesis) {
  const existing = thesis.thesisSeminars?.[0];
  if (existing && !["failed", "cancelled"].includes(existing.status)) return existing;

  // Verify requirements before auto-registration
  const student = await prisma.student.findUnique({ where: { id: thesis.studentId } });
  const completedGuidances = await prisma.thesisGuidance.count({ where: { thesisId: thesis.id, status: "completed" } });
  const seminarAttendance = await coreRepo.countSeminarAttendance(thesis.studentId);
  const supervisors = await prisma.thesisSupervisors.findMany({ where: { thesisId: thesis.id } });
  const allSupervisorsReady = supervisors.length > 0 && supervisors.every((s) => s.seminarReady);

  if (completedGuidances < MIN_BIMBINGAN || seminarAttendance < MIN_KEHADIRAN || !student?.researchMethodCompleted || !allSupervisorsReady) {
    throwError("Anda belum memenuhi persyaratan pendaftaran seminar hasil.", 403);
  }

  const created = await coreRepo.createThesisSeminar(thesis.id);
  return { id: created.id, status: created.status };
}

// ============================================================
// PUBLIC: Document Types
// ============================================================

export async function getDocumentTypes() {
  const types = await docRepo.ensureSeminarDocumentTypes();
  return Object.entries(types).map(([name, dt]) => ({
    id: dt.id,
    name: dt.name,
    accept: DOC_TYPE_CONFIG[name]?.accept || [],
    label: DOC_TYPE_CONFIG[name]?.label || name,
  }));
}

// ============================================================
// PUBLIC: Get Documents
// ============================================================

export async function getDocuments(seminarId) {
  const seminar = await coreRepo.findSeminarBasicById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);
  const docs = await docRepo.findSeminarDocuments(seminarId);
  return {
    seminarId,
    documents: docs.map((d) => ({
      thesisSeminarId: d.thesisSeminarId,
      documentTypeId: d.documentTypeId,
      documentId: d.documentId,
      status: d.status,
      submittedAt: d.submittedAt,
      verifiedAt: d.verifiedAt,
      notes: d.notes,
      verifiedBy: d.verifier?.fullName || null,
      fileName: d.document?.fileName || null,
      filePath: d.document?.filePath || null,
    })),
  };
}

// ============================================================
// PUBLIC: Upload Document
// ============================================================

export async function uploadDocument(seminarId, studentId, file, docTypeName) {
  if (!file || !file.buffer) throwError("File tidak ditemukan.", 400);
  const originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
  const normalizedFile = { ...file, originalname: originalName };

  const docType = await docRepo.getOrCreateDocumentType(docTypeName);
  validateFileExtension(normalizedFile, docTypeName);

  // If seminarId provided, use it; otherwise resolve from student
  let targetSeminarId = seminarId;
  let thesisId;

  if (!targetSeminarId || targetSeminarId === "active") {
    const thesis = await coreRepo.getThesisWithSeminar(studentId);
    if (!thesis) throwError("Anda belum memiliki tugas akhir yang terdaftar.", 404);
    thesisId = thesis.id;
    const seminar = await getOrCreateSeminar(thesis);
    if (seminar.status !== "registered") throwError("Dokumen sudah tidak dapat diubah.", 403);
    targetSeminarId = seminar.id;
  } else {
    const seminar = await coreRepo.findSeminarBasicById(targetSeminarId);
    if (!seminar) throwError("Seminar tidak ditemukan.", 404);
    if (seminar.status !== "registered") throwError("Dokumen sudah tidak dapat diubah.", 403);
    thesisId = seminar.thesisId;
  }

  const existing = await docRepo.findSeminarDocument(targetSeminarId, docType.id);
  if (existing?.status === "approved") {
    throwError("Dokumen ini sudah diverifikasi dan tidak dapat diubah.", 403);
  }

  // Save file to disk
  const uploadsRoot = path.join(process.cwd(), "uploads", "thesis", thesisId, "seminar", targetSeminarId);
  await mkdir(uploadsRoot, { recursive: true });

  // Delete old file if re-uploading
  if (existing) {
    try {
      const oldDoc = await docRepo.findDocumentById(existing.documentId);
      if (oldDoc?.filePath) await unlink(path.join(process.cwd(), oldDoc.filePath));
      await docRepo.deleteDocument(existing.documentId);
    } catch (e) { console.warn("Could not delete old seminar document:", e.message); }
  }

  const ext = path.extname(originalName).toLowerCase();
  const safeName = `${docTypeName.replace(/\s+/g, "-").toLowerCase()}${ext}`;
  const filePath = path.join(uploadsRoot, safeName);
  await writeFile(filePath, file.buffer);
  const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");

  const doc = await docRepo.createDocument({
    userId: studentId,
    documentTypeId: docType.id,
    filePath: relPath,
    fileName: originalName,
  });

  const now = new Date();
  if (existing) {
    await docRepo.updateSeminarDocument(targetSeminarId, docType.id, {
      documentId: doc.id, submittedAt: now, status: "submitted",
      notes: null, verifiedBy: null, verifiedAt: null,
    });
  } else {
    await docRepo.createSeminarDocument({
      thesisSeminarId: targetSeminarId, documentTypeId: docType.id,
      documentId: doc.id, submittedAt: now, status: "submitted",
    });
  }

  // Notify Admins
  try {
    const adminIds = await coreRepo.findUserIdsByRole("Admin");
    if (adminIds.length > 0) {
      const student = await prisma.user.findUnique({ where: { id: studentId }, select: { fullName: true } });
      const studentName = student?.fullName || "Mahasiswa";
      const title = "Dokumen Seminar Hasil Baru";
      const message = `${studentName} telah mengunggah dokumen "${docTypeName}".`;

      await Promise.all([
        import("../notification.service.js").then(m => m.createNotificationsForUsers(adminIds, { title, message })),
        import("../push.service.js").then(m => m.sendFcmToUsers(adminIds, { title, body: message, data: { seminarId: targetSeminarId, type: "seminar_doc_upload" } }))
      ]);
    }
  } catch (err) {
    console.error("[FCM/Notification Error] Failed to notify admins on seminar doc upload:", err.message);
  }

  return { documentTypeId: docType.id, documentId: doc.id, fileName: originalName, filePath: relPath, status: "submitted", submittedAt: now };
}

// ============================================================
// PUBLIC: View Document
// ============================================================

export async function viewDocument(seminarId, docTypeId) {
  const semDoc = await docRepo.findSeminarDocument(seminarId, docTypeId);
  if (!semDoc) throwError("Dokumen belum diupload.", 404);

  const doc = await docRepo.findDocumentById(semDoc.documentId);
  if (!doc) throwError("File dokumen tidak ditemukan.", 404);

  return {
    documentTypeId: semDoc.documentTypeId,
    documentId: semDoc.documentId,
    status: semDoc.status,
    submittedAt: semDoc.submittedAt,
    verifiedAt: semDoc.verifiedAt,
    notes: semDoc.notes,
    fileName: doc.fileName,
    filePath: doc.filePath,
  };
}

// ============================================================
// PUBLIC: Verify Document (Admin approve/decline)
// ============================================================

export async function verifyDocument(seminarId, docTypeId, { action, notes, userId }) {
  if (!["approve", "decline"].includes(action)) throwError('Action harus "approve" atau "decline".', 400);

  const seminar = await coreRepo.findSeminarBasicById(seminarId);
  if (!seminar) throwError("Seminar tidak ditemukan.", 404);
  if (seminar.status !== "registered") throwError("Verifikasi dokumen hanya dapat dilakukan saat seminar berstatus 'registered'.", 400);

  const docWithFile = await docRepo.findDocumentWithFile(seminarId, docTypeId);
  if (!docWithFile) throwError("Dokumen tidak ditemukan untuk di-verifikasi.", 404);

  const docTypes = await docRepo.getSeminarDocumentTypes();
  const docType = docTypes.find(dt => dt.id === docTypeId);
  const docTypeName = docType ? docType.name : "Dokumen Persyaratan";

  const newStatus = action === "approve" ? "approved" : "declined";
  await docRepo.updateDocumentStatus(seminarId, docTypeId, { status: newStatus, notes: notes || null, verifiedBy: userId });

  const thesis = await coreRepo.findThesisById(seminar.thesisId);

  // 1. Notify student about this specific document status
  try {
    if (thesis?.studentId) {
      const title = action === "approve" ? "Dokumen Disetujui" : "Dokumen Ditolak";
      const statusText = action === "approve" ? "disetujui" : "ditolak";
      const message = `Dokumen "${docTypeName}" untuk seminar hasil Anda telah ${statusText} oleh Admin.${notes ? ` Catatan: ${notes}` : ""}`;

      await Promise.all([
        import("../notification.service.js").then(m => m.createNotificationsForUsers([thesis.studentId], { title, message })),
        import("../push.service.js").then(m => m.sendFcmToUsers([thesis.studentId], { title, body: message, data: { seminarId, type: "seminar_doc_verified" } }))
      ]);
    }
  } catch (err) {
    console.error("[Notification Error] Failed to notify student on doc verification:", err.message);
  }

  // 2. Auto-transition to 'verified' when all docs approved
  let seminarTransitioned = false;
  if (action === "approve") {
    const allDocs = await docRepo.countDocumentsByStatus(seminarId);
    // Important: we use the updated count including the current action
    const approvedCount = allDocs.filter((d) => d.documentTypeId === docTypeId ? true : d.status === "approved").length;

    if (approvedCount >= docTypes.length) {
      await coreRepo.updateSeminar(seminarId, { status: "verified", verifiedAt: new Date() });
      seminarTransitioned = true;

      // 2a. Notify student that seminar is now verified
      try {
        const student = await prisma.user.findUnique({ where: { id: thesis.studentId }, select: { fullName: true } });
        const studentName = student?.fullName || "Mahasiswa";

        const title = "Seminar Hasil Terverifikasi";
        const message = "Seluruh dokumen persyaratan seminar hasil Anda telah diverifikasi. Menunggu penetapan penguji.";
        await Promise.all([
          import("../notification.service.js").then(m => m.createNotificationsForUsers([thesis.studentId], { title, message })),
          import("../push.service.js").then(m => m.sendFcmToUsers([thesis.studentId], { title, body: message, data: { seminarId, type: "seminar_verified" } }))
        ]);

        // 2b. Notify Ketua Departemen
        const kadepIds = await coreRepo.findUserIdsByRole("Ketua Departemen");
        if (kadepIds.length > 0) {
          const kadepTitle = "Penetapan Penguji Seminar Hasil";
          const kadepMsg = `Mahasiswa ${studentName} telah melewati verifikasi dokumen seminar hasil. Mohon untuk melakukan penetapan dosen penguji.`;
          await Promise.all([
            import("../notification.service.js").then(m => m.createNotificationsForUsers(kadepIds, { title: kadepTitle, message: kadepMsg })),
            import("../push.service.js").then(m => m.sendFcmToUsers(kadepIds, { title: kadepTitle, body: kadepMsg, data: { seminarId, type: "seminar_need_examiner" } }))
          ]);
        }
      } catch (err) {
        console.error("[Notification Error] Failed to notify student/kadep on seminar verification:", err.message);
      }
    }
  }

  return { documentTypeId: docTypeId, status: newStatus, seminarTransitioned, newSeminarStatus: seminarTransitioned ? "verified" : seminar.status };
}
