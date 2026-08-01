import { z } from "zod";

export const createRequirementSchema = z.object({
  academicYearId: z.string().uuid("ID Tahun Ajaran tidak valid"),
  name: z.string().trim().min(1, "Nama persyaratan tidak boleh kosong").max(255, "Nama persyaratan maksimal 255 karakter"),
  description: z.string().trim().optional(),
});

export const updateRequirementSchema = createRequirementSchema.partial().omit({ academicYearId: true });

export const reorderRequirementsSchema = z.object({
  academicYearId: z.string().uuid("ID Tahun Ajaran tidak valid"),
  orderedIds: z.array(z.string().uuid("ID persyaratan tidak valid")).min(1, "Daftar urutan tidak boleh kosong"),
});

export const copyTemplateSchema = z.object({
  sourceAcademicYearId: z.string().uuid("ID Tahun Ajaran Sumber tidak valid"),
  targetAcademicYearId: z.string().uuid("ID Tahun Ajaran Tujuan tidak valid"),
});
