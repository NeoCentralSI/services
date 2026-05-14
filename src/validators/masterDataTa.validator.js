import { z } from "zod";

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
    "Rating": importCellSchema,
}).strict();

export const createThesisSchema = z.object({
    studentId: z.string().uuid(),
    title: z.string().nullable().optional(),
    thesisTopicId: z.string().uuid().nullable().optional(),
    pembimbing1: z.string().uuid(),
    pembimbing2: z.union([z.string().uuid(), z.literal("none")]).nullable().optional(),
}).refine((data) => !data.pembimbing2 || data.pembimbing1 !== data.pembimbing2, {
    message: "Pembimbing 1 dan Pembimbing 2 harus dosen yang berbeda",
    path: ["pembimbing2"],
});

export const updateThesisSchema = z.object({
    title: z.string().nullable().optional(),
    thesisTopicId: z.string().uuid().nullable().optional(),
    academicYearId: z.string().uuid().nullable().optional(),
    startDate: z.string().datetime({ offset: true }).nullable().optional().or(z.date().nullable().optional()),
    rating: z.enum(["ONGOING", "SLOW", "AT_RISK", "FAILED", "CANCELLED"]).optional(),
    pembimbing1: z.string().uuid().optional(),
    pembimbing2: z.union([z.string().uuid(), z.literal("none")]).nullable().optional(),
    supervisors: z.array(
        z.object({
            lecturerId: z.string(),
            roleId: z.string()
        })
    ).optional()
}).refine((data) => !data.pembimbing1 || !data.pembimbing2 || data.pembimbing1 !== data.pembimbing2, {
    message: "Pembimbing 1 dan Pembimbing 2 harus dosen yang berbeda",
    path: ["pembimbing2"],
});

export const importThesesSchema = z.object({
    rows: z.array(importThesisRowSchema),
});
