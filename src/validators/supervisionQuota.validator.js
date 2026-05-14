import { z } from "zod";

/** Body schema for PUT set default quota */
export const setDefaultQuotaBodySchema = z.object({
  quotaMax: z
    .number()
    .int()
    .min(1, "Kuota maksimum minimal 1")
    .max(100, "Kuota maksimum maksimal 100"),
  quotaSoftLimit: z
    .number()
    .int()
    .min(0, "Soft limit minimal 0")
    .max(100, "Soft limit maksimal 100"),
});

/** Body schema for PATCH update lecturer quota */
export const updateLecturerQuotaBodySchema = z.object({
  quotaMax: z.number().int().min(0).max(100).optional(),
  quotaSoftLimit: z.number().int().min(0).max(100).optional(),
  notes: z.string().max(500).optional().nullable(),
});

/** academicYearId: UUID atau slug tahun-YYYY-ganjil|genap */
export const academicYearIdParamSchema = z
  .string()
  .min(1, "academicYearId wajib diisi")
  .refine(
    (val) => {
      if (z.string().uuid().safeParse(val).success) return true;
      const slugMatch = /^tahun-(\d{4})-(ganjil|genap)$/.exec(val);
      return !!slugMatch;
    },
    { message: "academicYearId harus UUID atau format tahun-YYYY-ganjil|genap" }
  );
