/**
 * Extracted service functions that were previously inline Prisma calls
 * inside thesisGuidance.route.js. Grouped here to keep layered architecture.
 */
import prisma from "../../config/prisma.js";
import { ROLES } from "../../constants/roles.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";
import * as studentRepo from "../../repositories/thesisGuidance/student.guidance.repository.js";

export async function getSupervisorBusySlots(supervisorId, start, end) {
  const slots = await prisma.thesisGuidance.findMany({
    where: {
      supervisorId,
      requestedDate: { gte: start, lte: end },
      status: { in: ["requested", "accepted"] },
    },
    select: {
      id: true,
      requestedDate: true,
      duration: true,
      status: true,
      thesis: {
        select: {
          student: {
            select: { user: { select: { fullName: true } } },
          },
        },
      },
    },
  });
  return slots.map((s) => ({
    id: s.id,
    start: s.requestedDate?.toISOString(),
    end: new Date(s.requestedDate.getTime() + (s.duration || 60) * 60000).toISOString(),
    duration: s.duration,
    status: s.status,
    studentName: s.thesis?.student?.user?.fullName ?? null,
  }));
}

export async function getMyThesisDetail(userId) {
  const thesis = await studentRepo.getActiveThesisForStudent(userId);
  if (!thesis) throw new NotFoundError("Tugas Akhir tidak ditemukan");

  const [supervisors, student] = await Promise.all([
    studentRepo.getSupervisorsForThesis(thesis.id),
    prisma.student.findUnique({
      where: { id: userId },
      include: { user: { select: { fullName: true, identityNumber: true, email: true } } },
    }),
  ]);
  const guidanceCount = await prisma.thesisGuidance.count({
    where: { thesisId: thesis.id, status: "completed" },
  });
  const milestones = await prisma.thesisMilestone.findMany({
    where: { thesisId: thesis.id, status: { not: "deleted" } },
    select: { status: true },
  });
  const totalM = milestones.length;
  const completedM = milestones.filter((m) => m.status === "completed").length;

  return {
    id: thesis.id,
    title: thesis.title,
    status: thesis.thesisStatus?.name ?? null,
    rating: thesis.rating ?? null,
    startDate: thesis.startDate,
    deadlineDate: thesis.deadlineDate,
    createdAt: thesis.createdAt,
    updatedAt: thesis.updatedAt,
    student: {
      id: userId,
      name: student?.user?.fullName ?? null,
      nim: student?.user?.identityNumber ?? null,
      email: student?.user?.email ?? null,
    },
    topic: null,
    academicYear: null,
    document: thesis.document,
    proposalDocument: null,
    uploadedFiles: [],
    supervisors: supervisors.map((s) => ({
      id: s.lecturerId,
      name: s.lecturer?.user?.fullName ?? null,
      email: s.lecturer?.user?.email ?? null,
      role: s.role?.name ?? null,
      avatarUrl: s.lecturer?.user?.avatarUrl ?? null,
    })),
    examiners: [],
    stats: {
      totalGuidances: guidanceCount,
      totalMilestones: totalM,
      completedMilestones: completedM,
      milestoneProgress: totalM > 0 ? Math.round((completedM / totalM) * 100) : 0,
    },
    seminarApproval: { pembimbing1: false, pembimbing2: false },
  };
}

export async function updateThesisTitle(userId, title) {
  const thesis = await studentRepo.getActiveThesisForStudent(userId);
  if (!thesis) throw new NotFoundError("Tugas Akhir tidak ditemukan");
  if (!title) throw new BadRequestError("Judul wajib diisi");

  const updated = await prisma.thesis.update({
    where: { id: thesis.id },
    data: { title },
  });
  return { id: updated.id, title: updated.title, updatedAt: updated.updatedAt };
}

export async function generateLogbookPdf(userId) {
  const thesis = await studentRepo.getActiveThesisForStudent(userId);
  if (!thesis) throw new NotFoundError("Tugas Akhir tidak ditemukan");

  const guidances = await prisma.thesisGuidance.findMany({
    where: { thesisId: thesis.id, status: "completed" },
    include: {
      supervisor: {
        include: { user: { select: { fullName: true, identityNumber: true } } },
      },
    },
    orderBy: { approvedDate: "asc" },
  });

  if (guidances.length === 0) {
    throw new BadRequestError("Belum ada sesi bimbingan selesai untuk digenerate.");
  }

  const student = await prisma.student.findUnique({
    where: { id: userId },
    include: { user: { select: { fullName: true, identityNumber: true } } },
  });

  const supervisors = await studentRepo.getSupervisorsForThesis(thesis.id);
  const dospem1 = supervisors.find((s) => s.role?.name === ROLES.PEMBIMBING_1);
  const dospem2 = supervisors.find((s) => s.role?.name === ROLES.PEMBIMBING_2);

  const { createSimpleLetterPdf } = await import("../../utils/pdf.util.js");

  const rows = guidances.map((g, i) => {
    const dateStr = g.approvedDate
      ? g.approvedDate.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
      : "-";
    const notes = [g.sessionSummary, g.actionItems].filter(Boolean).join("\n\nTindak Lanjut: ");
    return `${i + 1}. ${dateStr}\n   ${notes || "Sesi bimbingan"}`;
  });

  const pdfBuffer = await createSimpleLetterPdf({
    title: "Logbook Bimbingan Tugas Akhir (TA-06)",
    subtitle: `${student?.user?.fullName ?? "-"} (${student?.user?.identityNumber ?? "-"}) — ${thesis.title ?? "Judul belum ditentukan"}`,
    lines: [
      `Jumlah Sesi Bimbingan: ${guidances.length}`,
      `Dosen Pembimbing 1: ${dospem1?.lecturer?.user?.fullName ?? "-"}`,
      dospem2 ? `Dosen Pembimbing 2: ${dospem2.lecturer?.user?.fullName ?? "-"}` : null,
      "",
      "=== Riwayat Bimbingan ===",
      "",
      ...rows,
      "",
      `Dokumen ini digenerate secara otomatis oleh SIMPTA pada ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}.`,
    ].filter((l) => l !== null),
    fileLabel: "SIMPTA — Logbook Bimbingan Digital (Pengganti TA-06)",
  });

  return { pdfBuffer, nim: student?.user?.identityNumber ?? "unknown" };
}

export async function cancelGuidanceByLecturer(guidanceId, reason) {
  return prisma.thesisGuidance.update({
    where: { id: guidanceId },
    data: { status: "cancelled", rejectionReason: reason || null },
  });
}

export async function rejectSessionSummary(guidanceId, reason) {
  return prisma.thesisGuidance.update({
    where: { id: guidanceId },
    data: {
      status: "accepted",
      supervisorFeedback: reason || "Ringkasan perlu diperbaiki",
    },
  });
}

export async function updateSupervisorFeedback(guidanceId, feedback) {
  return prisma.thesisGuidance.update({
    where: { id: guidanceId },
    data: { supervisorFeedback: feedback },
  });
}

export async function getLecturerGuidanceHistory(studentId, lecturerId) {
  return prisma.thesisGuidance.findMany({
    where: {
      thesis: { studentId },
      supervisorId: lecturerId,
      status: { not: "deleted" },
    },
    include: {
      supervisor: { include: { user: { select: { fullName: true } } } },
    },
    orderBy: { requestedDate: "desc" },
  });
}
