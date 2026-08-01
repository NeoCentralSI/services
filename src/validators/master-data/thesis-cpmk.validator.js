import { z } from "zod";

export const createThesisCpmkSchema = z.object({
  academicYearId: z.string().uuid("ID Tahun Ajaran tidak valid"),
  code: z.string().trim().min(1, "Kode CPMK wajib diisi").max(255).transform((value) => value.toUpperCase()),
  description: z.string().trim().min(1, "Deskripsi CPMK wajib diisi"),
});

export const updateThesisCpmkSchema = z.object({
  code: z.string().trim().min(1).max(255).transform((value) => value.toUpperCase()).optional(),
  description: z.string().trim().min(1).optional(),
});

export const copyThesisCpmkTemplateSchema = z.object({
  sourceAcademicYearId: z.string().uuid("ID Tahun Ajaran sumber tidak valid"),
  targetAcademicYearId: z.string().uuid("ID Tahun Ajaran tujuan tidak valid"),
});
