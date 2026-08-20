import { z } from "zod";
import { academicYearIdSchema } from "../common.validator.js";

export const createThesisCpmkSchema = z.object({
  academicYearId: academicYearIdSchema,
  code: z.string().min(1, "Kode CPMK wajib diisi").max(255),
  description: z.string().min(1, "Deskripsi CPMK wajib diisi"),
});

export const updateThesisCpmkSchema = z.object({
  code: z.string().min(1).max(255).optional(),
  description: z.string().min(1).optional(),
});
