import { z } from "zod";

export const createCurriculumSchema = z.object({
    name: z
        .string({ required_error: "Nama kurikulum wajib diisi" })
        .trim()
        .min(1, "Nama kurikulum tidak boleh kosong")
        .max(255, "Nama kurikulum maksimal 255 karakter"),
    startYear: z
        .number({ required_error: "Tahun mulai wajib diisi" })
        .int("Tahun mulai harus berupa angka tahun")
        .min(2000, "Tahun mulai tidak valid"),
    endYear: z
        .number()
        .int("Tahun akhir harus berupa angka tahun")
        .min(2000, "Tahun akhir tidak valid")
        .nullable()
        .optional(),
}).superRefine((data, ctx) => {
    if (data.endYear !== null && data.endYear !== undefined && data.endYear < data.startYear) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Tahun akhir tidak boleh kurang dari tahun mulai",
            path: ["endYear"],
        });
    }
});

export const updateCurriculumSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, "Nama kurikulum tidak boleh kosong")
        .max(255, "Nama kurikulum maksimal 255 karakter")
        .optional(),
    startYear: z
        .number()
        .int("Tahun mulai harus berupa angka tahun")
        .min(2000, "Tahun mulai tidak valid")
        .optional(),
    endYear: z
        .number()
        .int("Tahun akhir harus berupa angka tahun")
        .min(2000, "Tahun akhir tidak valid")
        .nullable()
        .optional(),
}).superRefine((data, ctx) => {
    if (
        data.startYear !== undefined &&
        data.endYear !== null &&
        data.endYear !== undefined &&
        data.endYear < data.startYear
    ) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Tahun akhir tidak boleh kurang dari tahun mulai",
            path: ["endYear"],
        });
    }
});
