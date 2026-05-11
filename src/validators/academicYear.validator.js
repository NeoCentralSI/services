import { z } from "zod";

const yearFormat = z.string().regex(/^\d{4}\/\d{4}$/, "Format tahun ajaran: 2024/2025");

export const createAcademicYearSchema = z.object({
  semester: z.enum(["ganjil", "genap"]).default("ganjil"),
  year: yearFormat.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const updateAcademicYearSchema = z.object({
  semester: z.enum(["ganjil", "genap"]).optional(),
  year: yearFormat.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});
