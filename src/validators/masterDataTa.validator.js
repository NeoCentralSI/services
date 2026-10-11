import { z } from "zod";
import { academicYearIdSchema } from "./common.validator.js";

const thesisLifecycleStatusSchema = z.enum(["proposal", "research", "on_leave", "completed", "failed"]);

const importCellSchema = z.union([z.string(), z.number(), z.date(), z.null()]).optional();

const importThesisRowSchema = z.object({
    "NIM": importCellSchema,
    "Tahun Ajaran": importCellSchema,
    "Topik": importCellSchema,
    "Status": importCellSchema,
    "Pembimbing 1": importCellSchema,
    "Pembimbing 2": importCellSchema,
    "Tanggal Mulai": importCellSchema,
    "Judul Tugas Akhir": importCellSchema,
    "Rating": importCellSchema, // ignored (K21: rating is computed)
    "Alasan Penghentian": importCellSchema,
    "Catatan Penghentian": importCellSchema,
    "No": importCellSchema,
    "Nama Mahasiswa": importCellSchema,
    "Nama": importCellSchema,
}).passthrough();

// K21: a stopped thesis needs a reason (validated again in thesisLifecycle.service).
const terminationReasonSchema = z.enum(["supervision_evaluation", "withdrawn", "dropped_out", "other"]);
const terminationNoteSchema = z.string().trim().max(2000, "Catatan penghentian maksimal 2000 karakter").nullable().optional();

export const createThesisSchema = z.object({
    studentId: z.string().uuid(),
    title: z.string().nullable().optional(),
    thesisTopicId: z.string().uuid().nullable().optional(),
    pembimbing1: z.string().uuid({ message: "Pembimbing 1 wajib diisi" }),
    pembimbing2: z.union([z.string().uuid(), z.literal("none")]).nullable().optional(),
    // K15: explicit thesis status; defaults to research (running TA) in the service.
    status: thesisLifecycleStatusSchema.optional(),
    terminationReason: terminationReasonSchema.optional(),
    terminationNote: terminationNoteSchema,
    // K21: rating is computed by the rating job; unknown keys (e.g. rating) are stripped.
}).refine((data) => !data.pembimbing2 || data.pembimbing1 !== data.pembimbing2, {
    message: "Pembimbing 1 dan Pembimbing 2 harus dosen yang berbeda",
    path: ["pembimbing2"],
});

export const updateThesisSchema = z.object({
    title: z.string().nullable().optional(),
    thesisTopicId: z.string().uuid().nullable().optional(),
    academicYearId: academicYearIdSchema.nullable().optional(),
    startDate: z.string().datetime({ offset: true }).nullable().optional().or(z.date().nullable().optional()),
    status: thesisLifecycleStatusSchema.optional(),
    terminationReason: terminationReasonSchema.optional(),
    terminationNote: terminationNoteSchema,
    pembimbing1: z.string().uuid().optional(),
    pembimbing2: z.union([z.string().uuid(), z.literal("none")]).nullable().optional(),
}).refine((data) => !data.pembimbing1 || !data.pembimbing2 || data.pembimbing1 !== data.pembimbing2, {
    message: "Pembimbing 1 dan Pembimbing 2 harus dosen yang berbeda",
    path: ["pembimbing2"],
});

export const importThesesSchema = z.object({
    rows: z.array(importThesisRowSchema),
});
