import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import prisma from "../../config/prisma.js";
import { AppError, BadRequestError, ForbiddenError, NotFoundError } from "../../utils/errors.js";
import * as studentRepo from "../../repositories/thesisGuidance/student.guidance.repository.js";
import * as proposalRepo from "../../repositories/thesisGuidance/proposal.repository.js";
import { assertTa04GuidanceAuthorized } from "../ta04Authorization.service.js";

const MAX_CONTENT_LENGTH = 12000;

function assertInformalLogDelegate() {
  const delegate = prisma.thesisStudentInformalLog;
  if (!delegate || typeof delegate.findMany !== "function") {
    throw new AppError(
      "Prisma Client belum memuat model catatan informal (thesis_student_informal_logs). Hentikan server Node yang memakai query engine, lalu jalankan `pnpm exec prisma generate` di folder `services` dan restart API.",
      503,
    );
  }
}

function mapInformalLogItem(r) {
  return {
    id: r.id,
    content: r.content,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    document: r.document
      ? {
          id: r.document.id,
          fileName: r.document.fileName,
          url: r.document.filePath ? `/${r.document.filePath}` : null,
          fileSize: r.document.fileSize,
          mimeType: r.document.mimeType,
        }
      : null,
  };
}

const INFORMAL_LOG_DOCUMENT_SELECT = {
  document: { select: { id: true, fileName: true, filePath: true, fileSize: true, mimeType: true } },
};

async function assertMetopenInformalEligibility(userId) {
  const student = await prisma.student.findUnique({
    where: { id: userId },
    select: { takingThesisCourse: true, eligibleMetopen: true },
  });
  if (!student) throw new NotFoundError("Data mahasiswa tidak ditemukan");
  if (student.takingThesisCourse === true) {
    throw new ForbiddenError(
      "Catatan informal Metopen hanya untuk mahasiswa yang belum tercatat mengambil mata kuliah Tugas Akhir. Gunakan modul Bimbingan di Tugas Akhir.",
    );
  }
  if (student.eligibleMetopen === false) {
    throw new ForbiddenError("Akses Metode Penelitian tidak aktif untuk akun ini.");
  }
}

export async function listInformalLogsForStudent(userId) {
  assertInformalLogDelegate();
  await assertMetopenInformalEligibility(userId);
  const thesis = await studentRepo.getActiveThesisForStudent(userId);
  if (!thesis) return { thesisId: null, items: [] };

  await assertTa04GuidanceAuthorized(thesis.id);

  const rows = await prisma.thesisStudentInformalLog.findMany({
    where: { thesisId: thesis.id, studentId: userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: INFORMAL_LOG_DOCUMENT_SELECT,
  });

  return {
    thesisId: thesis.id,
    items: rows.map(mapInformalLogItem),
  };
}

/**
 * FR-LOG-08 / canon v2.9 §5.5: P1/P2 aktif read-only setelah hasOfficialSupervisor.
 * Tidak ada bypass Koordinator Metopen / KaDep / Sekdep.
 */
export async function listInformalLogsForLecturer(lecturerUserId, thesisId) {
  assertInformalLogDelegate();

  const thesis = await proposalRepo.findThesisById(thesisId);
  if (!thesis) throw new NotFoundError("Tugas akhir tidak ditemukan");

  const isSupervisor = await proposalRepo.findThesisSupervisor(thesisId, lecturerUserId);
  if (!isSupervisor) {
    throw new ForbiddenError(
      "Hanya Pembimbing 1 atau Pembimbing 2 aktif yang dapat melihat catatan informal mahasiswa ini",
    );
  }

  await assertTa04GuidanceAuthorized(thesisId);

  const rows = await prisma.thesisStudentInformalLog.findMany({
    where: { thesisId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: INFORMAL_LOG_DOCUMENT_SELECT,
  });

  return {
    thesisId,
    items: rows.map(mapInformalLogItem),
  };
}

function sanitizeFileName(originalName) {
  const base = path.basename(String(originalName || "lampiran"));
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function createInformalLogForStudent(userId, { content }, file) {
  assertInformalLogDelegate();
  await assertMetopenInformalEligibility(userId);
  const trimmed = String(content ?? "").trim();
  if (!trimmed) throw new BadRequestError("Isi catatan wajib diisi.");
  if (trimmed.length > MAX_CONTENT_LENGTH) {
    throw new BadRequestError(`Catatan maksimal ${MAX_CONTENT_LENGTH} karakter.`);
  }

  const thesis = await studentRepo.getActiveThesisForStudent(userId);
  if (!thesis) throw new NotFoundError("Tidak ada tugas akhir aktif");

  if (thesis.studentId !== userId) {
    throw new ForbiddenError("Akses ditolak.");
  }

  await assertTa04GuidanceAuthorized(thesis.id);

  let documentId = null;
  if (file?.buffer?.length) {
    const uploadsDir = path.join(process.cwd(), "uploads", "thesis", thesis.id, "informal-log");
    await fs.mkdir(uploadsDir, { recursive: true });
    const uniqueId = randomUUID();
    const safeOriginal = sanitizeFileName(file.originalname);
    const diskName = `${uniqueId}-${safeOriginal}`;
    const relativeFilePath = `uploads/thesis/${thesis.id}/informal-log/${diskName}`;
    const absolutePath = path.join(uploadsDir, diskName);
    await fs.writeFile(absolutePath, file.buffer, { flag: "wx" });

    const doc = await prisma.document.create({
      data: {
        userId,
        filePath: relativeFilePath,
        fileName: safeOriginal,
        fileSize: file.size,
        mimeType: file.mimetype || "application/octet-stream",
      },
      select: { id: true },
    });
    documentId = doc.id;
  }

  const created = await prisma.thesisStudentInformalLog.create({
    data: {
      thesisId: thesis.id,
      studentId: userId,
      content: trimmed,
      documentId,
    },
    include: INFORMAL_LOG_DOCUMENT_SELECT,
  });

  return mapInformalLogItem(created);
}
