import { z } from "zod";

export const createAcademicYearSchema = z.object({
  semester: z.enum(["ganjil", "genap"]).default("ganjil"),
  year: z.number().int().min(1900).max(3000).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const updateAcademicYearSchema = z.object({
  semester: z.enum(["ganjil", "genap"]).optional(),
  year: z.number().int().min(1900).max(3000).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  isActive: z.boolean().optional(),
});
