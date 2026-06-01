import { z } from "zod";

export const createRequirementSchema = z.object({
  academicYearId: z.string().uuid("ID Tahun Ajaran tidak valid"),
  code: z.string().optional(),
  name: z.string().min(1, "Nama persyaratan tidak boleh kosong"),
  description: z.string().optional(),
  isRequired: z.boolean().optional().default(true),
  isActive: z.boolean().optional().default(true),
  displayOrder: z.number().int().optional().default(0),
});

export const updateRequirementSchema = createRequirementSchema.partial().omit({ academicYearId: true });

export const reorderRequirementsSchema = z.object({
  orderedIds: z.array(z.string().uuid("ID persyaratan tidak valid")),
});
