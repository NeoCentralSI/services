import { z } from "zod";
import { academicYearIdSchema } from "./common.validator.js";

export const createCpmkSchema = z.object({
  code: z
    .string()
    .trim()
    .min(5, "Kode CPMK terlalu pendek")
    .max(20, "Kode CPMK maksimal 20 karakter")
    .regex(
      /^CPMK[- ]?\d{1,2}$/i,
      "Kode harus berformat CPMK-01, CPMK-02, dan seterusnya",
    ),
  description: z
    .string()
    .trim()
    .min(10, "Deskripsi CPMK minimal 10 karakter")
    .max(255, "Deskripsi CPMK maksimal 255 karakter"),
  academicYearId: academicYearIdSchema,
});

export const updateCpmkSchema = createCpmkSchema
  .omit({ academicYearId: true })
  .partial()
  .refine(
    (payload) =>
      payload.code !== undefined || payload.description !== undefined,
    { message: "Minimal satu field harus diisi" },
  );

export const createCriteriaSchema = z.object({
  researchMethodCpmkId: z.string().uuid("CPMK tidak valid"),
  name: z
    .string()
    .trim()
    .min(1, "Nama kriteria wajib diisi")
    .max(255, "Nama kriteria maksimal 255 karakter"),
  maxScore: z
    .number()
    .int("Skor maksimal harus bilangan bulat")
    .min(1, "Skor maksimal minimal 1")
    .max(100, "Skor maksimal tidak boleh lebih dari 100"),
  displayOrder: z.number().int().min(0).optional(),
});

export const updateCriteriaSchema = createCriteriaSchema.partial().refine(
  (payload) => Object.keys(payload).length > 0,
  { message: "Minimal satu field harus diisi" },
);

export const createRubricSchema = z
  .object({
    minScore: z.number().int().min(0),
    maxScore: z.number().int().min(0),
    description: z.string().trim().min(1).max(5000),
    displayOrder: z.number().int().min(0).optional(),
  })
  .refine((payload) => payload.maxScore >= payload.minScore, {
    message: "Skor maksimal harus lebih besar atau sama dengan skor minimal",
    path: ["maxScore"],
  });

export const updateRubricSchema = createRubricSchema
  .partial()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "Minimal satu field harus diisi",
  })
  .refine(
    (payload) =>
      payload.minScore === undefined ||
      payload.maxScore === undefined ||
      payload.maxScore >= payload.minScore,
    {
      message: "Skor maksimal harus lebih besar atau sama dengan skor minimal",
      path: ["maxScore"],
    },
  );

export const reorderCriteriaSchema = z.object({
  cpmkId: z.string().uuid("CPMK tidak valid"),
  orderedIds: z.array(z.string().uuid()).min(1).refine(
    (ids) => new Set(ids).size === ids.length,
    "ID urutan tidak boleh duplikat",
  ),
});

export const reorderRubricsSchema = z.object({
  criteriaId: z.string().uuid("Kriteria tidak valid"),
  orderedIds: z.array(z.string().uuid()).min(1).refine(
    (ids) => new Set(ids).size === ids.length,
    "ID urutan tidak boleh duplikat",
  ),
});
