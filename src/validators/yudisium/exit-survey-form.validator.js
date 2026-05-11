import { z } from "zod";

export const createExitSurveyFormSchema = z.object({
  name: z
    .string({ required_error: "Nama form wajib diisi" })
    .min(1, "Nama form tidak boleh kosong")
    .max(255, "Nama form maksimal 255 karakter"),
  description: z.string().max(65535).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const updateExitSurveyFormSchema = z.object({
  name: z
    .string()
    .min(1, "Nama form tidak boleh kosong")
    .max(255, "Nama form maksimal 255 karakter")
    .optional(),
  description: z.string().max(65535).optional().nullable(),
  isActive: z.boolean().optional(),
});
