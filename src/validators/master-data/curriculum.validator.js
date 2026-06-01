import { z } from "zod";

export const createCurriculumSchema = z.object({
    name: z
        .string({ required_error: "Nama kurikulum wajib diisi" })
        .min(1, "Nama kurikulum tidak boleh kosong")
        .max(255, "Nama kurikulum maksimal 255 karakter"),
    startYear: z
        .number({ required_error: "Tahun mulai wajib diisi" })
        .int("Tahun mulai harus berupa angka tahun"),
    endYear: z
        .number()
        .int("Tahun akhir harus berupa angka tahun")
        .nullable()
        .optional(),
});

export const updateCurriculumSchema = z.object({
    name: z
        .string()
        .min(1, "Nama kurikulum tidak boleh kosong")
        .max(255, "Nama kurikulum maksimal 255 karakter")
        .optional(),
    startYear: z
        .number()
        .int("Tahun mulai harus berupa angka tahun")
        .optional(),
    endYear: z
        .number()
        .int("Tahun akhir harus berupa angka tahun")
        .nullable()
        .optional(),
});
