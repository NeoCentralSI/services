import { z } from "zod";

const yearFormat = z.string().regex(/^\d{4}\/\d{4}$/, "Format tahun ajaran: 2024/2025");

function validateDateOrder(data, context) {
  if (!data.startDate || !data.endDate) return;
  if (new Date(data.startDate) > new Date(data.endDate)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["endDate"],
      message: "Tanggal selesai harus setelah atau sama dengan tanggal mulai",
    });
  }
}

export const createAcademicYearSchema = z.object({
  semester: z.enum(["ganjil", "genap"]).default("ganjil"),
  year: yearFormat,
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
}).superRefine(validateDateOrder);

export const updateAcademicYearSchema = z.object({
  semester: z.enum(["ganjil", "genap"]).optional(),
  year: yearFormat.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
}).superRefine(validateDateOrder);
