import { z } from "zod";

const nullableString = (schema) =>
  z.preprocess((value) => (value === "" ? null : value), schema.optional().nullable());

const requestFields = {
  lecturerId: nullableString(z.string().min(1, "Pilih dosen pembimbing")),
  topicId: z.string().min(1, "Pilih topik penelitian"),
  proposedTitle: z.string().min(3, "Judul tugas akhir wajib diisi").max(255),
  backgroundSummary: z.string().min(10, "Latar belakang singkat wajib diisi").max(5000),
  problemStatement: z.string().min(10, "Tujuan / permasalahan wajib diisi").max(5000),
  proposedSolution: z.string().min(10, "Rencana solusi wajib diisi").max(5000),
  researchObject: z.string().min(3, "Objek penelitian wajib diisi").max(255),
  researchPermitStatus: z.enum(["approved", "in_process", "not_approved"], {
    message: "Status izin penelitian wajib dipilih",
  }),
  justificationText: nullableString(z.string().max(5000)),
  studentJustification: nullableString(z.string().max(5000)),
  attachmentId: nullableString(z.string()),
};

export const submitRequestSchema = z.object({
  ...requestFields,
});

export const saveDraftSchema = z.object({
  lecturerId: requestFields.lecturerId,
  topicId: nullableString(z.string().min(1, "Pilih topik penelitian")),
  proposedTitle: nullableString(z.string().max(255)),
  backgroundSummary: nullableString(z.string().max(5000)),
  problemStatement: nullableString(z.string().max(5000)),
  proposedSolution: nullableString(z.string().max(5000)),
  researchObject: nullableString(z.string().max(255)),
  researchPermitStatus: nullableString(z.enum(["approved", "in_process", "not_approved"])),
  justificationText: requestFields.justificationText,
  studentJustification: requestFields.studentJustification,
  attachmentId: requestFields.attachmentId,
});

export const respondSchema = z.object({
  action: z.enum(["accept", "reject"], { message: "Action harus 'accept' atau 'reject'" }),
  approvalNote: z.string().max(2000).optional().nullable(),
  lecturerOverquotaReason: z.string().max(2000).optional().nullable(),
  rejectionReason: z.string().max(1000).optional().nullable(),
});

export const kadepDecideSchema = z.object({
  action: z.enum(["approve", "reject", "override", "redirect", "request_revision"], {
    message: "Action harus 'approve', 'reject', 'override', 'redirect', atau 'request_revision'",
  }),
  targetLecturerId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
