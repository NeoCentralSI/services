import { z } from "zod";

const assessmentRoleSchema = z.enum(["default", "supervisor"]);

export const createCriteriaSchema = z.object({
  metopenCpmkId: z.string().uuid("CPMK tidak valid"),
  name: z.string().min(1, "Nama kriteria wajib diisi").max(255, "Nama kriteria maksimal 255 karakter"),
  role: assessmentRoleSchema,
  maxScore: z.number().int().min(0, "Skor maksimal minimal 0").max(100, "Skor maksimal terlalu besar"),
  displayOrder: z.number().int().min(0).optional(),
});

export const updateCriteriaSchema = createCriteriaSchema.partial();

export const createRubricSchema = z
  .object({
    minScore: z.number().int().min(0, "Skor minimal tidak boleh negatif"),
    maxScore: z.number().int().min(0, "Skor maksimal tidak boleh negatif"),
    description: z.string().min(1, "Deskripsi rubrik wajib diisi").max(5000, "Deskripsi rubrik terlalu panjang"),
    displayOrder: z.number().int().min(0).optional(),
  })
  .refine((payload) => payload.maxScore >= payload.minScore, {
    message: "Skor maksimal harus lebih besar atau sama dengan skor minimal",
    path: ["maxScore"],
  });

export const updateRubricSchema = z
  .object({
    minScore: z.number().int().min(0, "Skor minimal tidak boleh negatif").optional(),
    maxScore: z.number().int().min(0, "Skor maksimal tidak boleh negatif").optional(),
    description: z.string().min(1, "Deskripsi rubrik wajib diisi").max(5000, "Deskripsi rubrik terlalu panjang").optional(),
    displayOrder: z.number().int().min(0).optional(),
  })
  .refine(
    (payload) =>
      payload.minScore === undefined ||
      payload.maxScore === undefined ||
      payload.maxScore >= payload.minScore,
    {
      message: "Skor maksimal harus lebih besar atau sama dengan skor minimal",
      path: ["maxScore"],
    }
  );

export const reorderCriteriaSchema = z.object({
  cpmkId: z.string({ required_error: "CPMK wajib dipilih" }).uuid("CPMK tidak valid"),
  orderedIds: z
    .array(z.string().uuid("ID tidak valid"))
    .min(1, "Minimal 1 item"),
});

export const reorderRubricsSchema = z.object({
  criteriaId: z.string({ required_error: "Kriteria wajib dipilih" }).uuid("Kriteria tidak valid"),
  orderedIds: z
    .array(z.string().uuid("ID tidak valid"))
    .min(1, "Minimal 1 item"),
});

export const createMetopenCpmkSchema = z.object({
  code: z.string().min(1, "Kode CPMK wajib diisi").max(50, "Kode CPMK maksimal 50 karakter"),
  description: z.string().min(1, "Deskripsi CPMK wajib diisi").max(255, "Deskripsi CPMK maksimal 255 karakter"),
  academicYearId: z.string().uuid("Tahun akademik tidak valid").optional(),
});
