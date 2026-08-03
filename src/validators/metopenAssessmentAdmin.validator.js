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
  code: z
    .string()
    .trim()
    .min(5, "Kode CPMK terlalu pendek")
    .max(20, "Kode CPMK maksimal 20 karakter")
    .regex(
      /^CPMK[- ]?\d{1,2}$/i,
      "Kode harus berformat resmi, contoh: CPMK-01, CPMK-02, CPMK-03 (dipakai export nilai SIA)",
    ),
  description: z
    .string()
    .trim()
    .min(10, "Deskripsi CPMK minimal 10 karakter")
    .max(255, "Deskripsi CPMK maksimal 255 karakter"),
  academicYearId: z.string().uuid("Tahun akademik tidak valid"),
});

export const updateMetopenCpmkSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(5, "Kode CPMK terlalu pendek")
      .max(20, "Kode CPMK maksimal 20 karakter")
      .regex(
        /^CPMK[- ]?\d{1,2}$/i,
        "Kode harus berformat resmi, contoh: CPMK-01, CPMK-02, CPMK-03 (dipakai export nilai SIA)",
      )
      .optional(),
    description: z
      .string()
      .trim()
      .min(10, "Deskripsi CPMK minimal 10 karakter")
      .max(255, "Deskripsi CPMK maksimal 255 karakter")
      .optional(),
  })
  .refine((payload) => payload.code !== undefined || payload.description !== undefined, {
    message: "Minimal satu field (kode atau deskripsi) harus diisi",
  });

export const academicYearIdParamSchema = z.object({
  academicYearId: z.string().uuid("Tahun akademik tidak valid"),
});

export const updateScoreCompositionSchema = z
  .object({
    ta03aCap: z
      .number({ required_error: "Batas TA-03A wajib diisi" })
      .int("Batas TA-03A harus bilangan bulat")
      .min(1, "Batas TA-03A minimal 1")
      .max(99, "Batas TA-03A maksimal 99"),
    ta03bCap: z
      .number({ required_error: "Batas TA-03B wajib diisi" })
      .int("Batas TA-03B harus bilangan bulat")
      .min(1, "Batas TA-03B minimal 1")
      .max(99, "Batas TA-03B maksimal 99"),
  })
  .refine((payload) => payload.ta03aCap + payload.ta03bCap === 100, {
    message: "Jumlah TA-03A + TA-03B harus tepat 100",
    path: ["ta03bCap"],
  });
