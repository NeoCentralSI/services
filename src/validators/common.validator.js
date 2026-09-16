import { z } from "zod";

const ACADEMIC_YEAR_SLUG_PATTERN = /^tahun-(\d{4})-(ganjil|genap)$/;

/**
 * academicYearId: UUID atau slug tahun-YYYY-ganjil|genap.
 *
 * `AcademicYear.id` adalah String tanpa batasan UUID, dan data produksi memakai
 * kedua bentuk sekaligus: UUID untuk periode yang dibuat aplikasi dan slug
 * legacy seperti `tahun-2025-genap`. Memaksa UUID menolak periode slug yang sah,
 * jadi setiap titik validasi academicYearId memakai skema ini.
 */
export const academicYearIdSchema = z
  .string()
  .min(1, "academicYearId wajib diisi")
  .refine(
    (val) => {
      if (z.string().uuid().safeParse(val).success) return true;
      return ACADEMIC_YEAR_SLUG_PATTERN.test(val);
    },
    { message: "academicYearId harus UUID atau format tahun-YYYY-ganjil|genap" }
  );
